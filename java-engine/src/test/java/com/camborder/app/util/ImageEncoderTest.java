package com.camborder.app.util;

import com.camborder.app.dto.ExportSettings;
import com.camborder.app.service.impl.ExifMetadataServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

/** 验证 EXIF 与 ICC 开关彼此独立，避免只开启一项时误写另一类元数据。 */
final class ImageEncoderTest {

    @Test
    void writesOnlyRequestedExifMetadata(@TempDir final Path tempDir) throws IOException {
        Path source = writeJpegWithMetadata(tempDir.resolve("source.jpg"));
        Path output = tempDir.resolve("metadata-only.jpg");
        ExportSettings settings = exportSettings(output, true, false);

        ImageEncoder.ExportResult result = new ImageEncoder().writeToFile(
                sampleImage(), output.toString(), settings, source.toString());

        assertThat(result.getMetadataPreservation().getStatus())
                .isEqualTo(ImageEncoder.FeatureStatus.APPLIED);
        assertThat(result.getColorProfilePreservation().getStatus())
                .isEqualTo(ImageEncoder.FeatureStatus.NOT_REQUESTED);
        byte[] encoded = Files.readAllBytes(output);
        assertThat(hasJpegSegment(encoded, 0xe1, "Exif\0\0".getBytes(StandardCharsets.US_ASCII))).isTrue();
        assertThat(hasJpegSegment(encoded, 0xe2, "ICC_PROFILE\0".getBytes(StandardCharsets.US_ASCII))).isFalse();
    }

    @Test
    void writesOnlyRequestedIccProfile(@TempDir final Path tempDir) throws IOException {
        Path source = writeJpegWithMetadata(tempDir.resolve("source.jpg"));
        Path output = tempDir.resolve("profile-only.jpg");
        ExportSettings settings = exportSettings(output, false, true);

        ImageEncoder.ExportResult result = new ImageEncoder().writeToFile(
                sampleImage(), output.toString(), settings, source.toString());

        assertThat(result.getMetadataPreservation().getStatus())
                .isEqualTo(ImageEncoder.FeatureStatus.NOT_REQUESTED);
        assertThat(result.getColorProfilePreservation().getStatus())
                .isEqualTo(ImageEncoder.FeatureStatus.APPLIED);
        byte[] encoded = Files.readAllBytes(output);
        assertThat(hasJpegSegment(encoded, 0xe1, "Exif\0\0".getBytes(StandardCharsets.US_ASCII))).isFalse();
        assertThat(hasJpegSegment(encoded, 0xe2, "ICC_PROFILE\0".getBytes(StandardCharsets.US_ASCII))).isTrue();
    }

    @Test
    void writesRealTiffExifAndIccAfterChangingOutputDimensions(@TempDir final Path tempDir)
            throws IOException {
        Path source = realTiffFixture();
        Path output = tempDir.resolve("real-metadata.tif");
        ExportSettings settings = tiffExportSettings(output, true, true);

        ImageEncoder.ExportResult result = new ImageEncoder().writeToFile(
                sampleImage(), output.toString(), settings, source.toString());

        assertThat(result.getMetadataPreservation().getStatus())
                .isEqualTo(ImageEncoder.FeatureStatus.APPLIED);
        assertThat(result.getColorProfilePreservation().getStatus())
                .isEqualTo(ImageEncoder.FeatureStatus.APPLIED);
        assertThat(ImageIO.read(output.toFile()).getWidth()).isEqualTo(16);
        assertThat(ImageIO.read(output.toFile()).getHeight()).isEqualTo(12);

        ImageMetadataPayload outputMetadata = ImageMetadataPayload.read(output.toString());
        assertThat(outputMetadata.hasExif()).isTrue();
        assertThat(outputMetadata.hasIcc()).isTrue();
        var exif = new ExifMetadataServiceImpl().readMetadata(output.toString());
        assertThat(exif.getCameraModel()).contains("Canon", "1Ds Mark II");
        assertThat(exif.getDateTimeOriginal()).isEqualTo("2006:12:05 03:45:51");
    }

    @Test
    void convertsRealJpegExifAndIccIntoTiff(@TempDir final Path tempDir) throws IOException {
        Path source = Path.of("..", "fixtures", "stage4", "real-exif-canon-m03a9518.jpg")
                .toAbsolutePath().normalize();
        Path output = tempDir.resolve("jpeg-source.tif");

        ImageEncoder.ExportResult result = new ImageEncoder().writeToFile(
                sampleImage(), output.toString(), tiffExportSettings(output, true, true),
                source.toString());

        assertThat(result.getMetadataPreservation().getStatus())
                .isEqualTo(ImageEncoder.FeatureStatus.APPLIED);
        assertThat(result.getColorProfilePreservation().getStatus())
                .isEqualTo(ImageEncoder.FeatureStatus.APPLIED);
        ImageMetadataPayload outputMetadata = ImageMetadataPayload.read(output.toString());
        assertThat(outputMetadata.hasExif()).isTrue();
        assertThat(outputMetadata.hasIcc()).isTrue();
        var exif = new ExifMetadataServiceImpl().readMetadata(output.toString());
        assertThat(exif.getCameraModel()).contains("Canon", "5D Mark IV");
        assertThat(exif.getLensModel()).contains("EF24-70mm");
        assertThat(exif.getDateTimeOriginal()).isEqualTo("2017:05:11 15:52:33");
    }

    @Test
    void convertsRealJpegExifIntoPngTiffPayload(@TempDir final Path tempDir) throws IOException {
        Path source = Path.of("..", "fixtures", "stage4", "real-exif-canon-m03a9518.jpg")
                .toAbsolutePath().normalize();
        Path output = tempDir.resolve("jpeg-source.png");

        ImageEncoder.ExportResult result = new ImageEncoder().writeToFile(
                sampleImage(), output.toString(), exportSettings(output, true, true),
                source.toString());

        assertThat(result.getMetadataPreservation().getStatus())
                .isEqualTo(ImageEncoder.FeatureStatus.APPLIED);
        assertThat(result.getColorProfilePreservation().getStatus())
                .isEqualTo(ImageEncoder.FeatureStatus.APPLIED);
        ImageMetadataPayload outputMetadata = ImageMetadataPayload.read(output.toString());
        assertThat(outputMetadata.hasExif()).isTrue();
        assertThat(outputMetadata.hasIcc()).isTrue();
        var exif = new ExifMetadataServiceImpl().readMetadata(output.toString());
        assertThat(exif.getCameraModel()).contains("Canon", "5D Mark IV");
        assertThat(exif.getDateTimeOriginal()).isEqualTo("2017:05:11 15:52:33");
    }

    @Test
    void convertsRealTiffExifAndIccIntoJpeg(@TempDir final Path tempDir) throws IOException {
        Path source = realTiffFixture();
        Path output = tempDir.resolve("tiff-source.jpg");
        ExportSettings settings = exportSettings(output, true, true);

        ImageEncoder.ExportResult result = new ImageEncoder().writeToFile(
                sampleImage(), output.toString(), settings, source.toString());

        assertThat(result.getMetadataPreservation().getStatus())
                .isEqualTo(ImageEncoder.FeatureStatus.APPLIED);
        assertThat(result.getColorProfilePreservation().getStatus())
                .isEqualTo(ImageEncoder.FeatureStatus.APPLIED);
        ImageMetadataPayload outputMetadata = ImageMetadataPayload.read(output.toString());
        assertThat(outputMetadata.hasExif()).isTrue();
        assertThat(outputMetadata.hasIcc()).isTrue();
        var exif = new ExifMetadataServiceImpl().readMetadata(output.toString());
        assertThat(exif.getCameraModel()).contains("Canon", "1Ds Mark II");
        assertThat(exif.getDateTimeOriginal()).isEqualTo("2006:12:05 03:45:51");
    }

    @Test
    void convertsRealTiffExifAndIccIntoPng(@TempDir final Path tempDir) throws IOException {
        Path source = realTiffFixture();
        Path output = tempDir.resolve("tiff-source.png");
        ExportSettings settings = new ExportSettings(output.toString(), "png", 95);
        settings.setPreserveMetadata(true);
        settings.setPreserveColorProfile(true);

        ImageEncoder.ExportResult result = new ImageEncoder().writeToFile(
                sampleImage(), output.toString(), settings, source.toString());

        assertThat(result.getMetadataPreservation().getStatus())
                .isEqualTo(ImageEncoder.FeatureStatus.APPLIED);
        assertThat(result.getColorProfilePreservation().getStatus())
                .isEqualTo(ImageEncoder.FeatureStatus.APPLIED);
        ImageMetadataPayload outputMetadata = ImageMetadataPayload.read(output.toString());
        assertThat(outputMetadata.hasExif()).isTrue();
        assertThat(outputMetadata.hasIcc()).isTrue();
        var exif = new ExifMetadataServiceImpl().readMetadata(output.toString());
        assertThat(exif.getCameraModel()).contains("Canon", "1Ds Mark II");
        assertThat(exif.getDateTimeOriginal()).isEqualTo("2006:12:05 03:45:51");
    }

    @Test
    void keepsRealTiffExifAndIccSwitchesIndependent(@TempDir final Path tempDir) {
        Path source = realTiffFixture();
        ImageEncoder encoder = new ImageEncoder();

        Path exifOnly = tempDir.resolve("exif-only.tif");
        ImageEncoder.ExportResult exifResult = encoder.writeToFile(
                sampleImage(), exifOnly.toString(), tiffExportSettings(exifOnly, true, false),
                source.toString());
        ImageMetadataPayload exifOutput = ImageMetadataPayload.read(exifOnly.toString());
        assertThat(exifResult.getMetadataPreservation().getStatus())
                .isEqualTo(ImageEncoder.FeatureStatus.APPLIED);
        assertThat(exifResult.getColorProfilePreservation().getStatus())
                .isEqualTo(ImageEncoder.FeatureStatus.NOT_REQUESTED);
        assertThat(exifOutput.hasExif()).isTrue();
        assertThat(exifOutput.hasIcc()).isFalse();

        Path iccOnly = tempDir.resolve("icc-only.tif");
        ImageEncoder.ExportResult iccResult = encoder.writeToFile(
                sampleImage(), iccOnly.toString(), tiffExportSettings(iccOnly, false, true),
                source.toString());
        ImageMetadataPayload iccOutput = ImageMetadataPayload.read(iccOnly.toString());
        assertThat(iccResult.getMetadataPreservation().getStatus())
                .isEqualTo(ImageEncoder.FeatureStatus.NOT_REQUESTED);
        assertThat(iccResult.getColorProfilePreservation().getStatus())
                .isEqualTo(ImageEncoder.FeatureStatus.APPLIED);
        assertThat(iccOutput.hasExif()).isFalse();
        assertThat(iccOutput.hasIcc()).isTrue();
    }

    private static ExportSettings exportSettings(final Path output,
                                                 final boolean preserveMetadata,
                                                 final boolean preserveColorProfile) {
        ExportSettings settings = new ExportSettings(output.toString(), "jpeg", 95);
        settings.setPreserveMetadata(preserveMetadata);
        settings.setPreserveColorProfile(preserveColorProfile);
        return settings;
    }

    private static BufferedImage sampleImage() {
        BufferedImage image = new BufferedImage(16, 12, BufferedImage.TYPE_INT_RGB);
        var graphics = image.createGraphics();
        graphics.setColor(Color.WHITE);
        graphics.fillRect(0, 0, image.getWidth(), image.getHeight());
        graphics.dispose();
        return image;
    }

    private static ExportSettings tiffExportSettings(final Path output,
                                                      final boolean preserveMetadata,
                                                      final boolean preserveColorProfile) {
        ExportSettings settings = new ExportSettings(output.toString(), "tiff", 95);
        settings.setPreserveMetadata(preserveMetadata);
        settings.setPreserveColorProfile(preserveColorProfile);
        return settings;
    }

    private static Path realTiffFixture() {
        return Path.of("..", "fixtures", "stage4", "real-exif-canon-farmers-nooning.tif")
                .toAbsolutePath().normalize();
    }

    /** 创建带最小 EXIF/ICC APP 段的 JPEG，测试只关心编码器的块选择。 */
    private static Path writeJpegWithMetadata(final Path path) throws IOException {
        Path base = path.resolveSibling("base.jpg");
        ImageIO.write(sampleImage(), "jpeg", base.toFile());
        byte[] jpeg = Files.readAllBytes(base);
        byte[] exif = concat("Exif\0\0".getBytes(StandardCharsets.US_ASCII), new byte[]{1, 2, 3});
        byte[] icc = concat("ICC_PROFILE\0".getBytes(StandardCharsets.US_ASCII), new byte[]{1, 1, 4, 5, 6});
        ByteArrayOutputStream output = new ByteArrayOutputStream(jpeg.length + exif.length + icc.length + 12);
        output.write(jpeg, 0, 2);
        writeJpegSegment(output, 0xe1, exif);
        writeJpegSegment(output, 0xe2, icc);
        output.write(jpeg, 2, jpeg.length - 2);
        Files.write(path, output.toByteArray());
        return path;
    }

    private static void writeJpegSegment(final ByteArrayOutputStream output,
                                         final int marker, final byte[] payload) {
        int length = payload.length + 2;
        output.write(0xff);
        output.write(marker);
        output.write((length >>> 8) & 0xff);
        output.write(length & 0xff);
        output.write(payload, 0, payload.length);
    }

    private static boolean hasJpegSegment(final byte[] bytes, final int expectedMarker,
                                          final byte[] expectedPrefix) {
        int offset = 2;
        while (offset + 4 <= bytes.length && (bytes[offset] & 0xff) == 0xff) {
            while (offset < bytes.length && (bytes[offset] & 0xff) == 0xff) offset++;
            if (offset >= bytes.length) return false;
            int marker = bytes[offset++] & 0xff;
            if (marker == 0xda || marker == 0xd9) return false;
            if (marker == 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
            if (offset + 2 > bytes.length) return false;
            int length = ((bytes[offset] & 0xff) << 8) | (bytes[offset + 1] & 0xff);
            if (length < 2 || offset + length > bytes.length) return false;
            int payloadStart = offset + 2;
            int payloadLength = length - 2;
            if (marker == expectedMarker && payloadLength >= expectedPrefix.length) {
                boolean matches = true;
                for (int index = 0; index < expectedPrefix.length; index++) {
                    if (bytes[payloadStart + index] != expectedPrefix[index]) {
                        matches = false;
                        break;
                    }
                }
                if (matches) return true;
            }
            offset += length;
        }
        return false;
    }

    private static byte[] concat(final byte[] first, final byte[] second) {
        byte[] result = new byte[first.length + second.length];
        System.arraycopy(first, 0, result, 0, first.length);
        System.arraycopy(second, 0, result, first.length, second.length);
        return result;
    }
}
