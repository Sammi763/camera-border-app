package com.camborder.app.util;

import com.camborder.app.exception.PreviewGenerationException;
import com.camborder.app.model.BorderConfig;
import com.camborder.app.model.TextItem;
import org.springframework.stereotype.Component;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.GraphicsEnvironment;
import java.awt.RenderingHints;
import java.awt.Shape;
import java.awt.font.TextLayout;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.util.List;

/**
 * 文字绘制器（无状态组件）。
 * 单一职责：把多段文字按各自 placement 绘制到已合成边框的画布上。
 *
 * 阶段 2 升级：
 * - 遍历 texts[] 全部段落，不再只渲染 texts[0]
 * - 每段支持背景条、阴影、描边样式
 * - 空内容或 disabled 的段落自动跳过
 *
 * placement 语义（不新增 DTO 字段，复用 TextItem.placement 字符串）：
 * - 图片区域：image-top-center / image-center / image-bottom-center
 *   坐标以原始图片绘制区域为基准（左上角 = (borderLeft, borderTop)），
 *   水平在图片区域内居中，marginY 为相对图片区域上/下边缘的偏移。
 * - 边框区域：border-top-center / border-bottom-center
 *   坐标以对应边框区域为基准，水平在整张画布内居中，垂直在边框区域内居中。
 *   marginY 为相对边框区域垂直中心的向下偏移（非负）。
 *   边框高度不足以放下文字时仍按公式计算基线，不抛异常。
 * - 边框角落（摄影信息卡预设布局）：border-top-left / border-top-right /
 *   border-bottom-left / border-bottom-right
 *   垂直与对应边框区域居中对齐；水平贴近对应角落，marginX 为距左右边框
 *   外边缘的内缩距离（左对齐贴 borderLeft，右对齐贴 borderRight）。
 * - 旧值兼容：
 *   - top-center：保持旧行为，相对整张画布顶部定位。
 *   - center：映射为 image-center。
 *   - bottom-center：保持旧行为，相对整张画布底部定位。
 * - 未识别的非空 placement：抛受控异常。
 *
 * marginX 仅在角落 placement（border-*-left / border-*-right）参与水平定位。
 */
@Component
public final class TextRenderer {

    /**
     * 遍历 texts[] 列表，按顺序绘制每段文字到画布。
     *
     * @param canvas      已合成边框的最终画布
     * @param texts       文字列表，按顺序依次绘制
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

        int[] insets = BorderComposer.insets(border);
        int borderTop = insets[0];
        int borderBottom = insets[1];
        int borderLeft = insets[2];
        int borderRight = insets[3];
        int imageX = borderLeft;
        int imageY = borderTop;
        int canvasWidth = canvas.getWidth();
        int canvasHeight = canvas.getHeight();

        Graphics2D graphics = canvas.createGraphics();
        try {
            graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING,
                    RenderingHints.VALUE_ANTIALIAS_ON);
            graphics.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING,
                    RenderingHints.VALUE_TEXT_ANTIALIAS_ON);

            for (TextItem text : texts) {
                if (text == null) {
                    continue;
                }
                String content = text.getContent();
                if (content == null || content.isBlank()) {
                    continue;
                }
                String placement = text.getPlacement();
                if (placement == null || placement.isBlank()) {
                    continue;
                }

                drawSingleText(graphics, text, placement, content,
                        imageX, imageY, imageWidth, imageHeight,
                        borderTop, borderBottom, borderLeft, borderRight,
                        canvasWidth, canvasHeight);
            }
        } finally {
            graphics.dispose();
        }
    }

    /**
     * 绘制单段文字：计算坐标 -> 画背景条 -> 画阴影 -> 画描边 -> 画正文。
     */
    private void drawSingleText(final Graphics2D graphics, final TextItem text,
                                final String placement, final String content,
                                final int imageX, final int imageY,
                                final int imageWidth, final int imageHeight,
                                final int borderTop, final int borderBottom,
                                final int borderLeft, final int borderRight,
                                final int canvasWidth, final int canvasHeight) {
        int fontSize = text.getFontSize() > 0 ? text.getFontSize() : 16;
        String family = text.getFontFamily();
        Font font = resolveFont(family, fontSize);
        graphics.setFont(font);
        FontMetrics metrics = graphics.getFontMetrics();

        int textWidth = metrics.stringWidth(content);
        int textHeight = metrics.getHeight();
        int ascent = metrics.getAscent();
        int descent = metrics.getDescent();
        int marginY = Math.max(0, text.getMarginY());
        int marginX = Math.max(0, text.getMarginX());

        // 计算文字基线坐标
        int x;
        int y;
        switch (placement) {
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
            case "border-top-center":
                x = (canvasWidth - textWidth) / 2;
                y = (borderTop - textHeight) / 2 + ascent + marginY;
                break;
            case "border-bottom-center":
                x = (canvasWidth - textWidth) / 2;
                y = (canvasHeight - borderBottom) + (borderBottom - textHeight) / 2 + ascent + marginY;
                break;
            case "border-top-left":
                x = borderLeft + marginX;
                y = (borderTop - textHeight) / 2 + ascent + marginY;
                break;
            case "border-top-right":
                x = canvasWidth - borderRight - marginX - textWidth;
                y = (borderTop - textHeight) / 2 + ascent + marginY;
                break;
            case "border-bottom-left":
                x = borderLeft + marginX;
                y = (canvasHeight - borderBottom) + (borderBottom - textHeight) / 2 + ascent + marginY;
                break;
            case "border-bottom-right":
                x = canvasWidth - borderRight - marginX - textWidth;
                y = (canvasHeight - borderBottom) + (borderBottom - textHeight) / 2 + ascent + marginY;
                break;
            case "top-center":
                x = (canvasWidth - textWidth) / 2;
                y = marginY + ascent;
                break;
            case "center":
                x = imageX + (imageWidth - textWidth) / 2;
                y = imageY + (imageHeight - textHeight) / 2 + ascent;
                break;
            case "bottom-center":
                x = (canvasWidth - textWidth) / 2;
                y = canvasHeight - marginY - descent;
                break;
            default:
                throw new PreviewGenerationException("unsupported placement: " + placement);
        }

        // 文字区域左上角（用于背景条定位）
        int textLeft = x;
        int textTop = y - ascent;

        // 1. 背景条：先画矩形背景
        if (text.isBackgroundEnabled()) {
            int padX = text.getBackgroundPaddingX() > 0 ? text.getBackgroundPaddingX() : 4;
            int padY = text.getBackgroundPaddingY() > 0 ? text.getBackgroundPaddingY() : 2;
            graphics.setColor(ColorParser.parse(text.getBackgroundColor(), "rgba(0,0,0,0.6)"));
            graphics.fillRect(
                    textLeft - padX,
                    textTop - padY,
                    textWidth + padX * 2,
                    textHeight + padY * 2);
        }

        // 2. 阴影：在正文下方偏移绘制灰色文字
        if (text.isShadowEnabled()) {
            int offsetX = text.getShadowOffsetX();
            int offsetY = text.getShadowOffsetY();
            int blur = text.getShadowBlur();
            Color shadowColor = ColorParser.parse(text.getShadowColor(), "rgba(0,0,0,0.5)");

            // 简单模糊阴影：通过多次偏移绘制半透明文字模拟
            if (blur > 0) {
                graphics.setColor(new Color(shadowColor.getRed(), shadowColor.getGreen(),
                        shadowColor.getBlue(), shadowColor.getAlpha() / 3));
                for (int dx = -blur; dx <= blur; dx += Math.max(1, blur / 2)) {
                    for (int dy = -blur; dy <= blur; dy += Math.max(1, blur / 2)) {
                        graphics.drawString(content, x + offsetX + dx, y + offsetY + dy);
                    }
                }
            } else {
                graphics.setColor(shadowColor);
                graphics.drawString(content, x + offsetX, y + offsetY);
            }
        }

        // 3. 描边：用 TextLayout 获取字形轮廓并描边
        if (text.isStrokeEnabled() && text.getStrokeWidth() > 0) {
            Color strokeColor = ColorParser.parse(text.getStrokeColor(), "#000000");
            float strokeW = text.getStrokeWidth();
            TextLayout layout = new TextLayout(content, font, graphics.getFontRenderContext());
            Shape outline = layout.getOutline(AffineTransform.getTranslateInstance(x, y));
            graphics.setColor(strokeColor);
            graphics.setStroke(new BasicStroke(strokeW, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
            graphics.draw(outline);
        }

        // 4. 正文
        graphics.setColor(ColorParser.parse(text.getColor(), "#000000"));
        graphics.drawString(content, x, y);
    }

    /**
     * 字体解析：按名称查找已安装字体，找不到时回退到 SansSerif。
     */
    private Font resolveFont(final String family, final int fontSize) {
        if (family == null || family.isBlank()) {
            return new Font(Font.SANS_SERIF, Font.PLAIN, fontSize);
        }
        // 尝试精确匹配字体族名称
        Font font = new Font(family, Font.PLAIN, fontSize);
        // Java 的 new Font 在找不到字体时会回退到默认字体，
        // 检查实际字体族名称是否与请求一致
        String actualFamily = font.getFamily();
        if (family.equalsIgnoreCase(actualFamily)) {
            return font;
        }
        // 精确匹配失败，尝试忽略大小写和空格匹配
        String normalized = family.toLowerCase().replace(" ", "");
        String[] availableFamilies = GraphicsEnvironment.getLocalGraphicsEnvironment().getAvailableFontFamilyNames();
        for (String available : availableFamilies) {
            if (normalized.equals(available.toLowerCase().replace(" ", ""))) {
                return new Font(available, Font.PLAIN, fontSize);
            }
        }
        // 回退到 SansSerif，日志由调用方或上层处理
        return new Font(Font.SANS_SERIF, Font.PLAIN, fontSize);
    }
}
