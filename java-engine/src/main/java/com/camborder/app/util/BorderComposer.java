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
        return compose(scaled, border, null, 1.0);
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
        return compose(scaled, border, gradient, 1.0);
    }

    /**
     * 按渲染比例缩放边框后合成画布。
     *
     * 配方像素语义以全分辨率有向源图为基准；预览与档位导出把照片等比缩小时，
     * 边框必须按同一 renderScale 缩放，保证任何输出尺寸下「边框:照片」比例
     * 与原图尺寸导出一致（预览与导出同源一致）。renderScale=1 时行为不变。
     *
     * @param renderScale 照片当前宽度相对全分辨率目标宽度的比例，必须为正
     */
    public BufferedImage compose(final BufferedImage scaled, final BorderConfig border,
                                 final GradientConfig gradient, final double renderScale) {
        int[] insets = insets(border, renderScale);
        int top = insets[0];
        int bottom = insets[1];
        int left = insets[2];
        int right = insets[3];
        if (top == 0 && bottom == 0 && left == 0 && right == 0) {
            return scaled;
        }

        int width = scaled.getWidth() + left + right;
        int height = scaled.getHeight() + top + bottom;
        // 画布明确使用 sRGB 工作空间，同时保留源图 8/16-bit sample model，避免 Java2D
        // 把已经转换的像素继续标成源 ICC 或偷偷降位深。
        BufferedImage canvas = PixelBufferFactory.createLikeInSrgb(scaled, width, height);
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
        return insets(border, 1.0);
    }

    /**
     * 按渲染比例缩放后的边框内边距；语义同 {@link #insets(BorderConfig)}。
     * renderScale 非有限或非正时按 1 处理，保证异常输入不放大边框。
     */
    public static int[] insets(final BorderConfig border, final double renderScale) {
        if (border == null) {
            return new int[]{0, 0, 0, 0};
        }
        final double scale = safeScale(renderScale);
        return new int[]{
                scaleInset(border.getTop(), scale),
                scaleInset(border.getBottom(), scale),
                scaleInset(border.getLeft(), scale),
                scaleInset(border.getRight(), scale)
        };
    }

    private static double safeScale(final double renderScale) {
        return Double.isFinite(renderScale) && renderScale > 0 ? renderScale : 1.0;
    }

    private static int scaleInset(final int value, final double scale) {
        return Math.max(0, (int) Math.round(value * scale));
    }
}
