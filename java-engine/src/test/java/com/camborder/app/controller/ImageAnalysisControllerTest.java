package com.camborder.app.controller;

import com.camborder.app.dto.ImageAnalysisRequest;
import com.camborder.app.model.ImageProcessingConfig;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.testsupport.AbstractControllerTest;
import com.camborder.app.util.FilmTestFixtures;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** T07 图像分析接口：成功、空 body、非法阶段/ROI/schema。 */
final class ImageAnalysisControllerTest extends AbstractControllerTest {

    @Test
    void returnsAnalysisForLinearTiff() throws Exception {
        final String path = FilmTestFixtures.writeLinearTiff(tempDir, 2, 1,
                new int[]{10000, 20000, 30000, 40000, 50000, 60000}).toString();
        final RenderRecipe recipe = FilmTestFixtures.recipe(java.nio.file.Path.of(path),
                FilmTestFixtures.linearProcessing());

        mockMvc.perform(post("/api/image-analysis")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request(recipe, "raw-linear", null))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.stage").value("raw-linear"))
                .andExpect(jsonPath("$.analyzedWidth").value(2))
                .andExpect(jsonPath("$.bucketCount").value(256))
                .andExpect(jsonPath("$.recipeSignature").isNotEmpty())
                .andExpect(jsonPath("$.clipping.stages.sensor.available").value(false));
    }

    @Test
    void rejectsMissingRecipeAndStage() throws Exception {
        mockMvc.perform(post("/api/image-analysis")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("IMAGE_ANALYSIS_RECIPE_REQUIRED"));

        mockMvc.perform(post("/api/image-analysis")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request(
                                FilmTestFixtures.recipe(java.nio.file.Path.of("/tmp/x.tif"),
                                        FilmTestFixtures.linearProcessing()), null, null))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("IMAGE_ANALYSIS_INVALID_STAGE"));
    }

    @Test
    void rejectsInvalidStageAndRoi() throws Exception {
        final String path = FilmTestFixtures.writeLinearTiff(tempDir, 1, 1,
                new int[]{10000, 10000, 10000}).toString();
        final RenderRecipe recipe = FilmTestFixtures.recipe(java.nio.file.Path.of(path),
                FilmTestFixtures.linearProcessing());

        mockMvc.perform(post("/api/image-analysis")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request(recipe, "raw-linear",
                                new ImageProcessingConfig.NormalizedCrop(0.5, 0.5, 0, 0.5)))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("IMAGE_ANALYSIS_INVALID_ROI"));
    }

    @Test
    void rejectsUnknownSchemaBeforePipeline() throws Exception {
        final ImageProcessingConfig processing = FilmTestFixtures.linearProcessing();
        processing.setSchemaVersion(2);
        final RenderRecipe recipe = FilmTestFixtures.recipe(java.nio.file.Path.of("/tmp/x.tif"), processing);

        mockMvc.perform(post("/api/image-analysis")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request(recipe, "raw-linear", null))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("IMAGE_PROCESSING_UNSUPPORTED_SCHEMA"));
    }

    private static ImageAnalysisRequest request(final RenderRecipe recipe, final String stage,
                                                final ImageProcessingConfig.NormalizedCrop roi) {
        final ImageAnalysisRequest request = new ImageAnalysisRequest();
        request.setRecipe(recipe);
        request.setStage(stage);
        request.setRoi(roi);
        return request;
    }
}
