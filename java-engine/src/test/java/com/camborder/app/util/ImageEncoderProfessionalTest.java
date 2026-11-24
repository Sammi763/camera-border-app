package com.camborder.app.util;

import com.camborder.app.dto.ExportSettings;
import com.camborder.app.dto.FidelityReport;
import com.camborder.app.exception.RenderOutputConflictException;
import com.camborder.app.service.ExifToolService;
import com.sun.jna.Platform;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 验证专业导出报告使用实际事实，并且 8-bit 源不会被虚报为 16-bit。 */
final class ImageEncoderProfessionalTest {

    @Test
    void standardDeliveryReturnsVerifiedFacts(@TempDir final Path tempDir) throws IOException {
        Path source = writeSource(tempDir.resolve("source.png"));
        Path output = tempDir.resolve("standard.jpg");
        FakeExifTool exifTool = new FakeExifTool(16, 12, 8);
        ExportSettings settings = settings(output, "standard-delivery", "jpeg", "8");

        ImageEncoder.ExportResult result = new ImageEncoder(exifTool).writeToFile(
                ImageIO.read(source.toFile()), output.toString(), settings, source.toString(),
                sourceInfo(source, 8));

        assertThat(result.getFidelityReport()).isNotNull();
        assertThat(result.getFidelityReport().isVerified()).isTrue();
        assertThat(result.getFidelityReport().getOutput().getWidth()).isEqualTo(16);
        assertThat(result.getFidelityReport().getOutput().getHeight()).isEqualTo(12);
        assertThat(result.getFidelityReport().getOutput().getBitDepth()).isEqualTo(8);
        assertThat(result.getFidelityReport().getFeatures().get("bitDepth").getStatus())
                .isEqualTo(ImageEncoder.FeatureStatus.APPLIED);
        assertThat(Files.exists(output)).isTrue();
        assertThat(exifTool.rewriteCount).isEqualTo(1);
    }

    @Test
    void archiveOfEightBitSourceReportsEightBit(@TempDir final Path tempDir) throws IOException {
        Path source = writeSource(tempDir.resolve("source.png"));
        Path output = tempDir.resolve("archive.tif");
        ExportSettings settings = settings(output, "high-fidelity-archive", "tiff", "source");
        FakeExifTool exifTool = new FakeExifTool(16, 12, 8);

        ImageEncoder.ExportResult result = new ImageEncoder(exifTool).writeToFile(
                ImageIO.read(source.toFile()), output.toString(), settings, source.toString(),
                sourceInfo(source, 8));

        assertThat(result.getFidelityReport().getOutput().getBitDepth()).isEqualTo(8);
        assertThat(result.getFidelityReport().getFeatures().get("bitDepth").getStatus())
                .isEqualTo(ImageEncoder.FeatureStatus.APPLIED);
        assertThat(result.getFidelityReport().getFidelityScope()).isEqualTo("full");
    }

    @Test
    void professionalExportFailsClosedWithoutExifTool(@TempDir final Path tempDir) throws IOException {
        Path source = writeSource(tempDir.resolve("source.png"));
        Path output = tempDir.resolve("blocked.jpg");
        ExportSettings settings = settings(output, "standard-delivery", "jpeg", "8");

        assertThatThrownBy(() -> new ImageEncoder(new UnavailableExifTool()).writeToFile(
                ImageIO.read(source.toFile()), output.toString(), settings, source.toString(),
                sourceInfo(source, 8)))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("ExifTool");
        assertThat(Files.exists(output)).isFalse();
    }

    @Test
    void fileCreatedDuringMetadataRewriteIsPreserved(@TempDir final Path tempDir) throws IOException {
        final Path source = writeSource(tempDir.resolve("source.png"));
        final Path output = tempDir.resolve("competing.jpg");
        final FakeExifTool tool = new FakeExifTool(16, 12, 8) {
            @Override
            public void rewrite(final Path input, final Path staging, final String policy,
                                final byte[] icc, final int width, final int height,
                                final int bitDepth, final String colorSpace) {
                super.rewrite(input, staging, policy, icc, width, height, bitDepth, colorSpace);
                try {
                    Files.writeString(output, "外部创建的文件");
                } catch (IOException exception) {
                    throw new AssertionError(exception);
                }
            }
        };
        assertThatThrownBy(() -> new ImageEncoder(tool).writeToFile(
                ImageIO.read(source.toFile()), output.toString(),
                settings(output, "standard-delivery", "jpeg", "8"), source.toString(), sourceInfo(source, 8)))
                .isInstanceOf(RenderOutputConflictException.class);
        assertThat(Files.readString(output)).isEqualTo("外部创建的文件");
        try (java.util.stream.Stream<Path> files = Files.list(tempDir)) {
            assertThat(files).containsExactlyInAnyOrder(source, output);
        }
    }

    @Test
    void nativeExclusiveRenamePreservesExistingDestination(@TempDir final Path tempDir) throws IOException {
        Assumptions.assumeTrue(Platform.isMac() || Platform.isWindows());
        final Path staging = Files.writeString(tempDir.resolve("待发布.tmp"), "编码成品");
        final Path target = Files.writeString(tempDir.resolve("目标.jpg"), "已有文件");

        assertThatThrownBy(() -> OutputPathValidator.renameExclusive(staging, target))
                .isInstanceOf(RenderOutputConflictException.class);
        assertThat(Files.readString(target)).isEqualTo("已有文件");
        assertThat(Files.readString(staging)).isEqualTo("编码成品");

        Files.delete(target);
        OutputPathValidator.renameExclusive(staging, target);
        assertThat(Files.readString(target)).isEqualTo("编码成品");
        assertThat(staging).doesNotExist();
    }

    private static ExportSettings settings(final Path output, final String tier,
                                           final String format, final String bitDepth) {
        ExportSettings settings = new ExportSettings(output.toString(), format, 95);
        settings.setTier(tier);
        settings.setColorProfilePolicy("source");
        settings.setMetadataPolicy("preserve");
        settings.setBitDepthPolicy(bitDepth);
        return settings;
    }

    private static Path writeSource(final Path path) throws IOException {
        BufferedImage image = new BufferedImage(16, 12, BufferedImage.TYPE_INT_RGB);
        ImageIO.write(image, "png", path.toFile());
        return path;
    }

    private static SourceImageInfo sourceInfo(final Path source, final int bitDepth) {
        return new SourceImageInfo("decoded-file", source.toString(), 16, 12, bitDepth,
                "sRGB-assumed", 1, null, new FidelityReport.MetadataFacts());
    }

    private static final class UnavailableExifTool implements ExifToolService {
        @Override public boolean isAvailable() { return false; }
        @Override public String version() { return null; }
        @Override public ExifToolService.Inspection inspect(final Path file) { return invalid(); }
        @Override public void rewrite(final Path source, final Path output, final String metadataPolicy,
                                      final byte[] targetIcc, final int width, final int height,
                                      final int bitDepth, final String colorSpace) { }
    }

    private static class FakeExifTool implements ExifToolService {
        private final int width;
        private final int height;
        private final int bitDepth;
        private int rewriteCount;

        private FakeExifTool(final int width, final int height, final int bitDepth) {
            this.width = width;
            this.height = height;
            this.bitDepth = bitDepth;
        }

        @Override public boolean isAvailable() { return true; }
        @Override public String version() { return "13.59"; }
        @Override public ExifToolService.Inspection inspect(final Path file) {
            FidelityReport.IccFacts icc = new FidelityReport.IccFacts();
            icc.setState("present");
            FidelityReport.MetadataFacts metadata = new FidelityReport.MetadataFacts();
            return new ExifToolService.Inspection(true, width, height, bitDepth, 1, "sRGB", icc, metadata, null);
        }
        @Override public void rewrite(final Path source, final Path output, final String metadataPolicy,
                                      final byte[] targetIcc, final int width, final int height,
                                      final int bitDepth, final String colorSpace) {
            rewriteCount++;
            assertThat(Files.exists(output)).isTrue();
            assertThat(targetIcc).isNotEmpty();
            assertThat(bitDepth).isEqualTo(this.bitDepth);
        }
    }

    private static ExifToolService.Inspection invalid() {
        return new ExifToolService.Inspection(false, 0, 0, 0, 0, null, null, null, "unavailable");
    }
}
