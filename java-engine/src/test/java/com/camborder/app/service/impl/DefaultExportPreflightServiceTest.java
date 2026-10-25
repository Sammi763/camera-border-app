package com.camborder.app.service.impl;

import com.camborder.app.dto.CapabilitiesResponse;
import com.camborder.app.dto.ExportPreflightResponse;
import com.camborder.app.dto.ExportSettings;
import com.camborder.app.dto.RenderJobRequest;
import com.camborder.app.dto.RenderJobSnapshot;
import com.camborder.app.exception.ApiException;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.service.CapabilitiesService;
import com.camborder.app.util.ImageReader;
import com.camborder.app.util.RawDecoder;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 覆盖阶段五预检的成功、固定档位失败和批次冲突路径。 */
final class DefaultExportPreflightServiceTest {

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
