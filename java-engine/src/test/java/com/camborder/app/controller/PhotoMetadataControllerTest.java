package com.camborder.app.controller;

import com.camborder.app.dto.PhotoMetadataRequest;
import com.camborder.app.testsupport.AbstractControllerTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.nio.file.Path;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 摄影元数据接口 POST /api/photo-metadata 的测试。
 * 覆盖：缺失文件 400、无 EXIF 文件返回全 null（不 500）、缺少 imagePath 400。
 */
final class PhotoMetadataControllerTest extends AbstractControllerTest {

    /**
     * 生成一张不含 EXIF 的本地 JPEG 图片（ImageIO 写出无 EXIF 目录），返回其绝对路径。
     */
    private String writeTempJpegWithoutExif() throws Exception {
        BufferedImage image = new BufferedImage(40, 30, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = image.createGraphics();
        try {
            graphics.setColor(Color.BLUE);
            graphics.fillRect(0, 0, 40, 30);
        } finally {
            graphics.dispose();
        }
        Path file = tempDir.resolve("no-exif.jpg");
        ImageIO.write(image, "jpg", file.toFile());
        return file.toAbsolutePath().toString();
    }

    @Test
    void shouldReturnNullFieldsForImageWithoutExif() throws Exception {
        // ImageIO 写出的 JPEG 不含 EXIF -> 所有字段为 null，且不返回 500
        PhotoMetadataRequest request = new PhotoMetadataRequest(writeTempJpegWithoutExif());

        mockMvc.perform(post("/api/photo-metadata")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cameraModel").isEmpty())
                .andExpect(jsonPath("$.lensModel").isEmpty())
                .andExpect(jsonPath("$.aperture").isEmpty())
                .andExpect(jsonPath("$.shutterSpeed").isEmpty())
                .andExpect(jsonPath("$.iso").isEmpty())
                .andExpect(jsonPath("$.focalLength").isEmpty());
    }

    @Test
    void shouldRejectWhenImageFileNotFound() throws Exception {
        PhotoMetadataRequest request = new PhotoMetadataRequest("/no/such/exif-image.jpg");

        mockMvc.perform(post("/api/photo-metadata")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(containsString("not found")));
    }

    @Test
    void shouldRejectWhenImagePathMissing() throws Exception {
        // 请求体不含 imagePath -> 400
        mockMvc.perform(post("/api/photo-metadata")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("imagePath is required"));
    }
}
