package com.camborder.app.dto;

/**
 * 预览响应 DTO：状态、消息、是否可用、预览资源地址。
 */
public final class PreviewResponse {

    private String status;
    private String message;
    private boolean previewAvailable;
    private String previewUrl;

    public PreviewResponse() {
    }

    public PreviewResponse(final String status, final String message,
                           final boolean previewAvailable, final String previewUrl) {
        this.status = status;
        this.message = message;
        this.previewAvailable = previewAvailable;
        this.previewUrl = previewUrl;
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

    public boolean isPreviewAvailable() {
        return previewAvailable;
    }

    public void setPreviewAvailable(final boolean previewAvailable) {
        this.previewAvailable = previewAvailable;
    }

    public String getPreviewUrl() {
        return previewUrl;
    }

    public void setPreviewUrl(final String previewUrl) {
        this.previewUrl = previewUrl;
    }
}
