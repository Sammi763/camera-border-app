package com.camborder.app.util;

import com.camborder.app.model.BorderConfig;
import com.camborder.app.model.LogoConfig;
import org.springframework.stereotype.Component;

import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;

/**
 * 品牌标识绘制器（无状态组件）。
 * 单一职责：在边框区域绘制品牌文字标识。
 *
 * MVP 首版支持品牌文字绘制，不支持真实 logo 矢量图。
 * 支持自动对比色：根据边框色亮度自动选择深/浅品牌文字颜色。
 *
 * placement 语义（复用 TextRenderer 的命名规则）：
 * - border-top-left / border-top-center / border-top-right
 * - border-bottom-left / border-bottom-center / border-bottom-right
 * - 未识别的 placement：跳过绘制（不抛异常）
 */
@Component
public final class LogoRenderer {

    /**
     * 在画布上绘制品牌标识文字。
     *
     * @param canvas 已合成边框的最终画布
     * @param logo   品牌标识配置
     * @param border 边框配置（用于定位边框区域）
     */
    public void draw(final BufferedImage canvas, final LogoConfig logo,
                     final BorderConfig border) {
        if (logo == null || !logo.isEnabled()) {
            return;
        }

        String brandText = logo.getBrand();
        if (brandText == null || brandText.isBlank()) {
            return;
        }

        String placement = logo.getPlacement();
        if (placement == null || placement.isBlank()) {
            return;
        }

        // 校验 placement 是否为已识别的 6 种位置之一，未知 placement 直接跳过
        if (!isValidPlacement(placement)) {
            return;
        }

        int fontSize = logo.getSize() > 0 ? logo.getSize() : 14;
        Font font = new Font(Font.SANS_SERIF, Font.BOLD, fontSize);

        Graphics2D graphics = canvas.createGraphics();
        try {
            graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING,
                    RenderingHints.VALUE_ANTIALIAS_ON);
            graphics.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING,
                    RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
            graphics.setFont(font);

            FontMetrics metrics = graphics.getFontMetrics();
            int textWidth = metrics.stringWidth(brandText);
            int textHeight = metrics.getHeight();
            int ascent = metrics.getAscent();

            int canvasWidth = canvas.getWidth();
            int canvasHeight = canvas.getHeight();
            int[] insets = BorderComposer.insets(border);
            int borderTop = insets[0];
            int borderBottom = insets[1];
            int borderLeft = insets[2];
            int borderRight = insets[3];

            // 计算坐标
            int margin = 12;
            int x;
            int y;

            // 水平定位
            if (placement.contains("left")) {
                x = borderLeft + margin;
            } else if (placement.contains("right")) {
                x = canvasWidth - borderRight - margin - textWidth;
            } else {
                x = (canvasWidth - textWidth) / 2;
            }

            // 垂直定位
            if (placement.contains("top")) {
                y = (borderTop - textHeight) / 2 + ascent;
            } else {
                y = (canvasHeight - borderBottom) + (borderBottom - textHeight) / 2 + ascent;
            }

            // 颜色选择
            Color color = resolveColor(logo.getColorMode(), border.getColor());
            graphics.setColor(color);
            graphics.drawString(brandText, x, y);
        } finally {
            graphics.dispose();
        }
    }

    /**
     * 根据颜色模式选择品牌文字颜色。
     * - auto-contrast：根据边框色亮度自动选择深/浅色
     * - light：固定浅色
     * - dark：固定深色
     */
    private Color resolveColor(final String colorMode, final String borderColor) {
        if ("light".equals(colorMode)) {
            return new Color(0xf0, 0xf0, 0xf0);
        }
        if ("dark".equals(colorMode)) {
            return new Color(0x22, 0x22, 0x22);
        }
        // auto-contrast（默认）
        if (isDarkColor(borderColor)) {
            return new Color(0xf0, 0xf0, 0xf0);
        } else {
            return new Color(0x22, 0x22, 0x22);
        }
    }

    /**
     * 判断颜色是否偏深。
     * 使用 ITU-R BT.709 简化公式计算亮度，亮度 < 0.5 视为深色。
     */
    private boolean isDarkColor(final String hex) {
        if (hex == null || hex.isBlank()) {
            return false;
        }
        String stripped = hex.trim();
        if (stripped.startsWith("#")) {
            stripped = stripped.substring(1);
        }
        if (stripped.length() == 3) {
            stripped = "" + stripped.charAt(0) + stripped.charAt(0)
                    + stripped.charAt(1) + stripped.charAt(1)
                    + stripped.charAt(2) + stripped.charAt(2);
        }
        if (stripped.length() != 6) {
            return false;
        }
        try {
            int rgb = Integer.parseInt(stripped, 16);
            int r = (rgb >> 16) & 0xff;
            int g = (rgb >> 8) & 0xff;
            int b = rgb & 0xff;
            double luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;
            return luminance < 0.5;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    /**
     * 校验 placement 是否为已识别的 6 种边框位置之一。
     * 未知 placement 返回 false，调用方应跳过绘制。
     */
    private boolean isValidPlacement(final String placement) {
        switch (placement) {
            case "border-top-left":
            case "border-top-center":
            case "border-top-right":
            case "border-bottom-left":
            case "border-bottom-center":
            case "border-bottom-right":
                return true;
            default:
                return false;
        }
    }
}
