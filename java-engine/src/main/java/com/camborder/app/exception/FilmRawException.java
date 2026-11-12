package com.camborder.app.exception;

import org.springframework.http.HttpStatus;

/** 底片真实 RAW 解码的受控错误；错误码供前端区分输入/组件/超时等状态。 */
public final class FilmRawException extends ApiException {

    public FilmRawException(final String message, final HttpStatus status, final String code) {
        super(message, status, code);
    }
}
