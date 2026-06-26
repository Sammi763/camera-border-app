package com.camborder.app.dto;

import java.util.Map;

/**
 * 文本变量格式化请求 DTO。
 * 用于 POST /api/metadata/format，将模板中的 {Camera} 等变量替换为实际值。
 */
public final class FormatMetadataTextRequest {

    private String template;
    private Map<String, String> metadata;

    public FormatMetadataTextRequest() {
    }

    public FormatMetadataTextRequest(final String template, final Map<String, String> metadata) {
        this.template = template;
        this.metadata = metadata;
    }

    public String getTemplate() {
        return template;
    }

    public void setTemplate(final String template) {
        this.template = template;
    }

    public Map<String, String> getMetadata() {
        return metadata;
    }

    public void setMetadata(final Map<String, String> metadata) {
        this.metadata = metadata;
    }
}
