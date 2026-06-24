package com.camborder.app.service.impl;

import com.camborder.app.dto.ExportSettings;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.service.ImageRenderService;
import com.camborder.app.util.BorderComposer;
import com.camborder.app.util.ImageEncoder;
import com.camborder.app.util.ImageReader;
import com.camborder.app.util.ImageScaler;
import com.camborder.app.util.TextRenderer;
import org.springframework.stereotype.Service;

import java.awt.image.BufferedImage;

/**
 * 图像渲染服务 Java 2D 实现（service.impl 层）。
 * 编排各 util 组件完成渲染流水线：读取 -> 缩放 -> 边框 -> 文字 -> 编码。
 * 本类只做编排，不承担具体渲染逻辑（各职责已在 util 包拆分）。
 *
 * 设计原则：
 * - 不复制渲染逻辑，预览与导出都从这里拿合成后的 BufferedImage。
 * - 不引入数据库、队列中间件、Redis，纯 CPU + Java 2D。
 * - 当前阶段仅支持单段文字（texts[0]）的简单排版，不做多段复杂排版。
 */
@Service
public final class Java2DImageRenderService implements ImageRenderService {

    private final ImageReader imageReader;
    private final ImageScaler imageScaler;
    private final BorderComposer borderComposer;
    private final TextRenderer textRenderer;
    private final ImageEncoder imageEncoder;

    public Java2DImageRenderService(final ImageReader imageReader,
                                    final ImageScaler imageScaler,
                                    final BorderComposer borderComposer,
                                    final TextRenderer textRenderer,
                                    final ImageEncoder imageEncoder) {
        this.imageReader = imageReader;
        this.imageScaler = imageScaler;
        this.borderComposer = borderComposer;
        this.textRenderer = textRenderer;
        this.imageEncoder = imageEncoder;
    }

    @Override
    public BufferedImage compose(final RenderRecipe recipe, final int maxWidth, final int maxHeight) {
        BufferedImage source = imageReader.read(recipe.getImagePath());
        BufferedImage scaled = imageScaler.scale(source, maxWidth, maxHeight);
        BufferedImage canvas = borderComposer.compose(scaled, recipe.getBorder(), recipe.getGradient());
        // 文字定位需要区分「图片区域」与「边框区域」，传入边框配置与缩放后图片尺寸
        textRenderer.draw(canvas, recipe.getTexts(), recipe.getBorder(),
                scaled.getWidth(), scaled.getHeight());
        return canvas;
    }

    @Override
    public byte[] toPng(final BufferedImage image) {
        return imageEncoder.toPng(image);
    }

    @Override
    public String writeToFile(final BufferedImage image, final ExportSettings export) {
        // 解包 DTO 后交给编码器，保持 util 不依赖 dto
        return imageEncoder.writeToFile(image, export.getOutputPath(),
                export.getFormat(), export.getJpegQuality());
    }
}
