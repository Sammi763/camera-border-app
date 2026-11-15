package com.camborder.app.controller;

import com.camborder.app.dto.FilmReferenceLibraryRequest;
import com.camborder.app.dto.FilmReferenceLibraryResponse;
import com.camborder.app.dto.FilmReferenceQueryResponse;
import com.camborder.app.service.FilmReferenceLibraryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * FilmArchive 只读关联接口。
 *
 * POST /api/film-reference-libraries 注册/刷新本机目录；GET /api/film-references
 * 查询已索引文献。两个接口都不返回或修改图片处理参数。
 */
@RestController
@RequestMapping("/api")
public final class FilmReferenceController {

    private final FilmReferenceLibraryService service;

    public FilmReferenceController(final FilmReferenceLibraryService service) {
        this.service = service;
    }

    @PostMapping("/film-reference-libraries")
    public ResponseEntity<FilmReferenceLibraryResponse> register(
            @RequestBody final FilmReferenceLibraryRequest request) {
        return ResponseEntity.ok(service.register(request));
    }

    @GetMapping("/film-references")
    public ResponseEntity<FilmReferenceQueryResponse> list(
            @RequestParam(value = "query", required = false) final String query,
            @RequestParam(value = "manufacturer", required = false) final String manufacturer,
            @RequestParam(value = "category", required = false) final String category,
            @RequestParam(value = "filmId", required = false) final String filmId,
            @RequestParam(value = "includeHidden", required = false, defaultValue = "true")
            final boolean includeHidden,
            @RequestParam(value = "offset", required = false, defaultValue = "0") final int offset,
            @RequestParam(value = "limit", required = false, defaultValue = "50") final int limit) {
        return ResponseEntity.ok(service.query(query, manufacturer, category, filmId,
                includeHidden, offset, limit));
    }
}
