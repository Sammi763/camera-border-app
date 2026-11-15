package com.camborder.app.service.impl;

import com.camborder.app.model.ImageProcessingConfig;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.util.FilmRawDecoder;
import com.camborder.app.util.FilmTestFixtures;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/** v2 正片直通与彩负分支复用同一浮点管线。 */
final class FilmProcessingV2Test {

    private final ObjectMapper mapper = new ObjectMapper();
    private final FilmProcessingPipeline pipeline = new FilmProcessingPipeline(
            new FilmRawDecoder("", mapper), mapper);

    @Test
    void positiveSkipsInversionAndZeroAdjustmentsAreIdentity(@TempDir final Path temp) throws Exception {
        final Path path = FilmTestFixtures.writeLinearTiff(temp, 1, 1,
                new int[]{16384, 16384, 16384});
        final RenderRecipe recipe = FilmTestFixtures.recipe(path, v2("positive"));

        try (FilmProcessingPipeline.Processed base = pipeline.process(recipe, "base-positive");
             FilmProcessingPipeline.Processed current = pipeline.process(recipe, "current-positive")) {
            for (int channel = 0; channel < 3; channel++) {
                assertThat(current.getImage().get(0, 0, channel))
                        .isCloseTo(base.getImage().get(0, 0, channel), within(1e-6f));
                assertThat(base.getImage().get(0, 0, channel))
                        .isCloseTo(16384f / 65535f, within(1e-6f));
            }
            assertThat(current.getResolvedFilmBase()).isNull();
            assertThat(current.getResolvedLightGain()).isNull();
        }
        assertThat(pipeline.getBaseComputeCount()).isZero();
        assertThat(pipeline.getPositiveComputeCount()).isEqualTo(1);
    }

    @Test
    void positiveExposureDoublesLinearValues(@TempDir final Path temp) throws Exception {
        final Path path = FilmTestFixtures.writeLinearTiff(temp, 1, 1,
                new int[]{16384, 16384, 16384});
        final ImageProcessingConfig config = v2("positive");
        config.getPositive().setExposureEv(1);
        final RenderRecipe recipe = FilmTestFixtures.recipe(path, config);

        try (FilmProcessingPipeline.Processed current = pipeline.process(recipe, "current-positive")) {
            for (int channel = 0; channel < 3; channel++) {
                assertThat(current.getImage().get(0, 0, channel))
                        .isCloseTo((float) (16384d / 65535d * 2d), within(2e-6f));
            }
        }
    }

    @Test
    void colorNegativeStillEntersNegativeAndPositiveStages(@TempDir final Path temp) throws Exception {
        final Path path = FilmTestFixtures.writeLinearTiff(temp, 1, 1,
                new int[]{32768, 32768, 32768});
        final ImageProcessingConfig config = v2("color-negative");
        config.setNegative(FilmTestFixtures.manualNegative(new double[]{0.8, 0.6, 0.4}));
        final RenderRecipe recipe = FilmTestFixtures.recipe(path, config);

        try (FilmProcessingPipeline.Processed base = pipeline.process(recipe, "base-positive");
             FilmProcessingPipeline.Processed current = pipeline.process(recipe, "current-positive")) {
            assertThat(base.getResolvedFilmBase()).isNotNull();
            assertThat(pipeline.getBaseComputeCount()).isEqualTo(2);
            assertThat(current.getImage().get(0, 0, 0)).isCloseTo(base.getImage().get(0, 0, 0), within(1e-6f));
        }
    }

    private static ImageProcessingConfig v2(final String polarity) {
        final ImageProcessingConfig config = FilmTestFixtures.linearProcessing();
        config.setSchemaVersion(ImageProcessingConfig.SCHEMA_VERSION_V2);
        config.setAlgorithmVersion(ImageProcessingConfig.ALGORITHM_VERSION_V2);
        config.setInputMode(null);
        config.setInputSource("linear-tiff");
        config.setFilmPolarity(polarity);
        return config;
    }
}
