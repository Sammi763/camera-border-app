package com.camborder.app.exception;

import org.springframework.http.HttpStatus;

/**
 * 受控 API 异常基类。
 * 携带对外错误信息与 HTTP 状态，由 {@link GlobalExceptionHandler} 统一转换为 {@link com.camborder.app.dto.ErrorResponse}。
 * 控制器遇到请求不合法（校验失败、资源不存在等）时直接抛出，不再到处手写 Map.of("error", ...)。
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;

    public ApiException(final String message, final HttpStatus status) {
        super(message);
        this.status = status;
    }

    public HttpStatus getStatus() {
        return status;
    }
}
