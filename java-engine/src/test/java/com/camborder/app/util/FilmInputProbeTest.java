package com.camborder.app.util;

import com.camborder.app.exception.FilmProcessingException;
import com.camborder.app.model.ImageProcessingConfig;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 大数组分配前探测尺寸：TIFF 头信息与 RAW --probe。 */
final class FilmInputProbeTest {

    @Test
    void readsLinearTiffSizeFromHeaderWithoutDecodingPixels(@TempDir final Path tempDir) throws Exception {
        final Path path = FilmTestFixtures.writeLinearTiff(tempDir, 7, 3,
                FilmTestFixtures.constantSamples(21, new int[]{1000, 2000, 3000}));
        final FilmInputProbe probe = new FilmInputProbe(null);

        final FilmInputProbe.Probed probed = probe.probe(path.toString(), linear());

        assertThat(probed.getWidth()).isEqualTo(7);
        assertThat(probed.getHeight()).isEqualTo(3);
        assertThat(probed.getSourceVersion()).startsWith("sha256:");
    }

    @Test
    void unknownOrCorruptSizeFailsExplicitly(@TempDir final Path tempDir) throws Exception {
        final Path corrupt = Files.writeString(tempDir.resolve("broken.tif"), "not a tiff");
        final FilmInputProbe probe = new FilmInputProbe(null);

        assertThatThrownBy(() -> probe.probe(corrupt.toString(), linear()))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY);
                    assertThat(exception.getCode()).isEqualTo(FilmInputProbe.CODE_SIZE_UNKNOWN);
                });
    }

    @Test
    void rawProbeUsesDedicatedProbeModeWithoutPixelOutput(@TempDir final Path tempDir) throws Exception {
        final Path helper = tempDir.resolve("probe-helper");
        Files.writeString(helper, "#!/bin/sh\n"
                + "if [ \"$1\" = \"--probe\" ]; then\n"
                + "  for arg in \"$@\"; do\n"
                + "    if [ \"$arg\" = \"--output\" ] || [ \"$arg\" = \"--metadata\" ]; then echo 'unexpected pixel output' >&2; exit 9; fi\n"
                + "  done\n"
                + "  echo '{\"schemaVersion\":1,\"helperVersion\":\"1.1.0\",\"librawVersion\":\"0.22.3\",\"make\":\"Sony\",\"model\":\"X\",\"software\":\"s\",\"rawWidth\":10,\"rawHeight\":8,\"cropMode\":\"vendor-inset\",\"width\":10,\"height\":8,\"topMargin\":0,\"leftMargin\":0,\"flip\":0,\"exifOrientation\":1,\"sensorBitDepth\":14,\"black\":0,\"maximum\":16383,\"linearMax\":[0,0,0,0],\"whiteBalance\":\"camera\",\"highlight\":\"clip\",\"camMul\":[1,1,1,1],\"preMul\":[1,1,1,1],\"rgbCam\":[[1,0,0,0],[0,1,0,0],[0,0,1,0]],\"camXyz\":[[1,0,0],[0,1,0],[0,0,1],[0,0,0]],\"thumbnailCount\":0,\"thumbWidth\":0,\"thumbHeight\":0}'\n"
                + "  exit 0\n"
                + "fi\n"
                + "exit 9\n");
        assertThat(helper.toFile().setExecutable(true)).isTrue();
        final Path raw = Files.writeString(tempDir.resolve("sample.ARW"), "fake raw");
        final ImageProcessingConfig config = new ImageProcessingConfig();
        config.setInputMode("sensor-raw");
        final FilmInputProbe probe = new FilmInputProbe(new FilmRawDecoder(helper.toString(), new ObjectMapper()));

        final FilmInputProbe.Probed probed = probe.probe(raw.toString(), config);

        assertThat(probed.getWidth()).isEqualTo(10);
        assertThat(probed.getHeight()).isEqualTo(8);
        assertThat(probed.getSourceVersion()).startsWith("sha256:");
    }

    @Test
    void unsupportedInputModeFailsBeforeAllocation(@TempDir final Path tempDir) throws Exception {
        final Path file = Files.writeString(tempDir.resolve("photo.jpg"), "x");
        final ImageProcessingConfig config = new ImageProcessingConfig();
        config.setInputMode("standard");

        assertThatThrownBy(() -> new FilmInputProbe(null).probe(file.toString(), config))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(FilmInputProbe.CODE_SIZE_UNKNOWN));
    }

    private static ImageProcessingConfig linear() {
        final ImageProcessingConfig config = new ImageProcessingConfig();
        config.setInputMode("linear-tiff");
        final ImageProcessingConfig.LinearInput input = new ImageProcessingConfig.LinearInput();
        input.setTransferFunction("linear");
        input.setColorSpace("linear-rec2020");
        input.setBitDepth(16);
        config.setLinearInput(input);
        return config;
    }
}
