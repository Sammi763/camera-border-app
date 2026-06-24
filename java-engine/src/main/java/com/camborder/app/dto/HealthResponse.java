package com.camborder.app.dto;

/**
 * 健康检查响应体。
 */
public final class HealthResponse {

    private final String status;
    private final String app;
    private final String version;

    public HealthResponse(final String status, final String app, final String version) {
        this.status = status;
        this.app = app;
        this.version = version;
    }

    public String getStatus() {
        return this.status;
    }

    public String getApp() {
        return this.app;
    }

    public String getVersion() {
        return this.version;
    }
}
