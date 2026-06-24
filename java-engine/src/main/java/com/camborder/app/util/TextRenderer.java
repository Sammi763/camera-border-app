package com.camborder.app.util;

import com.camborder.app.exception.PreviewGenerationException;
import com.camborder.app.model.BorderConfig;
import com.camborder.app.model.TextItem;
import org.springframework.stereotype.Component;

import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.util.List;

/**
 * 文字绘制器（无状态组件）。
 * 单一职责：把一段文字按 placement 绘制到已合成边框的画布上，不读取文件、不缩放、不合成边框。
 * 当前阶段仅渲染 texts[0]，不支持多段文字复杂排版。
 *
 * placement 语义（不新增 DTO 字段，复用 TextItem.placement 字符串）：
 * - 图片区域：image-top-center / image-center / image-bottom-center
 *   坐标以原始图片绘制区域为基准（左上角 = (borderLeft, borderTop)），
 *   水平在图片区域内居中，marginY 为相对图片区域上/下边缘的偏移。
 * - 边框区域：border-top-center / border-bottom-center
 *   坐标以对应边框区域为基准，水平在整张画布内居中，垂直在边框区域内居中。
 *   marginY 为相对边框区域垂直中心的向下偏移（非负）。
 *   边框高度不足以放下文字时仍按公式计算基线，不抛异常。
 * - 旧值兼容：
 *   - top-center：保持旧行为，相对整张画布顶部定位（marginY 为距画布顶部偏移）。
 *   - center：映射为 image-center（相对图片区域居中，无边框时与旧行为一致）。
 *   - bottom-center：保持旧行为，相对整张画布底部定位（marginY 为距画布底部偏移）。
 * - 未识别的非空 placement：抛受控异常，由控制器映射为 4xx，
 *   方便前端发现配置问题，而不是静默不绘制。
 *
 * marginX 暂不参与居中排版，保持现有行为不破坏。
 */
@Component
public final class TextRenderer {

    /**
     * 绘制 texts[0] 到画布。
     *
     * @param canvas      已合成边框的最终画布
     * @param texts       文字列表，仅取第一段
     * @param border      边框配置，用于确定图片区域与边框区域
     * @param imageWidth  缩放后图片宽度（图片区域宽度）
     * @param imageHeight 缩放后图片高度（图片区域高度）
     * @throws PreviewGenerationException placement 未识别或颜色非法时抛出
     */
    public void draw(final BufferedImage canvas, final List<TextItem> texts,
                     final BorderConfig border, final int imageWidth, final int imageHeight) {
        if (texts == null || texts.isEmpty()) {
            return;
        }
        TextItem text = texts.get(0);
        if (text == null || text.getContent() == null || text.getContent().isBlank()) {
            return;
        }
        String placement = text.getPlacement();
        if (placement == null || placement.isBlank()) {
            // 未指定 placement 视为不绘制文字，保持入口清晰
            return;
        }

        int[] insets = BorderComposer.insets(border);
        int borderTop = insets[0];
        int borderBottom = insets[1];
        int borderLeft = insets[2];
        // 图片绘制区域左上角在画布中的坐标
        int imageX = borderLeft;
        int imageY = borderTop;

        int canvasWidth = canvas.getWidth();
        int canvasHeight = canvas.getHeight();

        Graphics2D graphics = canvas.createGraphics();
        try {
            graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING,
                    RenderingHints.VALUE_ANTIALIAS_ON);
            int fontSize = text.getFontSize() > 0 ? text.getFontSize() : 16;
            String family = text.getFontFamily();
            Font font = (family != null && !family.isBlank())
                    ? new Font(family, Font.PLAIN, fontSize)
                    : new Font(Font.SANS_SERIF, Font.PLAIN, fontSize);
            graphics.setFont(font);
            FontMetrics metrics = graphics.getFontMetrics();

            String content = text.getContent();
            int textWidth = metrics.stringWidth(content);
            int textHeight = metrics.getHeight();
            int ascent = metrics.getAscent();
            int descent = metrics.getDescent();
            // marginY 统一收敛为非负偏移，marginX 暂不参与居中排版
            int marginY = Math.max(0, text.getMarginY());

            int x;
            int y;
            switch (placement) {
                // ---- 图片区域：水平在图片区域内居中 ----
                case "image-top-center":
                    x = imageX + (imageWidth - textWidth) / 2;
                    y = imageY + marginY + ascent;
                    break;
                case "image-center":
                    x = imageX + (imageWidth - textWidth) / 2;
                    y = imageY + (imageHeight - textHeight) / 2 + ascent;
                    break;
                case "image-bottom-center":
                    x = imageX + (imageWidth - textWidth) / 2;
                    y = imageY + imageHeight - marginY - descent;
                    break;
                // ---- 边框区域：水平在整张画布内居中，垂直在边框区域内居中 ----
                case "border-top-center":
                    // 顶部边框区域 [0, borderTop]，垂直居中，marginY 向下偏移
                    x = (canvasWidth - textWidth) / 2;
                    y = (borderTop - textHeight) / 2 + ascent + marginY;
                    break;
                case "border-bottom-center":
                    // 底部边框区域 [canvasHeight - borderBottom, canvasHeight]，垂直居中，marginY 向下偏移
                    x = (canvasWidth - textWidth) / 2;
                    y = (canvasHeight - borderBottom) + (borderBottom - textHeight) / 2 + ascent + marginY;
                    break;
                // ---- 旧值兼容 ----
                case "top-center":
                    // 保持旧行为：相对整张画布顶部，水平整画布居中
                    x = (canvasWidth - textWidth) / 2;
                    y = marginY + ascent;
                    break;
                case "center":
                    // 兼容映射：center -> image-center（相对图片区域居中）
                    x = imageX + (imageWidth - textWidth) / 2;
                    y = imageY + (imageHeight - textHeight) / 2 + ascent;
                    break;
                case "bottom-center":
                    // 保持旧行为：相对整张画布底部，水平整画布居中
                    x = (canvasWidth - textWidth) / 2;
                    y = canvasHeight - marginY - descent;
                    break;
                default:
                    // 未识别的 placement 抛受控异常，由控制器映射为 4xx，方便前端发现配置问题
                    throw new PreviewGenerationException("unsupported placement: " + placement);
            }

            graphics.setColor(ColorParser.parse(text.getColor(), "#000000"));
            graphics.drawString(content, x, y);
        } finally {
            graphics.dispose();
        }
    }
}
