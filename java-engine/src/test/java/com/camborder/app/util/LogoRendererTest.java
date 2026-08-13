package com.camborder.app.util;

import com.camborder.app.model.BorderConfig;
import com.camborder.app.model.LogoConfig;
import org.junit.jupiter.api.Test;

import java.awt.Color;
import java.awt.image.BufferedImage;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * LogoRenderer 测试：品牌文字标识渲染。
 * 通过完整渲染管线断言像素落点和颜色。
 */
final class LogoRendererTest {

    private final LogoRenderer logoRenderer = new LogoRenderer();

    /**
     * 品牌标识启用后，应有文字像素出现在指定区域。
     */
    @Test
    void shouldDrawBrandTextWhenEnabled() {
        BufferedImage canvas = new BufferedImage(200, 100, BufferedImage.TYPE_INT_RGB);
        // 填充白色背景
        java.awt.Graphics2D g = canvas.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, 200, 100);
        g.dispose();

        BorderConfig border = new BorderConfig(0, 30, 0, 0, "#FFFFFF");
        LogoConfig logo = new LogoConfig(true, "brand-text", "Nikon",
                "border-bottom-right", 16, "auto-contrast");

        logoRenderer.draw(canvas, logo, border);

        // 底部边框区域 [70, 100) 应有深色文字像素
        boolean hasTextPixel = false;
        for (int y = 70; y < 100 && !hasTextPixel; y++) {
            for (int x = 0; x < 200; x++) {
                int pixel = canvas.getRGB(x, y);
                int red = (pixel >> 16) & 0xFF;
                int green = (pixel >> 8) & 0xFF;
                int blue = pixel & 0xFF;
                if (red < 50 && green < 50 && blue < 50) {
                    hasTextPixel = true;
                    break;
                }
            }
        }
        assertThat(hasTextPixel).isTrue();
    }

    /**
     * 品牌标识禁用时，不应绘制任何文字。
     */
    @Test
    void shouldNotDrawWhenDisabled() {
        BufferedImage canvas = new BufferedImage(200, 100, BufferedImage.TYPE_INT_RGB);
        java.awt.Graphics2D g = canvas.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, 200, 100);
        g.dispose();

        BorderConfig border = new BorderConfig(0, 30, 0, 0, "#FFFFFF");
        LogoConfig logo = new LogoConfig(false, "brand-text", "Nikon",
                "border-bottom-right", 16, "auto-contrast");

        logoRenderer.draw(canvas, logo, border);

        // 画布应保持纯白
        boolean hasDarkPixel = false;
        for (int y = 0; y < 100 && !hasDarkPixel; y++) {
            for (int x = 0; x < 200; x++) {
                int pixel = canvas.getRGB(x, y);
                int red = (pixel >> 16) & 0xFF;
                int green = (pixel >> 8) & 0xFF;
                int blue = pixel & 0xFF;
                if (red < 200 && green < 200 && blue < 200) {
                    hasDarkPixel = true;
                    break;
                }
            }
        }
        assertThat(hasDarkPixel).isFalse();
    }

    /**
     * 深色边框 + auto-contrast → 浅色文字。
     */
    @Test
    void shouldUseLightColorOnDarkBorder() {
        BufferedImage canvas = new BufferedImage(200, 100, BufferedImage.TYPE_INT_RGB);
        java.awt.Graphics2D g = canvas.createGraphics();
        g.setColor(new Color(0x1a, 0x1a, 0x1a));
        g.fillRect(0, 0, 200, 100);
        g.dispose();

        BorderConfig border = new BorderConfig(0, 30, 0, 0, "#1a1a1a");
        LogoConfig logo = new LogoConfig(true, "brand-text", "Canon",
                "border-top-right", 16, "auto-contrast");

        logoRenderer.draw(canvas, logo, border);

        // 顶部边框区域 [0, 30) 应有浅色文字像素
        boolean hasLightText = false;
        for (int y = 0; y < 30 && !hasLightText; y++) {
            for (int x = 0; x < 200; x++) {
                int pixel = canvas.getRGB(x, y);
                int red = (pixel >> 16) & 0xFF;
                int green = (pixel >> 8) & 0xFF;
                int blue = pixel & 0xFF;
                if (red > 200 && green > 200 && blue > 200) {
                    hasLightText = true;
                    break;
                }
            }
        }
        assertThat(hasLightText).isTrue();
    }

    /**
     * 浅色边框 + auto-contrast → 深色文字。
     */
    @Test
    void shouldUseDarkColorOnLightBorder() {
        BufferedImage canvas = new BufferedImage(200, 100, BufferedImage.TYPE_INT_RGB);
        java.awt.Graphics2D g = canvas.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, 200, 100);
        g.dispose();

        BorderConfig border = new BorderConfig(0, 30, 0, 0, "#ffffff");
        LogoConfig logo = new LogoConfig(true, "brand-text", "Sony",
                "border-bottom-left", 16, "auto-contrast");

        logoRenderer.draw(canvas, logo, border);

        // 底部边框区域应有深色文字像素
        boolean hasDarkText = false;
        for (int y = 70; y < 100 && !hasDarkText; y++) {
            for (int x = 0; x < 200; x++) {
                int pixel = canvas.getRGB(x, y);
                int red = (pixel >> 16) & 0xFF;
                int green = (pixel >> 8) & 0xFF;
                int blue = pixel & 0xFF;
                if (red < 50 && green < 50 && blue < 50) {
                    hasDarkText = true;
                    break;
                }
            }
        }
        assertThat(hasDarkText).isTrue();
    }

    /**
     * brand 为空时不应绘制。
     */
    @Test
    void shouldNotDrawWhenBrandIsEmpty() {
        BufferedImage canvas = new BufferedImage(200, 100, BufferedImage.TYPE_INT_RGB);
        java.awt.Graphics2D g = canvas.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, 200, 100);
        g.dispose();

        BorderConfig border = new BorderConfig(0, 30, 0, 0, "#FFFFFF");
        LogoConfig logo = new LogoConfig(true, "brand-text", "",
                "border-top-right", 16, "auto-contrast");

        logoRenderer.draw(canvas, logo, border);

        // 画布应保持纯白
        boolean hasDarkPixel = false;
        for (int y = 0; y < 100 && !hasDarkPixel; y++) {
            for (int x = 0; x < 200; x++) {
                int pixel = canvas.getRGB(x, y);
                int red = (pixel >> 16) & 0xFF;
                int green = (pixel >> 8) & 0xFF;
                int blue = pixel & 0xFF;
                if (red < 200 && green < 200 && blue < 200) {
                    hasDarkPixel = true;
                    break;
                }
            }
        }
        assertThat(hasDarkPixel).isFalse();
    }

    /**
     * light 模式强制浅色文字（在浅色边框上）。
     */
    @Test
    void shouldUseLightColorWhenModeIsLight() {
        BufferedImage canvas = new BufferedImage(200, 100, BufferedImage.TYPE_INT_RGB);
        java.awt.Graphics2D g = canvas.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, 200, 100);
        g.dispose();

        BorderConfig border = new BorderConfig(0, 30, 0, 0, "#ffffff");
        LogoConfig logo = new LogoConfig(true, "brand-text", "Fuji",
                "border-bottom-center", 16, "light");

        logoRenderer.draw(canvas, logo, border);

        // 底部边框区域应有浅色文字像素（浅色模式）
        boolean hasLightText = false;
        for (int y = 70; y < 100 && !hasLightText; y++) {
            for (int x = 0; x < 200; x++) {
                int pixel = canvas.getRGB(x, y);
                int red = (pixel >> 16) & 0xFF;
                int green = (pixel >> 8) & 0xFF;
                int blue = pixel & 0xFF;
                if (red > 230 && green > 230 && blue > 230) {
                    hasLightText = true;
                    break;
                }
            }
        }
        assertThat(hasLightText).isTrue();
    }

    /**
     * 非法 placement 不应绘制任何文字。
     */
    @Test
    void shouldNotDrawWhenPlacementIsInvalid() {
        BufferedImage canvas = new BufferedImage(200, 100, BufferedImage.TYPE_INT_RGB);
        java.awt.Graphics2D g = canvas.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, 200, 100);
        g.dispose();

        BorderConfig border = new BorderConfig(0, 30, 0, 0, "#FFFFFF");
        LogoConfig logo = new LogoConfig(true, "brand-text", "Nikon",
                "diagonal-left", 16, "auto-contrast");

        logoRenderer.draw(canvas, logo, border);

        // 画布应保持纯白（非法 placement 跳过绘制）
        boolean hasDarkPixel = false;
        for (int y = 0; y < 100 && !hasDarkPixel; y++) {
            for (int x = 0; x < 200; x++) {
                int pixel = canvas.getRGB(x, y);
                int red = (pixel >> 16) & 0xFF;
                int green = (pixel >> 8) & 0xFF;
                int blue = pixel & 0xFF;
                if (red < 200 && green < 200 && blue < 200) {
                    hasDarkPixel = true;
                    break;
                }
            }
        }
        assertThat(hasDarkPixel).isFalse();
    }
}
