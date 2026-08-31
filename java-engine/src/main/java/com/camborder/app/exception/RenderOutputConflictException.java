package com.camborder.app.exception;

import org.springframework.http.HttpStatus;

/**
 * 导出目标与已有输入或其他导出项冲突。
 *
 * 冲突必须在接受任务前返回 409，避免异步任务静默覆盖用户文件。
 */
public final class RenderOutputConflictException extends ApiException {

    public RenderOutputConflictException(final String message) {
        super(message, HttpStatus.CONFLICT);
    }
}
