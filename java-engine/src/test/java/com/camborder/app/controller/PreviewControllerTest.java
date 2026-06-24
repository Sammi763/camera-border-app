package com.camborder.app.controller;

import com.camborder.app.dto.PreviewRequest;
import com.camborder.app.model.BorderConfig;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.model.TextItem;
import com.camborder.app.testsupport.AbstractControllerTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 预览接口 POST /api/preview 的测试。
 */
final class PreviewControllerTest extends AbstractControllerTest {

    @Test
    void shouldReturnPreviewForValidRequest() throws Exception {
        PreviewRequest request = new PreviewRequest(
                new RenderRecipe(writeTempImage(), null, null, null, false), 800, 600);

        mockMvc.perform(post("/api/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.previewAvailable").value(true))
                .andExpect(jsonPath("$.previewUrl").value(startsWith("/previews/")))
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    @Test
    void shouldReturnPreviewWithMinimalRecipe() throws Exception {
        PreviewRequest request = new PreviewRequest(
                new RenderRecipe(writeTempImage(), null, null, null, false), 0, 0);

        mockMvc.perform(post("/api/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.previewUrl").value(startsWith("/previews/")));
    }

    @Test
    void shouldServeRealPreviewContent() throws Exception {
        PreviewRequest request = new PreviewRequest(
                new RenderRecipe(writeTempImage(), null, null, null, false), 800, 600);

        String responseBody = mockMvc.perform(post("/api/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        String previewUrl = objectMapper.readTree(responseBody).get("previewUrl").asText();

        byte[] content = mockMvc.perform(get(previewUrl))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_PNG))
                .andReturn().getResponse().getContentAsByteArray();

        // 返回的是真实图片内容，而非 1x1 占位像素：以 PNG 签名开头且体积明显大于占位图
        assertThat(content).startsWith((byte) 0x89, 0x50, 0x4E, 0x47);
        assertThat(content.length).isGreaterThan(100);
    }

    @Test
    void shouldKeepSourceDimensionsWithoutBorder() throws Exception {
        // 无边框、不约束尺寸 -> 预览尺寸等于原图 40x30
        RenderRecipe recipe = new RenderRecipe(writeTempImage(), null, null, null, false);
        byte[] png = requestPreviewPng(recipe, 0, 0);

        BufferedImage result = readPng(png);
        assertThat(result.getWidth()).isEqualTo(40);
        assertThat(result.getHeight()).isEqualTo(30);
    }

    @Test
    void shouldRenderBorderAroundScaledImage() throws Exception {
        // 原图 40x30，不约束尺寸 -> 缩放后仍 40x30；四边各 20 -> 画布 80x70
        BorderConfig border = new BorderConfig(20, 20, 20, 20, "#FFFFFF");
        RenderRecipe recipe = new RenderRecipe(writeTempImage(), border, null, null, false);
        byte[] png = requestPreviewPng(recipe, 0, 0);

        BufferedImage result = readPng(png);
        // 边框扩展了画布尺寸
        assertThat(result.getWidth()).isEqualTo(80);
        assertThat(result.getHeight()).isEqualTo(70);
        // 左上角属于边框区域，应为白色
        assertThat(new Color(result.getRGB(0, 0))).isEqualTo(Color.WHITE);
    }

    @Test
    void shouldRenderAsymmetricBorder() throws Exception {
        // 非对称边框：左右各 10，上下各 5 -> 画布 60x40
        BorderConfig border = new BorderConfig(5, 5, 10, 10, "#FF0000");
        RenderRecipe recipe = new RenderRecipe(writeTempImage(), border, null, null, false);
        byte[] png = requestPreviewPng(recipe, 0, 0);

        BufferedImage result = readPng(png);
        assertThat(result.getWidth()).isEqualTo(60);
        assertThat(result.getHeight()).isEqualTo(40);
        // 边框颜色为红色
        assertThat(new Color(result.getRGB(0, 0))).isEqualTo(Color.RED);
    }

    @Test
    void shouldRenderSingleBottomCenterText() throws Exception {
        // 白底 120x80 画布，红色文字绘制在底部居中
        TextItem text = new TextItem("HELLO", null, 16, "#FF0000", "bottom-center", 0, 4);
        RenderRecipe recipe = new RenderRecipe(
                writeTempImage(120, 80, Color.WHITE), null,
                Collections.singletonList(text), null, false);
        byte[] png = requestPreviewPng(recipe, 0, 0);

        BufferedImage result = readPng(png);
        // 无边框，画布尺寸不变
        assertThat(result.getWidth()).isEqualTo(120);
        assertThat(result.getHeight()).isEqualTo(80);
        // 画布中存在红色像素，证明文字确实被绘制
        assertThat(containsRedPixel(result)).isTrue();
    }

    @Test
    void shouldRejectPreviewWithInvalidBorderColor() throws Exception {
        BorderConfig border = new BorderConfig(10, 10, 10, 10, "not-a-color");
        PreviewRequest request = new PreviewRequest(
                new RenderRecipe(writeTempImage(), border, null, null, false), 0, 0);

        mockMvc.perform(post("/api/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("invalid color")));
    }

    @Test
    void shouldAcceptHashRgbBorderColor() throws Exception {
        // #RGB 形式：#F00 应展开为红色 (255,0,0)
        BorderConfig border = new BorderConfig(10, 10, 10, 10, "#F00");
        byte[] png = requestPreviewPng(
                new RenderRecipe(writeTempImage(), border, null, null, false), 0, 0);

        BufferedImage result = readPng(png);
        assertThat(new Color(result.getRGB(0, 0))).isEqualTo(Color.RED);
    }

    @Test
    void shouldAcceptRgbBorderColor() throws Exception {
        // 无 # 的 RGB 形式：00F 应展开为蓝色 (0,0,255)
        BorderConfig border = new BorderConfig(10, 10, 10, 10, "00F");
        byte[] png = requestPreviewPng(
                new RenderRecipe(writeTempImage(), border, null, null, false), 0, 0);

        BufferedImage result = readPng(png);
        assertThat(new Color(result.getRGB(0, 0))).isEqualTo(Color.BLUE);
    }

    @Test
    void shouldAcceptHashRrggbbBorderColor() throws Exception {
        // #RRGGBB 形式：#00FF00 应为绿色
        BorderConfig border = new BorderConfig(10, 10, 10, 10, "#00FF00");
        byte[] png = requestPreviewPng(
                new RenderRecipe(writeTempImage(), border, null, null, false), 0, 0);

        BufferedImage result = readPng(png);
        assertThat(new Color(result.getRGB(0, 0))).isEqualTo(Color.GREEN);
    }

    @Test
    void shouldAcceptRrggbbBorderColor() throws Exception {
        // 无 # 的 RRGGBB 形式：0000FF 应为蓝色
        BorderConfig border = new BorderConfig(10, 10, 10, 10, "0000FF");
        byte[] png = requestPreviewPng(
                new RenderRecipe(writeTempImage(), border, null, null, false), 0, 0);

        BufferedImage result = readPng(png);
        assertThat(new Color(result.getRGB(0, 0))).isEqualTo(Color.BLUE);
    }

    @ParameterizedTest
    @ValueSource(strings = {"#1", "#1234", "#12345", "#1234567", "#GGG", "ZZZZZZ", "12 GH56"})
    void shouldRejectInvalidColorFormats(final String color) throws Exception {
        // 长度非法或包含非 hex 字符的颜色都必须被拒绝为 400
        BorderConfig border = new BorderConfig(10, 10, 10, 10, color);
        PreviewRequest request = new PreviewRequest(
                new RenderRecipe(writeTempImage(), border, null, null, false), 0, 0);

        mockMvc.perform(post("/api/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("invalid color")));
    }

    @Test
    void shouldRejectPreviewWhenImageFileNotFound() throws Exception {
        PreviewRequest request = new PreviewRequest(
                new RenderRecipe("/no/such/file.png", null, null, null, false), 800, 600);

        mockMvc.perform(post("/api/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("not found")));
    }

    @Test
    void shouldRejectPreviewWhenImagePathIsDirectory() throws Exception {
        PreviewRequest request = new PreviewRequest(
                new RenderRecipe(tempDir.toString(), null, null, null, false), 800, 600);

        mockMvc.perform(post("/api/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("not readable")));
    }

    @Test
    void shouldRejectPreviewWhenImageContentIsInvalid() throws Exception {
        Path textFile = tempDir.resolve("not-an-image.txt");
        Files.writeString(textFile, "this is not an image");

        PreviewRequest request = new PreviewRequest(
                new RenderRecipe(textFile.toAbsolutePath().toString(), null, null, null, false),
                800, 600);

        mockMvc.perform(post("/api/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("supported image")));
    }

    @Test
    void shouldRejectPreviewWithEmptyBody() throws Exception {
        mockMvc.perform(post("/api/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").isNotEmpty());
    }

    @Test
    void shouldRejectPreviewWithNullRecipe() throws Exception {
        mockMvc.perform(post("/api/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"maxWidth\":800}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").isNotEmpty());
    }

    @Test
    void shouldRejectPreviewWithMissingImagePath() throws Exception {
        String body = objectMapper.writeValueAsString(
                new PreviewRequest(new RenderRecipe(null, null, null, null, false), 800, 600));

        mockMvc.perform(post("/api/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("imagePath is required"));
    }

    @Test
    void shouldRejectPreviewWithBlankImagePath() throws Exception {
        String body = objectMapper.writeValueAsString(
                new PreviewRequest(new RenderRecipe("  ", null, null, null, false), 800, 600));

        mockMvc.perform(post("/api/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("imagePath is required"));
    }

    @Test
    void shouldRejectPreviewWithNegativeMaxWidth() throws Exception {
        String body = objectMapper.writeValueAsString(
                new PreviewRequest(minimalRecipe(), -1, 600));

        mockMvc.perform(post("/api/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("maxWidth must be non-negative"));
    }

    @Test
    void shouldRejectPreviewWithNegativeMaxHeight() throws Exception {
        String body = objectMapper.writeValueAsString(
                new PreviewRequest(minimalRecipe(), 800, -1));

        mockMvc.perform(post("/api/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("maxHeight must be non-negative"));
    }
}
