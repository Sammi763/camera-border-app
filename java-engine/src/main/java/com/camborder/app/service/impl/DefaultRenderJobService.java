package com.camborder.app.service.impl;

import com.camborder.app.dto.RenderJobAcceptedResponse;
import com.camborder.app.dto.RenderJobRequest;
import com.camborder.app.dto.RenderJobStatusResponse;
import com.camborder.app.repository.RenderJobStore;
import com.camborder.app.service.ImageRenderService;
import com.camborder.app.service.RenderJobService;
import org.springframework.stereotype.Service;

import java.awt.image.BufferedImage;
import java.util.UUID;

/**
 * 渲染导出任务服务默认实现（service.impl 层）。
 * 原 {@code PlaceholderRenderService}，现已是真实实现，故更名，去掉误导性的"占位"含义。
 * 导出目前采用「同步渲染完成后再返回 accepted」策略，
 * 渲染结果与最终状态在内存存储中跟踪，GET /api/render-jobs/{jobId} 可查到 completed 状态。
 *
 * 当前阶段：
 * - 不引入数据库、队列中间件、Redis，状态用 RenderJobStore 内存跟踪。
 * - 同步完成渲染，足以支撑本地单图高质量导出。
 */
@Service
public final class DefaultRenderJobService implements RenderJobService {

    private final ImageRenderService imageRenderService;
    private final RenderJobStore renderJobStore;

    public DefaultRenderJobService(final ImageRenderService imageRenderService,
                                   final RenderJobStore renderJobStore) {
        this.imageRenderService = imageRenderService;
        this.renderJobStore = renderJobStore;
    }

    /**
     * 同步渲染并写入文件，登记最终状态为 completed。
     *
     * @throws com.camborder.app.exception.PreviewGenerationException 图片不存在、不可读、非图片、颜色非法或 placement 不支持时抛出
     * @throws com.camborder.app.exception.RenderExportException      outputPath 为空或不可写时抛出
     */
    @Override
    public RenderJobAcceptedResponse submitJob(final RenderJobRequest request) {
        String jobId = UUID.randomUUID().toString();

        // 导出用原图尺寸合成（maxWidth/maxHeight 传 0 表示不缩放），不受预览缩放限制约束
        BufferedImage composited = imageRenderService.compose(request.getRecipe(), 0, 0);
        // 同步渲染并写入文件；outputPath 为空或不可写时抛 RenderExportException，由控制器映射为 4xx
        String outputPath = imageRenderService.writeToFile(composited, request.getExport());

        // 渲染成功，登记最终状态为 completed，outputPath 指向真实文件
        renderJobStore.put(jobId, new RenderJobStatusResponse(
                jobId,
                "completed",
                "Render job completed — output written to " + outputPath,
                outputPath
        ));

        return new RenderJobAcceptedResponse(
                jobId,
                "accepted",
                "Render job accepted and completed."
        );
    }

    /**
     * 按 jobId 查询任务状态，不存在时返回 null（由控制器映射为 404）。
     */
    @Override
    public RenderJobStatusResponse getJobStatus(final String jobId) {
        return renderJobStore.get(jobId);
    }
}
