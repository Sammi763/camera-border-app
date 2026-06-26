package com.camborder.app.service;

import com.camborder.app.dto.FilmStockResponse;

import java.util.List;

/**
 * 内置胶片库服务接口。
 */
public interface FilmStockService {

    /**
     * 返回所有内置胶片，按品牌和 ISO 排序。
     */
    List<FilmStockResponse> listFilmStocks();
}
