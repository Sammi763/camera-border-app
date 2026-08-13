package com.camborder.app.dto;

import com.camborder.app.util.ImageEncoder;

/**
 * 渲染任务状态响应 DTO：jobId、状态、消息、输出路径、实际格式、各项能力应用结果。
 */
public final class RenderJobStatusResponse {

    private String jobId;
    private String status;
    private String message;
    private String outputPath;
    private String actualFormat;
    private ImageEncoder.FeatureResult metadataPreservation;
    private ImageEncoder.FeatureResult colorProfilePreservation;
    private ImageEncoder.FeatureResult highBitDepth;

    public RenderJobStatusResponse() {
    }

    public RenderJobStatusResponse(final String jobId, final String status,
                                   final String message, final String outputPath) {
        this.jobId = jobId;
        this.status = status;
        this.message = message;
        this.outputPath = outputPath;
    }

    public RenderJobStatusResponse(final String jobId, final String status,
                                   final String message, final String outputPath,
                                   final String actualFormat,
                                   final ImageEncoder.FeatureResult metadataPreservation,
                                   final ImageEncoder.FeatureResult colorProfilePreservation,
                                   final ImageEncoder.FeatureResult highBitDepth) {
        this.jobId = jobId;
        this.status = status;
        this.message = message;
        this.outputPath = outputPath;
        this.actualFormat = actualFormat;
        this.metadataPreservation = metadataPreservation;
        this.colorProfilePreservation = colorProfilePreservation;
        this.highBitDepth = highBitDepth;
    }

    public String getJobId() { return jobId; }
    public void setJobId(final String jobId) { this.jobId = jobId; }

    public String getStatus() { return status; }
    public void setStatus(final String status) { this.status = status; }

    public String getMessage() { return message; }
    public void setMessage(final String message) { this.message = message; }

    public String getOutputPath() { return outputPath; }
    public void setOutputPath(final String outputPath) { this.outputPath = outputPath; }

    public String getActualFormat() { return actualFormat; }
    public void setActualFormat(final String actualFormat) { this.actualFormat = actualFormat; }

    public ImageEncoder.FeatureResult getMetadataPreservation() { return metadataPreservation; }
    public void setMetadataPreservation(final ImageEncoder.FeatureResult v) { this.metadataPreservation = v; }

    public ImageEncoder.FeatureResult getColorProfilePreservation() { return colorProfilePreservation; }
    public void setColorProfilePreservation(final ImageEncoder.FeatureResult v) { this.colorProfilePreservation = v; }

    public ImageEncoder.FeatureResult getHighBitDepth() { return highBitDepth; }
    public void setHighBitDepth(final ImageEncoder.FeatureResult v) { this.highBitDepth = v; }
}
