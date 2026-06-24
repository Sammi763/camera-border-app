package com.camborder.app.dto;

import java.util.Collections;
import java.util.Map;

/**
 * 统一错误响应体，序列化为 {"error": "..."}，与历史接口契约保持一致。
 */
public final class ErrorResponse {

    private final String error;

    public ErrorResponse(final String error) {
        this.error = error;
    }

    public String getError() {
        return error;
    }

    public Map<String, String> toMap() {
        return Collections.singletonMap("error", error);
    }
}
