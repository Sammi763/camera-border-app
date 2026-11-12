package com.camborder.app.service.impl;

import com.camborder.app.dto.ImageAnalysisRequest;
import com.camborder.app.dto.ImageAnalysisResponse;
import com.camborder.app.exception.FilmProcessingException;
import com.camborder.app.model.ImageProcessingConfig;
import com.camborder.app.service.ImageAnalysisService;
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
        final String stage = request.getStage();
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
        return response;
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
