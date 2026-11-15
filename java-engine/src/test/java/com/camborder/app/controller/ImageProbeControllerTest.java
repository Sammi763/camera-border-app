package com.camborder.app.controller;

import com.camborder.app.testsupport.AbstractControllerTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.nio.file.Path;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** POST /api/image-probe：成功、空 body、缺失路径与未支持文件。 */
final class ImageProbeControllerTest extends AbstractControllerTest {

    @Test
    void probesLocalRasterWithoutReturningPixels() throws Exception {
        final Path path = tempDir.resolve("scan.png");
        ImageIO.write(new BufferedImage(3, 2, BufferedImage.TYPE_INT_RGB), "png", path.toFile());

        mockMvc.perform(post("/api/image-probe")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"imagePath\":" + objectMapper.writeValueAsString(path.toString()) + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.format").value("png"))
                .andExpect(jsonPath("$.width").value(3))
                .andExpect(jsonPath("$.height").value(2))
                .andExpect(jsonPath("$.container.bitDepth").value(8))
                .andExpect(jsonPath("$.inputSources[0]").value("encoded-raster"))
                .andExpect(jsonPath("$.sourceVersion").value(org.hamcrest.Matchers.startsWith("sha256:")));
    }

    @Test
    void rejectsEmptyAndMissingPath() throws Exception {
        mockMvc.perform(post("/api/image-probe")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("IMAGE_PROBE_PATH_REQUIRED"));

        mockMvc.perform(post("/api/image-probe")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"imagePath\":\"/tmp/does-not-exist.png\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("IMAGE_PROBE_FILE_UNREADABLE"));
    }
}
