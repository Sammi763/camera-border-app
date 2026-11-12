package com.camborder.app.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 统一错误响应体，序列化为 {"error": "..."}；新契约可附加稳定机器码 code。
 * 为兼容旧响应，code 为 null 时不输出该字段。
 */
public final class ErrorResponse {

    private final String error;
    private final String code;

    public ErrorResponse(final String error) {
        this(error, null);
    }

    public ErrorResponse(final String error, final String code) {
        this.error = error;
        this.code = code;
    }

    public String getError() {
        return error;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public String getCode() {
        return code;
    }

    public Map<String, String> toMap() {
        final Map<String, String> result = new LinkedHashMap<>();
        result.put("error", error);
        if (code != null) {
            result.put("code", code);
        }
        return result;
    }
}
