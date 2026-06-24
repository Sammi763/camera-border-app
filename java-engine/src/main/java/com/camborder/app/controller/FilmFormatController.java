package com.camborder.app.controller;

import com.camborder.app.dto.FilmFormatResponse;
import com.camborder.app.service.FilmFormatService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 画幅默认值接口：GET /api/film-formats。
 * 返回固定画幅枚举及推荐边框，供前端切换画幅时填充边框默认值，后端不强制应用。
 */
@RestController
@RequestMapping("/api")
public final class FilmFormatController {

    private final FilmFormatService filmFormatService;

    public FilmFormatController(final FilmFormatService filmFormatService) {
        this.filmFormatService = filmFormatService;
    }

    @GetMapping("/film-formats")
    public ResponseEntity<List<FilmFormatResponse>> listFilmFormats() {
        return ResponseEntity.ok(filmFormatService.listFilmFormats());
    }
}
