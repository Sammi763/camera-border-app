package com.camborder.app.dto;

import com.camborder.app.util.ImageEncoder;

/**
 * 批量导出任务中单张图片的执行结果。
 * 状态只允许由任务服务推进，GET 响应会复制当前值，避免把可变内部对象泄露给序列化线程。
 */
public final class RenderJobItemStatusResponse {

    private int index;
    private String imagePath;
    private String status;
    private String outputPath;
    private String actualFormat;
    private String error;
    private ImageEncoder.FeatureResult metadataPreservation;
    private ImageEncoder.FeatureResult colorProfilePreservation;
    private ImageEncoder.FeatureResult highBitDepth;
    private SourceDecode sourceDecode;
    private FidelityReport fidelityReport;

    public RenderJobItemStatusResponse() {
    }

    public RenderJobItemStatusResponse(final int index, final String imagePath, final String status) {
        this.index = index;
        this.imagePath = imagePath;
        this.status = status;
    }

    public RenderJobItemStatusResponse copy() {
        RenderJobItemStatusResponse copy = new RenderJobItemStatusResponse(index, imagePath, status);
        copy.outputPath = outputPath;
        copy.actualFormat = actualFormat;
        copy.error = error;
        copy.metadataPreservation = metadataPreservation;
        copy.colorProfilePreservation = colorProfilePreservation;
        copy.highBitDepth = highBitDepth;
        copy.sourceDecode = sourceDecode;
        copy.fidelityReport = fidelityReport;
        return copy;
    }

    public int getIndex() { return index; }
    public void setIndex(final int index) { this.index = index; }

    public String getImagePath() { return imagePath; }
    public void setImagePath(final String imagePath) { this.imagePath = imagePath; }

    public String getStatus() { return status; }
    public void setStatus(final String status) { this.status = status; }

    public String getOutputPath() { return outputPath; }
    public void setOutputPath(final String outputPath) { this.outputPath = outputPath; }

    public String getActualFormat() { return actualFormat; }
    public void setActualFormat(final String actualFormat) { this.actualFormat = actualFormat; }

    public String getError() { return error; }
    public void setError(final String error) { this.error = error; }

    public ImageEncoder.FeatureResult getMetadataPreservation() { return metadataPreservation; }
    public void setMetadataPreservation(final ImageEncoder.FeatureResult value) { this.metadataPreservation = value; }

    public ImageEncoder.FeatureResult getColorProfilePreservation() { return colorProfilePreservation; }
    public void setColorProfilePreservation(final ImageEncoder.FeatureResult value) { this.colorProfilePreservation = value; }

    public ImageEncoder.FeatureResult getHighBitDepth() { return highBitDepth; }
    public void setHighBitDepth(final ImageEncoder.FeatureResult value) { this.highBitDepth = value; }

    public SourceDecode getSourceDecode() { return sourceDecode; }
    public void setSourceDecode(final SourceDecode value) { this.sourceDecode = value; }

    public FidelityReport getFidelityReport() { return fidelityReport; }
    public void setFidelityReport(final FidelityReport value) { this.fidelityReport = value; }
}
