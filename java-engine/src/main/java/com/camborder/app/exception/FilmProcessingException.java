package com.camborder.app.exception;

import org.springframework.http.HttpStatus;

/** 底片处理输入/中间结果的受控错误；带稳定 code，便于前端区分状态。 */
public final class FilmProcessingException extends ApiException {

    public FilmProcessingException(final String message, final HttpStatus status, final String code) {
        super(message, status, code);
    }
}
