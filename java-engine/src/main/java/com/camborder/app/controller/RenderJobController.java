package com.camborder.app.controller;

import com.camborder.app.dto.ExportSettings;
import com.camborder.app.dto.RenderJobRequest;
import com.camborder.app.dto.RenderJobStatusResponse;
import com.camborder.app.exception.ApiException;
import com.camborder.app.exception.ResourceNotFoundException;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.service.RenderJobService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Set;

/**
 * 渲染导出任务接口：
 * POST /api/render-jobs 提交导出任务，同步返回最终状态（completed + 输出路径）；
 * GET  /api/render-jobs/{jobId} 查询最近一次任务状态（兼容保留）。
 *
 * 控制层只负责 HTTP 入参校验与状态码，渲染委托 {@link RenderJobService}。
 * 校验失败抛受控异常，由全局异常处理器统一转成 ErrorResponse，不再到处手写 Map.of("error", ...)。
 */
@RestController
@RequestMapping("/api")
public final class RenderJobController {

    private static final Set<String> VALID_FORMATS = Set.of("png", "jpeg", "tiff");

    private final RenderJobService renderJobService;

    public RenderJobController(final RenderJobService renderJobService) {
        this.renderJobService = renderJobService;
    }

    @PostMapping("/render-jobs")
    public ResponseEntity<RenderJobStatusResponse> createJob(@RequestBody final RenderJobRequest request) {
        if (request == null || request.getRecipe() == null) {
            throw new ApiException("recipe is required", HttpStatus.BAD_REQUEST);
        }

        RenderRecipe recipe = request.getRecipe();

        if (recipe.getImagePath() == null || recipe.getImagePath().isBlank()) {
            throw new ApiException("imagePath is required", HttpStatus.BAD_REQUEST);
        }

        ExportSettings export = request.getExport();
        if (export == null || export.getOutputPath() == null || export.getOutputPath().isBlank()) {
            throw new ApiException("outputPath is required", HttpStatus.BAD_REQUEST);
        }
        if (export.getFormat() != null && !VALID_FORMATS.contains(export.getFormat())) {
            throw new ApiException("format must be png, jpeg or tiff", HttpStatus.BAD_REQUEST);
        }
        if (export.getJpegQuality() < 0 || export.getJpegQuality() > 100) {
            throw new ApiException("jpegQuality must be between 0 and 100", HttpStatus.BAD_REQUEST);
        }
        if (export.getMaxWidth() < 0 || export.getMaxHeight() < 0) {
            throw new ApiException("maxWidth and maxHeight must be non-negative", HttpStatus.BAD_REQUEST);
        }

        // 渲染/导出失败抛 PreviewGenerationException / RenderExportException，由全局异常处理器统一映射为 4xx。
        // 当前实现同步渲染，直接返回最终状态，前端无需轮询。
        return ResponseEntity.ok(renderJobService.submitJob(request));
    }

    @GetMapping("/render-jobs/{jobId}")
    public ResponseEntity<RenderJobStatusResponse> getJob(@PathVariable final String jobId) {
        RenderJobStatusResponse response = renderJobService.getJobStatus(jobId);
        if (response == null) {
            throw new ResourceNotFoundException("job not found");
        }
        return ResponseEntity.ok(response);
    }
}
