package com.camborder.app.service.impl;

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

/** T07 分析共用流水线：raw-linear / base-positive / current-positive 阶段。 */
final class FilmProcessingPipelineTest {

    private final FilmProcessingPipeline pipeline = new FilmProcessingPipeline(
            new FilmRawDecoder("", new ObjectMapper()), new ObjectMapper());

    @Test
    void stagesReuseSameSourceAndApplyNegativeThenPositive(@TempDir final Path tempDir) throws Exception {
        final double[] base = {0.5, 0.5, 0.5};
        final int[] samples = FilmTestFixtures.constantSamples(2, new int[]{16384, 16384, 16384});
        final Path path = FilmTestFixtures.writeLinearTiff(tempDir, 2, 1, samples);
        final ImageProcessingConfig config = FilmTestFixtures.linearProcessing();
        config.setNegative(FilmTestFixtures.manualNegative(base));
        final RenderRecipe recipe = FilmTestFixtures.recipe(path, config);

        final FilmProcessingPipeline.Processed raw = pipeline.process(recipe, "raw-linear");
        assertThat(raw.getImage().get(0, 0, 0))
                .isCloseTo(16384 / 65535f, within(1e-6f));
        assertThat(raw.getImage().hasNonFinite()).isFalse();

        final FilmProcessingPipeline.Processed basePositive = pipeline.process(recipe, "base-positive");
        final double expected = (-Math.log10((16384 / 65535.0) / 0.5)) / 1.0;
        assertThat(basePositive.getImage().get(0, 0, 0))
                .isCloseTo((float) expected, within(1e-5f));

        config.setPositive(new ImageProcessingConfig.PositiveAdjustments());
        config.getPositive().setExposureEv(1);
        final FilmProcessingPipeline.Processed positive = pipeline.process(recipe, "current-positive");
        assertThat(positive.getImage().get(0, 0, 0))
                .isCloseTo((float) (expected * 2), within(1e-5f));
    }

    @Test
    void sourceGeometryDoesNotAffectAnalysisStageCoordinates(@TempDir final Path tempDir) throws Exception {
        final Path path = FilmTestFixtures.writeLinearTiff(tempDir, 4, 2,
                FilmTestFixtures.constantSamples(8, new int[]{10000, 10000, 10000}));
        final ImageProcessingConfig config = FilmTestFixtures.linearProcessing();
        config.setSourceGeometry(new ImageProcessingConfig.SourceGeometry());
        config.getSourceGeometry().setCrop(new ImageProcessingConfig.NormalizedCrop(0.25, 0.25, 0.5, 0.5));
        config.getSourceGeometry().setRotationDegrees(12.5);

        final FilmProcessingPipeline.Processed processed = pipeline.process(
                FilmTestFixtures.recipe(path, config), "raw-linear");

        // 分析阶段基于完整源图坐标，编辑裁切/校平不在此处执行。
        assertThat(processed.getImage().getWidth()).isEqualTo(4);
        assertThat(processed.getImage().getHeight()).isEqualTo(2);
    }

    @Test
    void invalidStageAndMissingProcessingAreRejected(@TempDir final Path tempDir) throws Exception {
        final Path path = FilmTestFixtures.writeLinearTiff(tempDir, 1, 1,
                FilmTestFixtures.constantSamples(1, new int[]{10000, 10000, 10000}));
        final RenderRecipe recipe = FilmTestFixtures.recipe(path, FilmTestFixtures.linearProcessing());

        assertThatThrownBy(() -> pipeline.process(recipe, "bogus"))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(FilmProcessingPipeline.CODE_INVALID_STAGE));
        final RenderRecipe ordinary = new RenderRecipe(path.toString(), null, null, null, false);
        assertThatThrownBy(() -> pipeline.process(ordinary, "raw-linear"))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(FilmProcessingPipeline.CODE_NO_PROCESSING));
    }

    @Test
    void negativeStageRequiresEnabledNegative(@TempDir final Path tempDir) throws Exception {
        final Path path = FilmTestFixtures.writeLinearTiff(tempDir, 1, 1,
                FilmTestFixtures.constantSamples(1, new int[]{10000, 10000, 10000}));
        final RenderRecipe recipe = FilmTestFixtures.recipe(path, FilmTestFixtures.linearProcessing());

        assertThatThrownBy(() -> pipeline.process(recipe, "base-positive"))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(FilmProcessingPipeline.CODE_NEGATIVE_REQUIRED));
    }
}
