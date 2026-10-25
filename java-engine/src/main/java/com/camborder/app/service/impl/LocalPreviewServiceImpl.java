package com.camborder.app.service.impl;

import com.camborder.app.dto.PreviewRequest;
import com.camborder.app.dto.PreviewResponse;
import com.camborder.app.dto.FidelityReport;
import com.camborder.app.repository.PreviewStore;
import com.camborder.app.service.ImageRenderService;
import com.camborder.app.service.PreviewService;
import org.springframework.stereotype.Service;

import java.awt.color.ICC_ColorSpace;
import java.awt.image.BufferedImage;
import java.security.MessageDigest;

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
        ImageRenderService.ComposeOutcome outcome = imageRenderService.compose(
                request.getRecipe(), request.getMaxWidth(), request.getMaxHeight());
        byte[] pngBytes = imageRenderService.toPng(outcome.getImage());

        String previewId = previewStore.store(pngBytes);
        PreviewResponse response = new PreviewResponse(
                "ok",
                "Preview generated from local image.",
                true,
                "/previews/" + previewId
        );
        // 解码来源随响应返回：RAW 只展示内嵌 JPEG 的受限像素来源说明。
        response.setSourceDecode(outcome.getSourceDecode());
        final FidelityReport report = FidelityReport.completed("preview", "png");
        report.setPixelSource(outcome.getSourceInfo() == null
                ? "decoded-file" : outcome.getSourceInfo().getPixelSource());
        report.setMetadataSource(outcome.getSourceInfo() == null
                ? request.getRecipe().getImagePath() : outcome.getSourceInfo().getMetadataSource());
        if (outcome.getSourceInfo() != null) {
            report.setSource(outcome.getSourceInfo().toFacts());
            if ("embedded-jpeg".equals(outcome.getSourceInfo().getPixelSource())) {
                report.setFidelityScope("limited");
                report.getWarnings().add("RAW 仅使用内嵌 JPEG 像素");
            }
        }
        final FidelityReport.Facts output = new FidelityReport.Facts();
        output.setWidth(outcome.getImage().getWidth());
        output.setHeight(outcome.getImage().getHeight());
        output.setDecodedWidth(outcome.getImage().getWidth());
        output.setDecodedHeight(outcome.getImage().getHeight());
        output.setOrientedWidth(outcome.getImage().getWidth());
        output.setOrientedHeight(outcome.getImage().getHeight());
        output.setBitDepth(com.camborder.app.util.PixelBufferFactory.bitDepth(outcome.getImage()));
        output.setColorSpace(outcome.getImage().getColorModel().getColorSpace() instanceof ICC_ColorSpace
                ? "icc" : "sRGB");
        output.setOrientation(1);
        output.setOrientationApplied(true);
        final FidelityReport.IccFacts icc = new FidelityReport.IccFacts();
        final byte[] outputIcc = com.camborder.app.util.ImageEncoder.actualIccProfile(outcome.getImage());
        icc.setState("present");
        icc.setByteLength(outputIcc.length);
        icc.setSha256(sha256(outputIcc));
        output.setIcc(icc);
        report.setOutput(output);
        report.getTransformations().setResized(true);
        report.getTransformations().setOrientationNormalized(true);
        report.getTransformations().setThumbnailPolicy("not-present");
        response.setFidelityReport(report);
        return response;
    }

    private static String sha256(final byte[] value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value);
            StringBuilder result = new StringBuilder(digest.length * 2);
            for (byte datum : digest) result.append(String.format("%02x", datum));
            return result.toString();
        } catch (Exception exception) {
            return null;
        }
    }
}
