package com.camborder.app.util;

import com.camborder.app.exception.FilmRawException;
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

/**
 * T03 真实 LibRaw 集成检查：只在 macOS arm64 + 本机 ARW 样片 + 已构建 helper 时运行。
 * Linux CI 上没有这些资源时整体跳过，不能用替身结果代替真实解码证据。
 */
final class FilmRawDecoderNativeTest {

    private static final Path HELPER = Path.of("..", "professional-tools", "libraw",
            "macos-arm64", "film-raw-helper").toAbsolutePath().normalize();
    private static final Path SAMPLE = Path.of("..", "photos", "DSC04875.ARW")
            .toAbsolutePath().normalize();

    @Test
    void decodesSonyArwIntoLinearSixteenBitCameraRgb() {
        Assumptions.assumeTrue(isMacArm64(), "仅 macOS arm64 运行真实解码");
        Assumptions.assumeTrue(Files.isRegularFile(HELPER), "helper 未构建");
        Assumptions.assumeTrue(Files.isRegularFile(SAMPLE), "本机 ARW 样片缺失");

        final FilmRawDecoder decoder = new FilmRawDecoder(HELPER.toString(), new ObjectMapper());
        final FilmRawDecoder.DecodedRaw decoded = decoder.decode(SAMPLE.toString());

        assertThat(decoded.getWidth()).isEqualTo(7008);
        assertThat(decoded.getHeight()).isEqualTo(4672);
        final FilmRawDecoder.RawFacts facts = decoded.getFacts();
        assertThat(facts.getMake()).isEqualTo("Sony");
        assertThat(facts.getModel()).isEqualTo("ILCE-7M5");
        assertThat(facts.getRawWidth()).isEqualTo(7168);
        assertThat(facts.getRawHeight()).isEqualTo(5120);
        assertThat(facts.getFlip()).isEqualTo(5);
        assertThat(facts.getExifOrientation()).isEqualTo(8);
        assertThat(facts.getSensorBitDepth()).isEqualTo(14);
        assertThat(facts.getBlack()).isEqualTo(512);
        assertThat(facts.getMaximum()).isEqualTo(16383);
        assertThat(facts.getSourceSha256()).hasSize(64);
        // 传感器线性值是正片数据，不能用内嵌 JPEG 的 8-bit 尺寸/位深冒充。
        assertThat(decoded.sample(0, 0, 0)).isBetween(0, 65535);
        assertThat(facts.getRgbCam()[0][0]).isGreaterThan(0);
    }

    @Test
    void probeReportsRawDimensionsAndSourceFactsWithoutPixelDecode() {
        Assumptions.assumeTrue(isMacArm64(), "仅 macOS arm64 运行真实探测");
        Assumptions.assumeTrue(Files.isRegularFile(HELPER), "helper 未构建");
        Assumptions.assumeTrue(Files.isRegularFile(SAMPLE), "本机 ARW 样片缺失");

        final FilmRawDecoder.ProbeResult probed = new FilmRawDecoder(HELPER.toString(), new ObjectMapper())
                .probe(SAMPLE.toString());

        assertThat(probed.getWidth()).isEqualTo(7168);
        assertThat(probed.getHeight()).isEqualTo(5120);
        assertThat(probed.getFacts().getMake()).isEqualTo("Sony");
        assertThat(probed.getSourceVersion()).startsWith("sha256:").contains("size:");
    }

    @Test
    void corruptRawFailsWithoutFallingBackToEmbeddedJpeg(@TempDir final Path tempDir)
            throws Exception {
        Assumptions.assumeTrue(isMacArm64(), "仅 macOS arm64 运行真实解码");
        Assumptions.assumeTrue(Files.isRegularFile(HELPER), "helper 未构建");
        final Path corrupt = tempDir.resolve("broken.ARW");
        Files.write(corrupt, new byte[]{0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00});

        final FilmRawDecoder decoder = new FilmRawDecoder(HELPER.toString(), new ObjectMapper());

        assertThatThrownBy(() -> decoder.decode(corrupt.toString()))
                .isInstanceOfSatisfying(FilmRawException.class, exception ->
                        assertThat(exception.getMessage()).doesNotContain("embedded"));
    }

    @Test
    void convertsRealRawToFloatWorkingImageAndWritesSixteenBitReference(@TempDir final Path tempDir)
            throws Exception {
        Assumptions.assumeTrue(isMacArm64(), "仅 macOS arm64 运行真实解码");
        Assumptions.assumeTrue(Files.isRegularFile(HELPER), "helper 未构建");
        Assumptions.assumeTrue(Files.isRegularFile(SAMPLE), "本机 ARW 样片缺失");

        final FilmRawDecoder.DecodedRaw raw = new FilmRawDecoder(HELPER.toString(), new ObjectMapper())
                .decode(SAMPLE.toString());
        final FloatRgbImage working = FloatImageOps.fromCameraRgb(
                raw.getRgb(), raw.getWidth(), raw.getHeight(), raw.getFacts().getRgbCam());
        assertThat(working.getWidth()).isEqualTo(7008);
        assertThat(working.getHeight()).isEqualTo(4672);
        assertThat(working.hasNonFinite()).isFalse();
        final float[] range = working.channelRange();
        assertThat(range[3]).isGreaterThan(0);
        assertThat(range[0]).isLessThanOrEqualTo(range[3]);

        final FilmProcessingFacts facts = new FilmProcessingFacts(
                SAMPLE.toString(), raw.getWidth(), raw.getHeight(),
                raw.getFacts().getSensorBitDepth(), "camera-rgb",
                working.getWidth(), working.getHeight());
        assertThat(facts.getWorkingDataType()).isEqualTo("float32");
        assertThat(facts.getWorkingColorSpace()).isEqualTo("linear-rec2020");

        final BufferedImage output = FloatImageOps.toBufferedImage16(working);
        final Path reference = tempDir.resolve("raw-working-reference.tif");
        new com.camborder.app.util.ImageEncoder().writeToFile(output, reference.toString(),
                new com.camborder.app.dto.ExportSettings(reference.toString(), "tiff", 95));
        final BufferedImage readBack = ImageIO.read(reference.toFile());
        assertThat(readBack.getRaster().getDataBuffer().getDataType())
                .isEqualTo(java.awt.image.DataBuffer.TYPE_USHORT);
        assertThat(readBack.getWidth()).isEqualTo(7008);
        assertThat(readBack.getHeight()).isEqualTo(4672);
    }

    @Test
    void pipelineReportsOrientationAndUnknownSensorClipping(@TempDir final Path tempDir)
            throws Exception {
        Assumptions.assumeTrue(isMacArm64(), "仅 macOS arm64 运行真实解码");
        Assumptions.assumeTrue(Files.isRegularFile(HELPER), "helper 未构建");
        Assumptions.assumeTrue(Files.isRegularFile(SAMPLE), "本机 ARW 样片缺失");

        final com.camborder.app.model.ImageProcessingConfig processing =
                new com.camborder.app.model.ImageProcessingConfig();
        processing.setInputMode("sensor-raw");
        processing.setRaw(new com.camborder.app.model.ImageProcessingConfig.RawOptions());
        final com.camborder.app.model.RenderRecipe recipe = new com.camborder.app.model.RenderRecipe(
                SAMPLE.toString(), null, null, null, false);
        recipe.setImageProcessing(processing);
        final com.camborder.app.service.impl.FilmProcessingPipeline pipeline =
                new com.camborder.app.service.impl.FilmProcessingPipeline(
                        new FilmRawDecoder(HELPER.toString(), new ObjectMapper()), new ObjectMapper());

        final com.camborder.app.service.impl.FilmProcessingPipeline.Processed processed =
                pipeline.process(recipe, "raw-linear");

        assertThat(processed.getImage().getWidth()).isEqualTo(4672);
        assertThat(processed.getImage().getHeight()).isEqualTo(7008);
        assertThat(processed.getSourceDecode().getOrientedWidth()).isEqualTo(4672);
        assertThat(processed.getSensorClipping().isAvailable()).isFalse();
        assertThat(processed.getSensorClipping().getNote()).contains("传感器域原始剪裁统计");
        assertThat(processed.getSensorClipping().getLow()).hasSize(3);
        assertThat(processed.getSensorClipping().getHigh()).hasSize(3);
        assertThat(processed.getWorkingClipping().isAvailable()).isTrue();
        assertThat(processed.getSourceVersion()).contains("sha256:");
    }

    private static boolean isMacArm64() {
        final String os = System.getProperty("os.name", "").toLowerCase();
        final String arch = System.getProperty("os.arch", "").toLowerCase();
        return os.contains("mac") && (arch.contains("aarch64") || arch.contains("arm64"));
    }
}
