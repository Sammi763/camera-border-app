package com.camborder.app.util;

import com.camborder.app.dto.ExportSettings;
import com.camborder.app.exception.FilmProcessingException;
import com.camborder.app.model.ImageProcessingConfig;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.service.impl.FilmExportService;
import com.camborder.app.service.impl.FilmProcessingPipeline;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

/** FFF TIFF 容器：RGB16 主图、分块读取、外部预览不冒充主图、全尺寸导出。 */
final class FilmFlextightReaderTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void readsRgb16MainImageAcrossChunkBoundary(@TempDir final Path temp) throws Exception {
        final int width = 300;
        final int height = 600;
        final int[] samples = new int[width * height * 3];
        for (int index = 0; index < width * height; index++) {
            samples[index * 3] = 10000;
            samples[index * 3 + 1] = 20000;
            samples[index * 3 + 2] = 30000;
        }
        final Path tiff = FilmTestFixtures.writeLinearTiff(temp, width, height, samples);
        final Path fff = temp.resolve("scan.fff");
        Files.move(tiff, fff);

        final FilmFlextightReader.ProbeResult probe = new FilmFlextightReader().probe(fff);
        assertThat(probe.getWidth()).isEqualTo(width);
        assertThat(probe.getHeight()).isEqualTo(height);
        assertThat(probe.getBitDepth()).isEqualTo(16);
        assertThat(probe.getBands()).isEqualTo(3);

        final FilmFlextightReader.ReadResult read = new FilmFlextightReader()
                .read(fff.toString(), fffInput());
        assertThat(read.getImage().getWidth()).isEqualTo(width);
        assertThat(read.getImage().getHeight()).isEqualTo(height);
        assertThat(read.getImage().get(0, 0, 0)).isCloseTo(10000f / 65535f, within(1e-6f));
        assertThat(read.getImage().get(299, 599, 2)).isCloseTo(30000f / 65535f, within(1e-6f));
        assertThat(read.getWarning()).contains("未被当作输入定义");
    }

    @Test
    void nonTiffAndEightBitAreRejectedExplicitly(@TempDir final Path temp) throws Exception {
        final Path text = temp.resolve("not-tiff.fff");
        Files.writeString(text, "not a tiff");
        assertThatThrownBy(() -> new FilmFlextightReader().probe(text))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(FilmFlextightReader.CODE_NOT_TIFF));

        final BufferedImage image = new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB);
        final Path tiff = temp.resolve("eight.tif");
        ImageIO.write(image, "tiff", tiff.toFile());
        final Path fff = temp.resolve("eight.fff");
        Files.move(tiff, fff);
        assertThatThrownBy(() -> new FilmFlextightReader().probe(fff))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception ->
                        assertThat(exception.getCode())
                                .isEqualTo(FilmFlextightReader.CODE_MAIN_IMAGE_UNSUPPORTED));
    }

    @Test
    void fullSizeExportKeepsRgb16Dimensions(@TempDir final Path temp) throws Exception {
        final int width = 40;
        final int height = 300;
        final int[] samples = new int[width * height * 3];
        for (int index = 0; index < width * height; index++) {
            samples[index * 3] = 40000;
            samples[index * 3 + 1] = 30000;
            samples[index * 3 + 2] = 20000;
        }
        final Path tiff = FilmTestFixtures.writeLinearTiff(temp, width, height, samples);
        final Path fff = temp.resolve("strip.fff");
        Files.move(tiff, fff);
        final ImageProcessingConfig processing = v2(fff);
        final RenderRecipe recipe = FilmTestFixtures.recipe(fff, processing);
        final FilmExportService exporter = new FilmExportService(
                new FilmProcessingPipeline(new FilmRawDecoder("", mapper), mapper),
                new ImageEncoder(new TestExifTool()), new FilmCompositor(new BorderStyleRenderer(), new TextRenderer(),
                new LogoRenderer(), new GradientPainter()));
        final Path output = temp.resolve("strip-master.tif");

        final ExportSettings export = new ExportSettings(output.toString(), "tiff", 95);
        export.setFilmOutput("tiff16-srgb");
        export.setBorderlessMaster(true);
        final FilmExportService.Result result = exporter.export(recipe, export);

        assertThat(result.getExportResult().getFidelityReport().getOutput().getWidth())
                .isEqualTo(width);
        assertThat(result.getExportResult().getFidelityReport().getOutput().getHeight())
                .isEqualTo(height);
        final BufferedImage decoded = ImageIO.read(output.toFile());
        assertThat(decoded.getWidth()).isEqualTo(width);
        assertThat(decoded.getHeight()).isEqualTo(height);
        assertThat(decoded.getSampleModel().getSampleSize(0)).isEqualTo(16);
    }

    private static final class TestExifTool implements com.camborder.app.service.ExifToolService {
        public boolean isAvailable() { return true; }
        public String version() { return "test"; }
        public Inspection inspect(final Path path) {
            try {
                final BufferedImage image = ImageIO.read(path.toFile());
                final com.camborder.app.dto.FidelityReport.IccFacts icc =
                        new com.camborder.app.dto.FidelityReport.IccFacts();
                icc.setState(ImageMetadataPayload.read(path.toString()).hasIcc() ? "present" : "absent");
                return new Inspection(true, image.getWidth(), image.getHeight(),
                        PixelBufferFactory.bitDepth(image), 1, "icc", icc,
                        new com.camborder.app.dto.FidelityReport.MetadataFacts(), null);
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
        }
        public void rewrite(final Path source, final Path output, final String policy,
                            final byte[] icc, final int width, final int height,
                            final int bitDepth, final String colorSpace) {
            try {
                final BufferedImage image = ImageIO.read(output.toFile());
                Files.delete(output);
                if (bitDepth == 16) new ImageEncoder().writeFilmTiff(image, output.toString(), icc);
                else new ImageEncoder().writeFilmJpeg(image, output.toString(), icc, 95);
            } catch (Exception exception) {
                throw new IllegalStateException(exception);
            }
        }
    }

    private static ImageProcessingConfig.FlextightInput fffInput() {
        final ImageProcessingConfig.FlextightInput input = new ImageProcessingConfig.FlextightInput();
        input.setColorSpace("linear-rec2020");
        return input;
    }

    private static ImageProcessingConfig v2(final Path path) {
        final ImageProcessingConfig config = new ImageProcessingConfig();
        config.setSchemaVersion(ImageProcessingConfig.SCHEMA_VERSION_V2);
        config.setAlgorithmVersion(ImageProcessingConfig.ALGORITHM_VERSION_V2);
        config.setInputSource("flextight-fff");
        config.setFilmPolarity("positive");
        config.setFlextightInput(fffInput());
        final ImageProcessingConfig.PositiveAdjustments positive =
                new ImageProcessingConfig.PositiveAdjustments();
        config.setPositive(positive);
        return config;
    }
}
