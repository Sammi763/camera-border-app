package com.camborder.app.service.impl;

import com.camborder.app.dto.ExportSettings;
import com.camborder.app.exception.ApiException;
import com.camborder.app.exception.FilmProcessingException;
import com.camborder.app.model.BorderConfig;
import com.camborder.app.model.ImageProcessingConfig;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.util.FilmRawDecoder;
import com.camborder.app.util.FilmInputProbe;
import com.camborder.app.repository.FilmStageCache;
import com.camborder.app.util.FilmTestFixtures;
import com.camborder.app.util.BorderComposer;
import com.camborder.app.util.BorderStyleRenderer;
import com.camborder.app.util.GradientPainter;
import com.camborder.app.util.ImageEncoder;
import com.camborder.app.util.ImageMetadataPayload;
import com.camborder.app.util.ImagePlacementRenderer;
import com.camborder.app.util.ImageReader;
import com.camborder.app.util.ImageScaler;
import com.camborder.app.util.LogoRenderer;
import com.camborder.app.util.RawDecoder;
import com.camborder.app.util.TextRenderer;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** T11 底片导出：sRGB JPEG、16-bit sRGB/Rec.2020 TIFF、不带框母版和错误组合。 */
final class FilmExportServiceTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final ImageEncoder encoder = new ImageEncoder(new FileExifTool());
    private final FilmExportService service = new FilmExportService(
            new FilmProcessingPipeline(new FilmRawDecoder("", mapper), mapper),
            encoder, new com.camborder.app.util.FilmCompositor(new BorderStyleRenderer(), new TextRenderer(), new LogoRenderer(), new GradientPainter()));

    @Test void preflightDescribesExpectedFactsButNeverClaimsVerified(@TempDir Path temp) throws Exception {
        final RenderRecipe recipe = recipe(temp, false);
        final ExportSettings export = filmExport(temp.resolve("expected.tif"),"tiff","tiff16-rec2020",false);
        final com.camborder.app.dto.FidelityReport report = service.preflight(recipe,export,null);
        assertThat(report.isVerified()).isFalse();
        assertThat(report.getSource().getWidth()).isEqualTo(2);
        assertThat(report.getOutput().getWidth()).isEqualTo(202);
        assertThat(report.getOutput().getColorSpace()).isEqualTo("linear-rec2020");
        assertThat(report.getOutput().getBitDepth()).isEqualTo(16);
        assertThatThrownBy(() -> service.preflight(recipe,export,"stale-version")).hasMessageContaining("源图已变化");
        assertThat(temp.resolve("expected.tif")).doesNotExist();
    }

    @Test
    void sourceMutationDuringMetadataRewriteNeverPublishes(@TempDir final Path tempDir) throws Exception {
        final FileExifTool tool = new FileExifTool(); tool.mutateSource = true;
        final FilmExportService service = new FilmExportService(new FilmProcessingPipeline(new FilmRawDecoder("", mapper), mapper),
                new ImageEncoder(tool), new com.camborder.app.util.FilmCompositor(new BorderStyleRenderer(),new TextRenderer(),new LogoRenderer(),new GradientPainter()));
        final Path output = tempDir.resolve("mutated.tif");
        assertThatThrownBy(() -> service.export(recipe(tempDir, true), filmExport(output,"tiff","tiff16-srgb",true)))
                .hasMessageContaining("源文件已变化");
        assertThat(output).doesNotExist();
        try (java.util.stream.Stream<Path> files = Files.list(tempDir)) {
            assertThat(files.noneMatch(path -> path.getFileName().toString().startsWith(".camborder-export-"))).isTrue();
        }
    }

    @Test
    void staleSourceVersionNeverWritesOutput(@TempDir final Path tempDir) throws Exception {
        final RenderRecipe recipe = recipe(tempDir, true);
        final Path output = tempDir.resolve("stale.tif");
        assertThatThrownBy(() -> service.export(recipe,
                filmExport(output, "tiff", "tiff16-srgb", true), "stale-version"))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo("FILM_SOURCE_CHANGED"));
        assertThat(Files.exists(output)).isFalse();
    }

    @Test
    void borderlessSrgbJpegIsEightBitWithIcc(@TempDir final Path tempDir) throws Exception {
        final RenderRecipe recipe = recipe(tempDir, true);
        final Path output = tempDir.resolve("film-share.jpg");
        final ExportSettings export = filmExport(output, "jpeg", "srgb-jpeg", true);

        final FilmExportService.Result result = service.export(recipe, export);

        assertThat(result.getExportResult().getActualFormat()).isEqualTo("jpeg");
        final BufferedImage readBack = ImageIO.read(output.toFile());
        assertThat(readBack.getWidth()).isEqualTo(2);
        assertThat(readBack.getHeight()).isEqualTo(1);
        assertThat(readBack.getRaster().getDataBuffer().getDataType())
                .isEqualTo(java.awt.image.DataBuffer.TYPE_BYTE);
        assertThat(ImageMetadataPayload.read(output.toString()).hasIcc()).isTrue();
    }

    @Test
    void borderlessSrgbTiffIsSixteenBitWithIccAndNoDecorations(@TempDir final Path tempDir) throws Exception {
        final RenderRecipe recipe = recipe(tempDir, true);
        final Path output = tempDir.resolve("film-master-srgb.tif");
        final ExportSettings export = filmExport(output, "tiff", "tiff16-srgb", true);

        service.export(recipe, export);

        final BufferedImage readBack = ImageIO.read(output.toFile());
        assertThat(readBack.getRaster().getDataBuffer().getDataType())
                .isEqualTo(java.awt.image.DataBuffer.TYPE_USHORT);
        // borderless 母版保持处理图尺寸，不被 100px 边框扩展。
        assertThat(readBack.getWidth()).isEqualTo(2);
        assertThat(readBack.getHeight()).isEqualTo(1);
        assertThat(ImageMetadataPayload.read(output.toString()).hasIcc()).isTrue();
    }

    @Test
    void wideGamutAndDecoratedSixteenBitPreserveLowBits(@TempDir final Path tempDir) throws Exception {
        final RenderRecipe recipe = recipe(tempDir, false);
        final Path wide = tempDir.resolve("wide.tif");
        final FilmExportService.Result result = service.export(recipe, filmExport(wide, "tiff", "tiff16-rec2020", false));
        final BufferedImage read = ImageIO.read(wide.toFile());
        assertThat(read.getWidth()).isEqualTo(202);
        assertThat(read.getRaster().getSampleModel().getSampleSize(0)).isEqualTo(16);
        final java.awt.color.ICC_ProfileRGB profile = (java.awt.color.ICC_ProfileRGB)
                java.awt.color.ICC_Profile.getInstance(ImageMetadataPayload.read(wide.toString()).getIcc());
        assertThat(profile.getGamma(0)).isEqualTo(1);
        assertThat(result.getExportResult().getFidelityReport().isVerified()).isTrue();
        assertThat(result.getExportResult().getColorProfilePreservation().getMessage()).contains("linear-rec2020");
        final Path srgb = tempDir.resolve("decorated.tif");
        service.export(recipe, filmExport(srgb, "tiff", "tiff16-srgb", false));
        assertThat(ImageIO.read(srgb.toFile()).getWidth()).isEqualTo(202);
    }

    @Test
    void missingMetadataToolFailsWithoutPublishing(@TempDir final Path tempDir) throws Exception {
        final FilmExportService unavailable = new FilmExportService(
                new FilmProcessingPipeline(new FilmRawDecoder("", mapper), mapper), new ImageEncoder(),
                new com.camborder.app.util.FilmCompositor(new BorderStyleRenderer(), new TextRenderer(), new LogoRenderer(), new GradientPainter()));
        final Path output = tempDir.resolve("missing.tif");
        assertThatThrownBy(() -> unavailable.export(recipe(tempDir, true), filmExport(output, "tiff", "tiff16-srgb", true)))
                .hasMessageContaining("ExifTool");
        assertThat(output).doesNotExist();
    }

    @Test
    void borderlessMasterAppliesCropAndExplicitOutputSize(@TempDir final Path tempDir) throws Exception {
        final RenderRecipe recipe = recipe(tempDir, true);
        recipe.getImageProcessing().getSourceGeometry().setCrop(
                new ImageProcessingConfig.NormalizedCrop(0.5, 0, 0.5, 1));
        final Path cropped = tempDir.resolve("cropped.tif");
        service.export(recipe, filmExport(cropped, "tiff", "tiff16-srgb", true));
        assertThat(ImageIO.read(cropped.toFile()).getWidth()).isEqualTo(1);
        recipe.getImageProcessing().setSourceGeometry(null);
        final Path small = tempDir.resolve("small.tif");
        final ExportSettings export = filmExport(small, "tiff", "tiff16-srgb", true);
        export.setMaxWidth(1);
        service.export(recipe, export);
        assertThat(ImageIO.read(small.toFile()).getWidth()).isEqualTo(1);
    }

    @Test
    void cacheEnabledAndDisabledExportsProduceIdenticalPixelsAndFacts(@TempDir final Path tempDir)
            throws Exception {
        final Path sourceDir = Files.createDirectory(tempDir.resolve("source"));
        final RenderRecipe recipe = recipe(sourceDir, false);
        final Path enabledOutput = tempDir.resolve("cached.tif");
        final Path disabledOutput = tempDir.resolve("uncached.tif");
        final FilmStageCache cache = new FilmStageCache(true, 64L * 1024L * 1024L,
                120_000L, System::currentTimeMillis);
        final FilmProcessingPipeline cachedPipeline = new FilmProcessingPipeline(
                new FilmRawDecoder("", mapper), mapper, new FilmInputProbe(new FilmRawDecoder("", mapper)),
                cache, new DefaultFilmMemoryBudgetService(cache,
                16L * 1024L * 1024L * 1024L, 4L * 1024L * 1024L * 1024L, 0, 0, 0, 0.25));
        final FilmExportService cached = new FilmExportService(cachedPipeline, encoder,
                new com.camborder.app.util.FilmCompositor(new BorderStyleRenderer(), new TextRenderer(),
                        new LogoRenderer(), new GradientPainter()));
        final FilmExportService uncached = new FilmExportService(
                new FilmProcessingPipeline(new FilmRawDecoder("", mapper), mapper), encoder,
                new com.camborder.app.util.FilmCompositor(new BorderStyleRenderer(), new TextRenderer(),
                        new LogoRenderer(), new GradientPainter()));

        cached.export(recipe, filmExport(enabledOutput, "tiff", "tiff16-srgb", false));
        uncached.export(recipe, filmExport(disabledOutput, "tiff", "tiff16-srgb", false));

        final BufferedImage a = ImageIO.read(enabledOutput.toFile());
        final BufferedImage b = ImageIO.read(disabledOutput.toFile());
        assertThat(a.getWidth()).isEqualTo(b.getWidth());
        assertThat(a.getHeight()).isEqualTo(b.getHeight());
        for (int y = 0; y < a.getHeight(); y++) {
            for (int x = 0; x < a.getWidth(); x++) {
                for (int band = 0; band < a.getRaster().getNumBands(); band++) {
                    assertThat(a.getRaster().getSample(x, y, band))
                            .isEqualTo(b.getRaster().getSample(x, y, band));
                }
            }
        }
        assertThat(cache.stats().getPuts()).isGreaterThan(0);
    }

    @Test
    void missingFilmOutputAndFormatMismatchAreRejected(@TempDir final Path tempDir) throws Exception {
        final RenderRecipe recipe = recipe(tempDir, true);
        final ExportSettings missing = new ExportSettings(
                tempDir.resolve("x.jpg").toString(), "jpeg", 95);
        assertThatThrownBy(() -> service.export(recipe, missing))
                .isInstanceOfSatisfying(ApiException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo("IMAGE_PROCESSING_FILM_OUTPUT_REQUIRED"));

        final ExportSettings mismatch = filmExport(
                tempDir.resolve("x.tif"), "jpeg", "tiff16-srgb", true);
        assertThatThrownBy(() -> service.export(recipe, mismatch))
                .isInstanceOfSatisfying(ApiException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo("IMAGE_PROCESSING_FILM_OUTPUT_INVALID"));
    }

    private RenderRecipe recipe(final Path tempDir, final boolean borderless) throws Exception {
        final Path source = FilmTestFixtures.writeLinearTiff(tempDir, 2, 1, new int[]{
                16384, 16384, 16384, 32768, 32768, 32768
        });
        final ImageProcessingConfig processing = FilmTestFixtures.linearProcessing();
        processing.setNegative(FilmTestFixtures.manualNegative(new double[]{0.5, 0.5, 0.5}));
        final RenderRecipe recipe = FilmTestFixtures.recipe(source, processing);
        if (!borderless) {
            recipe.setBorder(new BorderConfig(100, 100, 100, 100, "#ffffff"));
        }
        return recipe;
    }

    private static ExportSettings filmExport(final Path output, final String format,
                                             final String filmOutput, final boolean borderless) {
        final ExportSettings export = new ExportSettings(output.toString(), format, 95);
        export.setFilmOutput(filmOutput);
        export.setBorderlessMaster(borderless);
        export.setTier("custom");
        return export;
    }
    /** 使用真实 ImageIO 栅格和 ICC 验证编码；原生元数据工具另有集成测试。 */
    private static final class FileExifTool implements com.camborder.app.service.ExifToolService {
        boolean mutateSource;
        public boolean isAvailable() { return true; }
        public String version() { return "test-file-inspector"; }
        public Inspection inspect(final Path path) {
            try {
                final BufferedImage image = ImageIO.read(path.toFile());
                final com.camborder.app.dto.FidelityReport.IccFacts icc = new com.camborder.app.dto.FidelityReport.IccFacts();
                icc.setState(ImageMetadataPayload.read(path.toString()).hasIcc() ? "present" : "absent");
                return new Inspection(true, image.getWidth(), image.getHeight(), com.camborder.app.util.PixelBufferFactory.bitDepth(image), 1,
                        "icc", icc, new com.camborder.app.dto.FidelityReport.MetadataFacts(), null);
            } catch (Exception e) { throw new IllegalStateException(e); }
        }
        public void rewrite(final Path source, final Path output, final String policy, final byte[] icc,
                            final int width, final int height, final int depth, final String space) {
            try {
                final BufferedImage image = ImageIO.read(output.toFile());
                Files.delete(output);
                if (depth == 16) new ImageEncoder().writeFilmTiff(image, output.toString(), icc);
                else new ImageEncoder().writeFilmJpeg(image, output.toString(), icc, 95);
                if (mutateSource) Files.writeString(source, "changed during metadata");
            } catch (Exception e) { throw new IllegalStateException(e); }
        }
    }

}
