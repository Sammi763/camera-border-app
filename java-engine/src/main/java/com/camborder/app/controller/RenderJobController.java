package com.camborder.app.controller;

import com.camborder.app.dto.ExportSettings;
import com.camborder.app.dto.RenderJobRequest;
import com.camborder.app.dto.RenderJobSnapshot;
import com.camborder.app.dto.RenderJobStatusResponse;
import com.camborder.app.exception.ApiException;
import com.camborder.app.exception.ResourceNotFoundException;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.service.RenderJobService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Set;

/**
 * 渲染导出任务接口：
 * POST /api/render-jobs 提交一张或多张冻结快照，返回 202 + jobId；
 * GET  /api/render-jobs/{jobId} 查询聚合进度、当前项和逐项结果；
 * DELETE /api/render-jobs/{jobId} 取消未执行项。
 *
 * 控制层只负责 HTTP 入参校验与状态码，渲染委托 {@link RenderJobService}。
 * 校验失败抛受控异常，由全局异常处理器统一转成 ErrorResponse，不再到处手写 Map.of("error", ...)。
 */
@RestController
@RequestMapping("/api")
public final class RenderJobController {

    private static final Set<String> VALID_FORMATS = Set.of("png", "jpeg", "tiff");
    private static final int MAX_SNAPSHOTS_PER_JOB = 100;

    private final RenderJobService renderJobService;

    public RenderJobController(final RenderJobService renderJobService) {
        this.renderJobService = renderJobService;
    }

    @PostMapping("/render-jobs")
    public ResponseEntity<RenderJobStatusResponse> createJob(@RequestBody final RenderJobRequest request) {
        if (request == null || request.getItems() == null || request.getItems().isEmpty()) {
            throw new ApiException("items must contain at least one snapshot", HttpStatus.BAD_REQUEST);
        }
        List<RenderJobSnapshot> snapshots = request.getItems();
        if (snapshots.size() > MAX_SNAPSHOTS_PER_JOB) {
            throw new ApiException("items must contain at most " + MAX_SNAPSHOTS_PER_JOB + " snapshots", HttpStatus.BAD_REQUEST);
        }
        for (int index = 0; index < snapshots.size(); index++) {
            validateSnapshot(snapshots.get(index), index, snapshots.size() > 1);
        }

        return ResponseEntity.status(HttpStatus.ACCEPTED).body(renderJobService.submitJob(request));
    }

    private void validateSnapshot(final RenderJobSnapshot snapshot, final int index, final boolean batch) {
        String prefix = batch ? "items[" + index + "] " : "";
        if (snapshot == null || snapshot.getRecipe() == null) {
            throw new ApiException(prefix + "recipe is required", HttpStatus.BAD_REQUEST);
        }
        RenderRecipe recipe = snapshot.getRecipe();

        if (recipe.getImagePath() == null || recipe.getImagePath().isBlank()) {
            throw new ApiException(prefix + "imagePath is required", HttpStatus.BAD_REQUEST);
        }

        ExportSettings export = snapshot.getExport();
        if (export == null || export.getOutputPath() == null || export.getOutputPath().isBlank()) {
            throw new ApiException(prefix + "outputPath is required", HttpStatus.BAD_REQUEST);
        }
        if (export.getFormat() != null && !VALID_FORMATS.contains(export.getFormat())) {
            throw new ApiException(prefix + "format must be png, jpeg or tiff", HttpStatus.BAD_REQUEST);
        }
        if (export.getJpegQuality() < 0 || export.getJpegQuality() > 100) {
            throw new ApiException(prefix + "jpegQuality must be between 0 and 100", HttpStatus.BAD_REQUEST);
        }
        if (export.getMaxWidth() < 0 || export.getMaxHeight() < 0) {
            throw new ApiException(prefix + "maxWidth and maxHeight must be non-negative", HttpStatus.BAD_REQUEST);
        }
    }

    @GetMapping("/render-jobs/{jobId}")
    public ResponseEntity<RenderJobStatusResponse> getJob(@PathVariable final String jobId) {
        RenderJobStatusResponse response = renderJobService.getJobStatus(jobId);
        if (response == null) {
            throw new ResourceNotFoundException("job not found");
        }
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/render-jobs/{jobId}")
    public ResponseEntity<RenderJobStatusResponse> cancelJob(@PathVariable final String jobId) {
        RenderJobStatusResponse response = renderJobService.cancelJob(jobId);
        if (response == null) {
            throw new ResourceNotFoundException("job not found");
        }
        return ResponseEntity.ok(response);
    }
}
