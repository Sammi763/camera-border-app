package com.camborder.app.util;

import org.springframework.stereotype.Component;

import java.awt.Dimension;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;

/**
 * 图片缩放器（无状态组件）。
 * 按 maxWidth/maxHeight 等比缩小图片，不放大。0 表示该方向不约束。
 * 单一职责：只做缩放，不读取文件、不合成边框、不绘制文字。
 *
 * 预览传入 maxWidth/maxHeight 做等比缩小；导出传 0/0 表示用原图尺寸不缩放，
 * 不受预览的缩放限制约束。
 */
@Component
public final class ImageScaler {

    public BufferedImage scale(final BufferedImage source, final int maxWidth, final int maxHeight) {
        final Dimension size = fitDimensions(source.getWidth(), source.getHeight(), maxWidth, maxHeight);
        return scaleTo(source, size.width, size.height);
    }

    static BufferedImage scaleTo(final BufferedImage source, final int width, final int height) {
        if (width == source.getWidth() && height == source.getHeight()) {
            return source;
        }

        BufferedImage output = PixelBufferFactory.createLikeInSrgb(source, width, height);
        Graphics2D graphics = output.createGraphics();
        try {
            graphics.setRenderingHint(java.awt.RenderingHints.KEY_INTERPOLATION,
                    java.awt.RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            graphics.setRenderingHint(java.awt.RenderingHints.KEY_RENDERING,
                    java.awt.RenderingHints.VALUE_RENDER_QUALITY);
            graphics.drawImage(source, 0, 0, width, height, null);
        } finally {
            graphics.dispose();
        }
        return output;
    }

    static Dimension fitDimensions(final int width, final int height, final int maxWidth, final int maxHeight) {
        final double scaleW = maxWidth > 0 ? (double) maxWidth / width : Double.POSITIVE_INFINITY;
        final double scaleH = maxHeight > 0 ? (double) maxHeight / height : Double.POSITIVE_INFINITY;
        final double scale = Math.min(1, Math.min(scaleW, scaleH));
        return new Dimension(Math.max(1, (int) Math.round(width * scale)),
                Math.max(1, (int) Math.round(height * scale)));
    }
}
