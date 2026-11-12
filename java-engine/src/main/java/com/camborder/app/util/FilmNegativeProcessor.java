package com.camborder.app.util;

import com.camborder.app.exception.FilmProcessingException;
import com.camborder.app.model.ImageProcessingConfig;
import org.springframework.http.HttpStatus;

import java.util.Arrays;

/**
 * 通用彩色负片转正与片基校准（T05）。
 *
 * 明确的近似模型（不是 Gold/Portra 专属还原）：
 *   T_c = image_c / base_c                         （同阶段线性光）
 *   D_c = -log10(clamp(T_c, 1e-6, 1))              （负片密度，相对片基）
 *   n_c = clamp((D_c - min) / (max - min), 0, 1)   （冻结密度范围归一化）
 *   positive_c = n_c                               （高密度/暗负片 -> 亮正片）
 *
 * 片基可由同图 ROI 的逐通道中位数或手工数值给出；光源增益只作用于画面，片基
 * 已按同一 calibrated stage 记录。T05 只支持 linear-working 阶段；同卷参考帧、
 * 参考路径由 FilmProcessingPipeline 解析，持久校准在应用时展开为数值；camera-rgb 片基仍明确拒绝。
 */
public final class FilmNegativeProcessor {

    public static final String ALGORITHM_VERSION = "film-negative-v1";
    public static final String CODE_INVALID_CONFIG = "NEGATIVE_INVALID_CONFIG";
    public static final String CODE_LIGHT_SOURCE_UNRESOLVED = "NEGATIVE_LIGHT_SOURCE_UNRESOLVED";
    public static final String CODE_INVALID_BASE = "NEGATIVE_INVALID_BASE";
    public static final String CODE_BASE_REFERENCE_UNRESOLVED = "NEGATIVE_BASE_REFERENCE_UNRESOLVED";
    public static final String CODE_STAGE_MISMATCH = "NEGATIVE_STAGE_MISMATCH";
    public static final String CODE_INVALID_DENSITY = "NEGATIVE_INVALID_DENSITY";

    private static final double MIN_TRANSMITTANCE = 1e-6;
    private static final double EPSILON = 1e-9;
    private static final int MAX_PIXELS = 200_000_000;

    /** 负片转换结果 + 片基/光源/密度事实。 */
    public static final class Result {
        private final FloatRgbImage image;
        private final double[] lightGain;
        private final double[] base;
        private final String baseKind;
        private final String baseStage;
        private final String profile;
        private final String algorithmVersion;
        private final long lowClipCount;
        private final long highClipCount;
        private final long negativeDensityCount;
        private final long highDensityClipCount;
        private final double minDensity;
        private final double maxDensity;

        private Result(final FloatRgbImage image, final double[] lightGain, final double[] base,
                       final String baseKind, final String baseStage, final String profile,
                       final long lowClipCount, final long highClipCount,
                       final long negativeDensityCount, final long highDensityClipCount,
                       final double minDensity, final double maxDensity) {
            this.image = image;
            this.lightGain = lightGain.clone();
            this.base = base.clone();
            this.baseKind = baseKind;
            this.baseStage = baseStage;
            this.profile = profile;
            this.algorithmVersion = ALGORITHM_VERSION;
            this.lowClipCount = lowClipCount;
            this.highClipCount = highClipCount;
            this.negativeDensityCount = negativeDensityCount;
            this.highDensityClipCount = highDensityClipCount;
            this.minDensity = minDensity;
            this.maxDensity = maxDensity;
        }

        public FloatRgbImage getImage() { return image; }
        public double[] getLightGain() { return lightGain.clone(); }
        public double[] getBase() { return base.clone(); }
        public String getBaseKind() { return baseKind; }
        public String getBaseStage() { return baseStage; }
        public String getProfile() { return profile; }
        public String getAlgorithmVersion() { return algorithmVersion; }
        public long getLowClipCount() { return lowClipCount; }
        public long getHighClipCount() { return highClipCount; }
        public long getNegativeDensityCount() { return negativeDensityCount; }
        public long getHighDensityClipCount() { return highDensityClipCount; }
        public double getMinDensity() { return minDensity; }
        public double getMaxDensity() { return maxDensity; }
    }

    public Result process(final FloatRgbImage input, final ImageProcessingConfig.NegativeConfig config) {
        if (input == null) {
            throw new FilmProcessingException("负片输入为空", HttpStatus.BAD_REQUEST, CODE_INVALID_CONFIG);
        }
        if ((long) input.getWidth() * input.getHeight() > MAX_PIXELS) {
            throw new FilmProcessingException("负片输入像素数超过上限",
                    HttpStatus.BAD_REQUEST, CODE_INVALID_CONFIG);
        }
        if (config == null || !config.isEnabled()) {
            throw new FilmProcessingException("负片转换未启用",
                    HttpStatus.BAD_REQUEST, CODE_INVALID_CONFIG);
        }
        if (!"generic-color-negative-v1".equals(config.getProfile())) {
            throw new FilmProcessingException("未登记的负片转换配置",
                    HttpStatus.BAD_REQUEST, CODE_INVALID_CONFIG);
        }
        if (config.getDensity() == null) {
            throw new FilmProcessingException("负片密度范围缺失",
                    HttpStatus.BAD_REQUEST, CODE_INVALID_DENSITY);
        }
        final double minDensity = config.getDensity().getMin();
        final double maxDensity = config.getDensity().getMax();
        if (!Double.isFinite(minDensity) || !Double.isFinite(maxDensity)
                || minDensity < 0 || maxDensity > 6 || maxDensity - minDensity < 0.1) {
            throw new FilmProcessingException("负片密度范围非法",
                    HttpStatus.BAD_REQUEST, CODE_INVALID_DENSITY);
        }
        final double[] gain = resolveLightGain(config.getLightSource());
        final FloatRgbImage calibrated = applyGain(input, gain);
        final double[] base = resolveBase(calibrated, config.getFilmBase());

        final FloatRgbImage positive = new FloatRgbImage(input.getWidth(), input.getHeight());
        long lowClip = 0;
        long highClip = 0;
        long negativeDensity = 0;
        long highDensityClip = 0;
        for (int y = 0; y < input.getHeight(); y++) {
            FilmRequestGuard.check();
            for (int x = 0; x < input.getWidth(); x++) {
                for (int channel = 0; channel < 3; channel++) {
                    final double baseValue = base[channel];
                    if (!Double.isFinite(baseValue) || baseValue <= EPSILON) {
                        throw new FilmProcessingException("片基参考值非法",
                                HttpStatus.BAD_REQUEST, CODE_INVALID_BASE);
                    }
                    double transmittance = calibrated.get(x, y, channel) / baseValue;
                    if (!Double.isFinite(transmittance)) {
                        throw new FilmProcessingException("负片透过率非有限值",
                                HttpStatus.BAD_REQUEST, CODE_INVALID_BASE);
                    }
                    if (transmittance <= 0) {
                        transmittance = MIN_TRANSMITTANCE;
                        lowClip++;
                    } else if (transmittance > 1) {
                        negativeDensity++;
                        transmittance = 1;
                        highClip++;
                    } else if (transmittance < MIN_TRANSMITTANCE) {
                        transmittance = MIN_TRANSMITTANCE;
                        lowClip++;
                    }
                    final double density = -Math.log10(transmittance);
                    double normalized = (density - minDensity) / (maxDensity - minDensity);
                    if (normalized > 1) {
                        highDensityClip++;
                        normalized = 1;
                    } else if (normalized < 0) {
                        normalized = 0;
                    }
                    positive.set(x, y, channel, (float) normalized);
                }
            }
        }
        if (positive.hasNonFinite()) {
            throw new FilmProcessingException("负片转换产生非有限值",
                    HttpStatus.INTERNAL_SERVER_ERROR, CODE_INVALID_CONFIG);
        }
        return new Result(positive, gain, base, config.getFilmBase().getKind(),
                config.getFilmBase().getStage(), config.getProfile(),
                lowClip, highClip, negativeDensity, highDensityClip, minDensity, maxDensity);
    }

    private static double[] resolveLightGain(final ImageProcessingConfig.LightSourceConfig source) {
        if (source == null || source.getKind() == null) {
            throw new FilmProcessingException("光源校准缺失",
                    HttpStatus.BAD_REQUEST, CODE_LIGHT_SOURCE_UNRESOLVED);
        }
        if ("camera-white-balance".equals(source.getKind())) {
            return new double[]{1, 1, 1};
        }
        if (!"calibration".equals(source.getKind())) {
            throw new FilmProcessingException("光源校准类型非法",
                    HttpStatus.BAD_REQUEST, CODE_LIGHT_SOURCE_UNRESOLVED);
        }
        final double[] gain = source.getRgbGain();
        if (gain == null || gain.length != 3) {
            throw new FilmProcessingException(
                    "光源校准缺少已展开的 rgbGain，请重新应用已保存校准或选择参考帧",
                    HttpStatus.BAD_REQUEST, CODE_LIGHT_SOURCE_UNRESOLVED);
        }
        for (double value : gain) {
            if (!Double.isFinite(value) || value <= 0 || value > 10) {
                throw new FilmProcessingException("光源增益非法",
                        HttpStatus.BAD_REQUEST, CODE_LIGHT_SOURCE_UNRESOLVED);
            }
        }
        return gain.clone();
    }

    private static FloatRgbImage applyGain(final FloatRgbImage input, final double[] gain) {
        final FloatRgbImage result = input.copy();
        if (gain[0] == 1 && gain[1] == 1 && gain[2] == 1) return result;
        for (int y = 0; y < result.getHeight(); y++) {
            FilmRequestGuard.check();
            for (int x = 0; x < result.getWidth(); x++) {
                for (int channel = 0; channel < 3; channel++) {
                    result.set(x, y, channel,
                            (float) (result.get(x, y, channel) * gain[channel]));
                }
            }
        }
        return result;
    }

    private static double[] resolveBase(final FloatRgbImage image,
                                        final ImageProcessingConfig.FilmBaseConfig base) {
        if (base == null || base.getKind() == null) {
            throw new FilmProcessingException("片基配置缺失",
                    HttpStatus.BAD_REQUEST, CODE_INVALID_BASE);
        }
        if (!"linear-working".equals(base.getStage())) {
            throw new FilmProcessingException(
                    "T05 只支持 linear-working 片基；camera-rgb 片基需要 T12 校准解析器",
                    HttpStatus.BAD_REQUEST, CODE_STAGE_MISMATCH);
        }
        if ("roi".equals(base.getKind())) {
            if (base.getRoi() == null) {
                throw new FilmProcessingException("片基 ROI 缺失",
                        HttpStatus.BAD_REQUEST, CODE_INVALID_BASE);
            }
            return medianOfRoi(image, base.getRoi());
        }
        if ("manual".equals(base.getKind())) {
            final double[] rgb = base.getRgb();
            if (rgb == null || rgb.length != 3) {
                throw new FilmProcessingException("手工片基 RGB 缺失",
                        HttpStatus.BAD_REQUEST, CODE_INVALID_BASE);
            }
            for (double value : rgb) {
                if (!Double.isFinite(value) || value <= EPSILON || value > 4) {
                    throw new FilmProcessingException("手工片基 RGB 非法",
                            HttpStatus.BAD_REQUEST, CODE_INVALID_BASE);
                }
            }
            return rgb.clone();
        }
        if ("reference-frame".equals(base.getKind())) {
            throw new FilmProcessingException(
                    "同卷参考帧片基需要 T12 校准解析器；T05 不猜测参考图解释",
                    HttpStatus.BAD_REQUEST, CODE_BASE_REFERENCE_UNRESOLVED);
        }
        throw new FilmProcessingException("片基来源类型非法",
                HttpStatus.BAD_REQUEST, CODE_INVALID_BASE);
    }

    public static double[] medianOfRoi(final FloatRgbImage image,
                                        final ImageProcessingConfig.NormalizedCrop roi) {
        final int left = Math.max(0, (int) Math.floor(roi.getX() * image.getWidth()));
        final int top = Math.max(0, (int) Math.floor(roi.getY() * image.getHeight()));
        final int right = Math.min(image.getWidth(),
                (int) Math.ceil((roi.getX() + roi.getWidth()) * image.getWidth()));
        final int bottom = Math.min(image.getHeight(),
                (int) Math.ceil((roi.getY() + roi.getHeight()) * image.getHeight()));
        if (right <= left || bottom <= top) {
            throw new FilmProcessingException("片基 ROI 面积为 0",
                    HttpStatus.BAD_REQUEST, CODE_INVALID_BASE);
        }
        final int pixels = (right - left) * (bottom - top);
        final double[][] values = new double[3][pixels];
        int index = 0;
        for (int y = top; y < bottom; y++) {
            for (int x = left; x < right; x++) {
                for (int channel = 0; channel < 3; channel++) {
                    values[channel][index] = image.get(x, y, channel);
                }
                index++;
            }
        }
        final double[] result = new double[3];
        for (int channel = 0; channel < 3; channel++) {
            Arrays.sort(values[channel]);
            final double median = pixels % 2 == 1
                    ? values[channel][pixels / 2]
                    : (values[channel][pixels / 2 - 1] + values[channel][pixels / 2]) / 2.0;
            if (!Double.isFinite(median) || median <= EPSILON) {
                throw new FilmProcessingException("片基 ROI 中位数非法",
                        HttpStatus.BAD_REQUEST, CODE_INVALID_BASE);
            }
            result[channel] = median;
        }
        return result;
    }
}
