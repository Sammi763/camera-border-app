package com.camborder.app.controller;

import com.camborder.app.dto.ExportSettings;
import com.camborder.app.dto.RenderJobRequest;
import com.camborder.app.model.BorderConfig;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.testsupport.AbstractControllerTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 渲染导出任务接口测试：POST /api/render-jobs、GET /api/render-jobs/{jobId}，
 * 覆盖校验、状态查询与真实文件导出（PNG/JPEG、原图尺寸、默认质量、错误路径）。
 */
final class RenderJobControllerTest extends AbstractControllerTest {

    @Test
    void shouldAcceptValidRenderJob() throws Exception {
        ExportSettings export = new ExportSettings(
                tempDir.resolve("result.png").toString(), "png", 95);
        RenderRecipe recipe = new RenderRecipe(writeTempImage(), null, null, null, false);
        RenderJobRequest request = new RenderJobRequest(recipe, export);

        mockMvc.perform(post("/api/render-jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.jobId").isNotEmpty())
                .andExpect(jsonPath("$.status").value("accepted"))
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    @Test
    void shouldRejectRenderJobWithNullExport() throws Exception {
        // export 为空时无法确定输出路径，返回 400
        RenderJobRequest request = new RenderJobRequest(minimalRecipe(), null);

        mockMvc.perform(post("/api/render-jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("outputPath is required"));
    }

    @Test
    void shouldRejectRenderJobWithEmptyBody() throws Exception {
        mockMvc.perform(post("/api/render-jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").isNotEmpty());
    }

    @Test
    void shouldRejectRenderJobWithMissingImagePath() throws Exception {
        ExportSettings export = new ExportSettings("/output/out.png", "png", 95);
        RenderJobRequest request = new RenderJobRequest(
                new RenderRecipe(null, null, null, null, false), export);

        mockMvc.perform(post("/api/render-jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("imagePath is required"));
    }

    @Test
    void shouldRejectRenderJobWithBlankImagePath() throws Exception {
        ExportSettings export = new ExportSettings("/output/out.png", "png", 95);
        RenderJobRequest request = new RenderJobRequest(
                new RenderRecipe("", null, null, null, false), export);

        mockMvc.perform(post("/api/render-jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("imagePath is required"));
    }

    @Test
    void shouldRejectRenderJobWithInvalidFormat() throws Exception {
        ExportSettings export = new ExportSettings("/output/out.bmp", "bmp", 95);
        RenderJobRequest request = new RenderJobRequest(minimalRecipe(), export);

        mockMvc.perform(post("/api/render-jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("format must be png or jpeg"));
    }

    @Test
    void shouldRejectRenderJobWithNegativeJpegQuality() throws Exception {
        ExportSettings export = new ExportSettings("/output/out.jpg", "jpeg", -1);
        RenderJobRequest request = new RenderJobRequest(minimalRecipe(), export);

        mockMvc.perform(post("/api/render-jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("jpegQuality must be between 1 and 100"));
    }

    @Test
    void shouldRejectRenderJobWithJpegQualityOver100() throws Exception {
        ExportSettings export = new ExportSettings("/output/out.jpg", "jpeg", 101);
        RenderJobRequest request = new RenderJobRequest(minimalRecipe(), export);

        mockMvc.perform(post("/api/render-jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("jpegQuality must be between 1 and 100"));
    }

    @Test
    void shouldReturnJobStatusForKnownJob() throws Exception {
        ExportSettings export = new ExportSettings(
                tempDir.resolve("out.png").toString(), "png", 95);
        RenderRecipe recipe = new RenderRecipe(writeTempImage(), null, null, null, false);
        RenderJobRequest createRequest = new RenderJobRequest(recipe, export);

        String responseBody = mockMvc.perform(post("/api/render-jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createRequest)))
                .andReturn().getResponse().getContentAsString();

        String jobId = objectMapper.readTree(responseBody).get("jobId").asText();

        mockMvc.perform(get("/api/render-jobs/" + jobId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.jobId").value(jobId))
                .andExpect(jsonPath("$.status").value("completed"))
                .andExpect(jsonPath("$.message").isNotEmpty())
                .andExpect(jsonPath("$.outputPath").isNotEmpty());
    }

    @Test
    void shouldReturn404ForUnknownJob() throws Exception {
        mockMvc.perform(get("/api/render-jobs/nonexistent-id"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("job not found"));
    }

    /**
     * 提交导出任务，返回状态响应里的 outputPath（指向真实文件）。
     */
    private String submitExport(final RenderRecipe recipe, final ExportSettings export)
            throws Exception {
        return submitExport(new RenderJobRequest(recipe, export));
    }

    @Test
    void shouldExportRealPngFileWithBorderDimensions() throws Exception {
        // 原图 40x30，四边各 20 -> 导出画布应为 80x70
        BorderConfig border = new BorderConfig(20, 20, 20, 20, "#FFFFFF");
        RenderRecipe recipe = new RenderRecipe(writeTempImage(), border, null, null, false);
        ExportSettings export = new ExportSettings(
                tempDir.resolve("export.png").toString(), "png", 95);

        String outputPath = submitExport(recipe, export);

        // 文件真实存在
        Path exported = Path.of(outputPath);
        assertThat(Files.exists(exported)).isTrue();

        // 能被 ImageIO 读取，且尺寸符合边框合成结果
        BufferedImage result = ImageIO.read(exported.toFile());
        assertThat(result.getWidth()).isEqualTo(80);
        assertThat(result.getHeight()).isEqualTo(70);
        // 左上角属于边框区域，应为白色
        assertThat(new java.awt.Color(result.getRGB(0, 0))).isEqualTo(java.awt.Color.WHITE);
    }

    @Test
    void shouldExportRealJpegFileReadableByImageIO() throws Exception {
        RenderRecipe recipe = new RenderRecipe(writeTempImage(), null, null, null, false);
        ExportSettings export = new ExportSettings(
                tempDir.resolve("export.jpg").toString(), "jpeg", 80);

        String outputPath = submitExport(recipe, export);

        // 文件真实存在
        Path exported = Path.of(outputPath);
        assertThat(Files.exists(exported)).isTrue();

        // 能被 ImageIO 读取为 JPEG，尺寸等于原图 40x30
        BufferedImage result = ImageIO.read(exported.toFile());
        assertThat(result).isNotNull();
        assertThat(result.getWidth()).isEqualTo(40);
        assertThat(result.getHeight()).isEqualTo(30);
    }

    @Test
    void shouldExportPngKeepingOriginalSizeBeyondPreviewLimit() throws Exception {
        // 原图 2000x1000，远超预览 1280 限制；导出应保持原图尺寸，不被预览缩放约束
        RenderRecipe recipe = new RenderRecipe(
                writeTempImage(2000, 1000, java.awt.Color.BLUE), null, null, null, false);
        ExportSettings export = new ExportSettings(
                tempDir.resolve("big.png").toString(), "png", 95);

        String outputPath = submitExport(recipe, export);

        BufferedImage result = ImageIO.read(Path.of(outputPath).toFile());
        assertThat(result).isNotNull();
        assertThat(result.getWidth()).isEqualTo(2000);
        assertThat(result.getHeight()).isEqualTo(1000);
    }

    @Test
    void shouldExportJpegWithDefaultQualityWhenNotProvided() throws Exception {
        // jpegQuality 未传（0）应使用默认高质量导出，且文件可被 ImageIO 读取
        RenderRecipe recipe = new RenderRecipe(writeTempImage(), null, null, null, false);
        ExportSettings export = new ExportSettings(
                tempDir.resolve("default-quality.jpg").toString(), "jpeg", 0);

        String outputPath = submitExport(recipe, export);

        assertThat(Files.exists(Path.of(outputPath))).isTrue();
        BufferedImage result = ImageIO.read(Path.of(outputPath).toFile());
        assertThat(result).isNotNull();
        assertThat(result.getWidth()).isEqualTo(40);
        assertThat(result.getHeight()).isEqualTo(30);
    }

    @Test
    void shouldCreateParentDirectoryWhenMissing() throws Exception {
        // outputPath 指向尚不存在的子目录，导出应自动创建父目录并成功写入
        Path nested = tempDir.resolve("nested/deep/out.png");
        RenderRecipe recipe = new RenderRecipe(writeTempImage(), null, null, null, false);
        ExportSettings export = new ExportSettings(nested.toString(), "png", 95);

        String outputPath = submitExport(recipe, export);

        assertThat(Files.exists(Path.of(outputPath))).isTrue();
    }

    @Test
    void shouldRejectExportWithMissingOutputPath() throws Exception {
        // outputPath 为空字符串
        RenderRecipe recipe = new RenderRecipe(writeTempImage(), null, null, null, false);
        ExportSettings export = new ExportSettings("", "png", 95);
        RenderJobRequest request = new RenderJobRequest(recipe, export);

        mockMvc.perform(post("/api/render-jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("outputPath is required"));
    }

    @Test
    void shouldRejectExportWhenOutputPathIsNotWritable() throws Exception {
        // outputPath 指向一个已存在的文件（而非目录的子路径），父目录无法被创建
        Path existingFile = tempDir.resolve("blocker.txt");
        Files.writeString(existingFile, "block");
        RenderRecipe recipe = new RenderRecipe(writeTempImage(), null, null, null, false);
        ExportSettings export = new ExportSettings(
                existingFile.toString() + "/out.png", "png", 95);
        RenderJobRequest request = new RenderJobRequest(recipe, export);

        mockMvc.perform(post("/api/render-jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").isNotEmpty());
    }

    @Test
    void shouldRejectExportWhenImageFileNotFound() throws Exception {
        RenderRecipe recipe = new RenderRecipe("/no/such/file.png", null, null, null, false);
        ExportSettings export = new ExportSettings(
                tempDir.resolve("out.png").toString(), "png", 95);
        RenderJobRequest request = new RenderJobRequest(recipe, export);

        mockMvc.perform(post("/api/render-jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("not found")));
    }
}
