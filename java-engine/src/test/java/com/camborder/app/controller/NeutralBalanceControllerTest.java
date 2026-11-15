package com.camborder.app.controller;

import com.camborder.app.dto.ImageAnalysisRequest;
import com.camborder.app.model.ImageProcessingConfig;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.testsupport.AbstractControllerTest;
import com.camborder.app.util.FilmTestFixtures;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.nio.file.Path;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** purpose=neutral-balance：从基础正片取样、绑定与失败路径。 */
final class NeutralBalanceControllerTest extends AbstractControllerTest {

    @Test
    void returnsNeutralSuggestionForBasePositive() throws Exception {
        final Path path = FilmTestFixtures.writeLinearTiff(tempDir, 4, 4,
                FilmTestFixtures.constantSamples(16, new int[]{19660, 16384, 13107}));
        final ImageAnalysisRequest request = new ImageAnalysisRequest();
        request.setRecipe(FilmTestFixtures.recipe(path, positiveV2()));
        request.setPurpose("neutral-balance");

        mockMvc.perform(post("/api/image-analysis")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.purpose").value("neutral-balance"))
                .andExpect(jsonPath("$.stage").value("base-positive"))
                .andExpect(jsonPath("$.neutralBalance.available").value(true))
                .andExpect(jsonPath("$.neutralBalance.sampleCount").value(16))
                .andExpect(jsonPath("$.neutralBalance.binding").isNotEmpty());
    }

    @Test
    void invalidPurposeIsRejected() throws Exception {
        final Path path = FilmTestFixtures.writeLinearTiff(tempDir, 1, 1,
                FilmTestFixtures.constantSamples(1, new int[]{10000, 10000, 10000}));
        final ImageAnalysisRequest request = new ImageAnalysisRequest();
        request.setRecipe(FilmTestFixtures.recipe(path, positiveV2()));
        request.setPurpose("auto-white-balance");

        mockMvc.perform(post("/api/image-analysis")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("IMAGE_ANALYSIS_INVALID_PURPOSE"));
    }

    private static ImageProcessingConfig positiveV2() {
        final ImageProcessingConfig config = FilmTestFixtures.linearProcessing();
        config.setSchemaVersion(ImageProcessingConfig.SCHEMA_VERSION_V2);
        config.setAlgorithmVersion(ImageProcessingConfig.ALGORITHM_VERSION_V2);
        config.setInputMode(null);
        config.setInputSource("linear-tiff");
        config.setFilmPolarity("positive");
        return config;
    }
}
