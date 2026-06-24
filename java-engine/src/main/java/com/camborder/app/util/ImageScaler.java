package com.camborder.app.util;

import org.springframework.stereotype.Component;

import java.awt.Graphics2D;
import java.awt.Image;
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
        int width = source.getWidth();
        int height = source.getHeight();

        double scaleW = maxWidth > 0 ? (double) maxWidth / width : Double.POSITIVE_INFINITY;
        double scaleH = maxHeight > 0 ? (double) maxHeight / height : Double.POSITIVE_INFINITY;
        double scale = Math.min(scaleW, scaleH);

        if (scale >= 1.0) {
            // 不放大，直接使用原图
            return source;
        }

        int newWidth = Math.max(1, (int) Math.round(width * scale));
        int newHeight = Math.max(1, (int) Math.round(height * scale));
        int type = source.getColorModel().hasAlpha()
                ? BufferedImage.TYPE_INT_ARGB
                : BufferedImage.TYPE_INT_RGB;

        BufferedImage output = new BufferedImage(newWidth, newHeight, type);
        Graphics2D graphics = output.createGraphics();
        try {
            graphics.drawImage(
                    source.getScaledInstance(newWidth, newHeight, Image.SCALE_SMOOTH),
                    0, 0, null);
        } finally {
            graphics.dispose();
        }
        return output;
    }
}
