package com.camborder.app.controller;

import com.camborder.app.dto.PreviewRequest;
import com.camborder.app.dto.PreviewResponse;
import com.camborder.app.exception.ApiException;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.service.PreviewService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 预览接口：POST /api/preview。
 * 控制层只负责 HTTP 入参校验与状态码，渲染委托 {@link PreviewService}。
 * 校验失败抛受控异常，由全局异常处理器统一转成 ErrorResponse。
 */
@RestController
@RequestMapping("/api")
public final class PreviewController {

    private final PreviewService previewService;

    public PreviewController(final PreviewService previewService) {
        this.previewService = previewService;
    }

    @PostMapping("/preview")
    public ResponseEntity<PreviewResponse> preview(@RequestBody final PreviewRequest request) {
        if (request == null || request.getRecipe() == null) {
            throw new ApiException("recipe is required", HttpStatus.BAD_REQUEST);
        }

        RenderRecipe recipe = request.getRecipe();

        if (recipe.getImagePath() == null || recipe.getImagePath().isBlank()) {
            throw new ApiException("imagePath is required", HttpStatus.BAD_REQUEST);
        }

        if (request.getMaxWidth() < 0) {
            throw new ApiException("maxWidth must be non-negative", HttpStatus.BAD_REQUEST);
        }

        if (request.getMaxHeight() < 0) {
            throw new ApiException("maxHeight must be non-negative", HttpStatus.BAD_REQUEST);
        }

        // 预览生成失败（文件不存在、不可读、非图片、颜色非法、placement 不支持）抛 PreviewGenerationException，
        // 由全局异常处理器统一映射为 4xx
        return ResponseEntity.ok(previewService.generatePreview(request));
    }
}
