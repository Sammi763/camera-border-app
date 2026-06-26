package com.camborder.app.controller;

import com.camborder.app.dto.FilmStockResponse;
import com.camborder.app.service.FilmStockService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 内置胶片库接口：GET /api/assets/film-stocks。
 * 返回首版 15 款常见胶片，按品牌和 ISO 排序。
 */
@RestController
@RequestMapping("/api")
public final class FilmStockController {

    private final FilmStockService filmStockService;

    public FilmStockController(final FilmStockService filmStockService) {
        this.filmStockService = filmStockService;
    }

    @GetMapping("/assets/film-stocks")
    public ResponseEntity<List<FilmStockResponse>> listFilmStocks() {
        return ResponseEntity.ok(filmStockService.listFilmStocks());
    }
}
