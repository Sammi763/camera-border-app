package com.camborder.app.service.impl;

import com.camborder.app.dto.ExportSettings;
import com.camborder.app.dto.RenderJobRequest;
import com.camborder.app.dto.RenderJobSnapshot;
import com.camborder.app.dto.RenderJobStatusResponse;
import com.camborder.app.exception.ApiException;
import com.camborder.app.repository.RenderJobRecord;
import com.camborder.app.repository.RenderJobStore;
import com.camborder.app.service.ImageRenderService;
import com.camborder.app.service.RenderJobService;
import com.camborder.app.util.ImageEncoder;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.awt.image.BufferedImage;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;

/**
 * 渲染导出任务服务默认实现（service.impl 层）。
 * 原 {@code PlaceholderRenderService}，现已是真实实现，故更名，去掉误导性的"占位"含义。
 *
 * 导出采用有界的异步队列：提交后立即返回任务 ID，工作线程再逐项读取、合成并写盘。
 * 单一工作线程是默认资源上限，因而全分辨率和高位深请求不会并发持有多张大图。
 *
 * 目标尺寸：导出默认使用原图尺寸（ExportSettings.maxWidth/maxHeight 为 0）；
 * 用户选择输出尺寸预设时（1080P/2K/4K/自定义），按预设上限等比缩小。
 *
 * 当前阶段不引入数据库、队列中间件或 Redis；状态仅在本进程内保存。
 */
@Service
public final class DefaultRenderJobService implements RenderJobService {

    private final ImageRenderService imageRenderService;
    private final RenderJobStore renderJobStore;
    private final ExecutorService renderJobExecutor;
    private final ObjectMapper objectMapper;

    public DefaultRenderJobService(final ImageRenderService imageRenderService,
                                   final RenderJobStore renderJobStore,
                                   @Qualifier("renderJobExecutor") final ExecutorService renderJobExecutor,
                                   final ObjectMapper objectMapper) {
        this.imageRenderService = imageRenderService;
        this.renderJobStore = renderJobStore;
        this.renderJobExecutor = renderJobExecutor;
        this.objectMapper = objectMapper;
    }

    /**
     * 冻结请求快照并提交到有界队列，立即返回 queued/running 状态。
     * 任务项错误会写入逐项结果，不会阻塞同批次的后续图片。
     */
    @Override
    public RenderJobStatusResponse submitJob(final RenderJobRequest request) {
        String jobId = UUID.randomUUID().toString();
        List<RenderJobSnapshot> snapshots = freezeSnapshots(request.getItems());
        RenderJobRecord record = new RenderJobRecord(jobId, snapshots);
        renderJobStore.put(jobId, record);

        try {
            Future<?> future = renderJobExecutor.submit(() -> execute(record));
            record.setFuture(future);
        } catch (RejectedExecutionException exception) {
            renderJobStore.remove(jobId);
            throw new ApiException("render queue is full", HttpStatus.TOO_MANY_REQUESTS);
        }
        return record.snapshot();
    }

    /**
     * 按 jobId 查询任务状态，不存在时返回 null（由控制器映射为 404）。
     */
    @Override
    public RenderJobStatusResponse getJobStatus(final String jobId) {
        RenderJobRecord record = renderJobStore.get(jobId);
        return record == null ? null : record.snapshot();
    }

    /** 取消队列中未开始的图片；当前编码项不强制中断，避免产生半写文件。 */
    @Override
    public RenderJobStatusResponse cancelJob(final String jobId) {
        RenderJobRecord record = renderJobStore.get(jobId);
        return record == null ? null : record.cancel();
    }

    private List<RenderJobSnapshot> freezeSnapshots(final List<RenderJobSnapshot> source) {
        List<RenderJobSnapshot> frozen = new ArrayList<>();
        for (RenderJobSnapshot snapshot : source) {
            // ObjectMapper 经过 JSON 树复制所有可变嵌套模型（文字、渐变、边框、导出设置），
            // 使排队任务与控制器收到的请求对象完全断开引用。
            frozen.add(objectMapper.convertValue(snapshot, RenderJobSnapshot.class));
        }
        return frozen;
    }

    private void execute(final RenderJobRecord record) {
        List<RenderJobSnapshot> snapshots = record.snapshots();
        for (int index = 0; index < snapshots.size(); index++) {
            if (!record.startItem(index)) {
                return;
            }
            RenderJobSnapshot snapshot = snapshots.get(index);
            try {
                ExportSettings export = snapshot.getExport();
                ImageRenderService.ComposeOutcome outcome = imageRenderService.compose(
                        snapshot.getRecipe(), export.getMaxWidth(), export.getMaxHeight());
                BufferedImage composited = outcome.getImage();
                ImageEncoder.ExportResult exportResult = outcome.getSourceInfo() == null
                        ? imageRenderService.writeToFile(composited, export, snapshot.getRecipe().getImagePath())
                        : imageRenderService.writeToFile(
                        composited, export, snapshot.getRecipe().getImagePath(), outcome.getSourceInfo());
                record.completeItem(index, exportResult, outcome.getSourceDecode());
            } catch (RuntimeException exception) {
                record.failItem(index, safeErrorMessage(exception));
            }
            if (record.isCancellationRequested()) {
                // 下一次 startItem 会把剩余 queued 项统一标记为 cancelled。
                record.startItem(index + 1 < snapshots.size() ? index + 1 : index);
                return;
            }
        }
    }

    private String safeErrorMessage(final RuntimeException exception) {
        String message = exception.getMessage();
        return message == null || message.isBlank() ? "导出失败" : message;
    }
}
