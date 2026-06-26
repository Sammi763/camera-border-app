package com.camborder.app.dto;

/**
 * 文本变量格式化响应 DTO。
 * 返回替换并清理后的最终文本。
 */
public final class FormatMetadataTextResponse {

    private final String text;

    public FormatMetadataTextResponse(final String text) {
        this.text = text;
    }

    public String getText() {
        return text;
    }
}
