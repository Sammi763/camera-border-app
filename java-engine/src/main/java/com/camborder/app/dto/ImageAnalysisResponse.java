package com.camborder.app.dto;

import com.camborder.app.model.ImageProcessingConfig;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 图像分析响应（T02 冻结契约，T07 实现）。
 *
 * 直方图以归一化工作值 0..1 分桶；underflow/overflow 显式报告负值与超范围值。
 * 统计阶段不含边框、文字、Logo；剪裁事实按传感器/工作/输出阶段分开。
 */
public final class ImageAnalysisResponse {

    private double[] resolvedFilmBase;
    private double[] resolvedLightGain;
    public double[] getResolvedFilmBase() { return resolvedFilmBase; }
    public void setResolvedFilmBase(final double[] value) { resolvedFilmBase = value; }
    public double[] getResolvedLightGain() { return resolvedLightGain; }
    public void setResolvedLightGain(final double[] value) { resolvedLightGain = value; }
    private String status;
    private String purpose;
    private NeutralBalance neutralBalance;
    private String calibrationSpaceKey;
    public String getCalibrationSpaceKey() { return calibrationSpaceKey; }
    public void setCalibrationSpaceKey(final String value) { calibrationSpaceKey = value; }
    private String message;
    private String recipeSignature;
    private String sourceVersion;
    private String stage;
    private int analyzedWidth;
    private int analyzedHeight;
    /** full 或 stride:N；不能把屏幕像素冒充分析采样。 */
    private String sampling;
    private int bucketCount = 256;
    private ImageProcessingConfig.NormalizedCrop roi;
    private Histogram histogram;
    private RegionStats stats;
    private ClippingFacts clipping;

    public String getStatus() { return status; }
    public void setStatus(final String status) { this.status = status; }
    public String getPurpose() { return purpose; }
    public void setPurpose(final String purpose) { this.purpose = purpose; }
    public NeutralBalance getNeutralBalance() { return neutralBalance; }
    public void setNeutralBalance(final NeutralBalance neutralBalance) { this.neutralBalance = neutralBalance; }
    public String getMessage() { return message; }
    public void setMessage(final String message) { this.message = message; }
    public String getRecipeSignature() { return recipeSignature; }
    public void setRecipeSignature(final String recipeSignature) { this.recipeSignature = recipeSignature; }
    public String getSourceVersion() { return sourceVersion; }
    public void setSourceVersion(final String sourceVersion) { this.sourceVersion = sourceVersion; }
    public String getStage() { return stage; }
    public void setStage(final String stage) { this.stage = stage; }
    public int getAnalyzedWidth() { return analyzedWidth; }
    public void setAnalyzedWidth(final int analyzedWidth) { this.analyzedWidth = analyzedWidth; }
    public int getAnalyzedHeight() { return analyzedHeight; }
    public void setAnalyzedHeight(final int analyzedHeight) { this.analyzedHeight = analyzedHeight; }
    public String getSampling() { return sampling; }
    public void setSampling(final String sampling) { this.sampling = sampling; }
    public int getBucketCount() { return bucketCount; }
    public void setBucketCount(final int bucketCount) { this.bucketCount = bucketCount; }
    public ImageProcessingConfig.NormalizedCrop getRoi() { return roi; }
    public void setRoi(final ImageProcessingConfig.NormalizedCrop roi) { this.roi = roi; }
    public Histogram getHistogram() { return histogram; }
    public void setHistogram(final Histogram histogram) { this.histogram = histogram; }
    public RegionStats getStats() { return stats; }
    public void setStats(final RegionStats stats) { this.stats = stats; }
    public ClippingFacts getClipping() { return clipping; }
    public void setClipping(final ClippingFacts clipping) { this.clipping = clipping; }

    /**
     * 中性区域建议：从基础正片取样、过滤过暗/剪裁样本后给出的增益与 EV 建议。
     * 建议绑定 sourceVersion + recipeSignature；任一项变化后前端不得继续使用。
     */
    public static final class NeutralBalance {
        private boolean available;
        private String stage;
        private long sampleCount;
        private long rejectedTooDark;
        private long rejectedClipped;
        private long rejectedNonFinite;
        private double[] sampleMean;
        private double[] suggestedRgbGain;
        private double[] suggestedRgbBalanceEv;
        private String confidence;
        private String binding;
        private String note;
        private ImageProcessingConfig.NormalizedCrop roi;

        public boolean isAvailable() { return available; }
        public void setAvailable(final boolean available) { this.available = available; }
        public String getStage() { return stage; }
        public void setStage(final String stage) { this.stage = stage; }
        public long getSampleCount() { return sampleCount; }
        public void setSampleCount(final long sampleCount) { this.sampleCount = sampleCount; }
        public long getRejectedTooDark() { return rejectedTooDark; }
        public void setRejectedTooDark(final long rejectedTooDark) { this.rejectedTooDark = rejectedTooDark; }
        public long getRejectedClipped() { return rejectedClipped; }
        public void setRejectedClipped(final long rejectedClipped) { this.rejectedClipped = rejectedClipped; }
        public long getRejectedNonFinite() { return rejectedNonFinite; }
        public void setRejectedNonFinite(final long rejectedNonFinite) { this.rejectedNonFinite = rejectedNonFinite; }
        public double[] getSampleMean() { return sampleMean; }
        public void setSampleMean(final double[] sampleMean) { this.sampleMean = sampleMean; }
        public double[] getSuggestedRgbGain() { return suggestedRgbGain; }
        public void setSuggestedRgbGain(final double[] suggestedRgbGain) { this.suggestedRgbGain = suggestedRgbGain; }
        public double[] getSuggestedRgbBalanceEv() { return suggestedRgbBalanceEv; }
        public void setSuggestedRgbBalanceEv(final double[] suggestedRgbBalanceEv) { this.suggestedRgbBalanceEv = suggestedRgbBalanceEv; }
        public String getConfidence() { return confidence; }
        public void setConfidence(final String confidence) { this.confidence = confidence; }
        public String getBinding() { return binding; }
        public void setBinding(final String binding) { this.binding = binding; }
        public String getNote() { return note; }
        public void setNote(final String note) { this.note = note; }
        public ImageProcessingConfig.NormalizedCrop getRoi() { return roi; }
        public void setRoi(final ImageProcessingConfig.NormalizedCrop roi) { this.roi = roi; }
    }

    /** 每通道直方图；长数组按 bucketCount 输出。 */
    public static final class Histogram {
        private long[] red;
        private long[] green;
        private long[] blue;
        private long[] luma;
        private long underflow;
        private long overflow;

        public long[] getRed() { return red; }
        public void setRed(final long[] red) { this.red = red; }
        public long[] getGreen() { return green; }
        public void setGreen(final long[] green) { this.green = green; }
        public long[] getBlue() { return blue; }
        public void setBlue(final long[] blue) { this.blue = blue; }
        public long[] getLuma() { return luma; }
        public void setLuma(final long[] luma) { this.luma = luma; }
        public long getUnderflow() { return underflow; }
        public void setUnderflow(final long underflow) { this.underflow = underflow; }
        public long getOverflow() { return overflow; }
        public void setOverflow(final long overflow) { this.overflow = overflow; }
    }

    /** 区域统计；数组长度固定为 3（R/G/B）。 */
    public static final class RegionStats {
        private long pixelCount;
        private double[] mean;
        private double[] min;
        private double[] max;
        private long[] clippedLow;
        private long[] clippedHigh;

        public long getPixelCount() { return pixelCount; }
        public void setPixelCount(final long pixelCount) { this.pixelCount = pixelCount; }
        public double[] getMean() { return mean; }
        public void setMean(final double[] mean) { this.mean = mean; }
        public double[] getMin() { return min; }
        public void setMin(final double[] min) { this.min = min; }
        public double[] getMax() { return max; }
        public void setMax(final double[] max) { this.max = max; }
        public long[] getClippedLow() { return clippedLow; }
        public void setClippedLow(final long[] clippedLow) { this.clippedLow = clippedLow; }
        public long[] getClippedHigh() { return clippedHigh; }
        public void setClippedHigh(final long[] clippedHigh) { this.clippedHigh = clippedHigh; }
    }

    /** 剪裁事实按阶段分开；与 sRGB 预览饱和值无关。 */
    public static final class ClippingFacts {
        private Map<String, ClippingStage> stages = new LinkedHashMap<>();

        public Map<String, ClippingStage> getStages() { return stages; }
        public void setStages(final Map<String, ClippingStage> stages) {
            this.stages = stages == null ? new LinkedHashMap<>() : stages;
        }
    }

    public static final class ClippingStage {
        private boolean available;
        private long[] clippedLow;
        private long[] clippedHigh;
        private String note;

        public boolean isAvailable() { return available; }
        public void setAvailable(final boolean available) { this.available = available; }
        public long[] getClippedLow() { return clippedLow; }
        public void setClippedLow(final long[] clippedLow) { this.clippedLow = clippedLow; }
        public long[] getClippedHigh() { return clippedHigh; }
        public void setClippedHigh(final long[] clippedHigh) { this.clippedHigh = clippedHigh; }
        public String getNote() { return note; }
        public void setNote(final String note) { this.note = note; }
    }
}
