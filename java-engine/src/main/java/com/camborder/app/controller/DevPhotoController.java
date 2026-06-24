package com.camborder.app.controller;

import com.camborder.app.dto.DevPhotosResponse;
import com.camborder.app.service.DevPhotoService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 开发期样片列表接口：GET /api/dev/photos。
 * 控制层只负责 HTTP 与装配响应，目录解析逻辑在 {@link DevPhotoService}。
 */
@RestController
@RequestMapping("/api/dev")
public final class DevPhotoController {

    private final DevPhotoService devPhotoService;

    public DevPhotoController(final DevPhotoService devPhotoService) {
        this.devPhotoService = devPhotoService;
    }

    @GetMapping("/photos")
    public ResponseEntity<DevPhotosResponse> listPhotos() {
        return ResponseEntity.ok(new DevPhotosResponse(devPhotoService.listPhotos()));
    }
}
