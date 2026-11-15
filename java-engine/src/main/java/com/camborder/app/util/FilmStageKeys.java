package com.camborder.app.util;

import com.camborder.app.model.ImageProcessingConfig;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 阶段缓存键的规范化生成（T11）。
 *
 * 只包含会影响该阶段像素的有效参数：源版本、解码参数、负片/正片参数、算法版本、
 * 工作空间和实际处理尺寸。几何、边框、文字、Logo、输出格式不进入照片阶段键；
 * 输出色彩空间属于最终输出键，避免预览与母版串用。
 */
public final class FilmStageKeys {

    private FilmStageKeys() { }

    public static String rawKey(final ImageProcessingConfig config, final int width,
                                final int height, final String sourceVersion) {
        return rawKey(config, width, height, sourceVersion, "unknown");
    }

    public static String rawKey(final ImageProcessingConfig config, final int width,
                                final int height, final String sourceVersion,
                                final String decoderVersion) {
        final StringBuilder value = new StringBuilder("raw-linear|")
                .append(config.getSchemaVersion()).append('|')
                .append(config.getInputMode()).append('|')
                .append(config.getInputSource()).append('|')
                .append(config.getFilmPolarity()).append('|')
                .append(config.getAlgorithmVersion()).append('|')
                .append(FloatRgbImage.WORKING_COLOR_SPACE).append('|')
                .append(width).append('x').append(height).append('|')
                .append(sourceVersion).append('|')
                .append(decoderVersion == null ? "unknown" : decoderVersion);
        final ImageProcessingConfig.RawOptions raw = config.getRaw();
        if (raw != null) {
            value.append("|raw:").append(raw.getWhiteBalance()).append(',')
                    .append(raw.isAutoBright()).append(',')
                    .append(raw.getGamma()).append(',')
                    .append(raw.getHighlight()).append(',')
                    .append(raw.getCrop());
        }
        final ImageProcessingConfig.LinearInput linear = config.getLinearInput();
        if (linear != null) {
            value.append("|linear:").append(linear.getTransferFunction()).append(',')
                    .append(linear.getColorSpace()).append(',')
                    .append(linear.getBitDepth()).append(',')
                    .append(nullSafe(linear.getIccSha256()));
        }
        final ImageProcessingConfig.EncodedInput encoded = config.getEncodedInput();
        if (encoded != null) {
            value.append("|encoded:").append(encoded.getColorSpace()).append(',')
                    .append(encoded.getBitDepth()).append(',')
                    .append(nullSafe(encoded.getIccSha256())).append(',')
                    .append(encoded.getAlphaBackground());
        }
        final ImageProcessingConfig.FlextightInput fff = config.getFlextightInput();
        if (fff != null) {
            value.append("|fff:").append(fff.getDevice()).append(',')
                    .append(fff.getMainImage()).append(',')
                    .append(fff.getColorSpace()).append(',')
                    .append(fff.getTransferFunction()).append(',')
                    .append(fff.getBitDepth()).append(',')
                    .append(nullSafe(fff.getIccSha256()));
        }
        return hash(value.toString());
    }

    /**
     * 基础正片键。referenceVersions 为参考帧路径到真实内容版本的映射；调用方必须在
     * 计算键之前读取 SHA-256，不能退化为路径、mtime 和大小比较。
     */
    public static String baseKey(final String rawKey, final ImageProcessingConfig config,
                                 final Map<String, String> referenceVersions) {
        final StringBuilder value = new StringBuilder("base-positive|")
                .append(rawKey).append('|')
                .append(config.getAlgorithmVersion()).append('|')
                .append(FilmNegativeProcessor.ALGORITHM_VERSION);
        final ImageProcessingConfig.NegativeConfig negative = config.getNegative();
        if (negative == null) {
            value.append("|negative:null");
        } else {
            value.append("|negative:").append(negative.isEnabled()).append(',')
                    .append(negative.getProfile()).append(',')
                    .append(nullSafe(negative.getCalibrationSpaceKey()));
            final ImageProcessingConfig.LightSourceConfig light = negative.getLightSource();
            if (light == null) {
                value.append("|light:null");
            } else {
                value.append("|light:").append(light.getKind()).append(',')
                        .append(nullSafe(light.getCalibrationId())).append(',')
                        .append(light.getCalibrationVersion()).append(',')
                        .append(Arrays.toString(light.getRgbGain())).append(',')
                        .append(nullSafe(light.getReferenceImagePath())).append(',')
                        .append(nullSafe(light.getReferenceFingerprint())).append(',')
                        .append(referenceVersion(light.getReferenceImagePath(), referenceVersions));
            }
            final ImageProcessingConfig.FilmBaseConfig base = negative.getFilmBase();
            if (base == null) {
                value.append("|base:null");
            } else {
                value.append("|base:").append(base.getKind()).append(',')
                        .append(nullSafe(base.getStage())).append(',')
                        .append(Arrays.toString(base.getRgb())).append(',')
                        .append(nullSafe(base.getReferenceImagePath())).append(',')
                        .append(nullSafe(base.getReferenceFingerprint())).append(',')
                        .append(referenceVersion(base.getReferenceImagePath(), referenceVersions)).append(',')
                        .append(base.getCalibrationId()).append(',')
                        .append(base.getCalibrationVersion()).append(',');
                final ImageProcessingConfig.NormalizedCrop roi = base.getRoi();
                value.append(roi == null ? "roi:null" : "roi:" + roi.getX() + "," + roi.getY()
                        + "," + roi.getWidth() + "," + roi.getHeight());
            }
            final ImageProcessingConfig.DensityConfig density = negative.getDensity();
            value.append("|density:").append(density == null ? "null"
                    : density.getMin() + "," + density.getMax());
        }
        return hash(value.toString());
    }

    /** 当前正片键：只受上游基础正片与正片调整参数影响。 */
    public static String currentKey(final String baseKey, final ImageProcessingConfig config) {
        final StringBuilder value = new StringBuilder("current-positive|")
                .append(baseKey).append('|')
                .append(config.getAlgorithmVersion()).append('|')
                .append(FilmPositiveProcessor.ALGORITHM_VERSION);
        final ImageProcessingConfig.PositiveAdjustments positive = config.getPositive();
        if (positive == null) {
            value.append("|positive:null");
        } else {
            value.append("|positive:").append(positive.getExposureEv()).append(',')
                    .append(Arrays.toString(positive.getRgbBalanceEv())).append(',')
                    .append(positive.getBlackPoint()).append(',')
                    .append(positive.getWhitePoint()).append(',')
                    .append(positive.getSaturation());
            curve(value, positive.getMasterCurve());
            curve(value, positive.getRedCurve());
            curve(value, positive.getGreenCurve());
            curve(value, positive.getBlueCurve());
        }
        return hash(value.toString());
    }

    private static void curve(final StringBuilder value, final ImageProcessingConfig.Curve curve) {
        if (curve == null) {
            value.append("|curve:null");
            return;
        }
        value.append("|curve:").append(curve.getInterpolation()).append(':');
        final List<ImageProcessingConfig.CurvePoint> points = curve.getPoints();
        if (points != null) {
            for (ImageProcessingConfig.CurvePoint point : points) {
                value.append(point.getX()).append(',').append(point.getY()).append(';');
            }
        }
    }

    private static String referenceVersion(final String path, final Map<String, String> versions) {
        if (path == null || path.isBlank()) return "none";
        final String version = versions == null ? null : versions.get(path);
        return version == null ? "unread" : version;
    }

    private static String nullSafe(final Object value) {
        return value == null ? "null" : value.toString();
    }

    private static String hash(final String value) {
        try {
            final byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            final StringBuilder result = new StringBuilder(digest.length * 2);
            for (byte datum : digest) {
                result.append(String.format(Locale.ROOT, "%02x", datum));
            }
            return result.toString();
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 unavailable", exception);
        }
    }
}
