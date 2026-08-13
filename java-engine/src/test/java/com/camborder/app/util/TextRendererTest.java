package com.camborder.app.util;

import com.camborder.app.dto.PreviewRequest;
import com.camborder.app.model.BorderConfig;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.model.TextItem;
import com.camborder.app.testsupport.AbstractControllerTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 文字 placement 区域定位测试 + 多段文字 / 背景条 / 阴影 / 描边测试。
 * 覆盖 {@link TextRenderer} 的行为，通过完整渲染管线（/api/preview）断言像素落点。
 */
final class TextRendererTest extends AbstractControllerTest {

    // ---- 旧单段文字兼容性测试 ------------------------------------------------

    @Test
    void shouldDrawImageCenterTextInsideImageRegion() throws Exception {
        BorderConfig border = new BorderConfig(40, 40, 0, 0, "#FFFFFF");
        TextItem text = new TextItem("TEXT", null, 12, "#FF0000", "image-center", 0, 0);
        RenderRecipe recipe = new RenderRecipe(
                writeTempImage(60, 40, Color.BLUE), border,
                Collections.singletonList(text), null, false);
        byte[] png = requestPreviewPng(recipe, 0, 0);

        BufferedImage result = readPng(png);
        assertThat(result.getWidth()).isEqualTo(60);
        assertThat(result.getHeight()).isEqualTo(120);

        List<Integer> redYs = redPixelYs(result);
        assertThat(redYs).isNotEmpty();
        for (int y : redYs) {
            assertThat(y).isBetween(40, 79);
        }
    }

    @Test
    void shouldDrawBorderTopCenterTextInsideTopBorder() throws Exception {
        BorderConfig border = new BorderConfig(40, 0, 0, 0, "#FFFFFF");
        TextItem text = new TextItem("TOP", null, 12, "#FF0000", "border-top-center", 0, 0);
        RenderRecipe recipe = new RenderRecipe(
                writeTempImage(60, 40, Color.BLUE), border,
                Collections.singletonList(text), null, false);
        byte[] png = requestPreviewPng(recipe, 0, 0);

        BufferedImage result = readPng(png);
        List<Integer> redYs = redPixelYs(result);
        assertThat(redYs).isNotEmpty();
        for (int y : redYs) {
            assertThat(y).isBetween(0, 39);
        }
    }

    @Test
    void shouldDrawBorderBottomCenterTextInsideBottomBorder() throws Exception {
        BorderConfig border = new BorderConfig(0, 40, 0, 0, "#FFFFFF");
        TextItem text = new TextItem("BOT", null, 12, "#FF0000", "border-bottom-center", 0, 0);
        RenderRecipe recipe = new RenderRecipe(
                writeTempImage(60, 40, Color.BLUE), border,
                Collections.singletonList(text), null, false);
        byte[] png = requestPreviewPng(recipe, 0, 0);

        BufferedImage result = readPng(png);
        List<Integer> redYs = redPixelYs(result);
        assertThat(redYs).isNotEmpty();
        for (int y : redYs) {
            assertThat(y).isBetween(40, 79);
        }
    }

    @Test
    void shouldRejectUnsupportedPlacement() throws Exception {
        TextItem text = new TextItem("X", null, 16, "#FF0000", "diagonal-left", 0, 0);
        PreviewRequest request = new PreviewRequest(
                new RenderRecipe(writeTempImage(), null,
                        Collections.singletonList(text), null, false), 0, 0);

        mockMvc.perform(post("/api/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("unsupported placement")));
    }

    // ---- 多段文字测试 --------------------------------------------------------

    /**
     * 两段文字分别用不同颜色放在不同区域，验证两段都被绘制。
     * 第一段红色文字放 border-bottom-center，第二段绿色文字放 border-top-center。
     */
    @Test
    void shouldDrawMultipleTextItems() throws Exception {
        BorderConfig border = new BorderConfig(40, 40, 0, 0, "#FFFFFF");
        TextItem text1 = new TextItem("BOTTOM", null, 12, "#FF0000", "border-bottom-center", 0, 0);
        TextItem text2 = new TextItem("TOP", null, 12, "#00FF00", "border-top-center", 0, 0);
        RenderRecipe recipe = new RenderRecipe(
                writeTempImage(80, 40, Color.BLUE), border,
                Arrays.asList(text1, text2), null, false);
        byte[] png = requestPreviewPng(recipe, 0, 0);

        BufferedImage result = readPng(png);
        // 红色文字应出现在底部边框区域 [80, 120)
        List<Integer> redYs = redPixelYs(result);
        assertThat(redYs).isNotEmpty();
        for (int y : redYs) {
            assertThat(y).isBetween(80, 119);
        }

        // 绿色文字应出现在顶部边框区域 [0, 40)
        boolean hasGreenInTopBorder = false;
        for (int y = 0; y < 40 && !hasGreenInTopBorder; y++) {
            for (int x = 0; x < result.getWidth(); x++) {
                int pixel = result.getRGB(x, y);
                int red = (pixel >> 16) & 0xFF;
                int green = (pixel >> 8) & 0xFF;
                int blue = pixel & 0xFF;
                if (green > 150 && red < 100 && blue < 100) {
                    hasGreenInTopBorder = true;
                    break;
                }
            }
        }
        assertThat(hasGreenInTopBorder).isTrue();
    }

    /**
     * 第二段内容为空时应跳过，不影响第一段。
     */
    @Test
    void shouldSkipEmptySecondText() throws Exception {
        BorderConfig border = new BorderConfig(0, 40, 0, 0, "#FFFFFF");
        TextItem text1 = new TextItem("VISIBLE", null, 12, "#FF0000", "border-bottom-center", 0, 0);
        TextItem text2 = new TextItem("", null, 12, "#FF0000", "border-bottom-center", 0, 0);
        RenderRecipe recipe = new RenderRecipe(
                writeTempImage(60, 40, Color.BLUE), border,
                Arrays.asList(text1, text2), null, false);
        byte[] png = requestPreviewPng(recipe, 0, 0);

        BufferedImage result = readPng(png);
        List<Integer> redYs = redPixelYs(result);
        assertThat(redYs).isNotEmpty();
    }

    /**
     * 旧请求仅含 7 个字段的 TextItem 时仍能正常工作（向后兼容）。
     */
    @Test
    void shouldWorkWithLegacyTextItemFields() throws Exception {
        BorderConfig border = new BorderConfig(0, 40, 0, 0, "#FFFFFF");
        // 旧构造器只含 7 个字段，新增样式字段默认关闭
        TextItem text = new TextItem("LEGACY", null, 12, "#FF0000", "border-bottom-center", 0, 0);
        RenderRecipe recipe = new RenderRecipe(
                writeTempImage(60, 40, Color.BLUE), border,
                Collections.singletonList(text), null, false);
        byte[] png = requestPreviewPng(recipe, 0, 0);

        BufferedImage result = readPng(png);
        List<Integer> redYs = redPixelYs(result);
        assertThat(redYs).isNotEmpty();
    }

    // ---- 背景条测试 ----------------------------------------------------------

    /**
     * 启用背景条时，文字周围应有背景色像素。
     */
    @Test
    void shouldDrawBackgroundBarWhenEnabled() throws Exception {
        BorderConfig border = new BorderConfig(0, 50, 0, 0, "#FFFFFF");
        TextItem text = new TextItem("BG", null, 12, "#FF0000", "border-bottom-center", 0, 0);
        text.setBackgroundEnabled(true);
        text.setBackgroundColor("#000000");
        text.setBackgroundPaddingX(6);
        text.setBackgroundPaddingY(4);
        RenderRecipe recipe = new RenderRecipe(
                writeTempImage(60, 40, Color.WHITE), border,
                Collections.singletonList(text), null, false);
        byte[] png = requestPreviewPng(recipe, 0, 0);

        BufferedImage result = readPng(png);
        // 底部边框区域 [40, 90) 应有黑色背景像素
        boolean hasBlackBackground = false;
        for (int y = 40; y < 90 && !hasBlackBackground; y++) {
            for (int x = 0; x < result.getWidth(); x++) {
                int pixel = result.getRGB(x, y);
                int red = (pixel >> 16) & 0xFF;
                int green = (pixel >> 8) & 0xFF;
                int blue = pixel & 0xFF;
                if (red < 30 && green < 30 && blue < 30) {
                    hasBlackBackground = true;
                    break;
                }
            }
        }
        assertThat(hasBlackBackground).isTrue();

        // 红色文字也应存在
        List<Integer> redYs = redPixelYs(result);
        assertThat(redYs).isNotEmpty();
    }

    // ---- 阴影测试 ------------------------------------------------------------

    /**
     * 启用阴影时，文字偏移位置应有半透明阴影像素。
     */
    @Test
    void shouldDrawShadowWhenEnabled() throws Exception {
        BorderConfig border = new BorderConfig(0, 50, 0, 0, "#FFFFFF");
        TextItem text = new TextItem("SHADOW", null, 12, "#FF0000", "border-bottom-center", 0, 0);
        text.setShadowEnabled(true);
        text.setShadowColor("#000000");
        text.setShadowBlur(0);
        text.setShadowOffsetX(3);
        text.setShadowOffsetY(3);
        RenderRecipe recipe = new RenderRecipe(
                writeTempImage(60, 40, Color.WHITE), border,
                Collections.singletonList(text), null, false);
        byte[] png = requestPreviewPng(recipe, 0, 0);

        BufferedImage result = readPng(png);
        // 底部边框区域应有黑色阴影像素
        boolean hasShadowPixel = false;
        for (int y = 40; y < 90 && !hasShadowPixel; y++) {
            for (int x = 0; x < result.getWidth(); x++) {
                int pixel = result.getRGB(x, y);
                int red = (pixel >> 16) & 0xFF;
                int green = (pixel >> 8) & 0xFF;
                int blue = pixel & 0xFF;
                if (red < 60 && green < 60 && blue < 60) {
                    hasShadowPixel = true;
                    break;
                }
            }
        }
        assertThat(hasShadowPixel).isTrue();
    }

    // ---- 描边测试 ------------------------------------------------------------

    /**
     * 启用描边时，文字轮廓周围应有描边色像素。
     */
    @Test
    void shouldDrawStrokeWhenEnabled() throws Exception {
        BorderConfig border = new BorderConfig(0, 50, 0, 0, "#FFFFFF");
        TextItem text = new TextItem("STROKE", null, 14, "#FFFFFF", "border-bottom-center", 0, 0);
        text.setStrokeEnabled(true);
        text.setStrokeColor("#FF0000");
        text.setStrokeWidth(2);
        RenderRecipe recipe = new RenderRecipe(
                writeTempImage(60, 40, Color.WHITE), border,
                Collections.singletonList(text), null, false);
        byte[] png = requestPreviewPng(recipe, 0, 0);

        BufferedImage result = readPng(png);
        // 底部边框区域应有红色描边像素（正文是白色，描边是红色）
        List<Integer> redYs = redPixelYs(result);
        assertThat(redYs).isNotEmpty();
    }
}
