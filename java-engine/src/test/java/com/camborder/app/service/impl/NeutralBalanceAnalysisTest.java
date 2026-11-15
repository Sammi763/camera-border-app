package com.camborder.app.service.impl;

import com.camborder.app.dto.ImageAnalysisRequest;
import com.camborder.app.dto.ImageAnalysisResponse;
import com.camborder.app.exception.FilmProcessingException;
import com.camborder.app.model.ImageProcessingConfig;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.util.FilmRawDecoder;
import com.camborder.app.util.FilmTestFixtures;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

/** 中性区域建议：基础正片取样、过滤、绑定和过期依据。 */
final class NeutralBalanceAnalysisTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final DefaultImageAnalysisService service = new DefaultImageAnalysisService(
            new FilmProcessingPipeline(new FilmRawDecoder("", mapper), mapper));

    @Test
    void neutralPatchProducesBoundGainAndEvSuggestion(@TempDir final Path temp) throws Exception {
        final int[] samples = new int[16 * 3];
        for (int index = 0; index < 16; index++) {
            samples[index * 3] = 19660;
            samples[index * 3 + 1] = 16384;
            samples[index * 3 + 2] = 13107;
        }
        final Path path = FilmTestFixtures.writeLinearTiff(temp, 4, 4, samples);
        final ImageAnalysisRequest request = request(path);

        final ImageAnalysisResponse response = service.analyze(request);

        assertThat(response.getPurpose()).isEqualTo("neutral-balance");
        assertThat(response.getStage()).isEqualTo("base-positive");
        final ImageAnalysisResponse.NeutralBalance neutral = response.getNeutralBalance();
        assertThat(neutral.isAvailable()).as(String.valueOf(neutral.getNote())).isTrue();
        assertThat(neutral.getStage()).isEqualTo("base-positive");
        assertThat(neutral.getSampleCount()).isEqualTo(16);
        assertThat(neutral.getSuggestedRgbGain()[0]).isCloseTo((0.2627 * 19660 + 0.6780 * 16384 + 0.0593 * 13107) / 19660, within(1e-4));
        assertThat(neutral.getSuggestedRgbGain()[1]).isCloseTo((0.2627 * 19660 + 0.6780 * 16384 + 0.0593 * 13107) / 16384, within(1e-4));
        assertThat(neutral.getSuggestedRgbGain()[2]).isCloseTo((0.2627 * 19660 + 0.6780 * 16384 + 0.0593 * 13107) / 13107, within(1e-4));
        assertThat(neutral.getSuggestedRgbBalanceEv()[0]).isCloseTo(Math.log(neutral.getSuggestedRgbGain()[0]) / Math.log(2), within(1e-9));
        assertThat(neutral.getSuggestedRgbBalanceEv()[2]).isCloseTo(Math.log(neutral.getSuggestedRgbGain()[2]) / Math.log(2), within(1e-9));
        assertThat(neutral.getBinding()).hasSize(64);
        assertThat(neutral.getBinding()).isEqualTo(response.getNeutralBalance().getBinding());
        assertThat(response.getRecipeSignature()).hasSize(64);
        assertThat(response.getSourceVersion()).startsWith("sha256:");
    }

    @Test
    void darkAndClippedRegionsAreRejectedInsteadOfBiasingGain(@TempDir final Path temp) throws Exception {
        final Path darkDir = java.nio.file.Files.createDirectories(temp.resolve("dark"));
        final Path dark = FilmTestFixtures.writeLinearTiff(darkDir, 1, 1,
                new int[]{100, 100, 100});
        final ImageAnalysisResponse darkResponse = service.analyze(request(dark));
        assertThat(darkResponse.getNeutralBalance().isAvailable()).isFalse();
        assertThat(darkResponse.getNeutralBalance().getRejectedTooDark()).isEqualTo(1);
        assertThat(darkResponse.getNeutralBalance().getSuggestedRgbGain()).isNull();

        final Path clippedDir = java.nio.file.Files.createDirectories(temp.resolve("clipped"));
        final Path clipped = FilmTestFixtures.writeLinearTiff(clippedDir, 1, 1,
                new int[]{65535, 65535, 65535});
        final ImageAnalysisResponse clippedResponse = service.analyze(request(clipped));
        assertThat(clippedResponse.getNeutralBalance().isAvailable()).isFalse();
        assertThat(clippedResponse.getNeutralBalance().getRejectedClipped()).isEqualTo(1);
    }

    @Test
    void invalidPurposeAndRoiFailWithStableErrors(@TempDir final Path temp) throws Exception {
        final Path path = FilmTestFixtures.writeLinearTiff(temp, 1, 1,
                new int[]{10000, 10000, 10000});
        final ImageAnalysisRequest invalidPurpose = request(path);
        invalidPurpose.setPurpose("auto-white-balance");
        assertThatThrownBy(() -> service.analyze(invalidPurpose))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo("IMAGE_ANALYSIS_INVALID_PURPOSE"));

        final ImageAnalysisRequest badRoi = request(path);
        badRoi.setRoi(new ImageProcessingConfig.NormalizedCrop(0.9, 0.9, 0.5, 0.5));
        assertThatThrownBy(() -> service.analyze(badRoi))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception ->
                        assertThat(exception.getCode())
                                .isEqualTo(DefaultImageAnalysisService.CODE_INVALID_ROI));
    }

    @Test
    void extremeCastIsRejectedRatherThanClamped(@TempDir final Path temp) throws Exception {
        final int[] samples = new int[16 * 3];
        for (int i = 0; i < 16; i++) {
            samples[i * 3] = 63000;
            samples[i * 3 + 1] = 100;
            samples[i * 3 + 2] = 100;
        }
        final Path path = FilmTestFixtures.writeLinearTiff(temp, 4, 4, samples);
        final ImageAnalysisResponse.NeutralBalance neutral = service.analyze(request(path)).getNeutralBalance();
        assertThat(neutral.isAvailable()).isFalse();
        assertThat(neutral.getSuggestedRgbBalanceEv()).isNull();
        assertThat(neutral.getNote()).contains("超出");
    }

    private static ImageAnalysisRequest request(final Path path) {
        final ImageProcessingConfig config = FilmTestFixtures.linearProcessing();
        config.setSchemaVersion(ImageProcessingConfig.SCHEMA_VERSION_V2);
        config.setAlgorithmVersion(ImageProcessingConfig.ALGORITHM_VERSION_V2);
        config.setInputMode(null);
        config.setInputSource("linear-tiff");
        config.setFilmPolarity("positive");
        final RenderRecipe recipe = FilmTestFixtures.recipe(path, config);
        final ImageAnalysisRequest request = new ImageAnalysisRequest();
        request.setRecipe(recipe);
        request.setPurpose("neutral-balance");
        return request;
    }
}
