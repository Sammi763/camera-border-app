package com.camborder.app.exception;

import org.springframework.http.HttpStatus;

/**
 * 预览生成失败异常。
 * 表示客户端提供的 imagePath 或图片内容不可用（文件不存在、不可读、不是支持的图片）、
 * 颜色格式非法、文字 placement 不支持等，属于请求不合法，映射为 400。
 */
public final class PreviewGenerationException extends ApiException {

    public PreviewGenerationException(final String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }
}
