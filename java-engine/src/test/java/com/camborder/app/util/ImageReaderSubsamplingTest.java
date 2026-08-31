package com.camborder.app.util;

import com.camborder.app.service.RawDevelopService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

/** 预览读取必须在 ImageIO 解码阶段使用 subsampling，导出则保持原始尺寸。 */
final class ImageReaderSubsamplingTest {

    @TempDir
    Path tempDir;

    @Test
    void constrainedPreviewDecodesSubsampledImageButUnconstrainedReadKeepsSourceSize() throws Exception {
        final Path imagePath = tempDir.resolve("large.jpg");
        final BufferedImage source = new BufferedImage(1600, 1200, BufferedImage.TYPE_INT_RGB);
        final Graphics2D graphics = source.createGraphics();
        graphics.setColor(new Color(48, 120, 192));
        graphics.fillRect(0, 0, source.getWidth(), source.getHeight());
        graphics.dispose();
        assertThat(ImageIO.write(source, "jpg", imagePath.toFile())).isTrue();

        final ImageReader reader = new ImageReader(new RawDecoder(), unavailableRawDevelopService());

        final ImageReader.ReadResult preview = reader.readWithSource(imagePath.toString(), 400, 400);
        assertThat(preview.getImage().getWidth()).isEqualTo(400);
        assertThat(preview.getImage().getHeight()).isEqualTo(300);
        assertThat(preview.getImage().getWidth()).isLessThan(source.getWidth());

        final ImageReader.ReadResult export = reader.readWithSource(imagePath.toString());
        assertThat(export.getImage().getWidth()).isEqualTo(source.getWidth());
        assertThat(export.getImage().getHeight()).isEqualTo(source.getHeight());
    }

    @Test
    void sizingKeepsEnoughPixelsForPortraitPreview() {
        // 100x6000 在 1280 方盒里最终约为 21x1280；采样 4 不会把窄边采样到 21 以下。
        assertThat(ImageDecodeSizing.subsamplingFor(100, 6000, 1280, 1280)).isEqualTo(4);
        assertThat(ImageDecodeSizing.subsamplingFor(1600, 1200, 0, 0)).isEqualTo(1);
    }

    @Test
    void embeddedRawJpegAlsoUsesPreviewSubsampling() throws Exception {
        final BufferedImage embedded = new BufferedImage(800, 600, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < embedded.getHeight(); y++) {
            for (int x = 0; x < embedded.getWidth(); x++) {
                final int red = (x * 31 + y * 17) & 0xff;
                final int green = (x * 11 + y * 47) & 0xff;
                final int blue = (x * 53 + y * 7) & 0xff;
                embedded.setRGB(x, y, (red << 16) | (green << 8) | blue);
            }
        }
        final ByteArrayOutputStream jpeg = new ByteArrayOutputStream();
        assertThat(ImageIO.write(embedded, "jpg", jpeg)).isTrue();
        assertThat(jpeg.size()).isGreaterThan(10 * 1024);
        final Path rawPath = tempDir.resolve("preview.nef");
        Files.write(rawPath, concat("RAW-CONTAINER".getBytes(), jpeg.toByteArray()));

        final BufferedImage preview = new RawDecoder().decode(rawPath.toString(), 200, 200);

        assertThat(preview.getWidth()).isEqualTo(200);
        assertThat(preview.getHeight()).isEqualTo(150);
    }

    private byte[] concat(final byte[] left, final byte[] right) {
        final byte[] result = new byte[left.length + right.length];
        System.arraycopy(left, 0, result, 0, left.length);
        System.arraycopy(right, 0, result, left.length, right.length);
        return result;
    }

    private RawDevelopService unavailableRawDevelopService() {
        return new RawDevelopService() {
            @Override
            public boolean isConfigured() {
                return false;
            }

            @Override
            public BufferedImage develop(final String rawPath) {
                throw new AssertionError("标准图片读取不得调用 RAW 显影服务");
            }
        };
    }
}
