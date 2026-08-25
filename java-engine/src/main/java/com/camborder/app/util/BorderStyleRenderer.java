package com.camborder.app.util;

import com.camborder.app.model.BorderStyle;
import com.camborder.app.model.BorderConfig;
import org.springframework.stereotype.Component;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.RoundRectangle2D;
import java.awt.image.BufferedImage;

/**
 * 边框风格绘制器（无状态组件）。
 *
 * 在纯色/渐变边框背景之上叠加确定性装饰。Canvas（前端 canvasRenderer.drawBorderStyle）
 * 与本类使用同一套风格 ID、参数语义与几何规则；本注释即几何规格的唯一权威定义，
 * 两端实现必须逐条对应：
 *
 * 公共约定：
 * - 坐标系：画布左上角为原点；图片区域矩形 (ix,iy,iw,ih) = (borderLeft, borderTop, scaledW, scaledH)。
 * - intensity ∈ [0,100]，强度因子 fi = clamp(intensity)/100；fi = 0 时该风格不绘制任何内容。
 * - edgeWidth ≥ 0（像素），记 ew。
 * - holeCount：齿孔/刻痕数量。
 * - paperTone：装饰色（hex）；非法颜色回退到各风格的默认色（见下）。
 * - 未识别 / 空 id 或 style == null：不绘制任何内容（回退原始行为）。
 *
 * 各风格几何：
 * 1. exhibition-line 极简展览线框（默认色 #333333）：
 *    外扩距离 g = max(1, ew)；线宽 lw = max(1, round(ew * fi))；
 *    以 (ix-g, iy-g, iw+2g, ih+2g) 为路径描边（居中描边）。
 * 2. polaroid-shadow 宝丽来宽下边（阴影黑）：
 *    阴影带高 h = max(2, ew*2)，自图片底边 (iy+ih) 向下线性渐变
 *    rgba(0,0,0, 0.35*fi) → 透明；宽度为图片宽左右各外扩 max(1, ew)。
 * 3. film-perforation 135 齿孔（默认色 #e8e8e8）：
 *    条带高度 s = min(borderTop, borderBottom)；孔高 hh = clamp(s*0.45, 3, 60)；
 *    孔宽 ww = hh*1.4；圆角半径 r = ww*0.18；孔数 n = clamp(holeCount, 2, 80)；
 *    等间距 spacing = canvasW/n，第 i 个孔中心 x = spacing*(i+0.5)；
 *    上排圆心 y = borderTop/2，下排 y = canvasH - borderBottom/2。
 * 4. mat-double-line 中画幅卡纸留白双细线（默认色 #9a948a）：
 *    内线外扩 g1 = max(2, ew*2)，线间距 gap = max(2, ew)，线宽 lw = max(1, round(ew/3))；
 *    两条围绕图片矩形的居中描边。
 * 5. torn-edge 撕边纸张（默认色 #f7f5f0）：
 *    撕边带宽 w = max(2, ew)，锯齿幅度 amp = max(1, w*fi)，步长 step = max(4, w)；
 *    沿图片四边以步长 step 生成锯齿三角形（顶点在带内按序号奇偶交替收放），
 *    三角形底边贴图片边缘、顶点朝边框方向，填充纸色。无随机数，形状由序号奇偶决定。
 * 6. negative-band 黑色负片边（条带黑 #0a0a0a，孔色 #cfcfcf）：
 *    先以不透明度 alpha = round(255 * min(1, 0.6 + 0.4*fi)) 的黑色覆盖上/下边框条带；
 *    再打一排小孔：hh = clamp(s*0.32, 2, 40)，ww = hh*1.6，n = clamp(holeCount, 4, 100)，
 *    分布规则与 3 相同。
 * 7. magazine-keyline 杂志拼贴边框双键线（默认色 #111111）：
 *    粗键线外扩 o = max(1, ew/4)、线宽 lwt = max(1, round(ew/2))；
 *    细键线外扩 o + ew + lwt、线宽 1px、不透明度 40%。
 * 8. archive-label-box 摄影档案标签（默认色 #8a8578）：
 *    仅当下边框条带 ≥ 14px 时绘制。标签盒高 bh = clamp(round(bottom*0.5), 8, 26+ew)，
 *    右边距 m = max(6, ew*2)，盒宽 bw = clamp(round(iw*0.28), 60, cw-2m)；
 *    盒右缘 x = ix+iw-m，垂直居中于下条带；1px 描边 + 盒内两条占位横线
 *    （长度分别为盒宽的 70% 与 45%，厚度 1px，位于盒高的 ±15%）。
 */
@Component
public final class BorderStyleRenderer {

    /** 渲染入口：style 为 null 或未识别时直接返回（保持原行为）。 */
    public void draw(final BufferedImage canvas, final BorderStyle style,
                     final BorderConfig border, final int imageWidth, final int imageHeight) {
        if (canvas == null || style == null) {
            return;
        }
        final String id = style.getId();
        if (id == null || id.isBlank()) {
            return;
        }

        final double fi = clamp(style.getIntensity(), 0, 100) / 100.0;
        if (fi <= 0) {
            return;
        }
        final int ew = Math.max(0, style.getEdgeWidth());

        final int[] insets = BorderComposer.insets(border);
        final int top = insets[0];
        final int bottom = insets[1];
        final int left = insets[2];
        final int ix = left;
        final int iy = top;
        final int iw = imageWidth;
        final int ih = imageHeight;
        final int cw = canvas.getWidth();
        final int ch = canvas.getHeight();

        Graphics2D g = canvas.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            switch (id) {
                case "exhibition-line":
                    drawExhibitionLine(g, style, fi, ew, ix, iy, iw, ih);
                    break;
                case "polaroid-shadow":
                    drawPolaroidShadow(g, fi, ew, ix, iy, iw, ih);
                    break;
                case "film-perforation":
                    drawPerforation(g, style, cw, ch, top, bottom,
                            clamp(style.getHoleCount(), 2, 80));
                    break;
                case "mat-double-line":
                    drawMatDoubleLine(g, style, ew, ix, iy, iw, ih);
                    break;
                case "torn-edge":
                    drawTornEdge(g, style, fi, ew, ix, iy, iw, ih);
                    break;
                case "negative-band":
                    drawNegativeBand(g, style, fi, cw, ch, top, bottom);
                    break;
                case "magazine-keyline":
                    drawMagazineKeyline(g, style, ew, ix, iy, iw, ih);
                    break;
                case "archive-label-box":
                    drawArchiveLabel(g, style, cw, ch, bottom, ix, iy, iw, ew);
                    break;
                default:
                    // 未识别的风格 id：静默忽略，保持原始渲染行为
                    break;
            }
        } finally {
            g.dispose();
        }
    }

    // ---- 1. 极简展览线框 ------------------------------------------------------

    private void drawExhibitionLine(final Graphics2D g, final BorderStyle style, final double fi,
                                    final int ew, final int ix, final int iy, final int iw, final int ih) {
        final int gap = Math.max(1, ew);
        final float lw = (float) Math.max(1, Math.round(ew * fi));
        g.setColor(ColorParser.parse(style.getPaperTone(), "#333333"));
        g.setStroke(new BasicStroke(lw));
        g.drawRect(ix - gap, iy - gap, iw + 2 * gap, ih + 2 * gap);
    }

    // ---- 2. 宝丽来宽下边（底部柔和投影） -------------------------------------

    private void drawPolaroidShadow(final Graphics2D g, final double fi, final int ew,
                                    final int ix, final int iy, final int iw, final int ih) {
        final int bandH = Math.max(2, ew * 2);
        final int extend = Math.max(1, ew);
        final float alpha = (float) (0.35 * fi);
        final Color start = new Color(0, 0, 0, Math.round(alpha * 255));
        final Color end = new Color(0, 0, 0, 0);
        final GradientPaint gradient = new GradientPaint(
                ix, iy + ih, start,
                ix, iy + ih + bandH, end);
        g.setPaint(gradient);
        g.fillRect(ix - extend, iy + ih, iw + 2 * extend, bandH);
        g.setPaint(null);
    }

    // ---- 3/6 共用：齿孔行分布 --------------------------------------------------

    private void drawPerforationRow(final Graphics2D g, final Color color, final int cw,
                                    final int centerY, final int n, final double holeH, final double holeW) {
        g.setColor(color);
        final double spacing = (double) cw / n;
        final double r = holeW * 0.18;
        for (int i = 0; i < n; i++) {
            final double cx = spacing * (i + 0.5);
            final double x = cx - holeW / 2;
            final double y = centerY - holeH / 2;
            g.fill(new RoundRectangle2D.Double(x, y, holeW, holeH, r * 2, r * 2));
        }
    }

    // ---- 3. 135 齿孔 ------------------------------------------------------------

    private void drawPerforation(final Graphics2D g, final BorderStyle style, final int cw, final int ch,
                                 final int top, final int bottom, final int n) {
        final int strip = Math.min(top, bottom);
        if (strip <= 0) {
            return;
        }
        // 孔高 = 条带高度 * 0.45（clamp 3..60），孔宽 = 孔高 * 1.4
        final double holeH = clamp(strip * 0.45, 3, 60);
        final double holeW = holeH * 1.4;
        final Color holeColor = ColorParser.parse(style.getPaperTone(), "#e8e8e8");
        drawPerforationRow(g, holeColor, cw, top / 2, n, holeH, holeW);
        drawPerforationRow(g, holeColor, cw, ch - bottom / 2, n, holeH, holeW);
    }

    // ---- 4. 中画幅卡纸留白双细线 ----------------------------------------------

    private void drawMatDoubleLine(final Graphics2D g, final BorderStyle style, final int ew,
                                   final int ix, final int iy, final int iw, final int ih) {
        final int g1 = Math.max(2, ew * 2);
        final int gap = Math.max(2, ew);
        final float lw = (float) Math.max(1, Math.round(ew / 3.0));
        g.setColor(ColorParser.parse(style.getPaperTone(), "#9a948a"));
        g.setStroke(new BasicStroke(lw));
        g.drawRect(ix - g1, iy - g1, iw + 2 * g1, ih + 2 * g1);
        final int g2 = g1 + gap;
        g.drawRect(ix - g2, iy - g2, iw + 2 * g2, ih + 2 * g2);
    }

    // ---- 5. 撕边纸张 ------------------------------------------------------------

    private void drawTornEdge(final Graphics2D g, final BorderStyle style, final double fi,
                              final int ew, final int ix, final int iy, final int iw, final int ih) {
        final int w = Math.max(2, ew);
        final double amp = Math.max(1, w * fi);
        final int step = Math.max(4, w);
        final Color tone = ColorParser.parse(style.getPaperTone(), "#f7f5f0");
        g.setColor(tone);

        // 上边：从左到右；锯齿顶点朝上（y 减小）
        for (int x = ix, i = 0; x < ix + iw; x += step, i++) {
            final int x2 = Math.min(x + step, ix + iw);
            final int tipY = iy - (int) Math.round(w * 0.35 + amp * ((i % 2 == 0) ? 1 : 0.2));
            fillTriangle(g, x, iy, x2, iy, (x + x2) / 2, tipY);
        }
        // 下边：锯齿顶点朝下
        for (int x = ix, i = 0; x < ix + iw; x += step, i++) {
            final int x2 = Math.min(x + step, ix + iw);
            final int tipY = iy + ih + (int) Math.round(w * 0.35 + amp * ((i % 2 == 0) ? 1 : 0.2));
            fillTriangle(g, x, iy + ih, x2, iy + ih, (x + x2) / 2, tipY);
        }
        // 左边：锯齿顶点朝左
        for (int y = iy, i = 0; y < iy + ih; y += step, i++) {
            final int y2 = Math.min(y + step, iy + ih);
            final int tipX = ix - (int) Math.round(w * 0.35 + amp * ((i % 2 == 0) ? 1 : 0.2));
            fillTriangle(g, ix, y, ix, y2, tipX, (y + y2) / 2);
        }
        // 右边：锯齿顶点朝右
        for (int y = iy, i = 0; y < iy + ih; y += step, i++) {
            final int y2 = Math.min(y + step, iy + ih);
            final int tipX = ix + iw + (int) Math.round(w * 0.35 + amp * ((i % 2 == 0) ? 1 : 0.2));
            fillTriangle(g, ix + iw, y, ix + iw, y2, tipX, (y + y2) / 2);
        }
    }

    private void fillTriangle(final Graphics2D g, final int x1, final int y1,
                              final int x2, final int y2, final int tx, final int ty) {
        g.fillPolygon(new int[]{x1, x2, tx}, new int[]{y1, y2, ty}, 3);
    }

    // ---- 6. 黑色负片边 ----------------------------------------------------------

    private void drawNegativeBand(final Graphics2D g, final BorderStyle style, final double fi,
                                  final int cw, final int ch, final int top, final int bottom) {
        if (top <= 0 && bottom <= 0) {
            return;
        }
        final int alpha = (int) Math.round(255 * Math.min(1.0, 0.6 + 0.4 * fi));
        g.setColor(new Color(10, 10, 10, alpha));
        if (top > 0) {
            g.fillRect(0, 0, cw, top);
        }
        if (bottom > 0) {
            g.fillRect(0, ch - bottom, cw, bottom);
        }
        // 小孔行（比 135 齿孔更小更密）
        final int strip = Math.min(Math.max(top, 1), Math.max(bottom, 1));
        final double holeH = clamp(strip * 0.32, 2, 40);
        final double holeW = holeH * 1.6;
        final int n = clamp(style.getHoleCount(), 4, 100);
        final Color holeColor = ColorParser.parse(style.getPaperTone(), "#cfcfcf");
        if (top > 0) {
            drawPerforationRow(g, holeColor, cw, top / 2, n, holeH, holeW);
        }
        if (bottom > 0) {
            drawPerforationRow(g, holeColor, cw, ch - bottom / 2, n, holeH, holeW);
        }
    }

    // ---- 7. 杂志拼贴双键线 ------------------------------------------------------

    private void drawMagazineKeyline(final Graphics2D g, final BorderStyle style, final int ew,
                                     final int ix, final int iy, final int iw, final int ih) {
        final int o = Math.max(1, ew / 4);
        final float lwThick = (float) Math.max(1, Math.round(ew / 2.0));
        final Color tone = ColorParser.parse(style.getPaperTone(), "#111111");

        g.setColor(tone);
        g.setStroke(new BasicStroke(lwThick));
        g.drawRect(ix - o, iy - o, iw + 2 * o, ih + 2 * o);

        final int o2 = o + ew + (int) lwThick;
        g.setColor(new Color(tone.getRed(), tone.getGreen(), tone.getBlue(), 102));
        g.setStroke(new BasicStroke(1f));
        g.drawRect(ix - o2, iy - o2, iw + 2 * o2, ih + 2 * o2);
    }

    // ---- 8. 摄影档案标签 --------------------------------------------------------

    private void drawArchiveLabel(final Graphics2D g, final BorderStyle style,
                                  final int cw, final int ch, final int bottom,
                                  final int ix, final int iy, final int iw, final int ew) {
        if (bottom < 14) {
            return;
        }
        final int boxH = clamp((int) Math.round(bottom * 0.5), 8, 26 + ew);
        final int margin = Math.max(6, ew * 2);
        final int boxW = clamp((int) Math.round(iw * 0.28), 60, cw - 2 * margin);
        final int x2 = ix + iw - margin;
        final int x1 = x2 - boxW;
        final int cy = ch - bottom / 2;
        final int y1 = cy - boxH / 2;

        final Color tone = ColorParser.parse(style.getPaperTone(), "#8a8578");
        g.setColor(tone);
        g.setStroke(new BasicStroke(1f));
        g.drawRect(x1, y1, boxW, boxH);

        // 盒内两条占位横线（模拟标签文字行）
        final int line1W = (int) Math.round(boxW * 0.70);
        final int line2W = (int) Math.round(boxW * 0.45);
        final int line1X = x1 + (boxW - line1W) / 2;
        final int line2X = x1 + (boxW - line2W) / 2;
        g.drawLine(line1X, cy - (int) Math.round(boxH * 0.15), line1X + line1W, cy - (int) Math.round(boxH * 0.15));
        g.drawLine(line2X, cy + (int) Math.round(boxH * 0.15), line2X + line2W, cy + (int) Math.round(boxH * 0.15));
    }

    private static int clamp(final int value, final int min, final int max) {
        return Math.max(min, Math.min(max, value));
    }

    private static double clamp(final double value, final double min, final double max) {
        return Math.max(min, Math.min(max, value));
    }
}
