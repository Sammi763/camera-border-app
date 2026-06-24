package com.camborder.app.dto;

/**
 * 渲染任务状态响应 DTO：jobId、状态、消息、输出路径。
 */
public final class RenderJobStatusResponse {

    private String jobId;
    private String status;
    private String message;
    private String outputPath;

    public RenderJobStatusResponse() {
    }

    public RenderJobStatusResponse(final String jobId, final String status,
                                   final String message, final String outputPath) {
        this.jobId = jobId;
        this.status = status;
        this.message = message;
        this.outputPath = outputPath;
    }

    public String getJobId() {
        return jobId;
    }

    public void setJobId(final String jobId) {
        this.jobId = jobId;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(final String status) {
        this.status = status;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(final String message) {
        this.message = message;
    }

    public String getOutputPath() {
        return outputPath;
    }

    public void setOutputPath(final String outputPath) {
        this.outputPath = outputPath;
    }
}
