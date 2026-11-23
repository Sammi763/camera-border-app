package com.camborder.app.service.impl;

import com.camborder.app.exception.FilmProcessingException;
import com.camborder.app.model.ImageProcessingConfig;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.repository.FilmStageCache;
import com.camborder.app.util.FilmInputProbe;
import com.camborder.app.util.FilmRawDecoder;
import com.camborder.app.util.FilmTestFixtures;
import com.camborder.app.util.FloatRgbImage;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 阶段缓存依赖：只重做受影响下游，缓存开关两条路径逐位一致。 */
final class FilmStageCachePipelineTest {

    private static final long GIB = 1024L * 1024L * 1024L;

    @Test
    void positiveChangesReuseRawAndBaseNegativeChangesReuseRaw(@TempDir final Path tempDir) throws Exception {
        final Path path = FilmTestFixtures.writeLinearTiff(tempDir, 2, 1,
                FilmTestFixtures.constantSamples(2, new int[]{16384, 16384, 16384}));
        final ImageProcessingConfig config = FilmTestFixtures.linearProcessing();
        config.setNegative(FilmTestFixtures.manualNegative(new double[]{0.5, 0.5, 0.5}));
        final RenderRecipe recipe = FilmTestFixtures.recipe(path, config);
        final FilmProcessingPipeline pipeline = pipeline();

        try (FilmProcessingPipeline.Processed first = pipeline.process(recipe, "current-positive")) {
            assertThat(first.getImage().getWidth()).isEqualTo(2);
        }
        assertThat(pipeline.getRawDecodeCount()).isEqualTo(1);
        assertThat(pipeline.getBaseComputeCount()).isEqualTo(1);
        assertThat(pipeline.getPositiveComputeCount()).isEqualTo(1);

        config.setPositive(positive(1.0));
        try (FilmProcessingPipeline.Processed second = pipeline.process(recipe, "current-positive")) {
            assertThat(second.getImage().get(0, 0, 0)).isGreaterThan(0);
        }
        assertThat(pipeline.getRawDecodeCount()).isEqualTo(1);
        assertThat(pipeline.getBaseComputeCount()).isEqualTo(1);
        assertThat(pipeline.getPositiveComputeCount()).isEqualTo(2);

        config.getNegative().getDensity().setMax(2.0);
        try (FilmProcessingPipeline.Processed third = pipeline.process(recipe, "current-positive")) {
            assertThat(third.getImage().getWidth()).isEqualTo(2);
        }
        assertThat(pipeline.getRawDecodeCount()).isEqualTo(1);
        assertThat(pipeline.getBaseComputeCount()).isEqualTo(2);
        assertThat(pipeline.getPositiveComputeCount()).isEqualTo(3);
    }

    @Test
    void basisSurvivesWithoutRawAndInteractiveNeverSuppliesExactPixels(@TempDir final Path tempDir) throws Exception {
        final int width = 1100;
        final int height = 40;
        final Path path = FilmTestFixtures.writeLinearTiff(tempDir, width, height,
                FilmTestFixtures.constantSamples(width * height, new int[]{16000, 16000, 16000}));
        final ImageProcessingConfig config = FilmTestFixtures.linearProcessing();
        config.setNegative(FilmTestFixtures.manualNegative(new double[]{0.5, 0.5, 0.5}));
        final RenderRecipe recipe = FilmTestFixtures.recipe(path, config);
        final FilmStageCache cache = cache();
        final FilmProcessingPipeline pipeline = pipeline(cache);
        cache.configureMaxBytes(FloatRgbImage.bytesFor(width, height));
        try (FilmProcessingPipeline.Processed ignored = pipeline.process(recipe, "base-positive")) {
            assertThat(cache.stages()).containsExactly("base-positive");
        }
        for (double exposure : new double[]{0.2, 0.4}) {
            config.setPositive(positive(exposure));
            try (FilmProcessingPipeline.Processed proxy = pipeline.processInteractivePreview(recipe, 1280, 1280)) {
                assertThat(proxy.getImage().getWidth()).isEqualTo(1024);
                assertThat(proxy.getSourceDecode().getFullWidth()).isEqualTo(width);
            }
            try (FilmProcessingPipeline.Processed exact = pipeline.process(recipe, "current-positive")) {
                assertThat(exact.getImage().getWidth()).isEqualTo(width);
            }
        }
        assertThat(pipeline.getRawDecodeCount()).isEqualTo(1);
        assertThat(pipeline.getBaseComputeCount()).isEqualTo(1);
        assertThat(cache.stages()).containsExactly("base-positive");
    }

    @Test
    void geometryChangesDoNotInvalidatePhotoStages(@TempDir final Path tempDir) throws Exception {
        final Path path = FilmTestFixtures.writeLinearTiff(tempDir, 4, 2,
                FilmTestFixtures.constantSamples(8, new int[]{16000, 16000, 16000}));
        final ImageProcessingConfig config = FilmTestFixtures.linearProcessing();
        config.setNegative(FilmTestFixtures.manualNegative(new double[]{0.5, 0.5, 0.5}));
        final RenderRecipe recipe = FilmTestFixtures.recipe(path, config);
        final FilmProcessingPipeline pipeline = pipeline();
        try (FilmProcessingPipeline.Processed ignored = pipeline.process(recipe, "current-positive")) {
            // 预热缓存
        }
        final long raw = pipeline.getRawDecodeCount();
        final long base = pipeline.getBaseComputeCount();
        final long positive = pipeline.getPositiveComputeCount();

        config.setSourceGeometry(new ImageProcessingConfig.SourceGeometry());
        config.getSourceGeometry().setCrop(new ImageProcessingConfig.NormalizedCrop(0.1, 0.1, 0.8, 0.8));
        config.getSourceGeometry().setRotationDegrees(9.5);
        recipe.setBorder(new com.camborder.app.model.BorderConfig());
        recipe.getBorder().setTop(20);
        recipe.getBorder().setBottom(20);
        recipe.getBorder().setLeft(20);
        recipe.getBorder().setRight(20);
        try (FilmProcessingPipeline.Processed ignored = pipeline.processForOutput(recipe,
                "current-positive", 64, 64, false)) {
            // 合成会重新执行，但照片阶段命中缓存。
        }

        assertThat(pipeline.getRawDecodeCount()).isEqualTo(raw);
        assertThat(pipeline.getBaseComputeCount()).isEqualTo(base);
        assertThat(pipeline.getPositiveComputeCount()).isEqualTo(positive);
    }

    @Test
    void cacheOnAndOffProduceBitIdenticalStagePixels(@TempDir final Path tempDir) throws Exception {
        final Path path = FilmTestFixtures.writeLinearTiff(tempDir, 3, 2,
                FilmTestFixtures.constantSamples(6, new int[]{12000, 13000, 14000}));
        final ImageProcessingConfig config = FilmTestFixtures.linearProcessing();
        config.setNegative(FilmTestFixtures.manualNegative(new double[]{0.4, 0.45, 0.5}));
        config.setPositive(positive(0.75));
        final RenderRecipe recipe = FilmTestFixtures.recipe(path, config);

        final FilmProcessingPipeline cached = pipeline();
        final FilmProcessingPipeline uncached = new FilmProcessingPipeline(
                new FilmRawDecoder("", new ObjectMapper()), new ObjectMapper());
        final float[][] first;
        final float[][] second;
        try (FilmProcessingPipeline.Processed a = cached.process(recipe, "current-positive");
             FilmProcessingPipeline.Processed b = uncached.process(recipe, "current-positive")) {
            first = new float[][]{a.getImage().getRgb().clone()};
            second = new float[][]{b.getImage().getRgb().clone()};
        }
        assertThat(first[0]).containsExactly(second[0]);
    }

    @Test
    void cachedStageIsNotMutatedByDownstreamPositiveAdjustments(@TempDir final Path tempDir) throws Exception {
        final Path path = FilmTestFixtures.writeLinearTiff(tempDir, 2, 1,
                FilmTestFixtures.constantSamples(2, new int[]{20000, 20000, 20000}));
        final ImageProcessingConfig config = FilmTestFixtures.linearProcessing();
        config.setNegative(FilmTestFixtures.manualNegative(new double[]{0.6, 0.6, 0.6}));
        final RenderRecipe recipe = FilmTestFixtures.recipe(path, config);
        final FilmStageCache cache = cache();
        final FilmProcessingPipeline pipeline = pipeline(cache);
        final float[] rawBefore;
        try (FilmProcessingPipeline.Processed raw = pipeline.process(recipe, "raw-linear")) {
            rawBefore = raw.getImage().getRgb().clone();
        }
        config.setPositive(positive(2.0));
        try (FilmProcessingPipeline.Processed ignored = pipeline.process(recipe, "current-positive")) {
            // 上游缓存不能被正片处理器原地修改。
        }
        final String rawKey = cache.keyForStage("raw-linear");
        assertThat(rawKey).isNotNull();
        final FilmStageCache.Lease rawLease = cache.acquire(rawKey);
        assertThat(rawLease).isNotNull();
        try {
            assertThat(rawLease.entry().getImage().getRgb()).containsExactly(rawBefore);
        } finally {
            rawLease.close();
        }
    }

    @Test
    void insufficientBudgetFailsWithControlled422(@TempDir final Path tempDir) throws Exception {
        final Path path = FilmTestFixtures.writeLinearTiff(tempDir, 100, 100,
                FilmTestFixtures.constantSamples(10_000, new int[]{10000, 10000, 10000}));
        final ImageProcessingConfig config = FilmTestFixtures.linearProcessing();
        config.setNegative(FilmTestFixtures.manualNegative(new double[]{0.5, 0.5, 0.5}));
        final FilmStageCache cache = new FilmStageCache(false, 0, 120_000L, System::currentTimeMillis);
        final DefaultFilmMemoryBudgetService tiny = new DefaultFilmMemoryBudgetService(
                cache, 1L * 1024L * 1024L, 400L * 1024L, 0, 0, 0, 0.25);
        final FilmProcessingPipeline pipeline = new FilmProcessingPipeline(
                new FilmRawDecoder("", new ObjectMapper()), new ObjectMapper(),
                new FilmInputProbe(new FilmRawDecoder("", new ObjectMapper())), cache, tiny);

        assertThatThrownBy(() -> pipeline.process(FilmTestFixtures.recipe(path, config), "raw-linear"))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY);
                    assertThat(exception.getCode()).isEqualTo(com.camborder.app.util.FilmMemoryEstimator.CODE_BUDGET_EXCEEDED);
                });
    }

    private static FilmProcessingPipeline pipeline() {
        return pipeline(cache());
    }

    private static FilmStageCache cache() {
        return new FilmStageCache(true, 64L * 1024L * 1024L, 120_000L, System::currentTimeMillis);
    }

    private static FilmProcessingPipeline pipeline(final FilmStageCache cache) {
        final ObjectMapper mapper = new ObjectMapper();
        final FilmRawDecoder raw = new FilmRawDecoder("", mapper);
        final DefaultFilmMemoryBudgetService budget = new DefaultFilmMemoryBudgetService(
                cache, 16L * GIB, 4L * GIB, 0, 0, 0, 0.25);
        return new FilmProcessingPipeline(raw, mapper, new FilmInputProbe(raw), cache, budget);
    }

    private static ImageProcessingConfig.PositiveAdjustments positive(final double exposure) {
        final ImageProcessingConfig.PositiveAdjustments positive =
                new ImageProcessingConfig.PositiveAdjustments();
        positive.setExposureEv(exposure);
        return positive;
    }

}
