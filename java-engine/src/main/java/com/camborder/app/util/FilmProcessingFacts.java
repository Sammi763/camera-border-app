package com.camborder.app.util;

/**
 * 源图/工作图/输出图的事实快照（T04）。
 *
 * 三个 bitDepth 不能混为一个：sourceBitDepth 是输入栅格/传感器有效位深，
 * workingDataType 是中间计算类型，outputBitDepth 只在输出阶段填写。
 */
public final class FilmProcessingFacts {

    private final String sourcePath;
    private final int sourceWidth;
    private final int sourceHeight;
    private final int sourceBitDepth;
    private final String sourceColorSpace;
    private final String workingDataType;
    private final String workingColorSpace;
    private final int processingWidth;
    private final int processingHeight;
    private Integer outputBitDepth;
    private String outputColorSpace;

    public FilmProcessingFacts(final String sourcePath, final int sourceWidth, final int sourceHeight,
                               final int sourceBitDepth, final String sourceColorSpace,
                               final int processingWidth, final int processingHeight) {
        this.sourcePath = sourcePath;
        this.sourceWidth = sourceWidth;
        this.sourceHeight = sourceHeight;
        this.sourceBitDepth = sourceBitDepth;
        this.sourceColorSpace = sourceColorSpace;
        this.workingDataType = FloatRgbImage.WORKING_DATA_TYPE;
        this.workingColorSpace = FloatRgbImage.WORKING_COLOR_SPACE;
        this.processingWidth = processingWidth;
        this.processingHeight = processingHeight;
    }

    public String getSourcePath() { return sourcePath; }
    public int getSourceWidth() { return sourceWidth; }
    public int getSourceHeight() { return sourceHeight; }
    public int getSourceBitDepth() { return sourceBitDepth; }
    public String getSourceColorSpace() { return sourceColorSpace; }
    public String getWorkingDataType() { return workingDataType; }
    public String getWorkingColorSpace() { return workingColorSpace; }
    public int getProcessingWidth() { return processingWidth; }
    public int getProcessingHeight() { return processingHeight; }
    public Integer getOutputBitDepth() { return outputBitDepth; }
    public String getOutputColorSpace() { return outputColorSpace; }

    public FilmProcessingFacts withOutput(final int bitDepth, final String colorSpace) {
        this.outputBitDepth = bitDepth;
        this.outputColorSpace = colorSpace;
        return this;
    }
}
