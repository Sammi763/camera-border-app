package com.camborder.app.util;

import com.camborder.app.dto.ExportSettings;
import com.camborder.app.dto.PreviewRequest;
import com.camborder.app.dto.RenderJobRequest;
import com.camborder.app.model.BorderConfig;
import com.camborder.app.model.GradientConfig;
import com.camborder.app.model.GradientStop;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.testsupport.AbstractControllerTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 渐变边框测试：预览与导出共用同一套渐变逻辑（{@link GradientPainter}）。
 * 通过 /api/preview 与 /api/render-jobs 端到端断言边框不同位置颜色不同。
 */
final class GradientPainterTest extends AbstractControllerTest {

    /** 构造一个线性渐变配方：左红右蓝，水平方向。 */
    private RenderRecipe linearGradientRecipe() throws Exception {
        BorderConfig border = new BorderConfig(40, 40, 40, 40, "#FFFFFF");
        GradientConfig gradient = new GradientConfig(true, "linear", 0,
                List.of(new GradientStop(0, "#FF0000"), new GradientStop(1, "#0000FF")));
        return new RenderRecipe(writeTempImage(40, 30, Color.GREEN), border, gradient, null, null, false);
    }

    @Test
    void shouldRenderDifferentColorsAcrossBorderInPreview() throws Exception {
        // 启用线性渐变 -> 边框区域左侧偏红、右侧偏蓝，颜色应不同
        byte[] png = requestPreviewPng(linearGradientRecipe(), 0, 0);

        BufferedImage result = readPng(png);
        // 画布 = 40+40+40 x 30+40+40 = 120x110
        assertThat(result.getWidth()).isEqualTo(120);
        assertThat(result.getHeight()).isEqualTo(110);

        Color left = new Color(result.getRGB(2, 2));
        Color right = new Color(result.getRGB(result.getWidth() - 3, 2));
        // 左侧应明显偏红（R 远大于 B），右侧应明显偏蓝（B 远大于 R）
        assertThat(left.getRed()).isGreaterThan(left.getBlue() + 50);
        assertThat(right.getBlue()).isGreaterThan(right.getRed() + 50);
    }

    @Test
    void shouldExportGradientPngFile() throws Exception {
        // 渐变导出：PNG 文件真实存在且可读，且边框颜色左右不同
        RenderRecipe recipe = linearGradientRecipe();
        ExportSettings export = new ExportSettings(
                tempDir.resolve("gradient.png").toString(), "png", 95);

        String outputPath = submitExport(new RenderJobRequest(recipe, export));

        assertThat(java.nio.file.Files.exists(Path.of(outputPath))).isTrue();
        BufferedImage result = ImageIO.read(Path.of(outputPath).toFile());
        assertThat(result).isNotNull();
        assertThat(result.getWidth()).isEqualTo(120);

        Color left = new Color(result.getRGB(2, 2));
        Color right = new Color(result.getRGB(result.getWidth() - 3, 2));
        assertThat(left.getRed()).isGreaterThan(left.getBlue() + 50);
        assertThat(right.getBlue()).isGreaterThan(right.getRed() + 50);
    }

    @Test
    void shouldRenderRadialGradientPreview() throws Exception {
        // 径向渐变：中心偏红、边缘偏蓝，画布中心与角落颜色应不同
        BorderConfig border = new BorderConfig(40, 40, 40, 40, "#FFFFFF");
        GradientConfig gradient = new GradientConfig(true, "radial", 0,
                List.of(new GradientStop(0, "#FF0000"), new GradientStop(1, "#0000FF")));
        RenderRecipe recipe = new RenderRecipe(
                writeTempImage(40, 30, Color.GREEN), border, gradient, null, null, false);
        byte[] png = requestPreviewPng(recipe, 0, 0);

        BufferedImage result = readPng(png);
        Color center = new Color(result.getRGB(result.getWidth() / 2, result.getHeight() / 2));
        Color corner = new Color(result.getRGB(2, 2));
        // 中心偏红，角落偏蓝，二者颜色不同
        assertThat(center.getRed() - center.getBlue())
                .isGreaterThan(corner.getRed() - corner.getBlue());
    }

    @Test
    void shouldRejectGradientWithSingleStop() throws Exception {
        // stops 少于 2 个应返回受控错误
        BorderConfig border = new BorderConfig(20, 20, 20, 20, "#FFFFFF");
        GradientConfig gradient = new GradientConfig(true, "linear", 0,
                List.of(new GradientStop(0, "#FF0000")));
        PreviewRequest request = new PreviewRequest(
                new RenderRecipe(writeTempImage(), border, gradient, null, null, false), 0, 0);

        mockMvc.perform(post("/api/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("gradient")));
    }

    @Test
    void shouldRenderGradientWithDuplicateMaxOffsets() throws Exception {
        // 三个 stop 中后两个 offset 均为 1.0：旧实现逐个 clamp 会把中间也收敛成 1.0，
        // 与末尾强制为 1.0 撞值，导致 LinearGradientPaint 抛 "Keyframe fractions must be increasing: 1.0"。
        // 归一化为严格递增分数后应能正常渲染，不再抛异常。
        BorderConfig border = new BorderConfig(20, 20, 20, 20, "#FFFFFF");
        GradientConfig gradient = new GradientConfig(true, "linear", 0,
                List.of(new GradientStop(0, "#FF0000"),
                        new GradientStop(1, "#00FF00"),
                        new GradientStop(1, "#0000FF")));
        RenderRecipe recipe = new RenderRecipe(
                writeTempImage(40, 30, Color.GREEN), border, gradient, null, null, false);

        byte[] png = requestPreviewPng(recipe, 0, 0);

        BufferedImage result = readPng(png);
        assertThat(result.getWidth()).isGreaterThan(0);
        assertThat(result.getHeight()).isGreaterThan(0);
    }
}
