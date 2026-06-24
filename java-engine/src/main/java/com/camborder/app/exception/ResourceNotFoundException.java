package com.camborder.app.exception;

import org.springframework.http.HttpStatus;

/**
 * 资源不存在异常。
 * 用于按 id 查询预览/任务不存在等场景，映射为 404。
 */
public final class ResourceNotFoundException extends ApiException {

    public ResourceNotFoundException(final String message) {
        super(message, HttpStatus.NOT_FOUND);
    }
}
