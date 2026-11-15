package com.camborder.app.controller;

import com.camborder.app.exception.ApiException;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * 随安装包分发的胶片资料索引（只读）。
 *
 * 只包含研究目录与来源链接，不包含 PDF 正文、不产生校色参数；PDF 必须由用户本机
 * FilmArchive 目录关联。索引冻结在构建产物中，断网可用。
 */
@RestController
@RequestMapping("/api")
public final class FilmReferenceIndexController {

    @GetMapping(value = "/film-reference-index", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> index() {
        try {
            final ClassPathResource resource = new ClassPathResource("film-reference-index.json");
            final String json = new String(resource.getInputStream().readAllBytes(),
                    StandardCharsets.UTF_8);
            return ResponseEntity.ok(json);
        } catch (IOException exception) {
            throw new ApiException("随包胶片资料索引不可用", HttpStatus.INTERNAL_SERVER_ERROR,
                    "FILM_REFERENCE_INDEX_UNAVAILABLE");
        }
    }
}
