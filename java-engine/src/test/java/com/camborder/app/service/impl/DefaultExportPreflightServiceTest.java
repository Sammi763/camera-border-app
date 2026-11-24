package com.camborder.app.service.impl;

import com.camborder.app.dto.CapabilitiesResponse;
import com.camborder.app.dto.ExportPreflightResponse;
import com.camborder.app.dto.ExportSettings;
import com.camborder.app.dto.FidelityReport;
import com.camborder.app.dto.RenderJobRequest;
import com.camborder.app.dto.RenderJobSnapshot;
import com.camborder.app.controller.ExportPreflightController;
import com.camborder.app.exception.ApiException;
import com.camborder.app.exception.GlobalExceptionHandler;
import com.camborder.app.model.ImagePlacement;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.service.CapabilitiesService;
import com.camborder.app.service.ExifToolService;
import com.camborder.app.util.ImageEncoder;
import com.camborder.app.util.ImageReader;
import com.camborder.app.util.RawDecoder;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 覆盖阶段五预检的成功、固定档位失败和批次冲突路径。 */
final class DefaultExportPreflightServiceTest {

    @Test
    void v2PreflightUsesInputSourceInsteadOfNullLegacyMode(@TempDir final Path temp) throws Exception {
        final Path source = writeImage(temp.resolve("scan.png"), 32, 24);
        final com.camborder.app.model.ImageProcessingConfig processing = new com.camborder.app.model.ImageProcessingConfig();
        processing.setSchemaVersion(2); processing.setAlgorithmVersion("film-color-v2");
        processing.setInputSource("encoded-raster"); processing.setFilmPolarity("positive");
        final com.camborder.app.model.ImageProcessingConfig.EncodedInput input = new com.camborder.app.model.ImageProcessingConfig.EncodedInput();
        input.setColorSpace("srgb"); input.setBitDepth(8); processing.setEncodedInput(input);
        final RenderRecipe recipe = new RenderRecipe(source.toString(), null, null, null, false);
        recipe.setImageProcessing(processing);
        final ExportSettings settings = standard(temp.resolve("result.jpg"));
        settings.setTier("custom"); settings.setFilmOutput("srgb-jpeg");
        final CapabilitiesResponse caps = capabilities(true).snapshot();
        final CapabilitiesResponse.FilmDigitizationCapability film = new CapabilitiesResponse.FilmDigitizationCapability();
        film.setAvailable(true); film.setInputModes(List.of("sensor-raw", "linear-tiff"));
        film.setInputSources(List.of("encoded-raster")); film.setOutputs(Map.of("srgb-jpeg", true));
        caps.setFilmDigitization(film);
        final DefaultExportPreflightService service = new DefaultExportPreflightService(new ImageReader(new RawDecoder()), () -> caps);
        final ExportPreflightResponse result = service.preflight(new RenderJobRequest(recipe, settings));
        assertThat(result.getStatus()).isEqualTo("ready");
        assertThat(result.getItems().get(0).getReport().getPixelSource()).isEqualTo("encoded-raster");
        film.setInputSources(List.of("camera-raw"));
        assertThat(service.preflight(new RenderJobRequest(recipe, settings)).getStatus()).isEqualTo("blocked");
    }

    @Test
    void returnsReadyWithActualSourceFacts(@TempDir final Path tempDir) throws IOException {
        Path source = writeImage(tempDir.resolve("source.png"), 32, 24);
        Path output = tempDir.resolve("output.jpg");
        DefaultExportPreflightService service = new DefaultExportPreflightService(
                new ImageReader(new RawDecoder()), capabilities(true));

        ExportPreflightResponse response = service.preflight(
                new RenderJobRequest(new RenderRecipe(source.toString(), null, null, null, false),
                        standard(output)));

        assertThat(response.getStatus()).isEqualTo("ready");
        assertThat(response.getItems()).singleElement().satisfies(item -> {
            assertThat(item.getStatus()).isEqualTo("ready");
            assertThat(item.getReport().getPhase()).isEqualTo("preflight");
            assertThat(item.getReport().getSource().getWidth()).isEqualTo(32);
            assertThat(item.getReport().getSource().getHeight()).isEqualTo(24);
            assertThat(item.getReport().getSource().getBitDepth()).isEqualTo(8);
            assertThat(item.getReport().getSource().getColorSpace()).isEqualTo("sRGB-assumed");
        });
    }

    @Test
    void blocksFixedTierWhenCapabilityIsUnavailable(@TempDir final Path tempDir) throws IOException {
        Path source = writeImage(tempDir.resolve("source.png"), 32, 24);
        DefaultExportPreflightService service = new DefaultExportPreflightService(
                new ImageReader(new RawDecoder()), capabilities(false));

        ExportPreflightResponse response = service.preflight(
                new RenderJobRequest(new RenderRecipe(source.toString(), null, null, null, false),
                        standard(tempDir.resolve("output.jpg"))));

        assertThat(response.getStatus()).isEqualTo("blocked");
        assertThat(response.getItems()).singleElement().satisfies(item -> {
            assertThat(item.getStatus()).isEqualTo("blocked");
            assertThat(item.getBlockingReasons()).anyMatch(reason -> reason.contains("ExifTool"));
        });
    }

    @Test
    void rejectsInvalidPolicyBeforeReadingSource(@TempDir final Path tempDir) {
        ExportSettings settings = standard(tempDir.resolve("output.jpg"));
        settings.setMetadataPolicy("not-a-policy");
        DefaultExportPreflightService service = new DefaultExportPreflightService(
                new ImageReader(new RawDecoder()), capabilities(true));

        assertThatThrownBy(() -> service.preflight(new RenderJobRequest(
                new RenderRecipe(tempDir.resolve("missing.png").toString(), null, null, null, false), settings)))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("metadataPolicy is invalid");
    }

    @Test
    void marksBatchOutputCollisionBlocked(@TempDir final Path tempDir) throws IOException {
        Path source = writeImage(tempDir.resolve("source.png"), 32, 24);
        ExportSettings first = standard(tempDir.resolve("same.jpg"));
        ExportSettings second = standard(tempDir.resolve("same.jpg"));
        RenderJobSnapshot firstSnapshot = new RenderJobSnapshot(
                new RenderRecipe(source.toString(), null, null, null, false), first);
        RenderJobSnapshot secondSnapshot = new RenderJobSnapshot(
                new RenderRecipe(source.toString(), null, null, null, false), second);
        DefaultExportPreflightService service = new DefaultExportPreflightService(
                new ImageReader(new RawDecoder()), capabilities(true));

        ExportPreflightResponse response = service.preflight(new RenderJobRequest(
                List.of(firstSnapshot, secondSnapshot)));

        assertThat(response.getStatus()).isEqualTo("blocked");
        assertThat(response.getItems().get(0).getStatus()).isEqualTo("ready");
        assertThat(response.getItems().get(1).getStatus()).isEqualTo("blocked");
        assertThat(response.getItems().get(1).getBlockingReasons())
                .anyMatch(reason -> reason.contains("批次内其他项冲突"));
    }

    @Test
    void marksMissingAndUnreadableSourcesWithoutBlockingOtherItems(@TempDir final Path tempDir) throws IOException {
        final Path missing = tempDir.resolve("moved.png");
        final Path directory = Files.createDirectory(tempDir.resolve("directory.png"));
        final Path corrupt = Files.writeString(tempDir.resolve("corrupt.png"), "非图像数据");
        final Path valid = writeImage(tempDir.resolve("valid.png"), 32, 24);
        final var service = new DefaultExportPreflightService(new ImageReader(new RawDecoder()), capabilities(true));
        final var snapshots = List.of(missing, directory, corrupt, valid).stream().map(path -> new RenderJobSnapshot(
                new RenderRecipe(path.toString(), null, null, null, false),
                standard(tempDir.resolve(path.getFileName() + ".jpg")))).collect(java.util.stream.Collectors.toList());

        final var response = service.preflight(new RenderJobRequest(snapshots));

        assertThat(response.getStatus()).isEqualTo("blocked");
        assertThat(response.getItems()).extracting(ExportPreflightResponse.Item::getIndex).containsExactly(0, 1, 2, 3);
        assertThat(response.getItems()).extracting(ExportPreflightResponse.Item::getStatus)
                .containsExactly("blocked", "blocked", "blocked", "ready");
        assertThat(response.getItems().get(0).getBlockingReasons()).containsExactly("源照片缺失，请在队列中重新定位文件");
        assertThat(response.getItems().get(1).getBlockingReasons()).containsExactly("源照片不可读，请在队列中检查文件");
        assertThat(response.getItems().get(2).getBlockingReasons()).containsExactly("源图读取失败");
        assertThat(response.getItems().get(0).getReport().getOutput()).isNull();
        assertThat(response.getItems().get(3).getReport().getOutput().getWidth()).isEqualTo(32);
        assertThat(Files.exists(tempDir.resolve("valid.png.jpg"))).isFalse();
    }

    @Test
    void invalidRequestsStillReturnBadRequest() throws Exception {
        final var service = new DefaultExportPreflightService(new ImageReader(new RawDecoder()), capabilities(true));
        final var mvc = MockMvcBuilders.standaloneSetup(new ExportPreflightController(service))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        final String base = "{\"items\":[{\"recipe\":{\"imagePath\":\"missing.png\"},"
                + "\"export\":{\"format\":\"%s\",\"outputPath\":\"output.jpg\",\"tier\":\"custom\",\"maxWidth\":%d}}]}";
        for (String body : List.of("", "{}", "{\"items\":[{}]}",
                String.format(base, "unknown", 0), String.format(base, "jpeg", -1))) {
            mvc.perform(post("/api/export-preflight").contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest());
        }
    }

    @Test
    void squareCropAt2048MatchesVerifiedOutputFile(@TempDir final Path tempDir) throws IOException {
        final Path source = tempDir.resolve("wide.jpg");
        assertThat(ImageIO.write(new BufferedImage(6000, 3000, BufferedImage.TYPE_3BYTE_BGR),
                "jpeg", source.toFile())).isTrue();
        final var reader = new ImageReader(new RawDecoder());
        final var service = new DefaultExportPreflightService(reader, capabilities(true));
        final var metadataTool = mock(ExifToolService.class);
        final var icc = new FidelityReport.IccFacts();
        icc.setState("present");
        when(metadataTool.isAvailable()).thenReturn(true);
        when(metadataTool.inspect(any())).thenReturn(new ExifToolService.Inspection(true, 2048, 2048,
                8, 1, "sRGB", icc, new FidelityReport.MetadataFacts(), null));
        final var renderer = renderer(reader, new ImageEncoder(metadataTool));
        final var recipe = new RenderRecipe(source.toString(), null, null, null, false);
        recipe.setImagePlacement(new ImagePlacement("fill", 0.75, 0.5, 0, 1.0));
        final Path output = tempDir.resolve("square.png");
        final var export = new ExportSettings(output.toString(), "png", 92);
        export.setTier("quick-share");
        export.setMaxWidth(2048);
        export.setMaxHeight(2048);
        export.setColorProfilePolicy("srgb");
        export.setMetadataPolicy("remove-location");
        export.setBitDepthPolicy("8");

        final var response = service.preflight(new RenderJobRequest(recipe, export));
        assertThat(response.getStatus()).isEqualTo("ready");
        final var facts = response.getItems().get(0).getReport().getOutput();
        assertThat(facts.getWidth()).isEqualTo(2048);
        assertThat(facts.getHeight()).isEqualTo(2048);
        final var rendered = renderer.composeForExport(recipe, export.getMaxWidth(), export.getMaxHeight());
        renderer.writeToFile(rendered.getImage(), export, recipe.getImagePath(), rendered.getSourceInfo());
        final BufferedImage encoded = ImageIO.read(output.toFile());
        assertThat(encoded.getWidth()).isEqualTo(facts.getWidth());
        assertThat(encoded.getHeight()).isEqualTo(facts.getHeight());
    }

    @Test
    void shortEdgeLayoutPreflightMatchesRenderedCanvas(@TempDir final Path tempDir) throws IOException {
        final var reader = new ImageReader(new RawDecoder());
        final var preflight = new DefaultExportPreflightService(reader, capabilities(true));
        final var renderer = renderer(reader, new ImageEncoder());
        for (int[] size : List.of(new int[]{600, 400}, new int[]{200, 300})) {
            final Path source = writeImage(tempDir.resolve("source-" + size[0] + ".png"), size[0], size[1]);
            final RenderRecipe recipe = new RenderRecipe(source.toString(),
                    new com.camborder.app.model.BorderConfig(80, 80, 80, 80, "#ffffff"), null, null, false);
            recipe.setLayoutScale("photo-short-edge");
            final ExportSettings export = standard(tempDir.resolve("result.jpg"));
            export.setMaxWidth(450);
            export.setMaxHeight(450);
            export.setTier("custom");
            final var expected = preflight.preflight(new RenderJobRequest(recipe, export))
                    .getItems().get(0).getReport().getOutput();
            final BufferedImage rendered = renderer.composeForExport(recipe, export.getMaxWidth(), export.getMaxHeight()).getImage();
            assertThat(rendered.getWidth()).isEqualTo(expected.getWidth());
            assertThat(rendered.getHeight()).isEqualTo(expected.getHeight());
            final int shortEdge = Math.min(450, Math.min(size[0], size[1]) * 450 / Math.max(size[0], size[1]));
            final int fittedShortEdge = Math.min(shortEdge, Math.min(size[0], size[1]));
            assertThat(Math.min(rendered.getWidth(), rendered.getHeight())).isEqualTo(
                    fittedShortEdge + 2 * (int) Math.round(fittedShortEdge * 0.08));
        }
    }

    private static Java2DImageRenderService renderer(final ImageReader reader, final ImageEncoder encoder) {
        return new Java2DImageRenderService(reader, new com.camborder.app.util.ImageScaler(),
                new com.camborder.app.util.BorderComposer(new com.camborder.app.util.GradientPainter()),
                new com.camborder.app.util.BorderStyleRenderer(), new com.camborder.app.util.TextRenderer(),
                encoder, new com.camborder.app.util.LogoRenderer());
    }

    @Test
    void rejectsUnknownLayoutScale(@TempDir final Path tempDir) throws IOException {
        final Path source = writeImage(tempDir.resolve("source.png"), 32, 24);
        final RenderRecipe recipe = new RenderRecipe(source.toString(), null, null, null, false);
        recipe.setLayoutScale("unknown");
        final var service = new DefaultExportPreflightService(new ImageReader(new RawDecoder()), capabilities(true));
        assertThatThrownBy(() -> service.preflight(new RenderJobRequest(recipe, standard(tempDir.resolve("output.jpg")))))
                .isInstanceOf(ApiException.class).hasMessageContaining("layoutScale is invalid");
    }

    private static ExportSettings standard(final Path output) {
        ExportSettings settings = new ExportSettings(output.toString(), "jpeg", 95);
        settings.setTier("standard-delivery");
        settings.setColorProfilePolicy("source");
        settings.setMetadataPolicy("preserve");
        settings.setBitDepthPolicy("8");
        return settings;
    }

    private static CapabilitiesService capabilities(final boolean available) {
        return () -> {
            CapabilitiesResponse response = new CapabilitiesResponse();
            response.setTiers(Map.of(
                    "quick-share", new CapabilitiesResponse.TierCapability(available, "jpeg", null),
                    "standard-delivery", new CapabilitiesResponse.TierCapability(available, "jpeg", available ? null : "ExifTool 不可用"),
                    "high-fidelity-archive", new CapabilitiesResponse.TierCapability(available, "tiff", null),
                    "custom", new CapabilitiesResponse.TierCapability(available, "jpeg", null)));
            CapabilitiesResponse.FormatCapability format = new CapabilitiesResponse.FormatCapability();
            format.setAvailable(available);
            format.setBitDepths(new int[]{8, 16});
            response.setOutput(Map.of("jpeg", format, "png", format, "tiff", format));
            return response;
        };
    }

    private static Path writeImage(final Path path, final int width, final int height) throws IOException {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        ImageIO.write(image, "png", path.toFile());
        return path;
    }
}
