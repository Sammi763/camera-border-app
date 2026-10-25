package com.camborder.app.service.impl;

import com.camborder.app.dto.ExportSettings;
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
        BufferedImage source = read.getImage();
        final java.awt.Color borderColor = ColorParser.parse(
                recipe.getBorder() == null ? null : recipe.getBorder().getColor(), "#FFFFFF");
        BufferedImage placed = imagePlacementRenderer.render(
                source, recipe.getImagePlacement(), borderColor);
        BufferedImage scaled = imageScaler.scale(placed, maxWidth, maxHeight);
        BufferedImage canvas = borderComposer.compose(scaled, recipe.getBorder(), recipe.getGradient());
        // 边框风格装饰：绘制在边框背景之上、文字与品牌标识之下；
        // 未识别的风格 id 或 null 时保持原始行为
        borderStyleRenderer.draw(canvas, recipe.getBorderStyle(), recipe.getBorder(),
                scaled.getWidth(), scaled.getHeight());
        // 文字定位需要区分「图片区域」与「边框区域」，传入边框配置与缩放后图片尺寸
        textRenderer.draw(canvas, recipe.getTexts(), recipe.getBorder(),
                scaled.getWidth(), scaled.getHeight());
        // 品牌标识绘制（如果启用）
        logoRenderer.draw(canvas, recipe.getLogo(), recipe.getBorder());
        return new ComposeOutcome(canvas, read.getSourceDecode(), read.getSourceInfo());
    }

    @Override
    public byte[] toPng(final BufferedImage image) {
        return imageEncoder.toPng(image);
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
