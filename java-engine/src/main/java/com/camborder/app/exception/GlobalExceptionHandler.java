package com.camborder.app.exception;

import com.camborder.app.dto.ErrorResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;

/**
 * 统一异常处理。
 * 把受控异常（{@link ApiException} 及其子类）统一转换为 {@link ErrorResponse}，
 * 控制器只负责抛异常，不再到处手写 Map.of("error", ...)。
 *
 * {@link PreviewGenerationException}、{@link RenderExportException}、{@link ResourceNotFoundException}
 * 均继承自 ApiException，因此单个 ApiException 处理器即可覆盖全部受控错误，统一返回对应状态码且不暴露堆栈。
 */
@ControllerAdvice
public final class GlobalExceptionHandler {

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ErrorResponse> handleApiException(final ApiException e) {
        return ResponseEntity.status(e.getStatus()).body(new ErrorResponse(e.getMessage()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> handleUnreadable(final HttpMessageNotReadableException e) {
        // 请求体缺失或不可解析为 JSON，统一返回 400，不暴露内部解析细节
        return ResponseEntity.badRequest().body(new ErrorResponse("request body is missing or invalid"));
    }
}
