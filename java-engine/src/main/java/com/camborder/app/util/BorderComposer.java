package com.camborder.app.util;

import com.camborder.app.model.BorderConfig;
import com.camborder.app.model.GradientConfig;
import org.springframework.stereotype.Component;

import java.awt.Graphics2D;
import java.awt.image.BufferedImage;

/**
 * 边框合成器（无状态组件）。
 * 在缩放图外层扩展画布并填充边框背景，再把原图贴到中间。
 * 单一职责：只做边框画布合成，不缩放、不绘制文字。
 *
 * 背景策略：
 * - gradient 启用（enabled=true）时，用 {@link GradientPainter} 绘制渐变背景。
 * - 否则用 border.color 纯色填充（颜色非法抛受控异常）。
 * 没有 border 或四边都为 0 时保持原图不变（无论是否配渐变）。
 *
 * 同时提供 {@link #insets(BorderConfig)} 作为边框内边距的单一事实来源，
 * 文字绘制器复用它来定位「图片区域」与「边框区域」。
 *
 * 预览与导出共用本类（同一套背景绘制逻辑），保证视觉一致。
 */
@Component
public final class BorderComposer {

    private final GradientPainter gradientPainter;

    public BorderComposer(final GradientPainter gradientPainter) {
        this.gradientPainter = gradientPainter;
    }

    /**
     * 在缩放图外层扩展画布并填充纯色边框，返回新画布（不启用渐变）。
     */
    public BufferedImage compose(final BufferedImage scaled, final BorderConfig border) {
        return compose(scaled, border, null);
    }

    /**
     * 在缩放图外层扩展画布并填充边框背景（可选渐变），返回新画布。
     *
     * @param scaled   缩放后的原图
     * @param border   边框配置
     * @param gradient 渐变配置，null 或未启用时退回纯色
     */
    public BufferedImage compose(final BufferedImage scaled, final BorderConfig border,
                                 final GradientConfig gradient) {
        int[] insets = insets(border);
        int top = insets[0];
        int bottom = insets[1];
        int left = insets[2];
        int right = insets[3];
        if (top == 0 && bottom == 0 && left == 0 && right == 0) {
            return scaled;
        }

        int width = scaled.getWidth() + left + right;
        int height = scaled.getHeight() + top + bottom;
        // 边框画布使用不透明 RGB
        BufferedImage canvas = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = canvas.createGraphics();
        try {
            if (isGradientEnabled(gradient)) {
                // 启用渐变：先画渐变背景，再把原图贴上去
                BufferedImage background = gradientPainter.paint(gradient, width, height);
                graphics.drawImage(background, 0, 0, null);
            } else {
                graphics.setColor(ColorParser.parse(border == null ? null : border.getColor(), "#FFFFFF"));
                graphics.fillRect(0, 0, width, height);
            }
            // 把缩放图按左边距/上边距贴到画布上
            graphics.drawImage(scaled, left, top, null);
        } finally {
            graphics.dispose();
        }
        return canvas;
    }

    /**
     * 判断渐变是否启用：配置非空、enabled=true，且 border 仍存在（无 border 时画布不扩展，渐变无意义）。
     */
    private boolean isGradientEnabled(final GradientConfig gradient) {
        return gradient != null && gradient.isEnabled();
    }

    /**
     * 计算边框内边距（top/bottom/left/right），负值收敛为 0，border 为 null 时全 0。
     * 返回数组顺序为 {top, bottom, left, right}，供文字绘制器定位区域使用。
     */
    public static int[] insets(final BorderConfig border) {
        if (border == null) {
            return new int[]{0, 0, 0, 0};
        }
        return new int[]{
                Math.max(0, border.getTop()),
                Math.max(0, border.getBottom()),
                Math.max(0, border.getLeft()),
                Math.max(0, border.getRight())
        };
    }
}
