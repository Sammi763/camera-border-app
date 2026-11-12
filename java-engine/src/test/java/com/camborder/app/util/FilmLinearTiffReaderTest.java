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

/** T04 受控 16-bit 线性 TIFF 读取：无 ICC 显式声明，不做 sRGB 旧路径规范化。 */
final class FilmLinearTiffReaderTest {

    @Test
    void acceptsMatchingLinearIccWithoutChangingSamples(@TempDir final Path temp) throws Exception {
        final BufferedImage source = FilmOutputProfile.toLinearRec2020(new FloatRgbImage(1,1,new float[]{32001/65535f,32002/65535f,32003/65535f}));
        final Path path = temp.resolve("linear-icc.tif");
        new ImageEncoder().writeFilmTiff(source,path.toString(),FilmOutputProfile.linearRec2020());
        final FloatRgbImage read = new FilmLinearTiffReader().read(path.toString(),FilmTestFixtures.linearProcessing().getLinearInput()).getImage();
        assertThat(read.get(0,0,0)).isCloseTo(32001/65535f,within(1e-6f));
        assertThat(read.get(0,0,1)).isCloseTo(32002/65535f,within(1e-6f));
    }

    @Test
    void readsSixteenBitValuesExactlyWithoutEightBitQuantization(@TempDir final Path tempDir)
            throws Exception {
        final Path tiff = write16BitTiff(tempDir, new int[]{
                0x1001, 0x2002, 0x3003,
                0x4004, 0x5005, 0x6006,
                0x7007, 0x8008, 0x9009
        }, 3, 1);

        final FilmLinearTiffReader.ReadResult result = new FilmLinearTiffReader()
                .read(tiff.toString(), linearInput("linear-rec2020"));

        assertThat(result.getSourceWidth()).isEqualTo(3);
        assertThat(result.getSourceBitDepth()).isEqualTo(16);
        assertThat(result.getImage().get(0, 0, 0)).isCloseTo(0x1001 / 65535f, within(1e-7f));
        assertThat(result.getImage().get(0, 0, 1)).isCloseTo(0x2002 / 65535f, within(1e-7f));
        assertThat(result.getImage().get(2, 0, 2)).isCloseTo(0x9009 / 65535f, within(1e-7f));
    }

    @Test
    void linearSrgbInputIsConvertedToWorkingRec2020(@TempDir final Path tempDir) throws Exception {
        final Path tiff = write16BitTiff(tempDir, new int[]{
                0x4000, 0x2000, 0x6000
        }, 1, 1);
        final FilmLinearTiffReader.ReadResult result = new FilmLinearTiffReader()
                .read(tiff.toString(), linearInput("linear-srgb"));

        final float[] source = {0x4000 / 65535f, 0x2000 / 65535f, 0x6000 / 65535f};
        final float[] expected = new float[3];
        FilmColorSpace.linearSrgbToRec2020(source, expected);

        assertThat(result.getImage().get(0, 0, 0)).isCloseTo(expected[0], within(1e-6f));
        assertThat(result.getImage().get(0, 0, 1)).isCloseTo(expected[1], within(1e-6f));
        assertThat(result.getImage().get(0, 0, 2)).isCloseTo(expected[2], within(1e-6f));
    }

    @Test
    void rejectsEightBitTiff(@TempDir final Path tempDir) throws Exception {
        final Path path = tempDir.resolve("eight-bit.tif");
        ImageIO.write(new BufferedImage(2, 1, BufferedImage.TYPE_INT_RGB), "tiff", path.toFile());

        assertThatThrownBy(() -> new FilmLinearTiffReader().read(path.toString(),
                linearInput("linear-rec2020")))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception -> {
                    assertThat(exception.getCode()).isEqualTo(FilmLinearTiffReader.CODE_INPUT_INVALID);
                    assertThat(exception.getMessage()).contains("16-bit");
                });
    }

    @Test
    void rejectsIccInputExplicitlyInsteadOfGuessingLinear() {
        final Path fixture = Path.of("..", "fixtures", "stage4", "real-exif-canon-farmers-nooning.tif")
                .toAbsolutePath().normalize();

        assertThatThrownBy(() -> new FilmLinearTiffReader().read(fixture.toString(),
                linearInput("linear-rec2020")))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(FilmLinearTiffReader.CODE_ICC_UNSUPPORTED));
    }

    @Test
    void rejectsIccFingerprintWhenFileHasNoIcc(@TempDir final Path tempDir) throws Exception {
        final Path tiff = write16BitTiff(tempDir, new int[]{0x1000, 0x1000, 0x1000}, 1, 1);
        final ImageProcessingConfig.LinearInput input = linearInput("linear-rec2020");
        input.setIccSha256("a".repeat(64));

        assertThatThrownBy(() -> new FilmLinearTiffReader().read(tiff.toString(), input))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(FilmLinearTiffReader.CODE_INPUT_INVALID));
    }

    @Test
    void rejectsCameraRgbTestInputWithoutMatrix(@TempDir final Path tempDir) throws Exception {
        final Path tiff = write16BitTiff(tempDir, new int[]{0x1000, 0x1000, 0x1000}, 1, 1);

        assertThatThrownBy(() -> new FilmLinearTiffReader().read(tiff.toString(),
                linearInput("linear-camera-rgb")))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception ->
                        assertThat(exception.getCode())
                                .isEqualTo(FilmLinearTiffReader.CODE_COLOR_SPACE_UNSUPPORTED));
    }

    @Test
    void factsSeparateSourceWorkingAndOutput(@TempDir final Path tempDir) throws Exception {
        final Path tiff = write16BitTiff(tempDir, new int[]{0x1000, 0x1000, 0x1000}, 1, 1);
        final FilmProcessingFacts facts = new FilmLinearTiffReader()
                .read(tiff.toString(), linearInput("linear-rec2020")).toFacts();

        assertThat(facts.getSourceBitDepth()).isEqualTo(16);
        assertThat(facts.getWorkingDataType()).isEqualTo("float32");
        assertThat(facts.getWorkingColorSpace()).isEqualTo("linear-rec2020");
        assertThat(facts.getOutputBitDepth()).isNull();
        facts.withOutput(16, "srgb");
        assertThat(facts.getOutputBitDepth()).isEqualTo(16);
    }

    @Test
    void fullProcessingOutputsRealSixteenBitReferenceTiff(@TempDir final Path tempDir) throws Exception {
        final int width = 16;
        final int[] samples = new int[width * 3];
        for (int x = 0; x < width; x++) {
            final int value = x * 4096 + (x % 16) * 17;
            samples[x * 3] = value;
            samples[x * 3 + 1] = value;
            samples[x * 3 + 2] = value;
        }
        final Path inputPath = write16BitTiff(tempDir, samples, width, 1);
        final FilmLinearTiffReader.ReadResult read = new FilmLinearTiffReader()
                .read(inputPath.toString(), linearInput("linear-rec2020"));
        final FloatRgbImage processed = FloatImageOps.resize(read.getImage(), 8, 1);
        final BufferedImage output = FloatImageOps.toBufferedImage16(processed);
        final Path outputPath = tempDir.resolve("reference-output.tif");
        new ImageEncoder().writeToFile(output, outputPath.toString(),
                new ExportSettings(outputPath.toString(), "tiff", 95));

        final BufferedImage readBack = ImageIO.read(outputPath.toFile());
        assertThat(readBack.getRaster().getDataBuffer().getDataType())
                .isEqualTo(java.awt.image.DataBuffer.TYPE_USHORT);
        int previous = -1;
        int nonEightBitMultiples = 0;
        for (int x = 0; x < readBack.getWidth(); x++) {
            final int value = readBack.getRaster().getSample(x, 0, 0);
            assertThat(value).isGreaterThan(previous);
            previous = value;
            if (value % 257 != 0) nonEightBitMultiples++;
        }
        assertThat(nonEightBitMultiples).isGreaterThan(0);
    }

    @Test
    void oversizedDimensionsAreRejectedBeforeDecode() {
        assertThatThrownBy(() -> FilmLinearTiffReader.validatePixelCount(20_000, 20_000))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(FilmLinearTiffReader.CODE_TOO_LARGE));
    }

    private static ImageProcessingConfig.LinearInput linearInput(final String colorSpace) {
        final ImageProcessingConfig.LinearInput input = new ImageProcessingConfig.LinearInput();
        input.setTransferFunction("linear");
        input.setColorSpace(colorSpace);
        input.setBitDepth(16);
        return input;
    }

    private static Path write16BitTiff(final Path directory, final int[] samples,
                                       final int width, final int height) throws Exception {
        final BufferedImage image = PixelBufferFactory.create(width, height, 16, false,
                ColorSpace.getInstance(ColorSpace.CS_sRGB));
        int index = 0;
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                for (int channel = 0; channel < 3; channel++) {
                    image.getRaster().setSample(x, y, channel, samples[index++]);
                }
            }
        }
        final Path path = directory.resolve("linear-input.tif");
        new ImageEncoder().writeToFile(image, path.toString(),
                new ExportSettings(path.toString(), "tiff", 95));
        assertThat(Files.isRegularFile(path)).isTrue();
        return path;
    }
}
