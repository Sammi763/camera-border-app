package com.camborder.app.dto;

/**
 * 渲染任务受理响应 DTO：jobId、状态、消息。
 */
public final class RenderJobAcceptedResponse {

    private String jobId;
    private String status;
    private String message;

    public RenderJobAcceptedResponse() {
    }

    public RenderJobAcceptedResponse(final String jobId, final String status, final String message) {
        this.jobId = jobId;
        this.status = status;
        this.message = message;
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
}
