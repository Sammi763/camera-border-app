package com.camborder.app.service.impl;

import com.camborder.app.dto.PreviewRequest;
import com.camborder.app.dto.PreviewResponse;
import com.camborder.app.repository.PreviewStore;
import com.camborder.app.service.ImageRenderService;
import com.camborder.app.service.PreviewService;
import org.springframework.stereotype.Service;

import java.awt.image.BufferedImage;

/**
 * 本地单图预览服务实现（service.impl 层）。
 * 负责把预览请求转换为预览响应：委托图像渲染服务合成图像并登记到预览存储。
 * 真实渲染能力由 {@link ImageRenderService} 统一提供，预览与导出共用同一套逻辑，避免复制。
 */
@Service
public final class LocalPreviewServiceImpl implements PreviewService {

    private final ImageRenderService imageRenderService;
    private final PreviewStore previewStore;

    public LocalPreviewServiceImpl(final ImageRenderService imageRenderService,
                                   final PreviewStore previewStore) {
        this.imageRenderService = imageRenderService;
        this.previewStore = previewStore;
    }

    /**
     * 根据 imagePath 读取本地图片，按 maxWidth/maxHeight 等比缩小并合成边框/文字，
     * 编码为 PNG 后登记到预览存储。
     *
     * @throws com.camborder.app.exception.PreviewGenerationException 当文件不存在、不可读、不是支持的图片、颜色非法或 placement 不支持时抛出
     */
    @Override
    public PreviewResponse generatePreview(final PreviewRequest request) {
        // 预览使用 maxWidth/maxHeight 做等比缩小；导出不传缩放约束
        BufferedImage composited = imageRenderService.compose(
                request.getRecipe(), request.getMaxWidth(), request.getMaxHeight());
        byte[] pngBytes = imageRenderService.toPng(composited);

        String previewId = previewStore.store(pngBytes);
        return new PreviewResponse(
                "ok",
                "Preview generated from local image.",
                true,
                "/previews/" + previewId
        );
    }
}
