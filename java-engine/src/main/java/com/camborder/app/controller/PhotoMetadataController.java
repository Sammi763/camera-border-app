package com.camborder.app.controller;

import com.camborder.app.dto.PhotoMetadataRequest;
import com.camborder.app.dto.PhotoMetadataResponse;
import com.camborder.app.exception.ApiException;
import com.camborder.app.service.PhotoMetadataService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 摄影元数据读取接口：POST /api/photo-metadata。
 * 请求 {imagePath}，返回基础 EXIF 字段；读取不到的字段为 null，文件不存在/不可读返回 400。
 */
@RestController
@RequestMapping("/api")
public final class PhotoMetadataController {

    private final PhotoMetadataService photoMetadataService;

    public PhotoMetadataController(final PhotoMetadataService photoMetadataService) {
        this.photoMetadataService = photoMetadataService;
    }

    @PostMapping("/photo-metadata")
    public ResponseEntity<PhotoMetadataResponse> readMetadata(@RequestBody final PhotoMetadataRequest request) {
        if (request == null || request.getImagePath() == null || request.getImagePath().isBlank()) {
            throw new ApiException("imagePath is required", HttpStatus.BAD_REQUEST);
        }
        // 文件不存在/不可读抛 PreviewGenerationException，由全局异常处理器映射为 4xx
        return ResponseEntity.ok(photoMetadataService.readMetadata(request.getImagePath()));
    }
}
