package com.camborder.app.service.impl;

import com.camborder.app.exception.RenderExportException;
import com.camborder.app.service.ExifToolService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 验证 ExifTool 输出解析、非零退出和超时失败不会被伪装成成功。 */
final class ControlledExifToolServiceTest {

    @Test
    void parsesGroupedExifToolFactsAndTreatsWarningsAsNonFatal(@TempDir final Path tempDir) throws IOException {
        Path executable = executable(tempDir.resolve("exiftool"));
        List<List<String>> commands = new ArrayList<>();
        String json = "[{"
                + "\"File:ImageWidth\":640,\"File:ImageHeight\":480,\"File:BitDepth\":8,"
                + "\"ExifIFD:Orientation\":\"Horizontal (normal)\","
                + "\"ExifIFD:ColorSpace\":\"sRGB\","
                + "\"ExifIFD:DateTimeOriginal\":\"2024:01:02 03:04:05\","
                + "\"XMP-x:CreatorTool\":\"Camera\",\"IPTC:Caption-Abstract\":\"Caption\","
                + "\"GPS:GPSLatitude\":\"1 deg\",\"IFD0:XResolution\":300,"
                + "\"IFD1:ThumbnailOffset\":123,"
                + "\"ICC-header:ColorSpaceData\":\"RGB \","
                + "\"ICC_Profile:ProfileDescription\":\"sRGB IEC61966-2.1\","
                + "\"ExifTool:Warning\":\"minor validation warning\""
                + "}]";
        ControlledExifToolService service = new ControlledExifToolService(
                executable.toString(), 1000, new ObjectMapper(), (command, timeout, maxOutput) -> {
                    commands.add(command);
                    return command.contains("-ver")
                            ? new ControlledExifToolService.ProcessResult(0, "13.59\n", "")
                            : new ControlledExifToolService.ProcessResult(0, json, "");
                });

        ExifToolService.Inspection inspection = service.inspect(tempDir.resolve("input.jpg"));

        assertThat(inspection.isValid()).isTrue();
        assertThat(inspection.getWidth()).isEqualTo(640);
        assertThat(inspection.getHeight()).isEqualTo(480);
        assertThat(inspection.getBitDepth()).isEqualTo(8);
        assertThat(inspection.getOrientation()).isEqualTo(1);
        assertThat(inspection.getColorSpace()).isEqualTo("sRGB");
        assertThat(inspection.getIcc().getState()).isEqualTo("present");
        assertThat(inspection.getMetadata().isExif()).isTrue();
        assertThat(inspection.getMetadata().isXmp()).isTrue();
        assertThat(inspection.getMetadata().isIptc()).isTrue();
        assertThat(inspection.getMetadata().isGps()).isTrue();
        assertThat(inspection.getMetadata().isDpi()).isTrue();
        assertThat(inspection.getMetadata().isThumbnail()).isTrue();
        assertThat(commands).hasSize(2);
    }

    @Test
    void rejectsNonZeroInspectionOutput(@TempDir final Path tempDir) throws IOException {
        Path executable = executable(tempDir.resolve("exiftool"));
        ControlledExifToolService service = new ControlledExifToolService(
                executable.toString(), 1000, new ObjectMapper(), (command, timeout, maxOutput) ->
                command.contains("-ver")
                        ? new ControlledExifToolService.ProcessResult(0, "13.59\n", "")
                        : new ControlledExifToolService.ProcessResult(2, "[]", "failed"));

        ExifToolService.Inspection inspection = service.inspect(tempDir.resolve("input.jpg"));

        assertThat(inspection.isValid()).isFalse();
        assertThat(inspection.getError()).contains("读取失败");
    }

    @Test
    void cleansTemporaryIccAfterExternalTimeout(@TempDir final Path tempDir) throws IOException {
        Path executable = executable(tempDir.resolve("exiftool"));
        Path source = Files.writeString(tempDir.resolve("source.jpg"), "source");
        Path output = tempDir.resolve("output.jpg");
        ControlledExifToolService service = new ControlledExifToolService(
                executable.toString(), 100, new ObjectMapper(), (command, timeout, maxOutput) -> {
                    if (command.contains("-ver")) {
                        return new ControlledExifToolService.ProcessResult(0, "13.59\n", "");
                    }
                    throw new RenderExportException("ExifTool 执行超时");
                });

        assertThatThrownBy(() -> service.rewrite(source, output, "preserve",
                new byte[]{1, 2, 3}, 10, 10, 8, "sRGB"))
                .isInstanceOf(RenderExportException.class)
                .hasMessageContaining("超时");
        try (var files = Files.list(tempDir)) {
            assertThat(files.noneMatch(path -> path.getFileName().toString().startsWith(".camborder-icc-")))
                    .isTrue();
        }
        assertThat(Files.exists(output)).isFalse();
    }

    private static Path executable(final Path path) throws IOException {
        Files.writeString(path, "placeholder");
        assertThat(path.toFile().setExecutable(true)).isTrue();
        return path;
    }
}
