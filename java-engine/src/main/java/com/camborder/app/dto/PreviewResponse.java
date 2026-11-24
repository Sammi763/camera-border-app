package com.camborder.app.dto;

import java.util.List;

/**
 * 预览响应 DTO：状态、消息、是否可用、预览资源地址。
 */
public final class PreviewResponse {

    private String previewQuality;
    public String getPreviewQuality() { return previewQuality; }
    public void setPreviewQuality(final String value) { previewQuality = value; }

    private String status;
    private String message;
    private boolean previewAvailable;
    private String previewUrl;
    /** 解码来源状态（standard / embedded-jpeg），可为 null。 */
    private SourceDecode sourceDecode;
    private FidelityReport fidelityReport;
    private List<TextBounds> textBounds;

    public List<TextBounds> getTextBounds() { return textBounds; }
    public void setTextBounds(final List<TextBounds> textBounds) { this.textBounds = textBounds; }

    /** 当前合成帧中各段已绘制文字的归一化区域，索引对应配方 texts。 */
    public static final class TextBounds {
        public final int index;
        public final double x;
        public final double y;
        public final double width;
        public final double height;

        public TextBounds(final int index, final double x, final double y, final double width, final double height) {
            this.index = index;
            this.x = x;
            this.y = y;
            this.width = width;
            this.height = height;
        }
    }

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

    public SourceDecode getSourceDecode() {
        return sourceDecode;
    }

    public void setSourceDecode(final SourceDecode sourceDecode) {
        this.sourceDecode = sourceDecode;
    }

    public FidelityReport getFidelityReport() {
        return fidelityReport;
    }

    public void setFidelityReport(final FidelityReport fidelityReport) {
        this.fidelityReport = fidelityReport;
    }
}
