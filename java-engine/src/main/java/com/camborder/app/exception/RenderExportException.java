package com.camborder.app.exception;

import org.springframework.http.HttpStatus;

/**
 * 导出失败异常。
 * 表示导出目标不可用（outputPath 为空、父目录不可写、写入失败等），
 * 属于请求不合法，映射为 400，不向响应暴露异常堆栈或本机敏感路径。
 */
public final class RenderExportException extends ApiException {

    public RenderExportException(final String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }
}
