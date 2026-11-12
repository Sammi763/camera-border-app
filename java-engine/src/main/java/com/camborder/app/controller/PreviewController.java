package com.camborder.app.controller;

import com.camborder.app.dto.PreviewRequest;
import com.camborder.app.dto.PreviewResponse;
import com.camborder.app.exception.ApiException;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.service.FilmTaskKind;
import com.camborder.app.service.FilmTaskScheduler;
import com.camborder.app.service.PreviewService;
import com.camborder.app.util.RenderRecipeValidator;
import com.fasterxml.jackson.databind.ObjectMapper;
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
    private final FilmTaskScheduler scheduler;
    private final ObjectMapper objectMapper;

    public PreviewController(final PreviewService previewService, final FilmTaskScheduler scheduler,
                             final ObjectMapper objectMapper) {
        this.previewService = previewService;
        this.scheduler = scheduler;
        this.objectMapper = objectMapper;
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

        RenderRecipeValidator.validateRecipe(recipe, "");
        if (request.getStage() != null && !java.util.Set.of("raw-linear", "base-positive", "current-positive").contains(request.getStage()))
            throw new ApiException("底片预览阶段非法", HttpStatus.BAD_REQUEST);
        if (recipe.getImageProcessing() == null && (request.getStage() != null || request.isSourceCoordinates()))
            throw new ApiException("底片对比选项需要 imageProcessing", HttpStatus.BAD_REQUEST);

        if (request.isActualPixels() && (request.getMaxWidth() != 0 || request.getMaxHeight() != 0))
            throw new ApiException("真实像素检查不能同时指定缩放尺寸", HttpStatus.BAD_REQUEST);

        if (request.getMaxWidth() < 0) {
            throw new ApiException("maxWidth must be non-negative", HttpStatus.BAD_REQUEST);
        }

        if (request.getMaxHeight() < 0) {
            throw new ApiException("maxHeight must be non-negative", HttpStatus.BAD_REQUEST);
        }

        // 预览生成失败（文件不存在、不可读、非图片、颜色非法、placement 不支持）抛 PreviewGenerationException，
        // 由全局异常处理器统一映射为 4xx
        if (recipe.getImageProcessing() == null) return ResponseEntity.ok(previewService.generatePreview(request));
        final String clientId = request.getClientId() == null || request.getClientId().isBlank()
                ? "legacy_" + java.util.UUID.randomUUID() : request.getClientId();
        final long generation = request.getGeneration();
        try (com.camborder.app.util.FilmRequestGuard.Scope ignored = com.camborder.app.util.FilmRequestGuard.open(clientId, generation)) {
            final String dedupe = request.getClientId() == null ? null : dedupe(request);
            final FilmTaskKind kind = request.getStage() == null
                    ? FilmTaskKind.PREVIEW : FilmTaskKind.STAGE_PREVIEW;
            return ResponseEntity.ok(scheduler.run(kind, clientId, generation,
                    dedupe, () -> previewService.generatePreview(request)));
        }
    }

    private String dedupe(final PreviewRequest request) {
        try {
            return objectMapper.writeValueAsString(request);
        } catch (Exception exception) {
            throw new ApiException("预览请求无法规范化", HttpStatus.BAD_REQUEST);
        }
    }
}
