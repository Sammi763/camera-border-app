package com.camborder.app.controller;

import com.camborder.app.dto.ExportSettings;
import com.camborder.app.dto.RenderJobRequest;
import com.camborder.app.model.BorderConfig;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.testsupport.AbstractControllerTest;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
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
    void shouldAcceptRenderJobAsynchronously() throws Exception {
        ExportSettings export = new ExportSettings(
                tempDir.resolve("result.png").toString(), "png", 95);
        RenderRecipe recipe = new RenderRecipe(writeTempImage(), null, null, null, false);
        RenderJobRequest request = new RenderJobRequest(recipe, export);

        JsonNode accepted = submitAccepted(request);
        assertThat(accepted.path("total").asInt()).isEqualTo(1);
        JsonNode terminal = waitForRenderJob(accepted.path("jobId").asText());
        assertThat(terminal.path("status").asText()).isEqualTo("completed");
        assertThat(terminal.path("items").get(0).path("outputPath").asText()).isNotBlank();
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
    void shouldRejectUnreadableImagePathBeforeAcceptingJob() throws Exception {
        ExportSettings export = new ExportSettings(
                tempDir.resolve("missing-source-output.png").toString(), "png", 95);
        RenderJobRequest request = new RenderJobRequest(
                new RenderRecipe(tempDir.resolve("missing-source.png").toString(), null, null, null, false), export);

        mockMvc.perform(post("/api/render-jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("imagePath must point to a readable file"));
    }

    @Test
    void shouldRejectOutputPathThatWouldOverwriteSource() throws Exception {
        String imagePath = writeTempImage();
        Path source = Path.of(imagePath);
        byte[] before = Files.readAllBytes(source);
        ExportSettings export = new ExportSettings(imagePath, "png", 95);
        RenderJobRequest request = new RenderJobRequest(
                new RenderRecipe(imagePath, null, null, null, false), export);

        mockMvc.perform(post("/api/render-jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("outputPath must not overwrite imagePath"));

        assertThat(Files.readAllBytes(source)).containsExactly(before);
    }

    @Test
    void shouldRejectAnExistingOutputPathInsteadOfOverwritingIt() throws Exception {
        String imagePath = writeTempImage();
        Path output = tempDir.resolve("existing-output.png");
        Files.writeString(output, "do not overwrite");
        ExportSettings export = new ExportSettings(output.toString(), "png", 95);
        RenderJobRequest request = new RenderJobRequest(
                new RenderRecipe(imagePath, null, null, null, false), export);

        mockMvc.perform(post("/api/render-jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("outputPath already exists"));

        assertThat(Files.readString(output)).isEqualTo("do not overwrite");
    }

    @Test
    void shouldRejectRenderJobWithInvalidFormat() throws Exception {
        ExportSettings export = new ExportSettings("/output/out.bmp", "bmp", 95);
        RenderJobRequest request = new RenderJobRequest(minimalRecipe(), export);

        mockMvc.perform(post("/api/render-jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("format must be png, jpeg or tiff"));
    }

    @Test
    void shouldRejectRenderJobWithNegativeJpegQuality() throws Exception {
        ExportSettings export = new ExportSettings("/output/out.jpg", "jpeg", -1);
        RenderJobRequest request = new RenderJobRequest(minimalRecipe(), export);

        mockMvc.perform(post("/api/render-jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("jpegQuality must be between 0 and 100"));
    }

    @Test
    void shouldRejectRenderJobWithJpegQualityOver100() throws Exception {
        ExportSettings export = new ExportSettings("/output/out.jpg", "jpeg", 101);
        RenderJobRequest request = new RenderJobRequest(minimalRecipe(), export);

        mockMvc.perform(post("/api/render-jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("jpegQuality must be between 0 and 100"));
    }

    @Test
    void shouldReturnJobStatusForKnownJob() throws Exception {
        ExportSettings export = new ExportSettings(
                tempDir.resolve("out.png").toString(), "png", 95);
        RenderRecipe recipe = new RenderRecipe(writeTempImage(), null, null, null, false);
        RenderJobRequest createRequest = new RenderJobRequest(recipe, export);

        JsonNode accepted = submitAccepted(createRequest);
        String jobId = accepted.path("jobId").asText();
        JsonNode terminal = waitForRenderJob(jobId);

        assertThat(terminal.path("jobId").asText()).isEqualTo(jobId);
        assertThat(terminal.path("status").asText()).isEqualTo("completed");
        assertThat(terminal.path("message").asText()).isNotBlank();
        assertThat(terminal.path("outputPath").asText()).isNotBlank();
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

    /** 提交后只断言 202，再由调用方明确等待终态。 */
    private JsonNode submitAccepted(final RenderJobRequest request) throws Exception {
        String body = mockMvc.perform(post("/api/render-jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.jobId").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body);
    }

    private JsonNode submitAndWait(final RenderJobRequest request) throws Exception {
        return waitForRenderJob(submitAccepted(request).path("jobId").asText());
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
    void shouldExportScaledDownToTargetSizeLimit() throws Exception {
        // 原图 2000x1000，导出目标尺寸 maxWidth=1000/maxHeight=1000 -> 等比缩小为 1000x500
        RenderRecipe recipe = new RenderRecipe(
                writeTempImage(2000, 1000, java.awt.Color.BLUE), null, null, null, false);
        ExportSettings export = new ExportSettings(
                tempDir.resolve("limited.png").toString(), "png", 95);
        export.setMaxWidth(1000);
        export.setMaxHeight(1000);

        String outputPath = submitExport(recipe, export);

        BufferedImage result = ImageIO.read(Path.of(outputPath).toFile());
        assertThat(result).isNotNull();
        assertThat(result.getWidth()).isEqualTo(1000);
        assertThat(result.getHeight()).isEqualTo(500);
    }

    @Test
    void shouldRejectNegativeOutputSize() throws Exception {
        // maxWidth 为负数视为非法请求，返回 400
        ExportSettings export = new ExportSettings(
                tempDir.resolve("out.png").toString(), "png", 95);
        export.setMaxWidth(-1);
        RenderRecipe recipe = new RenderRecipe(writeTempImage(), null, null, null, false);
        RenderJobRequest request = new RenderJobRequest(recipe, export);

        mockMvc.perform(post("/api/render-jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("maxWidth and maxHeight must be non-negative"));
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
    void shouldReportPerItemFailureWhenOutputPathIsNotWritable() throws Exception {
        // outputPath 指向一个已存在的文件（而非目录的子路径），父目录无法被创建
        Path existingFile = tempDir.resolve("blocker.txt");
        Files.writeString(existingFile, "block");
        RenderRecipe recipe = new RenderRecipe(writeTempImage(), null, null, null, false);
        ExportSettings export = new ExportSettings(
                existingFile.toString() + "/out.png", "png", 95);
        RenderJobRequest request = new RenderJobRequest(recipe, export);

        JsonNode terminal = submitAndWait(request);
        assertThat(terminal.path("status").asText()).isEqualTo("failed");
        assertThat(terminal.path("items").get(0).path("error").asText()).isNotBlank();
    }

    @Test
    void shouldRejectImageFileNotFoundBeforeAcceptingJob() throws Exception {
        RenderRecipe recipe = new RenderRecipe("/no/such/file.png", null, null, null, false);
        ExportSettings export = new ExportSettings(
                tempDir.resolve("out.png").toString(), "png", 95);
        RenderJobRequest request = new RenderJobRequest(recipe, export);

        mockMvc.perform(post("/api/render-jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("imagePath must point to a readable file"));
    }

    // ---- 专业导出测试 ----------------------------------------------------------

    @Test
    void shouldAcceptTiffFormat() throws Exception {
        String imageFile = writeTempImage();
        ExportSettings export = new ExportSettings(
                tempDir.resolve("out.tif").toString(), "tiff", 95);
        RenderRecipe recipe = new RenderRecipe(imageFile, null, null, null, false);
        RenderJobRequest request = new RenderJobRequest(recipe, export);

        submitAndWait(request);

        Path outputFile = tempDir.resolve("out.tif");
        assertThat(Files.exists(outputFile)).isTrue();
        assertThat(Files.size(outputFile)).isGreaterThan(0);
    }

    @Test
    void shouldReportAppliedWhenNoMetadataIsPresent() throws Exception {
        String imageFile = writeTempImage();
        ExportSettings export = new ExportSettings(
                tempDir.resolve("out.tif").toString(), "tiff", 95);
        export.setPreserveMetadata(true);
        RenderRecipe recipe = new RenderRecipe(imageFile, null, null, null, false);
        RenderJobRequest request = new RenderJobRequest(recipe, export);

        JsonNode statusResponse = submitAndWait(request);

        // 没有可读取的 EXIF 时，像素导出仍成功，能力状态应明确为 APPLIED。
        String metadataStatus = statusResponse.path("metadataPreservation").path("status").asText();
        String metadataMessage = statusResponse
                .path("metadataPreservation").path("message").asText();
        assertThat(metadataStatus).isEqualTo("APPLIED");
        assertThat(metadataMessage).contains("没有可读取");
    }

    @Test
    void shouldReportNotRequestedWhenPreserveColorProfileNotEnabled() throws Exception {
        String imageFile = writeTempImage();
        ExportSettings export = new ExportSettings(
                tempDir.resolve("out.tif").toString(), "tiff", 95);
        // 不开启 preserveColorProfile
        RenderRecipe recipe = new RenderRecipe(imageFile, null, null, null, false);
        RenderJobRequest request = new RenderJobRequest(recipe, export);

        JsonNode statusResponse = submitAndWait(request);
        String colorProfileStatus = statusResponse.path("colorProfilePreservation").path("status").asText();
        assertThat(colorProfileStatus).isEqualTo("NOT_REQUESTED");
    }

    @Test
    void shouldReportDowngradedWhenPreferHighBitDepthCannotBePreserved() throws Exception {
        String imageFile = writeTempImage();
        ExportSettings export = new ExportSettings(
                tempDir.resolve("out.tif").toString(), "tiff", 95);
        export.setPreferHighBitDepth(true);
        RenderRecipe recipe = new RenderRecipe(imageFile, null, null, null, false);
        RenderJobRequest request = new RenderJobRequest(recipe, export);

        JsonNode statusResponse = submitAndWait(request);

        Path outputFile = tempDir.resolve("out.tif");
        assertThat(Files.exists(outputFile)).isTrue();
        assertThat(statusResponse.path("highBitDepth").path("status").asText())
                .isEqualTo("DOWNGRADED");
    }

    @Test
    void shouldReportAppliedForPngWithoutMetadata() throws Exception {
        String imageFile = writeTempImage();
        ExportSettings export = new ExportSettings(
                tempDir.resolve("out.png").toString(), "png", 95);
        export.setPreserveMetadata(true);
        RenderRecipe recipe = new RenderRecipe(imageFile, null, null, null, false);
        RenderJobRequest request = new RenderJobRequest(recipe, export);

        JsonNode statusResponse = submitAndWait(request);
        String metadataStatus = statusResponse.path("metadataPreservation").path("status").asText();
        assertThat(metadataStatus).isEqualTo("APPLIED");
    }

    @Test
    void shouldReportDowngradedForJpegHighBitDepth() throws Exception {
        String imageFile = writeTempImage();
        ExportSettings export = new ExportSettings(
                tempDir.resolve("out.jpg").toString(), "jpeg", 90);
        export.setPreferHighBitDepth(true);
        RenderRecipe recipe = new RenderRecipe(imageFile, null, null, null, false);
        RenderJobRequest request = new RenderJobRequest(recipe, export);

        JsonNode statusResponse = submitAndWait(request);
        String bitDepthStatus = statusResponse.path("highBitDepth").path("status").asText();
        String bitDepthMessage = statusResponse
                .path("highBitDepth").path("message").asText();
        assertThat(bitDepthStatus).isEqualTo("DOWNGRADED");
        assertThat(bitDepthMessage).contains("8bit");
    }

    @Test
    void shouldReturnActualFormatInStatus() throws Exception {
        String imageFile = writeTempImage();
        ExportSettings export = new ExportSettings(
                tempDir.resolve("out.tif").toString(), "tiff", 95);
        RenderRecipe recipe = new RenderRecipe(imageFile, null, null, null, false);
        RenderJobRequest request = new RenderJobRequest(recipe, export);

        JsonNode statusResponse = submitAndWait(request);
        String actualFormat = statusResponse.path("actualFormat").asText();
        assertThat(actualFormat).isEqualTo("tiff");
    }
}
