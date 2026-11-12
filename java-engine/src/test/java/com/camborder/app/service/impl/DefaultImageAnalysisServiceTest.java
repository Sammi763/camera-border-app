package com.camborder.app.service.impl;

import com.camborder.app.dto.ImageAnalysisRequest;
import com.camborder.app.dto.ImageAnalysisResponse;
import com.camborder.app.exception.FilmProcessingException;
import com.camborder.app.model.ImageProcessingConfig;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.model.TextItem;
import com.camborder.app.util.FilmRawDecoder;
import com.camborder.app.util.FilmTestFixtures;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** T07 分析服务：直方图/ROI/统计/剪裁事实和错误路径。 */
final class DefaultImageAnalysisServiceTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final DefaultImageAnalysisService service = new DefaultImageAnalysisService(
            new FilmProcessingPipeline(new FilmRawDecoder("", mapper), mapper));

    @Test
    void outputSpaceHasMeasuredBoundaryCountsAndInvalidSpaceFails(@TempDir final Path temp) throws Exception {
        final Path path = FilmTestFixtures.writeLinearTiff(temp,1,1,new int[]{65535,0,0});
        final ImageAnalysisRequest request = request(FilmTestFixtures.recipe(path,FilmTestFixtures.linearProcessing()),"raw-linear",null);
        request.setOutputSpace("srgb");
        final ImageAnalysisResponse response=service.analyze(request);
        assertThat(response.getClipping().getStages().get("output").isAvailable()).isTrue();
        assertThat(response.getClipping().getStages().get("output").getClippedHigh()[0]).isEqualTo(1);
        request.setOutputSpace("invalid");
        assertThatThrownBy(()->service.analyze(request)).hasMessageContaining("输出统计空间非法");
    }

    @Test
    void fullImageAnalysisHasConsistentHistogramAndClippingFacts(@TempDir final Path tempDir)
            throws Exception {
        final int width = 2;
        final Path path = FilmTestFixtures.writeLinearTiff(tempDir, width, 1, new int[]{
                0, 0, 0, 65535, 65535, 65535
        });
        final RenderRecipe recipe = FilmTestFixtures.recipe(path, FilmTestFixtures.linearProcessing());

        final ImageAnalysisResponse response = service.analyze(request(recipe, "raw-linear", null));

        assertThat(response.getStatus()).isEqualTo("ok");
        assertThat(response.getAnalyzedWidth()).isEqualTo(2);
        assertThat(response.getAnalyzedHeight()).isEqualTo(1);
        assertThat(response.getSampling()).isEqualTo("full");
        assertThat(response.getBucketCount()).isEqualTo(256);
        assertThat(sum(response.getHistogram().getRed())).isEqualTo(2);
        assertThat(response.getStats().getPixelCount()).isEqualTo(2);
        assertThat(response.getStats().getClippedLow()[0]).isEqualTo(1);
        assertThat(response.getStats().getClippedHigh()[0]).isEqualTo(1);
        assertThat(response.getRecipeSignature()).hasSize(64);
        assertThat(response.getSourceVersion()).startsWith("sha256:");
        assertThat(response.getClipping().getStages().get("sensor").isAvailable()).isFalse();
        assertThat(response.getClipping().getStages().get("working").isAvailable()).isTrue();
        assertThat(response.getClipping().getStages().get("output").isAvailable()).isFalse();
    }

    @Test
    void roiAnalysisOnlyCountsSelectedRegion(@TempDir final Path tempDir) throws Exception {
        final int width = 4;
        final Path path = FilmTestFixtures.writeLinearTiff(tempDir, width, 1, new int[]{
                0, 0, 0,
                10000, 10000, 10000,
                20000, 20000, 20000,
                30000, 30000, 30000
        });
        final RenderRecipe recipe = FilmTestFixtures.recipe(path, FilmTestFixtures.linearProcessing());
        final ImageProcessingConfig.NormalizedCrop roi = new ImageProcessingConfig.NormalizedCrop(
                0.25, 0, 0.5, 1);

        final ImageAnalysisResponse response = service.analyze(request(recipe, "raw-linear", roi));

        assertThat(response.getStats().getPixelCount()).isEqualTo(2);
        assertThat(response.getRoi().getX()).isEqualTo(0.25);
        assertThat(response.getAnalyzedWidth()).isEqualTo(2);
        assertThat(response.getStats().getMean()[0]).isCloseTo(15000 / 65535.0,
                org.assertj.core.api.Assertions.within(1e-6));
    }

    @Test
    void decorationsDoNotChangeAnalysisStatistics(@TempDir final Path tempDir) throws Exception {
        final Path path = FilmTestFixtures.writeLinearTiff(tempDir, 1, 1,
                new int[]{10000, 10000, 10000});
        final RenderRecipe plain = FilmTestFixtures.recipe(path, FilmTestFixtures.linearProcessing());
        final RenderRecipe decorated = FilmTestFixtures.recipe(path, FilmTestFixtures.linearProcessing());
        decorated.setTexts(List.of(new TextItem()));
        decorated.setBorderStyle(new com.camborder.app.model.BorderStyle());

        final ImageAnalysisResponse first = service.analyze(request(plain, "raw-linear", null));
        final ImageAnalysisResponse second = service.analyze(request(decorated, "raw-linear", null));

        assertThat(second.getStats().getMean()).isEqualTo(first.getStats().getMean());
        assertThat(second.getStats().getPixelCount()).isEqualTo(first.getStats().getPixelCount());
    }

    @Test
    void invalidStageAndRoiAreRejected(@TempDir final Path tempDir) throws Exception {
        final Path path = FilmTestFixtures.writeLinearTiff(tempDir, 1, 1,
                new int[]{10000, 10000, 10000});
        final RenderRecipe recipe = FilmTestFixtures.recipe(path, FilmTestFixtures.linearProcessing());

        assertThatThrownBy(() -> service.analyze(request(recipe, "bogus", null)))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception ->
                        assertThat(exception.getCode())
                                .isEqualTo(DefaultImageAnalysisService.CODE_INVALID_STAGE));
        assertThatThrownBy(() -> service.analyze(request(recipe, "raw-linear",
                new ImageProcessingConfig.NormalizedCrop(0.5, 0.5, 0, 0.5))))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception ->
                        assertThat(exception.getCode())
                                .isEqualTo(DefaultImageAnalysisService.CODE_INVALID_ROI));
    }

    @Test
    void missingProcessingIsRejected(@TempDir final Path tempDir) throws Exception {
        final Path path = FilmTestFixtures.writeLinearTiff(tempDir, 1, 1,
                new int[]{10000, 10000, 10000});
        final RenderRecipe ordinary = new RenderRecipe(path.toString(), null, null, null, false);

        assertThatThrownBy(() -> service.analyze(request(ordinary, "raw-linear", null)))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(FilmProcessingPipeline.CODE_NO_PROCESSING));
    }

    private static ImageAnalysisRequest request(final RenderRecipe recipe, final String stage,
                                                final ImageProcessingConfig.NormalizedCrop roi) {
        final ImageAnalysisRequest request = new ImageAnalysisRequest();
        request.setRecipe(recipe);
        request.setStage(stage);
        request.setRoi(roi);
        return request;
    }

    private static long sum(final long[] values) {
        long total = 0;
        for (long value : values) total += value;
        return total;
    }
}
