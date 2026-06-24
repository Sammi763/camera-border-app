package com.camborder.app.service;

import com.camborder.app.dto.FilmFormatResponse;

import java.util.List;

/**
 * 画幅默认值服务接口：返回支持的画幅枚举及推荐边框。
 */
public interface FilmFormatService {

    List<FilmFormatResponse> listFilmFormats();
}
