package com.camborder.app.service.impl;

import com.camborder.app.dto.ExportSettings;
import com.camborder.app.dto.RenderJobRequest;
import com.camborder.app.dto.RenderJobStatusResponse;
import com.camborder.app.repository.RenderJobStore;
import com.camborder.app.service.ImageRenderService;
import com.camborder.app.service.RenderJobService;
import com.camborder.app.util.ImageEncoder;
import org.springframework.stereotype.Service;

import java.awt.image.BufferedImage;
import java.util.UUID;

/**
 * 渲染导出任务服务默认实现（service.impl 层）。
 * 原 {@code PlaceholderRenderService}，现已是真实实现，故更名，去掉误导性的"占位"含义。
 *
 * 导出采用「同步渲染」策略：submitJob 内部完成读取、合成、写盘后，
 * 直接把最终状态（completed + 输出路径 + 各项专业能力结果）返回给调用方。
 * 同步返回消除了前端空轮询：本地桌面场景渲染由 CPU 完成，
 * 一次 HTTP 往返即可拿到结果，且避免了 60s 轮询超时对慢导出的误判。
 *
 * 目标尺寸：导出默认使用原图尺寸（ExportSettings.maxWidth/maxHeight 为 0）；
 * 用户选择输出尺寸预设时（1080P/2K/4K/自定义），按预设上限等比缩小。
 *
 * 当前阶段：
 * - 不引入数据库、队列中间件、Redis，状态用 RenderJobStore 内存跟踪。
 * - 状态同时登记到内存存储，GET /api/render-jobs/{jobId} 仍可查询最近一次结果。
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
     * 同步渲染并写入文件，返回最终状态（completed）。
     *
     * @throws com.camborder.app.exception.PreviewGenerationException 图片不存在、不可读、非图片、颜色非法或 placement 不支持时抛出
     * @throws com.camborder.app.exception.RenderExportException      outputPath 为空或不可写时抛出
     */
    @Override
    public RenderJobStatusResponse submitJob(final RenderJobRequest request) {
        String jobId = UUID.randomUUID().toString();

        // 导出按 ExportSettings 的目标尺寸合成（0/0 = 原图尺寸），不受预览缩放限制约束
        ExportSettings export = request.getExport();
        BufferedImage composited = imageRenderService.compose(
                request.getRecipe(), export.getMaxWidth(), export.getMaxHeight());
        // 同步渲染并写入文件；outputPath 为空或不可写时抛 RenderExportException，由控制器映射为 4xx
        ImageEncoder.ExportResult exportResult = imageRenderService.writeToFile(composited, export);

        // 登记最终状态为 completed，附带结构化能力结果；同时作为 POST 的同步响应返回
        RenderJobStatusResponse status = new RenderJobStatusResponse(
                jobId,
                "completed",
                "Render job completed — output written to " + exportResult.getOutputPath(),
                exportResult.getOutputPath(),
                exportResult.getActualFormat(),
                exportResult.getMetadataPreservation(),
                exportResult.getColorProfilePreservation(),
                exportResult.getHighBitDepth()
        );
        renderJobStore.put(jobId, status);
        return status;
    }

    /**
     * 按 jobId 查询任务状态，不存在时返回 null（由控制器映射为 404）。
     */
    @Override
    public RenderJobStatusResponse getJobStatus(final String jobId) {
        return renderJobStore.get(jobId);
    }
}
