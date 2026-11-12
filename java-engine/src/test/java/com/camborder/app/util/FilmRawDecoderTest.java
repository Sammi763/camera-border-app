package com.camborder.app.util;

import com.camborder.app.exception.FilmRawException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpStatus;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * T03 进程协议测试：用可控 shell 替身在 Linux CI 验证 helper 调用，
 * 真实 LibRaw 解码由 FilmRawDecoderNativeTest 单独执行。
 */
final class FilmRawDecoderTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void decodesValidHelperOutputAndReportsFacts(@TempDir final Path tempDir) throws Exception {
        final Path helper = writeHelper(tempDir, successScript());
        final Path raw = writeRaw(tempDir, "sample.ARW");
        final FilmRawDecoder decoder = new FilmRawDecoder(helper.toString(), MAPPER);

        final FilmRawDecoder.DecodedRaw decoded = decoder.decode(raw.toString());

        assertThat(decoded.getWidth()).isEqualTo(2);
        assertThat(decoded.getHeight()).isEqualTo(1);
        assertThat(decoded.sample(0, 0, 0)).isEqualTo(0x1001);
        assertThat(decoded.sample(0, 0, 1)).isEqualTo(0x2002);
        assertThat(decoded.sample(0, 0, 2)).isEqualTo(0x3003);
        assertThat(decoded.sample(1, 0, 0)).isEqualTo(0x4004);
        assertThat(decoded.getFacts().getExifOrientation()).isEqualTo(1);
        assertThat(decoded.getFacts().getSensorBitDepth()).isEqualTo(14);
        assertThat(decoded.getFacts().getSourceSha256()).hasSize(64);
        assertThat(decoded.getFacts().getSourceVersion()).contains("sha256:").contains("size:");
    }

    @Test
    void acceptsSpacesAndChinesePath(@TempDir final Path tempDir) throws Exception {
        final Path helper = writeHelper(tempDir, successScript());
        final Path folder = Files.createDirectories(tempDir.resolve("底片 样片"));
        final Path raw = writeRaw(folder, "测试 负片.ARW");

        final FilmRawDecoder.DecodedRaw decoded = new FilmRawDecoder(helper.toString(), MAPPER)
                .decode(raw.toString());

        assertThat(decoded.getWidth()).isEqualTo(2);
        assertThat(decoded.getFacts().getRawWidth()).isEqualTo(7168);
    }

    @Test
    void missingHelperIsUnavailable(@TempDir final Path tempDir) throws Exception {
        final Path raw = writeRaw(tempDir, "sample.ARW");
        final FilmRawDecoder decoder = new FilmRawDecoder(
                tempDir.resolve("missing-helper").toString(), MAPPER);

        assertThatThrownBy(() -> decoder.decode(raw.toString()))
                .isInstanceOfSatisfying(FilmRawException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                    assertThat(exception.getCode()).isEqualTo(FilmRawDecoder.CODE_HELPER_UNAVAILABLE);
                });
    }

    @Test
    void rejectsNonRawInputBeforeStartingHelper(@TempDir final Path tempDir) throws Exception {
        final Path helper = writeHelper(tempDir, successScript());
        final Path image = Files.writeString(tempDir.resolve("photo.jpg"), "not raw");

        assertThatThrownBy(() -> new FilmRawDecoder(helper.toString(), MAPPER).decode(image.toString()))
                .isInstanceOfSatisfying(FilmRawException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(FilmRawDecoder.CODE_INPUT_INVALID));
    }

    @Test
    void timeoutDestroysHelperAndCleansTempDirectory(@TempDir final Path tempDir) throws Exception {
        final Path helper = writeHelper(tempDir, "#!/bin/sh\nexec sleep 10\n");
        final Path raw = writeRaw(tempDir, "sample.ARW");
        final Set<String> before = tempDirectories();
        final FilmRawDecoder.DecodeOptions options = new FilmRawDecoder.DecodeOptions();
        options.setTimeoutSeconds(1);

        assertThatThrownBy(() -> new FilmRawDecoder(helper.toString(), MAPPER).decode(raw.toString(), options))
                .isInstanceOfSatisfying(FilmRawException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.GATEWAY_TIMEOUT);
                    assertThat(exception.getCode()).isEqualTo(FilmRawDecoder.CODE_TIMEOUT);
                });
        assertThat(tempDirectories()).isEqualTo(before);
    }

    @Test
    void nonZeroExitIsReportedWithoutStackOrUnboundedLog(@TempDir final Path tempDir) throws Exception {
        final Path helper = writeHelper(tempDir,
                "#!/bin/sh\necho 'bad raw' >&2\nexit 9\n");
        final Path raw = writeRaw(tempDir, "sample.ARW");

        assertThatThrownBy(() -> new FilmRawDecoder(helper.toString(), MAPPER).decode(raw.toString()))
                .isInstanceOfSatisfying(FilmRawException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
                    assertThat(exception.getCode()).isEqualTo(FilmRawDecoder.CODE_FAILED);
                    assertThat(exception.getMessage()).contains("exit=9").contains("bad raw");
                });
    }

    @Test
    void invalidMagicIsRejected(@TempDir final Path tempDir) throws Exception {
        final Path helper = writeHelper(tempDir,
                "#!/bin/sh\nprintf 'bad' > \"$4\"\nprintf '{}' > \"$6\"\n");
        final Path raw = writeRaw(tempDir, "sample.ARW");

        assertThatThrownBy(() -> new FilmRawDecoder(helper.toString(), MAPPER).decode(raw.toString()))
                .isInstanceOfSatisfying(FilmRawException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.BAD_GATEWAY);
                    assertThat(exception.getCode()).isEqualTo(FilmRawDecoder.CODE_OUTPUT_INVALID);
                });
    }

    @Test
    void pixelLimitIsEnforced(@TempDir final Path tempDir) throws Exception {
        final Path helper = writeHelper(tempDir, successScript());
        final Path raw = writeRaw(tempDir, "sample.ARW");
        final FilmRawDecoder.DecodeOptions options = new FilmRawDecoder.DecodeOptions();
        options.setMaxPixels(1);

        assertThatThrownBy(() -> new FilmRawDecoder(helper.toString(), MAPPER).decode(raw.toString(), options))
                .isInstanceOfSatisfying(FilmRawException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(FilmRawDecoder.CODE_PIXEL_LIMIT));
    }

    @Test
    void sourceChangeDuringDecodeIsRejected(@TempDir final Path tempDir) throws Exception {
        final Path helper = writeHelper(tempDir, successScript() + "\nprintf 'x' >> \"$INPUT\"\n");
        final Path raw = writeRaw(tempDir, "sample.ARW");

        assertThatThrownBy(() -> new FilmRawDecoder(helper.toString(), MAPPER).decode(raw.toString()))
                .isInstanceOfSatisfying(FilmRawException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(exception.getCode()).isEqualTo(FilmRawDecoder.CODE_SOURCE_CHANGED);
                });
    }

    @Test
    void interruptingDecodeIsCancellationAndCleansUp(@TempDir final Path tempDir) throws Exception {
        final Path helper = writeHelper(tempDir, "#!/bin/sh\nexec sleep 10\n");
        final Path raw = writeRaw(tempDir, "sample.ARW");
        final Set<String> before = tempDirectories();
        final AtomicReference<Throwable> failure = new AtomicReference<>();

        final Thread worker = new Thread(() -> {
            try {
                new FilmRawDecoder(helper.toString(), MAPPER).decode(raw.toString());
            } catch (Throwable throwable) {
                failure.set(throwable);
            }
        });
        worker.start();
        Thread.sleep(250);
        worker.interrupt();
        worker.join(3000);

        assertThat(failure.get()).isInstanceOfSatisfying(FilmRawException.class, exception -> {
            assertThat(exception.getStatus()).isEqualTo(HttpStatus.REQUEST_TIMEOUT);
            assertThat(exception.getCode()).isEqualTo(FilmRawDecoder.CODE_CANCELLED);
        });
        assertThat(tempDirectories()).isEqualTo(before);
    }

    private static Set<String> tempDirectories() throws Exception {
        final Path temp = Path.of(System.getProperty("java.io.tmpdir"));
        try (Stream<Path> paths = Files.list(temp)) {
            return paths.filter(path -> path.getFileName().toString().startsWith("camborder-film-raw-"))
                    .map(path -> path.getFileName().toString())
                    .collect(Collectors.toSet());
        }
    }

    private static Path writeRaw(final Path directory, final String fileName) throws Exception {
        return Files.writeString(directory.resolve(fileName), "fake raw bytes");
    }

    private static Path writeHelper(final Path directory, final String script) throws Exception {
        final Path helper = directory.resolve("fake-film-raw-helper");
        Files.writeString(helper, script);
        assertThat(helper.toFile().setExecutable(true)).isTrue();
        return helper;
    }

    private static String successScript() {
        return "#!/bin/sh\n"
                + "if [ \"$1\" = \"--version\" ]; then echo 'film-raw-helper 1.0.0 libraw 0.22.3-Release'; exit 0; fi\n"
                + "while [ $# -gt 0 ]; do\n"
                + "  case \"$1\" in\n"
                + "    --input) INPUT=\"$2\"; shift 2;;\n"
                + "    --output) OUTPUT=\"$2\"; shift 2;;\n"
                + "    --metadata) META=\"$2\"; shift 2;;\n"
                + "    *) shift;;\n"
                + "  esac\n"
                + "done\n"
                + "[ -n \"$OUTPUT\" ] || exit 2\n"
                + "[ -n \"$META\" ] || exit 2\n"
                + "printf '\\106\\122\\127\\061\\002\\000\\000\\000\\001\\000\\000\\000\\003\\000\\020\\000\\001\\000\\000\\000\\016\\000\\000\\000\\014\\000\\000\\000\\001\\020\\002\\040\\003\\060\\004\\100\\005\\120\\006\\140' > \"$OUTPUT\"\n"
                + "cat > \"$META\" <<'JSON'\n"
                + "{\"schemaVersion\":1,\"helperVersion\":\"1.0.0\",\"librawVersion\":\"0.22.3-Release\","
                + "\"make\":\"Sony\",\"model\":\"ILCE-7M5\",\"software\":\"test\","
                + "\"rawWidth\":7168,\"rawHeight\":5120,\"cropMode\":\"vendor-inset\","
                + "\"width\":2,\"height\":1,\"topMargin\":8,\"leftMargin\":12,"
                + "\"flip\":5,\"exifOrientation\":1,\"sensorBitDepth\":14,"
                + "\"black\":512,\"maximum\":16383,\"linearMax\":[15360,15360,15360,15360],"
                + "\"whiteBalance\":\"camera\",\"highlight\":\"clip\","
                + "\"camMul\":[2310,1024,1699,1024],\"preMul\":[2.5,0.9,1.1,1],"
                + "\"rgbCam\":[[2,0,0,0],[0,1,0,0],[0,0,1,0]],"
                + "\"camXyz\":[[1,0,0],[0,1,0],[0,0,1],[0,0,0]],"
                + "\"thumbnailCount\":0,\"thumbWidth\":0,\"thumbHeight\":0}\n"
                + "JSON\n";
    }
}
