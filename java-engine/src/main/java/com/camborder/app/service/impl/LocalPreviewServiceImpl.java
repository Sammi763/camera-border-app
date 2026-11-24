package com.camborder.app.service.impl;

import com.camborder.app.dto.PreviewRequest;
import com.camborder.app.dto.PreviewResponse;
import com.camborder.app.dto.FidelityReport;
import com.camborder.app.exception.PreviewGenerationException;
import com.camborder.app.repository.PreviewStore;
import com.camborder.app.service.ImageRenderService;
import com.camborder.app.service.PreviewService;
import com.camborder.app.util.FloatImageOps;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.awt.color.ICC_ColorSpace;
import java.awt.image.BufferedImage;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;

/**
 * 本地单图预览服务实现（service.impl 层）。
 * 负责把预览请求转换为预览响应：委托图像渲染服务合成图像并登记到预览存储。
 * 真实渲染能力由 {@link ImageRenderService} 统一提供，预览与导出共用同一套逻辑，避免复制。
 */
@Service
public final class LocalPreviewServiceImpl implements PreviewService {

    private final ImageRenderService imageRenderService;
    private final PreviewStore previewStore;
    private final FilmProcessingPipeline filmProcessingPipeline;
    private final com.camborder.app.util.FilmCompositor compositor;

    public LocalPreviewServiceImpl(final ImageRenderService imageRenderService,
                                   final PreviewStore previewStore,
                                   final FilmProcessingPipeline filmProcessingPipeline) {
        this(imageRenderService, previewStore, filmProcessingPipeline, new com.camborder.app.util.FilmCompositor(
                new com.camborder.app.util.BorderStyleRenderer(), new com.camborder.app.util.TextRenderer(),
                new com.camborder.app.util.LogoRenderer(), new com.camborder.app.util.GradientPainter()));
    }

    @Autowired
    public LocalPreviewServiceImpl(final ImageRenderService renderer, final PreviewStore store,
            final FilmProcessingPipeline pipeline, final com.camborder.app.util.FilmCompositor compositor) {
        this.imageRenderService = renderer; this.previewStore = store;
        this.filmProcessingPipeline = pipeline; this.compositor = compositor;
    }

    /** 兼容旧测试/嵌入调用；底片配置在无 pipeline 时明确失败。 */
    public LocalPreviewServiceImpl(final ImageRenderService imageRenderService,
                                   final PreviewStore previewStore) {
        this(imageRenderService, previewStore, null);
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
        ImageRenderService.ComposeOutcome outcome;
        byte[] pngBytes;
        final List<PreviewResponse.TextBounds> textBounds = new ArrayList<>();
        final String stage = request.getStage() == null ? "current-positive" : request.getStage();
        final boolean interactive = "interactive".equals(request.getPreviewQuality())
                && "current-positive".equals(stage) && !request.isSourceCoordinates()
                && compositor.canComposeInteractive(request.getRecipe());
        if (request.getRecipe().getImageProcessing() != null) {
            if (filmProcessingPipeline == null) {
                throw new PreviewGenerationException("底片处理管线未配置");
            }
            final boolean borderless = "current-positive".equals(stage)
                    && Boolean.TRUE.equals(request.getRecipe().getBorderlessMaster());
            try (FilmProcessingPipeline.Processed processed = interactive
                    ? filmProcessingPipeline.processInteractivePreview(request.getRecipe(), request.getMaxWidth(), request.getMaxHeight())
                    : request.isSourceCoordinates()
                    ? filmProcessingPipeline.process(request.getRecipe(), stage)
                    : filmProcessingPipeline.processForOutput(request.getRecipe(), stage,
                    request.getMaxWidth(), request.getMaxHeight(), borderless)) {
                final com.camborder.app.util.FloatRgbImage rendered = request.isSourceCoordinates()
                        ? FloatImageOps.fitWithin(processed.getImage(), request.getMaxWidth(), request.getMaxHeight())
                        : interactive
                            ? compositor.composeInteractive(processed.getImage(), processed.getSourceDecode(), request.getRecipe(),
                                    request.getMaxWidth(), request.getMaxHeight(), borderless)
                            : compositor.compose(processed.getImage(), request.getRecipe(), request.getMaxWidth(),
                                    request.getMaxHeight(), borderless, "current-positive".equals(stage) ? textBounds::add : null);
                if (request.isActualPixels() && Math.max(rendered.getWidth(), rendered.getHeight()) > 8192)
                    throw new com.camborder.app.exception.FilmProcessingException("完整像素超过检查预算，请切回适应窗口",
                            org.springframework.http.HttpStatus.BAD_REQUEST, "FILM_ACTUAL_PIXELS_TOO_LARGE");
                outcome = new ImageRenderService.ComposeOutcome(
                        interactive ? FloatImageOps.toBufferedImage8(rendered) : FloatImageOps.toBufferedImage16(rendered),
                        processed.getSourceDecode(), processed.getSourceInfo());
                // 编码也发生在预算租约内，覆盖预览的完整生命周期。
                pngBytes = interactive ? imageRenderService.toInteractivePng(outcome.getImage())
                        : imageRenderService.toPng(outcome.getImage());
            }
        } else {
            outcome = imageRenderService.compose(
                    request.getRecipe(), request.getMaxWidth(), request.getMaxHeight());
            pngBytes = imageRenderService.toPng(outcome.getImage());
        }

        String previewId = previewStore.store(pngBytes);
        PreviewResponse response = new PreviewResponse(
                "ok",
                "Preview generated from local image.",
                true,
                "/previews/" + previewId
        );
        // 解码来源随响应返回：RAW 只展示内嵌 JPEG 的受限像素来源说明。
        response.setSourceDecode(outcome.getSourceDecode());
        response.setPreviewQuality(interactive ? "interactive" : "exact");
        if (!textBounds.isEmpty()) response.setTextBounds(textBounds);
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
        if (request.getRecipe().getImageProcessing() != null) {
            output.setWorkingDataType("float32");
            output.setAlgorithmVersion(request.getRecipe().getImageProcessing().getAlgorithmVersion());
        }
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
