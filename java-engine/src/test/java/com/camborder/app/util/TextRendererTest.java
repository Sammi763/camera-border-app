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
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 文字 placement 区域定位测试（覆盖 {@link TextRenderer} 的行为）。
 * 覆盖图片区域（image-center）与边框区域（border-top-center / border-bottom-center），
 * 以及未识别 placement 的受控错误。通过完整渲染管线（/api/preview）断言像素落点。
 */
final class TextRendererTest extends AbstractControllerTest {

    @Test
    void shouldDrawImageCenterTextInsideImageRegion() throws Exception {
        // 图片 60x40，上下边框各 40 -> 画布 60x120，图片区域 y 在 [40,80)
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
        // 文字确实被绘制
        assertThat(redYs).isNotEmpty();
        // 文字应落在图片区域 [40,80) 内，顶部/底部边框区域不应有红色
        for (int y : redYs) {
            assertThat(y).isBetween(40, 79);
        }
    }

    @Test
    void shouldDrawBorderTopCenterTextInsideTopBorder() throws Exception {
        // 图片 60x40，顶部边框 40，底部 0 -> 画布 60x80，顶部边框区域 y 在 [0,40)
        BorderConfig border = new BorderConfig(40, 0, 0, 0, "#FFFFFF");
        TextItem text = new TextItem("TOP", null, 12, "#FF0000", "border-top-center", 0, 0);
        RenderRecipe recipe = new RenderRecipe(
                writeTempImage(60, 40, Color.BLUE), border,
                Collections.singletonList(text), null, false);
        byte[] png = requestPreviewPng(recipe, 0, 0);

        BufferedImage result = readPng(png);
        assertThat(result.getWidth()).isEqualTo(60);
        assertThat(result.getHeight()).isEqualTo(80);

        List<Integer> redYs = redPixelYs(result);
        assertThat(redYs).isNotEmpty();
        // 文字应落在顶部边框区域 [0,40) 内，下方图片区域不应有红色
        for (int y : redYs) {
            assertThat(y).isBetween(0, 39);
        }
    }

    @Test
    void shouldDrawBorderBottomCenterTextInsideBottomBorder() throws Exception {
        // 图片 60x40，底部边框 40，顶部 0 -> 画布 60x80，底部边框区域 y 在 [40,80)
        BorderConfig border = new BorderConfig(0, 40, 0, 0, "#FFFFFF");
        TextItem text = new TextItem("BOT", null, 12, "#FF0000", "border-bottom-center", 0, 0);
        RenderRecipe recipe = new RenderRecipe(
                writeTempImage(60, 40, Color.BLUE), border,
                Collections.singletonList(text), null, false);
        byte[] png = requestPreviewPng(recipe, 0, 0);

        BufferedImage result = readPng(png);
        assertThat(result.getWidth()).isEqualTo(60);
        assertThat(result.getHeight()).isEqualTo(80);

        List<Integer> redYs = redPixelYs(result);
        assertThat(redYs).isNotEmpty();
        // 文字应落在底部边框区域 [40,80) 内，上方图片区域不应有红色
        for (int y : redYs) {
            assertThat(y).isBetween(40, 79);
        }
    }

    @Test
    void shouldRejectUnsupportedPlacement() throws Exception {
        // 未识别的 placement 应返回受控错误，方便前端发现配置问题
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
}
