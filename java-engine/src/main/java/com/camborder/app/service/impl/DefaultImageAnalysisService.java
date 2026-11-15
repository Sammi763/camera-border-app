package com.camborder.app.service.impl;

import com.camborder.app.dto.ImageAnalysisRequest;
import com.camborder.app.dto.ImageAnalysisResponse;
import com.camborder.app.exception.FilmProcessingException;
import com.camborder.app.model.ImageProcessingConfig;
import com.camborder.app.service.ImageAnalysisService;
import com.camborder.app.util.FilmRequestGuard;
import com.camborder.app.util.FloatRgbImage;
import com.camborder.app.util.ImageProcessingValidator;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * T07 分析实现：完整源图坐标、可选 ROI、256 桶直方图、区域统计和分阶段剪裁事实。
 * 统计不包含边框、文字、Logo；带大图时按 stride 有界采样并如实报告。
 */
@Service
public final class DefaultImageAnalysisService implements ImageAnalysisService {

    public static final String CODE_INVALID_ROI = "IMAGE_ANALYSIS_INVALID_ROI";
    public static final String CODE_INVALID_STAGE = "IMAGE_ANALYSIS_INVALID_STAGE";
    private static final int BUCKET_COUNT = 256;
    private static final long MAX_ANALYSIS_SAMPLES = 50_000_000L;

    private final FilmProcessingPipeline pipeline;

    public DefaultImageAnalysisService(final FilmProcessingPipeline pipeline) {
        this.pipeline = pipeline;
    }

    @Override
    public ImageAnalysisResponse analyze(final ImageAnalysisRequest request) {
        if (request == null || request.getRecipe() == null) {
            throw new FilmProcessingException("分析请求缺少 recipe",
                    HttpStatus.BAD_REQUEST, "IMAGE_ANALYSIS_RECIPE_REQUIRED");
        }
        final String outputSpace = request.getOutputSpace();
        if (outputSpace != null && !java.util.Set.of("srgb", "linear-rec2020").contains(outputSpace))
            throw new FilmProcessingException("输出统计空间非法", HttpStatus.BAD_REQUEST, "IMAGE_ANALYSIS_OUTPUT_SPACE_INVALID");
        final String purpose = request.getPurpose() == null || request.getPurpose().isBlank()
                ? "histogram" : request.getPurpose();
        if (!ImageProcessingValidator.ANALYSIS_PURPOSES.contains(purpose)) {
            throw new FilmProcessingException("分析用途非法",
                    HttpStatus.BAD_REQUEST, "IMAGE_ANALYSIS_INVALID_PURPOSE");
        }
        // 中性建议必须从基础正片取样，不能从已叠加当前调整的结果反推片基/光源。
        final String stage = "neutral-balance".equals(purpose)
                ? "base-positive" : request.getStage();
        if (stage == null || !ImageProcessingValidator.ANALYSIS_STAGES.contains(stage)) {
            throw new FilmProcessingException("分析阶段非法",
                    HttpStatus.BAD_REQUEST, CODE_INVALID_STAGE);
        }
        final ImageProcessingConfig.NormalizedCrop roi = request.getRoi() == null
                ? new ImageProcessingConfig.NormalizedCrop() : request.getRoi();
        validateRoi(roi);
        try (FilmProcessingPipeline.Processed processed = pipeline.process(request.getRecipe(), stage)) {
        final FloatRgbImage image = processed.getImage();

        final int left = Math.max(0, (int) Math.floor(roi.getX() * image.getWidth()));
        final int top = Math.max(0, (int) Math.floor(roi.getY() * image.getHeight()));
        final int right = Math.min(image.getWidth(),
                (int) Math.ceil((roi.getX() + roi.getWidth()) * image.getWidth()));
        final int bottom = Math.min(image.getHeight(),
                (int) Math.ceil((roi.getY() + roi.getHeight()) * image.getHeight()));
        if (right <= left || bottom <= top) {
            throw new FilmProcessingException("分析 ROI 面积为 0",
                    HttpStatus.BAD_REQUEST, CODE_INVALID_ROI);
        }
        final long roiPixels = (long) (right - left) * (bottom - top);
        final int stride = roiPixels <= MAX_ANALYSIS_SAMPLES ? 1
                : (int) Math.ceil(Math.sqrt((double) roiPixels / MAX_ANALYSIS_SAMPLES));
        final int sampledWidth = (right - left + stride - 1) / stride;
        final int sampledHeight = (bottom - top + stride - 1) / stride;

        final long[] red = new long[BUCKET_COUNT];
        final long[] green = new long[BUCKET_COUNT];
        final long[] blue = new long[BUCKET_COUNT];
        final long[] luma = new long[BUCKET_COUNT];
        final double[] sums = new double[3];
        final double[] mins = {Double.POSITIVE_INFINITY, Double.POSITIVE_INFINITY, Double.POSITIVE_INFINITY};
        final double[] maxs = {Double.NEGATIVE_INFINITY, Double.NEGATIVE_INFINITY, Double.NEGATIVE_INFINITY};
        final long[] low = new long[3];
        final long[] high = new long[3];
        final long[] outputLow = new long[3];
        final long[] outputHigh = new long[3];
        final float[] workingPixel = new float[3];
        final float[] outputPixel = new float[3];
        long underflow = 0;
        long overflow = 0;
        long count = 0;
        final float[] rgb = new float[3];
        for (int y = top; y < bottom; y += stride) {
            for (int x = left; x < right; x += stride) {
                for (int channel = 0; channel < 3; channel++) {
                    final double value = image.get(x, y, channel);
                    sums[channel] += value;
                    mins[channel] = Math.min(mins[channel], value);
                    maxs[channel] = Math.max(maxs[channel], value);
                    if (value <= 0) low[channel]++;
                    if (value >= 1) high[channel]++;
                    if (value < 0) underflow++;
                    if (value > 1) overflow++;
                }
                rgb[0] = image.get(x, y, 0);
                rgb[1] = image.get(x, y, 1);
                rgb[2] = image.get(x, y, 2);
                final double lumaValue = 0.2627 * rgb[0] + 0.6780 * rgb[1] + 0.0593 * rgb[2];
                if (lumaValue < 0) underflow++;
                if (lumaValue > 1) overflow++;
                add(red, rgb[0]);
                add(green, rgb[1]);
                add(blue, rgb[2]);
                add(luma, lumaValue);
                if (outputSpace != null) {
                    for (int c = 0; c < 3; c++) workingPixel[c] = image.get(x, y, c);
                    if ("srgb".equals(outputSpace)) com.camborder.app.util.FilmColorSpace.linearRec2020ToSrgb(workingPixel, outputPixel);
                    else System.arraycopy(workingPixel, 0, outputPixel, 0, 3);
                    for (int c = 0; c < 3; c++) {
                        if (outputPixel[c] <= 0) outputLow[c]++;
                        if (outputPixel[c] >= 1) outputHigh[c]++;
                    }
                }
                count++;
            }
        }

        final ImageAnalysisResponse response = new ImageAnalysisResponse();
        response.setStatus("ok");
        response.setPurpose(purpose);
        response.setRecipeSignature(processed.getRecipeSignature());
        response.setSourceVersion(processed.getSourceVersion());
        response.setStage(stage);
        response.setResolvedFilmBase(processed.getResolvedFilmBase());
        response.setResolvedLightGain(processed.getResolvedLightGain());
        response.setCalibrationSpaceKey(processed.getSourceDecode().getCalibrationSpaceKey());
        response.setAnalyzedWidth(sampledWidth);
        response.setAnalyzedHeight(sampledHeight);
        response.setSampling(stride == 1 ? "full" : "stride:" + stride);
        response.setBucketCount(BUCKET_COUNT);
        response.setRoi(copy(roi));
        final ImageAnalysisResponse.Histogram histogram = new ImageAnalysisResponse.Histogram();
        histogram.setRed(red);
        histogram.setGreen(green);
        histogram.setBlue(blue);
        histogram.setLuma(luma);
        histogram.setUnderflow(underflow);
        histogram.setOverflow(overflow);
        response.setHistogram(histogram);
        final ImageAnalysisResponse.RegionStats stats = new ImageAnalysisResponse.RegionStats();
        stats.setPixelCount(count);
        stats.setMean(new double[]{count == 0 ? 0 : sums[0] / count,
                count == 0 ? 0 : sums[1] / count, count == 0 ? 0 : sums[2] / count});
        stats.setMin(mins);
        stats.setMax(maxs);
        stats.setClippedLow(low);
        stats.setClippedHigh(high);
        response.setStats(stats);
        response.setClipping(clipping(processed, low, high, outputLow, outputHigh, outputSpace));
        if ("neutral-balance".equals(purpose)) {
            response.setNeutralBalance(neutralBalance(processed, roi, request.getRecipe().getImageProcessing().getPositive()));
        }
        return response;
        }
    }

    /**
     * 中性区域建议：过滤过暗、近剪裁和非有限样本，再取逐通道中位数。
     * 返回值只是建议，不修改配方；binding 绑定源指纹与基础正片配方签名，
     * 源文件或配方变化后前端必须丢弃旧建议。
     */
    private static ImageAnalysisResponse.NeutralBalance neutralBalance(
            final FilmProcessingPipeline.Processed processed,
            final ImageProcessingConfig.NormalizedCrop roi,
            final ImageProcessingConfig.PositiveAdjustments positive) {
        final FloatRgbImage image = processed.getImage();
        final int left = Math.max(0, (int) Math.floor(roi.getX() * image.getWidth()));
        final int top = Math.max(0, (int) Math.floor(roi.getY() * image.getHeight()));
        final int right = Math.min(image.getWidth(),
                (int) Math.ceil((roi.getX() + roi.getWidth()) * image.getWidth()));
        final int bottom = Math.min(image.getHeight(),
                (int) Math.ceil((roi.getY() + roi.getHeight()) * image.getHeight()));
        final ImageAnalysisResponse.NeutralBalance result = new ImageAnalysisResponse.NeutralBalance();
        result.setStage("base-positive");
        result.setRoi(copy(roi));
        if (right <= left || bottom <= top) {
            result.setAvailable(false);
            result.setNote("取样区域面积为 0");
            return result;
        }
        final long roiPixels = (long) (right - left) * (bottom - top);
        final int stride = Math.max(1, (int) Math.ceil(Math.sqrt((double) roiPixels / 2_000_000d)));
        final int maximum = ((right - left + stride - 1) / stride)
                * ((bottom - top + stride - 1) / stride);
        final double[] red = new double[Math.max(1, maximum)];
        final double[] green = new double[Math.max(1, maximum)];
        final double[] blue = new double[Math.max(1, maximum)];
        long tooDark = 0;
        long clipped = 0;
        long nonFinite = 0;
        int count = 0;
        for (int y = top; y < bottom; y += stride) {
            FilmRequestGuard.check();
            for (int x = left; x < right; x += stride) {
                final double r = image.get(x, y, 0);
                final double g = image.get(x, y, 1);
                final double b = image.get(x, y, 2);
                if (!Double.isFinite(r) || !Double.isFinite(g) || !Double.isFinite(b)) {
                    nonFinite++;
                    continue;
                }
                final double luma = 0.2627 * r + 0.6780 * g + 0.0593 * b;
                if (luma < 0.05) {
                    tooDark++;
                    continue;
                }
                if (r >= 0.98 || g >= 0.98 || b >= 0.98
                        || r <= 0.0 || g <= 0.0 || b <= 0.0) {
                    clipped++;
                    continue;
                }
                red[count] = r;
                green[count] = g;
                blue[count] = b;
                count++;
            }
        }
        result.setRejectedTooDark(tooDark);
        result.setRejectedClipped(clipped);
        result.setRejectedNonFinite(nonFinite);
        result.setSampleCount(count);
        if (count < 16 || count * 2L < count + tooDark + clipped + nonFinite) {
            result.setAvailable(false);
            result.setNote("有效样本不足 16 个或不到取样的一半；请扩大取样框或避开过暗/剪裁区域");
            return result;
        }
        final double[] reds = java.util.Arrays.copyOf(red, count);
        final double[] greens = java.util.Arrays.copyOf(green, count);
        final double[] blues = java.util.Arrays.copyOf(blue, count);
        java.util.Arrays.sort(reds);
        java.util.Arrays.sort(greens);
        java.util.Arrays.sort(blues);
        final double medianR = median(reds);
        final double medianG = median(greens);
        final double medianB = median(blues);
        if (medianR <= 1e-9 || medianG <= 1e-9 || medianB <= 1e-9) {
            result.setAvailable(false);
            result.setNote("中性样本中位数接近零，无法计算稳定增益");
            return result;
        }
        final double[] previous = positive == null ? new double[]{0, 0, 0} : positive.getRgbBalanceEv();
        final double luminance = 0.2627 * medianR * Math.pow(2, previous[0])
                + 0.6780 * medianG * Math.pow(2, previous[1])
                + 0.0593 * medianB * Math.pow(2, previous[2]);
        final double[] gain = {luminance / medianR, luminance / medianG, luminance / medianB};
        final double[] ev = new double[3];
        for (int channel = 0; channel < 3; channel++) {
            ev[channel] = Math.log(gain[channel]) / Math.log(2);
            if (!Double.isFinite(ev[channel]) || Math.abs(ev[channel]) > 4) {
                result.setAvailable(false);
                result.setNote("所需 RGB 平衡超出 ±4 EV，请重新选择可信的中性区域");
                return result;
            }
        }
        result.setAvailable(true);
        result.setSampleMean(new double[]{medianR, medianG, medianB});
        result.setSuggestedRgbGain(gain);
        result.setSuggestedRgbBalanceEv(ev);
        result.setConfidence(count >= 1000 ? "high" : count >= 100 ? "medium" : "low");
        result.setBinding(binding(processed.getSourceVersion(), processed.getRecipeSignature(), ev));
        result.setNote("已过滤 luma<0.05、任一通道<=0 或 >=0.98 的样本；建议需人工确认后应用");
        return result;
    }

    private static double median(final double[] sorted) {
        final int middle = sorted.length / 2;
        return sorted.length % 2 == 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
    }

    private static String binding(final String sourceVersion, final String recipeSignature,
                                  final double[] ev) {
        try {
            final java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
            final String value = sourceVersion + "|" + recipeSignature + "|"
                    + ev[0] + "," + ev[1] + "," + ev[2];
            final byte[] hash = digest.digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            final StringBuilder result = new StringBuilder(64);
            for (byte datum : hash) result.append(String.format(java.util.Locale.ROOT, "%02x", datum));
            return result.toString();
        } catch (Exception exception) {
            return null;
        }
    }

    private static ImageAnalysisResponse.ClippingFacts clipping(
            final FilmProcessingPipeline.Processed processed, final long[] low, final long[] high, final long[] outputLow, final long[] outputHigh, final String outputSpace) {
        final ImageAnalysisResponse.ClippingFacts facts = new ImageAnalysisResponse.ClippingFacts();
        final Map<String, ImageAnalysisResponse.ClippingStage> stages = new LinkedHashMap<>();
        stages.put("sensor", stage(processed.getSensorClipping()));
        final ImageAnalysisResponse.ClippingStage working = new ImageAnalysisResponse.ClippingStage();
        working.setAvailable(true);
        working.setClippedLow(low);
        working.setClippedHigh(high);
        working.setNote("当前分析区域的工作图线性值 <=0 或 >=1");
        stages.put("working", working);
        final ImageAnalysisResponse.ClippingStage output = new ImageAnalysisResponse.ClippingStage();
        output.setAvailable(outputSpace != null);
        output.setClippedLow(outputLow); output.setClippedHigh(outputHigh);
        output.setNote(outputSpace == null ? "未指定输出空间" : "分析区域在目标 " + outputSpace + " 空间的边界样本计数");
        stages.put("output", output);
        facts.setStages(stages);
        return facts;
    }

    private static ImageAnalysisResponse.ClippingStage stage(
            final FilmProcessingPipeline.ClipCounts counts) {
        final ImageAnalysisResponse.ClippingStage result = new ImageAnalysisResponse.ClippingStage();
        result.setAvailable(counts.isAvailable());
        result.setClippedLow(counts.getLow());
        result.setClippedHigh(counts.getHigh());
        result.setNote(counts.getNote());
        return result;
    }

    private static void add(final long[] histogram, final double value) {
        if (value < 0 || value > 1) return;
        int bucket = (int) Math.floor(value * (BUCKET_COUNT - 1));
        if (bucket < 0) bucket = 0;
        if (bucket >= BUCKET_COUNT) bucket = BUCKET_COUNT - 1;
        histogram[bucket]++;
    }

    private static void validateRoi(final ImageProcessingConfig.NormalizedCrop roi) {
        if (!Double.isFinite(roi.getX()) || !Double.isFinite(roi.getY())
                || !Double.isFinite(roi.getWidth()) || !Double.isFinite(roi.getHeight())
                || roi.getX() < 0 || roi.getY() < 0
                || roi.getWidth() <= 0 || roi.getHeight() <= 0
                || roi.getX() + roi.getWidth() > 1.000000001
                || roi.getY() + roi.getHeight() > 1.000000001) {
            throw new FilmProcessingException("分析 ROI 非法",
                    HttpStatus.BAD_REQUEST, CODE_INVALID_ROI);
        }
    }

    private static ImageProcessingConfig.NormalizedCrop copy(
            final ImageProcessingConfig.NormalizedCrop roi) {
        return new ImageProcessingConfig.NormalizedCrop(roi.getX(), roi.getY(),
                roi.getWidth(), roi.getHeight());
    }
}
