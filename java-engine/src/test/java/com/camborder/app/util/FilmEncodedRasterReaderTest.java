package com.camborder.app.util;

import com.camborder.app.dto.ExportSettings;
import com.camborder.app.exception.FilmProcessingException;
import com.camborder.app.model.ImageProcessingConfig;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import javax.imageio.ImageIO;
import java.awt.color.ColorSpace;
import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

/** v2 已编码栅格：8/16-bit、灰阶、透明度、缺失 ICC 与损坏文件。 */
final class FilmEncodedRasterReaderTest {

    @Test
    void transparentPngIsCompositedOverExplicitWhite(@TempDir final Path temp) throws Exception {
        final BufferedImage image = new BufferedImage(2, 1, BufferedImage.TYPE_INT_ARGB);
        image.setRGB(0, 0, 0x00FF0000);
        image.setRGB(1, 0, 0xFFFF0000);
        final Path path = temp.resolve("alpha.png");
        assertThat(ImageIO.write(image, "png", path.toFile())).isTrue();

        final FilmEncodedRasterReader.ReadResult result = new FilmEncodedRasterReader()
                .read(path.toString(), encoded("srgb", 8));

        assertThat(result.getImage().getWidth()).isEqualTo(2);
        assertThat(result.getImage().get(0, 0, 0)).isCloseTo(1f, within(1e-6f));
        assertThat(result.getImage().get(0, 0, 1)).isCloseTo(1f, within(1e-6f));
        assertThat(result.getImage().get(0, 0, 2)).isCloseTo(1f, within(1e-6f));
        assertThat(result.getImage().get(1, 0, 0)).isGreaterThan(0.5f);
        assertThat(result.getWarning()).contains("透明输入");
    }

    @Test
    void sixteenBitTiffKeepsLowBitSamples(@TempDir final Path temp) throws Exception {
        final BufferedImage image = PixelBufferFactory.create(1, 1, 16, false,
                ColorSpace.getInstance(ColorSpace.CS_sRGB));
        for (int channel = 0; channel < 3; channel++) {
            image.getRaster().setSample(0, 0, channel, 4097);
        }
        final Path path = temp.resolve("sixteen.tif");
        new ImageEncoder().writeToFile(image, path.toString(),
                new ExportSettings(path.toString(), "tiff", 95));

        final FileHeaderProbe header = probe(path);
        assertThat(header.bitDepth).isEqualTo(16);
        final FilmEncodedRasterReader.ReadResult result = new FilmEncodedRasterReader()
                .read(path.toString(), encoded("linear-srgb", 16));
        final double expected = 4097d / 65535d;
        assertThat(result.getImage().get(0, 0, 0)).isCloseTo((float) expected, within(1e-6f));
        assertThat(result.getImage().get(0, 0, 1)).isCloseTo((float) expected, within(1e-6f));
        assertThat(result.getImage().get(0, 0, 2)).isCloseTo((float) expected, within(1e-6f));
    }

    @Test
    void grayscalePngIsExpandedToRgb(@TempDir final Path temp) throws Exception {
        final BufferedImage image = new BufferedImage(1, 1, BufferedImage.TYPE_BYTE_GRAY);
        image.getRaster().setSample(0, 0, 0, 128);
        final Path path = temp.resolve("gray.png");
        ImageIO.write(image, "png", path.toFile());

        final FilmEncodedRasterReader.ReadResult result = new FilmEncodedRasterReader()
                .read(path.toString(), encoded("srgb", 8));
        assertThat(result.getImage().get(0, 0, 0))
                .isCloseTo(result.getImage().get(0, 0, 1), within(1e-7f));
        assertThat(result.getImage().get(0, 0, 1))
                .isCloseTo(result.getImage().get(0, 0, 2), within(1e-7f));
    }

    @Test
    void declaredBitDepthAndEmbeddedIccMustMatch(@TempDir final Path temp) throws Exception {
        final BufferedImage image = new BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB);
        final Path path = temp.resolve("eight.png");
        ImageIO.write(image, "png", path.toFile());

        assertThatThrownBy(() -> new FilmEncodedRasterReader()
                .read(path.toString(), encoded("srgb", 16)))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception ->
                        assertThat(exception.getCode())
                                .isEqualTo(FilmEncodedRasterReader.CODE_BIT_DEPTH_MISMATCH));
        final ImageProcessingConfig.EncodedInput embedded = encoded("embedded", 8);
        embedded.setIccSha256("0000000000000000000000000000000000000000000000000000000000000000");
        assertThatThrownBy(() -> new FilmEncodedRasterReader()
                .read(path.toString(), embedded))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception ->
                        assertThat(exception.getCode())
                                .isEqualTo(FilmEncodedRasterReader.CODE_ICC_MISSING));
    }

    @Test
    void corruptAndUnsupportedFilesFailWithoutGuessing(@TempDir final Path temp) throws Exception {
        final Path broken = temp.resolve("broken.png");
        Files.writeString(broken, "not an image");
        assertThatThrownBy(() -> new FilmEncodedRasterReader().probe(broken))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception ->
                        assertThat(exception.getCode())
                                .isEqualTo(FilmEncodedRasterReader.CODE_INPUT_UNSUPPORTED));
    }

    @Test
    void palettePngUsesColorsAndAlphaInsteadOfIndices(@TempDir final Path temp) throws Exception {
        final java.awt.image.IndexColorModel palette = new java.awt.image.IndexColorModel(8, 2,
                new byte[]{(byte) 255, 0}, new byte[]{0, 0}, new byte[]{0, (byte) 255},
                new byte[]{(byte) 255, 0});
        final BufferedImage image = new BufferedImage(2, 1, BufferedImage.TYPE_BYTE_INDEXED, palette);
        image.getRaster().setSample(0, 0, 0, 0);
        image.getRaster().setSample(1, 0, 0, 1);
        final Path path = temp.resolve("palette.png");
        ImageIO.write(image, "png", path.toFile());
        final FloatRgbImage result = new FilmEncodedRasterReader().read(path.toString(), encoded("srgb", 8)).getImage();
        final float[] expected = new float[3];
        FilmColorSpace.linearSrgbToRec2020(new float[]{1, 0, 0}, expected);
        for (int c = 0; c < 3; c++) {
            assertThat(result.get(0, 0, c)).isCloseTo(expected[c], within(2e-3f));
            assertThat(result.get(1, 0, c)).isCloseTo(1f, within(2e-6f));
        }
    }

    @Test
    void jpegEmbeddedProfileIsAppliedExactlyOnce(@TempDir final Path temp) throws Exception {
        final BufferedImage image = new BufferedImage(16, 16, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < 16; y++) for (int x = 0; x < 16; x++) image.setRGB(x, y, 0x808080);
        final Path path = temp.resolve("linear-profile.jpg");
        final byte[] profile = java.awt.color.ICC_Profile.getInstance(ColorSpace.CS_LINEAR_RGB).getData();
        new ImageEncoder().writeFilmJpeg(image, path.toString(), profile, 100);
        final FilmEncodedRasterReader reader = new FilmEncodedRasterReader();
        final ImageProcessingConfig.EncodedInput input = encoded("embedded", 8);
        input.setIccSha256(reader.probe(path).getIccSha256());
        final FloatRgbImage output = reader.read(path.toString(), input).getImage();
        assertThat(output.get(8, 8, 0)).isCloseTo(128f / 255, within(0.005f));
    }

    private static ImageProcessingConfig.EncodedInput encoded(final String colorSpace,
                                                              final int bitDepth) {
        final ImageProcessingConfig.EncodedInput input = new ImageProcessingConfig.EncodedInput();
        input.setColorSpace(colorSpace);
        input.setBitDepth(bitDepth);
        return input;
    }

    private static FileHeaderProbe probe(final Path path) {
        final FilmEncodedRasterReader.ProbeResult probe =
                new FilmEncodedRasterReader().probe(path);
        return new FileHeaderProbe(probe.getBitDepth());
    }

    private static final class FileHeaderProbe {
        private final int bitDepth;
        private FileHeaderProbe(final int bitDepth) { this.bitDepth = bitDepth; }
    }
}
