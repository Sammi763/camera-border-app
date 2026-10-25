package com.camborder.app.util;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** EXIF 1–8 的像素方向回归；真实 ARW 在本地样片存在时补充验证。 */
final class ImageOrientationTest {

    @TempDir
    Path tempDir;

    @Test
    void appliesAllExifOrientationsWithoutChangingPixelValues() {
        final BufferedImage source = new BufferedImage(3, 2, BufferedImage.TYPE_INT_RGB);
        final int[][] sourcePixels = {
                {0x110000, 0x220000, 0x330000},
                {0x440000, 0x550000, 0x660000}
        };
        for (int y = 0; y < sourcePixels.length; y++) {
            for (int x = 0; x < sourcePixels[y].length; x++) {
                source.setRGB(x, y, sourcePixels[y][x]);
            }
        }

        final int[][][] expected = {
                {{0x110000, 0x220000, 0x330000}, {0x440000, 0x550000, 0x660000}},
                {{0x330000, 0x220000, 0x110000}, {0x660000, 0x550000, 0x440000}},
                {{0x660000, 0x550000, 0x440000}, {0x330000, 0x220000, 0x110000}},
                {{0x440000, 0x550000, 0x660000}, {0x110000, 0x220000, 0x330000}},
                {{0x110000, 0x440000}, {0x220000, 0x550000}, {0x330000, 0x660000}},
                {{0x440000, 0x110000}, {0x550000, 0x220000}, {0x660000, 0x330000}},
                {{0x660000, 0x330000}, {0x550000, 0x220000}, {0x440000, 0x110000}},
                {{0x330000, 0x660000}, {0x220000, 0x550000}, {0x110000, 0x440000}}
        };

        for (int orientation = 1; orientation <= 8; orientation++) {
            final BufferedImage actual = ImageOrientation.apply(source, orientation);
            assertThat(actual.getWidth()).isEqualTo(expected[orientation - 1][0].length);
            assertThat(actual.getHeight()).isEqualTo(expected[orientation - 1].length);
            for (int y = 0; y < actual.getHeight(); y++) {
                for (int x = 0; x < actual.getWidth(); x++) {
                    assertThat(actual.getRGB(x, y))
                            .as("Orientation=%d (%d,%d)", orientation, x, y)
                            .isEqualTo(0xff000000 | expected[orientation - 1][y][x]);
                }
            }
        }
    }

    @Test
    void keepsRasterDataTypeAndTreatsInvalidOrientationAsNormal() {
        final BufferedImage source = new BufferedImage(4, 3, BufferedImage.TYPE_USHORT_GRAY);
        source.getRaster().setSample(1, 2, 0, 60000);

        final BufferedImage normal = ImageOrientation.apply(source, 0);
        assertThat(normal).isSameAs(source);
        final BufferedImage rotated = ImageOrientation.apply(source, 8);
        assertThat(rotated.getWidth()).isEqualTo(3);
        assertThat(rotated.getHeight()).isEqualTo(4);
        assertThat(rotated.getSampleModel().getDataType()).isEqualTo(source.getSampleModel().getDataType());
        assertThat(PixelBufferFactory.bitDepth(rotated)).isEqualTo(PixelBufferFactory.bitDepth(source));
        assertThat(rotated.getRaster().getSample(2, 2, 0)).isEqualTo(60000);
    }

    @Test
    void normalizesOrientationInExifPayloadAfterPixelsArePhysicallyRotated() {
        final byte[] payload = exifOrientation(8);
        final byte[] normalized = ImageOrientation.normalizeExifPayload(payload);

        assertThat(normalized).isNotSameAs(payload);
        assertThat(normalized[24] & 0xff).isEqualTo(1);
        assertThat(normalized[25] & 0xff).isEqualTo(0);
        // 其余 payload 仍保持一致，避免元数据搬运顺手丢字段。
        assertThat(normalized.length).isEqualTo(payload.length);
        for (int index = 0; index < normalized.length; index++) {
            if (index != 24 && index != 25) {
                assertThat(normalized[index]).as("payload byte %d", index).isEqualTo(payload[index]);
            }
        }
    }

    @Test
    void readsOrientationAtDecodeBoundaryAndDoesNotApplyItTwice() throws Exception {
        final Path source = tempDir.resolve("orientation-8.jpg");
        final BufferedImage image = new BufferedImage(3, 2, BufferedImage.TYPE_INT_RGB);
        image.setRGB(0, 0, 0x110000);
        image.setRGB(1, 0, 0x220000);
        image.setRGB(2, 0, 0x330000);
        image.setRGB(0, 1, 0x440000);
        image.setRGB(1, 1, 0x550000);
        image.setRGB(2, 1, 0x660000);
        final ByteArrayOutputStream encoded = new ByteArrayOutputStream();
        assertThat(ImageIO.write(image, "jpeg", encoded)).isTrue();
        Files.write(source, insertAfterJpegSignature(encoded.toByteArray(), exifOrientation(8)));

        assertThat(ImageOrientation.read(source)).isEqualTo(8);
        final ImageReader.ReadResult result = new ImageReader(new RawDecoder())
                .readWithSource(source.toString());
        assertThat(result.getImage().getWidth()).isEqualTo(2);
        assertThat(result.getImage().getHeight()).isEqualTo(3);
        assertThat(result.getSourceDecode().getOrientation()).isEqualTo(8);
        assertThat(result.getSourceDecode().isOrientationApplied()).isTrue();
        assertThat(result.getSourceDecode().getDecodedWidth()).isEqualTo(3);
        assertThat(result.getSourceDecode().getDecodedHeight()).isEqualTo(2);
        assertThat(result.getSourceDecode().getOrientedWidth()).isEqualTo(2);
        assertThat(result.getSourceDecode().getOrientedHeight()).isEqualTo(3);
        assertThat(result.getSourceDecode().getFullWidth()).isEqualTo(2);
        assertThat(result.getSourceDecode().getFullHeight()).isEqualTo(3);
        // 再次应用同一方向会把图转回横向；渲染读取结果只能已经是一次有向图。
        assertThat(ImageOrientation.apply(result.getImage(), 1)).isSameAs(result.getImage());
    }

    @Test
    void readsAllSixRealArwAsPortraitWhenLocalStageSamplesAreAvailable() {
        final Path photos = Path.of("..", "photos").toAbsolutePath().normalize();
        final List<String> names = Arrays.asList(
                "DSC04875.ARW", "DSC04876.ARW", "DSC04877.ARW",
                "DSC04881.ARW", "DSC04882.ARW", "DSC04883.ARW");
        org.junit.jupiter.api.Assumptions.assumeTrue(
                Files.isRegularFile(photos.resolve(names.get(0))),
                "本地阶段 1 ARW 样片未提供，跳过真实样片回归");

        final ImageReader reader = new ImageReader(new RawDecoder());
        for (String name : names) {
            final ImageReader.ReadResult result = reader.readWithSource(
                    photos.resolve(name).toString(), 1280, 1280);
            assertThat(result.getSourceDecode().getOrientation()).as(name).isEqualTo(8);
            assertThat(result.getSourceDecode().isOrientationApplied()).as(name).isTrue();
            assertThat(result.getImage().getHeight()).as(name).isGreaterThan(result.getImage().getWidth());
            assertThat(result.getSourceDecode().getOrientedWidth()).as(name)
                    .isEqualTo(result.getImage().getWidth());
            assertThat(result.getSourceDecode().getOrientedHeight()).as(name)
                    .isEqualTo(result.getImage().getHeight());
            assertThat(result.getSourceDecode().getFullWidth()).as(name).isEqualTo(4672);
            assertThat(result.getSourceDecode().getFullHeight()).as(name).isEqualTo(7008);
        }
    }

    @Test
    void readsCheckedInSyntheticTwoByThreePortraitFixture() {
        final Path fixture = Path.of("..", "fixtures", "stage1", "synthetic-portrait-2x3.png")
                .toAbsolutePath().normalize();
        org.junit.jupiter.api.Assumptions.assumeTrue(
                Files.isRegularFile(fixture), "阶段 1 合成竖图夹具未提供，跳过辅助回归");

        final ImageReader.ReadResult result = new ImageReader(new RawDecoder())
                .readWithSource(fixture.toString());

        assertThat(result.getImage().getWidth()).isEqualTo(2);
        assertThat(result.getImage().getHeight()).isEqualTo(3);
        assertThat(result.getSourceDecode().getOrientation()).isEqualTo(1);
        assertThat(result.getSourceDecode().isOrientationApplied()).isTrue();
        assertThat(result.getSourceInfo().getOrientedWidth()).isEqualTo(2);
        assertThat(result.getSourceInfo().getOrientedHeight()).isEqualTo(3);
    }

    private static byte[] insertAfterJpegSignature(final byte[] jpeg, final byte[] exifPayload) {
        final byte[] result = new byte[jpeg.length + 4 + exifPayload.length];
        result[0] = jpeg[0];
        result[1] = jpeg[1];
        result[2] = (byte) 0xff;
        result[3] = (byte) 0xe1;
        final int segmentLength = exifPayload.length + 2;
        result[4] = (byte) (segmentLength >>> 8);
        result[5] = (byte) segmentLength;
        System.arraycopy(exifPayload, 0, result, 6, exifPayload.length);
        System.arraycopy(jpeg, 2, result, 6 + exifPayload.length, jpeg.length - 2);
        return result;
    }

    private static byte[] exifOrientation(final int orientation) {
        final byte[] tiff = {
                'I', 'I', 42, 0, 8, 0, 0, 0,
                1, 0,
                0x12, 0x01, 3, 0, 1, 0, 0, 0,
                (byte) orientation, 0, 0, 0,
                0, 0, 0, 0
        };
        final byte[] prefix = "Exif\0\0".getBytes(StandardCharsets.US_ASCII);
        final byte[] result = new byte[prefix.length + tiff.length];
        System.arraycopy(prefix, 0, result, 0, prefix.length);
        System.arraycopy(tiff, 0, result, prefix.length, tiff.length);
        return result;
    }
}
