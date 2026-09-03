package com.camborder.app.util;

import com.camborder.app.model.BorderConfig;
import com.camborder.app.model.LogoConfig;
import org.springframework.stereotype.Component;

import com.camborder.app.exception.PreviewGenerationException;
import java.awt.Color;
import java.awt.AlphaComposite;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Path;
import javax.imageio.ImageIO;

/**
 * 品牌标识绘制器（无状态组件）。
 * 单一职责：在边框区域绘制品牌文字或 PNG/签名标识。
 *
 * 支持品牌文字与透明 PNG/签名图片。
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

        String placement = logo.getPlacement();
        if (placement == null || placement.isBlank()) {
            return;
        }

        // 校验 placement 是否为已识别的 6 种位置之一，未知 placement 直接跳过
        if (!isValidPlacement(placement)) {
            return;
        }

        Graphics2D graphics = canvas.createGraphics();
        try {
            graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING,
                    RenderingHints.VALUE_ANTIALIAS_ON);
            graphics.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING,
                    RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
            int canvasWidth = canvas.getWidth();
            int canvasHeight = canvas.getHeight();
            int[] insets = BorderComposer.insets(border);
            int borderTop = insets[0];
            int borderBottom = insets[1];
            int borderLeft = insets[2];
            int borderRight = insets[3];

            if (logo.getImagePath() != null && !logo.getImagePath().isBlank()) {
                drawImage(graphics, canvas, logo, placement, borderTop, borderBottom,
                        borderLeft, borderRight, canvasWidth, canvasHeight,
                        border == null ? null : border.getColor());
                return;
            }

            String brandText = logo.getBrand();
            if (brandText == null || brandText.isBlank()) return;
            drawText(graphics, logo, brandText, border == null ? new BorderConfig() : border, borderTop, borderBottom,
                    borderLeft, borderRight, canvasWidth, canvasHeight);
        } finally {
            graphics.dispose();
        }
    }

    private void drawText(final Graphics2D graphics, final LogoConfig logo, final String brandText,
                          final BorderConfig border, final int borderTop, final int borderBottom,
                          final int borderLeft, final int borderRight,
                          final int canvasWidth, final int canvasHeight) {
        int fontSize = logo.getSize() > 0 ? logo.getSize() : 14;
        Font font = new Font(Font.SANS_SERIF, Font.BOLD, fontSize);
        graphics.setFont(font);
        FontMetrics metrics = graphics.getFontMetrics();
        int textWidth = metrics.stringWidth(brandText);
        int textHeight = metrics.getHeight();
        int ascent = metrics.getAscent();
        int margin = 12;
        int x = logo.getPlacement().contains("left")
                ? borderLeft + margin
                : logo.getPlacement().contains("right")
                ? canvasWidth - borderRight - margin - textWidth
                : (canvasWidth - textWidth) / 2;
        int y = logo.getPlacement().contains("top")
                ? (borderTop - textHeight) / 2 + ascent
                : (canvasHeight - borderBottom) + (borderBottom - textHeight) / 2 + ascent;
        graphics.setComposite(AlphaComposite.getInstance(
                AlphaComposite.SRC_OVER, (float) clamp(logo.getOpacity(), 0, 1)));
        graphics.setColor(resolveColor(logo.getColorMode(), border.getColor()));
        graphics.drawString(brandText, x, y);
    }

    private void drawImage(final Graphics2D graphics, final BufferedImage canvas,
                           final LogoConfig logo, final String placement,
                           final int borderTop, final int borderBottom,
                           final int borderLeft, final int borderRight,
                           final int canvasWidth, final int canvasHeight,
                           final String borderColor) {
        final Path path = Path.of(logo.getImagePath());
        final BufferedImage image;
        try {
            image = ImageIO.read(path.toFile());
        } catch (IOException | RuntimeException exception) {
            throw new PreviewGenerationException("logo image could not be decoded: " + logo.getImagePath());
        }
        if (image == null || image.getWidth() <= 0 || image.getHeight() <= 0) {
            throw new PreviewGenerationException("logo image could not be decoded: " + logo.getImagePath());
        }

        final double maxEdge = Math.max(8, logo.getSize() > 0 ? logo.getSize() : 32);
        final double imageScale = maxEdge / Math.max(image.getWidth(), image.getHeight());
        final int width = Math.max(1, (int) Math.round(image.getWidth() * imageScale));
        final int height = Math.max(1, (int) Math.round(image.getHeight() * imageScale));
        final int margin = 12;
        final int x = placement.contains("left")
                ? borderLeft + margin
                : placement.contains("right")
                ? canvasWidth - borderRight - margin - width
                : (canvasWidth - width) / 2;
        final int y = placement.contains("top")
                ? (borderTop - height) / 2
                : canvasHeight - borderBottom + (borderBottom - height) / 2;

        graphics.setComposite(AlphaComposite.getInstance(
                AlphaComposite.SRC_OVER, (float) clamp(logo.getOpacity(), 0, 1)));
        if (logo.isAutoContrast()) {
            // autoContrast 是独立开关；即使旧配置仍带有 light/dark colorMode，
            // 自定义图片的反差底也必须按实际边框颜色计算。
            Color contrast = resolveColor("auto-contrast", borderColor);
            graphics.setColor(new Color(contrast.getRed(), contrast.getGreen(), contrast.getBlue(), 64));
            graphics.fillRoundRect(x - 2, y - 2, width + 4, height + 4, 4, 4);
        }
        graphics.drawImage(image, x, y, width, height, null);
        graphics.setComposite(AlphaComposite.SrcOver);
    }

    private double clamp(final double value, final double min, final double max) {
        if (!Double.isFinite(value)) return max;
        return Math.max(min, Math.min(max, value));
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
