package com.camborder.app.util;

import com.camborder.app.exception.PreviewGenerationException;
import com.camborder.app.model.GradientConfig;
import com.camborder.app.model.GradientStop;
import org.springframework.stereotype.Component;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.LinearGradientPaint;
import java.awt.MultipleGradientPaint;
import java.awt.RadialGradientPaint;
import java.awt.geom.Point2D;
import java.awt.image.BufferedImage;
import java.util.List;

/**
 * 渐变背景绘制器（无状态组件）。
 * 单一职责：按 {@link GradientConfig} 在指定尺寸画布上绘制渐变背景，返回不透明 RGB 画布。
 * 不读取文件、不缩放图片、不绘制文字；边框合成器在拿到该背景后再把原图贴到中间。
 *
 * 渐变类型：
 * - linear：按 angle 计算起止点。0 度=从左到右，90 度=从上到下，180 度=从右到左，270 度=从下到上，
 *   任意角度按向量近似映射到画布边界。
 * - radial：以画布中心为圆心，从中心向外径向渐变，半径取画布对角线一半。
 *
 * stops：至少 2 个，否则抛受控异常；多于 2 个使用 LinearGradientPaint / RadialGradientPaint 多点插值。
 * 颜色复用 {@link ColorParser}，非法颜色抛受控异常。
 *
 * 预览与导出共用本类（同一套渐变逻辑），保证视觉一致。
 */
@Component
public final class GradientPainter {

    /**
     * 绘制渐变背景画布。
     *
     * @param gradient 渐变配置（调用方已确认 enabled=true）
     * @param width    画布宽度
     * @param height   画布高度
     * @return 已填充渐变的不透明 RGB 画布
     * @throws PreviewGenerationException type 非法、stops 不足或颜色非法时抛出
     */
    public BufferedImage paint(final GradientConfig gradient, final int width, final int height) {
        if (width <= 0 || height <= 0) {
            throw new PreviewGenerationException("invalid canvas size for gradient");
        }
        String type = gradient.getType();
        List<GradientStop> stops = gradient.getStops();
        if (stops == null || stops.size() < 2) {
            throw new PreviewGenerationException("gradient requires at least 2 stops");
        }

        int size = stops.size();
        Color[] colors = new Color[size];
        for (int i = 0; i < size; i++) {
            colors[i] = ColorParser.parse(stops.get(i).getColor(), "#000000");
        }
        // offset 归一化为严格递增的 [0,1] 分数，避免渐变 Paint 抛非法参数
        float[] fractions = buildFractions(stops);

        BufferedImage canvas = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = canvas.createGraphics();
        try {
            if ("linear".equalsIgnoreCase(type)) {
                graphics.setPaint(linearPaint(gradient.getAngle(), width, height, fractions, colors));
            } else if ("radial".equalsIgnoreCase(type)) {
                graphics.setPaint(radialPaint(width, height, fractions, colors));
            } else {
                throw new PreviewGenerationException("unsupported gradient type: " + type);
            }
            graphics.fillRect(0, 0, width, height);
        } finally {
            graphics.dispose();
        }
        return canvas;
    }

    /**
     * 构造线性渐变 Paint（统一用 LinearGradientPaint，它本身支持 2 个及以上的停靠点）。
     */
    private MultipleGradientPaint linearPaint(final double angle, final int width, final int height,
                                              final float[] fractions, final Color[] colors) {
        Point2D[] pts = linearEndpoints(angle, width, height);
        return new LinearGradientPaint(pts[0], pts[1], fractions, colors);
    }

    /**
     * 按角度计算线性渐变在画布内的起止点。
     * 0 度=左到右，90 度=上到下，180 度=右到左，270 度=下到上。
     */
    private Point2D[] linearEndpoints(final double angle, final int width, final int height) {
        double rad = Math.toRadians(angle);
        // 渐变方向单位向量
        double dx = Math.cos(rad);
        double dy = Math.sin(rad);
        // 以画布中心为基准，沿方向向两边延伸到边界，使渐变覆盖整个画布
        double cx = width / 2.0;
        double cy = height / 2.0;
        // 投影长度：保证从中心沿方向延伸能覆盖到画布最远角，避免渐变提前结束留白
        double halfLen = (Math.abs(dx) * width + Math.abs(dy) * height) / 2.0;
        Point2D start = new Point2D.Double(cx - dx * halfLen, cy - dy * halfLen);
        Point2D end = new Point2D.Double(cx + dx * halfLen, cy + dy * halfLen);
        return new Point2D[]{start, end};
    }

    /**
     * 构造径向渐变 Paint：以画布中心为圆心，半径取对角线一半。
     */
    private MultipleGradientPaint radialPaint(final int width, final int height,
                                              final float[] fractions, final Color[] colors) {
        Point2D center = new Point2D.Double(width / 2.0, height / 2.0);
        float radius = (float) (Math.sqrt(width * width + height * height) / 2.0);
        return new RadialGradientPaint(center, radius, fractions, colors);
    }

    /**
     * 将 stops 的 offset 归一化为严格递增且落在 [0,1] 的分数数组。
     * <p>
     * LinearGradientPaint / RadialGradientPaint 要求 fractions 严格递增，
     * 仅逐个 clamp offset 仍可能出现重复或乱序（例如中间 stop 的 offset≥1 与末尾强制为 1 撞值），
     * 因此先固定首尾为 0/1，再通过前向+后向两遍扫描消除非严格递增。
     * 扫描时使用 {@link Math#nextUp(float)} / {@link Math#nextDown(float)} 递增/递减，
     * 相比固定步长可避免浮点精度不足导致 {@code 1.0f - step == 1.0f} 的退化，保证最终单调合法。
     *
     * @param stops 渐变停靠点（至少 2 个）
     * @return 严格递增的分数数组，首元素 0.0、末元素 1.0
     */
    private float[] buildFractions(final List<GradientStop> stops) {
        int n = stops.size();
        float[] fractions = new float[n];
        for (int i = 0; i < n; i++) {
            fractions[i] = (float) Math.max(0.0, Math.min(1.0, stops.get(i).getOffset()));
        }
        fractions[0] = 0.0f;
        fractions[n - 1] = 1.0f;
        // 前向扫描：保证每个分数严格大于前一个（封顶 1.0 时尾部可能仍相等，由后向扫描修正）
        for (int i = 1; i < n; i++) {
            if (fractions[i] <= fractions[i - 1]) {
                fractions[i] = Math.min(1.0f, Math.nextUp(fractions[i - 1]));
            }
        }
        // 后向扫描：消除尾部因封顶 1.0 产生的相等值，保证整体严格递增直至末位 1.0
        for (int i = n - 2; i >= 0; i--) {
            if (fractions[i] >= fractions[i + 1]) {
                fractions[i] = Math.max(0.0f, Math.nextDown(fractions[i + 1]));
            }
        }
        return fractions;
    }
}
