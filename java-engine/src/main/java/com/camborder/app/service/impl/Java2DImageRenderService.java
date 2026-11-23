package com.camborder.app.service.impl;

import com.camborder.app.dto.ExportSettings;
import com.camborder.app.dto.SourceDecode;
import com.camborder.app.model.ImagePlacement;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.service.ImageRenderService;
import com.camborder.app.util.BorderStyleRenderer;
import com.camborder.app.util.BorderComposer;
import com.camborder.app.util.ColorParser;
import com.camborder.app.util.ImageEncoder;
import com.camborder.app.util.ImageReader;
import com.camborder.app.util.ImagePlacementRenderer;
import com.camborder.app.util.ImageScaler;
import com.camborder.app.util.LogoRenderer;
import com.camborder.app.util.SourceImageInfo;
import com.camborder.app.util.TextRenderer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.awt.image.BufferedImage;

/**
 * 图像渲染服务 Java 2D 实现（service.impl 层）。
 * 编排各 util 组件完成渲染流水线：读取 -> 缩放 -> 边框 -> 边框风格 -> 文字 -> 品牌标识 -> 编码。
 * 本类只做编排，不承担具体渲染逻辑（各职责已在 util 包拆分）。
 *
 * 设计原则：
 * - 不复制渲染逻辑，预览与导出都从这里拿合成后的 BufferedImage。
 * - 不引入数据库、队列中间件、Redis，纯 CPU + Java 2D。
 */
@Service
public final class Java2DImageRenderService implements ImageRenderService {

    private final ImageReader imageReader;
    private final ImageScaler imageScaler;
    private final ImagePlacementRenderer imagePlacementRenderer;
    private final BorderComposer borderComposer;
    private final BorderStyleRenderer borderStyleRenderer;
    private final TextRenderer textRenderer;
    private final ImageEncoder imageEncoder;
    private final LogoRenderer logoRenderer;

    @Autowired
    public Java2DImageRenderService(final ImageReader imageReader,
                                    final ImageScaler imageScaler,
                                    final ImagePlacementRenderer imagePlacementRenderer,
                                    final BorderComposer borderComposer,
                                    final BorderStyleRenderer borderStyleRenderer,
                                    final TextRenderer textRenderer,
                                    final ImageEncoder imageEncoder,
                                    final LogoRenderer logoRenderer) {
        this.imageReader = imageReader;
        this.imageScaler = imageScaler;
        this.imagePlacementRenderer = imagePlacementRenderer;
        this.borderComposer = borderComposer;
        this.borderStyleRenderer = borderStyleRenderer;
        this.textRenderer = textRenderer;
        this.imageEncoder = imageEncoder;
        this.logoRenderer = logoRenderer;
    }

    /** 兼容旧测试/嵌入调用；生产环境由 Spring 注入共享的布局组件。 */
    public Java2DImageRenderService(final ImageReader imageReader,
                                    final ImageScaler imageScaler,
                                    final BorderComposer borderComposer,
                                    final BorderStyleRenderer borderStyleRenderer,
                                    final TextRenderer textRenderer,
                                    final ImageEncoder imageEncoder,
                                    final LogoRenderer logoRenderer) {
        this(imageReader, imageScaler, new ImagePlacementRenderer(), borderComposer,
                borderStyleRenderer, textRenderer, imageEncoder, logoRenderer);
    }

    @Override
    public ComposeOutcome compose(final RenderRecipe recipe, final int maxWidth, final int maxHeight) {
        // 预览在读取阶段按目标盒做 subsampling；导出传 0/0 则保持原图解码。
        final ImageReader.ReadResult read = imageReader.readWithSource(
                recipe.getImagePath(), maxWidth, maxHeight);
        return composeSource(read.getImage(), recipe, maxWidth, maxHeight,
                read.getSourceDecode(), read.getSourceInfo());
    }

    @Override
    public ComposeOutcome composeProcessed(final BufferedImage image, final RenderRecipe recipe,
                                           final int maxWidth, final int maxHeight,
                                           final SourceDecode sourceDecode,
                                           final SourceImageInfo sourceInfo) {
        if (image == null) {
            throw new IllegalArgumentException("processed image is required");
        }
        return composeSource(image, recipe, maxWidth, maxHeight, sourceDecode, sourceInfo);
    }

    private ComposeOutcome composeSource(final BufferedImage sourceImage, final RenderRecipe recipe,
                                         final int maxWidth, final int maxHeight,
                                         final SourceDecode sourceDecode,
                                         final SourceImageInfo sourceInfo) {
        BufferedImage source = sourceImage;
        final java.awt.Color borderColor = ColorParser.parse(
                recipe.getBorder() == null ? null : recipe.getBorder().getColor(), "#FFFFFF");
        BufferedImage placed = imagePlacementRenderer.render(
                source, recipe.getImagePlacement(), borderColor);
        BufferedImage scaled = imageScaler.scale(placed, maxWidth, maxHeight);
        // 配方像素语义（边框、字号、Logo、装饰线宽）以全分辨率有向源图为基准。
        // 预览与档位导出把照片等比缩小时，所有装饰参数必须按同一 renderScale 缩放，
        // 保证「边框:照片」构图比例与原图尺寸导出一致（预览与导出同源一致）。
        final double renderScale = resolveRenderScale(
                recipe.getImagePlacement(), sourceDecode, scaled.getWidth(),
                maxWidth, maxHeight);
        BufferedImage canvas = borderComposer.compose(scaled, recipe.getBorder(), recipe.getGradient(), renderScale);
        // 边框风格装饰：绘制在边框背景之上、文字与品牌标识之下；
        // 未识别的风格 id 或 null 时保持原始行为
        borderStyleRenderer.draw(canvas, recipe.getBorderStyle(), recipe.getBorder(),
                scaled.getWidth(), scaled.getHeight(), renderScale);
        // 文字定位需要区分「图片区域」与「边框区域」，传入边框配置与缩放后图片尺寸
        textRenderer.draw(canvas, recipe.getTexts(), recipe.getBorder(),
                scaled.getWidth(), scaled.getHeight(), renderScale);
        // 品牌标识绘制（如果启用）
        logoRenderer.draw(canvas, recipe.getLogo(), recipe.getBorder(), renderScale);
        return new ComposeOutcome(canvas, sourceDecode, sourceInfo);
    }

    /**
     * 计算配方像素语义到当前画布的缩放比例。
     *
     * 基准：全分辨率有向源尺寸下的 imagePlacement 目标宽度（即原图尺寸导出时
     * 照片区域的宽度）。当前照片宽度与该基准之比即所有装饰参数的缩放系数。
     * 原图尺寸导出（maxWidth/maxHeight 均为 0）固定为 1，行为与历史版本一致；
     * 解码事实缺失时保守回退 1，不做无依据的缩放。
     */
    private double resolveRenderScale(final ImagePlacement placement, final SourceDecode decode,
                                      final int scaledPhotoWidth, final int maxWidth, final int maxHeight) {
        if (maxWidth <= 0 && maxHeight <= 0) {
            return 1.0;
        }
        if (decode == null || decode.getFullWidth() <= 0 || decode.getFullHeight() <= 0) {
            return 1.0;
        }
        final ImagePlacementRenderer.Geometry fullGeometry =
                imagePlacementRenderer.calculate(decode.getFullWidth(), decode.getFullHeight(), placement);
        final double fullTargetWidth = fullGeometry.targetWidth();
        if (!Double.isFinite(fullTargetWidth) || fullTargetWidth <= 0) {
            return 1.0;
        }
        final double scale = scaledPhotoWidth / fullTargetWidth;
        return Double.isFinite(scale) && scale > 0 ? scale : 1.0;
    }

    @Override
    public byte[] toPng(final BufferedImage image) {
        return imageEncoder.toPng(image);
    }

    @Override
    public byte[] toInteractivePng(final BufferedImage image) {
        return imageEncoder.toInteractivePng(image);
    }


    @Override
    public ImageEncoder.ExportResult writeToFile(final BufferedImage image, final ExportSettings export) {
        return imageEncoder.writeToFile(image, export.getOutputPath(), export);
    }

    @Override
    public ImageEncoder.ExportResult writeToFile(final BufferedImage image, final ExportSettings export,
                                                 final String sourcePath) {
        return imageEncoder.writeToFile(image, export.getOutputPath(), export, sourcePath);
    }

    @Override
    public ImageEncoder.ExportResult writeToFile(final BufferedImage image, final ExportSettings export,
                                                 final String sourcePath,
                                                 final com.camborder.app.util.SourceImageInfo sourceInfo) {
        return imageEncoder.writeToFile(image, export.getOutputPath(), export, sourcePath, sourceInfo);
    }
}
