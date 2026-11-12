package com.camborder.app.controller;

import com.camborder.app.dto.ImageAnalysisRequest;
import com.camborder.app.dto.ImageAnalysisResponse;
import com.camborder.app.exception.ApiException;
import com.camborder.app.service.FilmTaskKind;
import com.camborder.app.service.FilmTaskScheduler;
import com.camborder.app.service.ImageAnalysisService;
import com.camborder.app.service.impl.DefaultImageAnalysisService;
import com.camborder.app.util.RenderRecipeValidator;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 图像分析接口：POST /api/image-analysis。
 *
 * 与预览/导出共用同一份 RenderRecipe；装饰不参与统计。
 * T07 只提供照片阶段的取样/直方图，不负责渲染边框或导出。
 */
@RestController
@RequestMapping("/api")
public final class ImageAnalysisController {

    private final ImageAnalysisService analysisService;
    private final FilmTaskScheduler scheduler;
    private final ObjectMapper objectMapper;

    public ImageAnalysisController(final ImageAnalysisService analysisService,
                                   final FilmTaskScheduler scheduler,
                                   final ObjectMapper objectMapper) {
        this.analysisService = analysisService;
        this.scheduler = scheduler;
        this.objectMapper = objectMapper;
    }

    @PostMapping("/image-analysis")
    public ResponseEntity<ImageAnalysisResponse> analyze(
            @RequestBody final ImageAnalysisRequest request) {
        if (request == null || request.getRecipe() == null) {
            throw new ApiException("analysis recipe is required", HttpStatus.BAD_REQUEST,
                    "IMAGE_ANALYSIS_RECIPE_REQUIRED");
        }
        if (request.getStage() == null || request.getStage().isBlank()) {
            throw new ApiException("analysis stage is required", HttpStatus.BAD_REQUEST,
                    DefaultImageAnalysisService.CODE_INVALID_STAGE);
        }
        RenderRecipeValidator.validateRecipe(request.getRecipe(), "");
        final String clientId = request.getClientId() == null || request.getClientId().isBlank()
                ? "legacy_" + java.util.UUID.randomUUID() : request.getClientId();
        final long generation = request.getGeneration();
        try (com.camborder.app.util.FilmRequestGuard.Scope ignored = com.camborder.app.util.FilmRequestGuard.open(clientId, generation)) {
            final String dedupe = request.getClientId() == null ? null : dedupe(request);
            return ResponseEntity.ok(scheduler.run(FilmTaskKind.ANALYSIS, clientId, generation,
                    dedupe, () -> analysisService.analyze(request)));
        }
    }

    private String dedupe(final ImageAnalysisRequest request) {
        try {
            return objectMapper.writeValueAsString(request);
        } catch (Exception exception) {
            throw new ApiException("分析请求无法规范化", HttpStatus.BAD_REQUEST);
        }
    }
}
