package com.camborder.app.dto;

import com.camborder.app.util.ImageEncoder;

import java.util.ArrayList;
import java.util.List;

/**
 * 渲染任务状态响应 DTO：聚合进度、当前项、逐项结果与失败原因。
 *
 * 单图任务兼容保留 outputPath / actualFormat 等顶层字段；新客户端应读取 items。
 */
public final class RenderJobStatusResponse {

    private String jobId;
    private String status;
    private String message;
    private String outputPath;
    private String actualFormat;
    private String error;
    private ImageEncoder.FeatureResult metadataPreservation;
    private ImageEncoder.FeatureResult colorProfilePreservation;
    private ImageEncoder.FeatureResult highBitDepth;
    /** 解码来源状态（standard / raw-developed / embedded-preview-fallback），可为 null。 */
    private com.camborder.app.dto.SourceDecode sourceDecode;
    private int total;
    private int processed;
    private int completed;
    private int failed;
    private int cancelled;
    /** 当前执行项，使用从 1 开始的序号；尚未开始时为 null。 */
    private Integer currentItem;
    private List<RenderJobItemStatusResponse> items = new ArrayList<>();

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

    public String getError() { return error; }
    public void setError(final String error) { this.error = error; }

    public ImageEncoder.FeatureResult getMetadataPreservation() { return metadataPreservation; }
    public void setMetadataPreservation(final ImageEncoder.FeatureResult v) { this.metadataPreservation = v; }

    public ImageEncoder.FeatureResult getColorProfilePreservation() { return colorProfilePreservation; }
    public void setColorProfilePreservation(final ImageEncoder.FeatureResult v) { this.colorProfilePreservation = v; }

    public ImageEncoder.FeatureResult getHighBitDepth() { return highBitDepth; }
    public void setHighBitDepth(final ImageEncoder.FeatureResult v) { this.highBitDepth = v; }

    public com.camborder.app.dto.SourceDecode getSourceDecode() { return sourceDecode; }
    public void setSourceDecode(final com.camborder.app.dto.SourceDecode v) { this.sourceDecode = v; }

    public int getTotal() { return total; }
    public void setTotal(final int total) { this.total = total; }

    public int getProcessed() { return processed; }
    public void setProcessed(final int processed) { this.processed = processed; }

    public int getCompleted() { return completed; }
    public void setCompleted(final int completed) { this.completed = completed; }

    public int getFailed() { return failed; }
    public void setFailed(final int failed) { this.failed = failed; }

    public int getCancelled() { return cancelled; }
    public void setCancelled(final int cancelled) { this.cancelled = cancelled; }

    public Integer getCurrentItem() { return currentItem; }
    public void setCurrentItem(final Integer currentItem) { this.currentItem = currentItem; }

    public List<RenderJobItemStatusResponse> getItems() { return items; }
    public void setItems(final List<RenderJobItemStatusResponse> items) {
        this.items = items == null ? new ArrayList<>() : new ArrayList<>(items);
    }
}
