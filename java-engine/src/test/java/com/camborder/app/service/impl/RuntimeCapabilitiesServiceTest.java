package com.camborder.app.service.impl;

import com.camborder.app.dto.CapabilitiesResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

/** 验证能力探测只报告当前随包组件的真实状态。 */
final class RuntimeCapabilitiesServiceTest {

    @Test
    void missingExifToolDisablesProfessionalTiers(@TempDir final Path tempDir) {
        RuntimeCapabilitiesService service = new RuntimeCapabilitiesService(
                tempDir.resolve("missing-exiftool").toString());
        service.registerImageIoPlugins();

        CapabilitiesResponse response = service.snapshot();

        assertThat(response.getComponents().get("exiftool").isAvailable()).isFalse();
        assertThat(response.getTiers().get("quick-share").isAvailable()).isFalse();
        assertThat(response.getTiers().get("standard-delivery").isAvailable()).isFalse();
        assertThat(response.getTiers().get("high-fidelity-archive").isAvailable()).isFalse();
        assertThat(response.getTiers().get("custom").isAvailable()).isFalse();
        assertThat(response.getFilmDigitization().isAvailable()).isFalse();
        assertThat(response.getFilmDigitization().getInputModes()).isEmpty();
        assertThat(response.getFilmDigitization().getOutputs().get("tiff16-rec2020")).isFalse();
    }

    @Test
    void reportsVersionLicenseAndManifestChecksumWhenFixedToolIsAvailable(@TempDir final Path tempDir)
            throws IOException {
        Assumptions.assumeFalse(System.getProperty("os.name", "").toLowerCase().contains("win"));
        Path executable = tempDir.resolve("exiftool");
        Files.writeString(executable, "#!/bin/sh\nprintf '13.59\\n'\n");
        assertThat(executable.toFile().setExecutable(true)).isTrue();
        Path manifest = tempDir.resolve("components.json");
        Files.writeString(manifest, "{\"components\":{\"exiftool\":{"
                + "\"sha256\":\"locked-checksum\",\"version\":\"13.59\"}}}");

        RuntimeCapabilitiesService service = new RuntimeCapabilitiesService(
                executable.toString(), manifest.toString(), new ObjectMapper());
        service.registerImageIoPlugins();

        CapabilitiesResponse response = service.snapshot();
        CapabilitiesResponse.Component exiftool = response.getComponents().get("exiftool");

        assertThat(exiftool.isAvailable()).isTrue();
        assertThat(exiftool.getVersion()).isEqualTo("13.59");
        assertThat(exiftool.getLicense()).contains("GPL");
        assertThat(exiftool.getSha256()).isEqualTo("locked-checksum");
        assertThat(response.getTiers().get("standard-delivery").isAvailable()).isTrue();
        assertThat(response.getOutput().get("jpeg").getBitDepths()).containsExactly(8);
        assertThat(response.getOutput().get("png").getBitDepths()).containsExactly(8, 16);
    }

    @Test
    void missingTwelveMonkeysManifestDisablesTiffAndArchiveButKeepsExifToolTiers(
            @TempDir final Path tempDir) throws IOException {
        Assumptions.assumeFalse(System.getProperty("os.name", "").toLowerCase().contains("win"));
        Path executable = tempDir.resolve("exiftool");
        Files.writeString(executable, "#!/bin/sh\nprintf '13.59\\n'\n");
        assertThat(executable.toFile().setExecutable(true)).isTrue();
        Path manifest = tempDir.resolve("components.json");
        Files.writeString(manifest, "{\"components\":{\"exiftool\":{"
                + "\"sha256\":\"locked-checksum\",\"version\":\"13.59\"}}}");

        RuntimeCapabilitiesService service = new RuntimeCapabilitiesService(
                executable.toString(), manifest.toString(), new ObjectMapper());
        service.registerImageIoPlugins();

        CapabilitiesResponse response = service.snapshot();
        assertThat(response.getComponents().get("exiftool").isAvailable()).isTrue();
        assertThat(response.getComponents().get("twelvemonkeys-imageio").isAvailable()).isFalse();
        assertThat(response.getInput().get("tiff")).isFalse();
        assertThat(response.getOutput().get("tiff").isAvailable()).isFalse();
        assertThat(response.getTiers().get("standard-delivery").isAvailable()).isTrue();
        assertThat(response.getTiers().get("high-fidelity-archive").isAvailable()).isFalse();
    }

    @Test
    void reportsHeicAndFontsOnlyWhenBundledInputsArePresent(@TempDir final Path tempDir)
            throws IOException {
        Assumptions.assumeFalse(System.getProperty("os.name", "").toLowerCase().contains("win"));
        Path executable = tempDir.resolve("exiftool");
        Files.writeString(executable, "#!/bin/sh\nprintf '13.59\\n'\n");
        assertThat(executable.toFile().setExecutable(true)).isTrue();
        Path components = tempDir.resolve("components.json");
        Files.writeString(components, "{\"components\":{\"exiftool\":{\"sha256\":\"locked\"}}}");
        Path fonts = tempDir.resolve("fonts");
        Files.createDirectories(fonts);
        Files.writeString(fonts.resolve("fonts.json"), "{\"fonts\":[{\"file\":\"bundled.ttf\"}]}");
        Files.writeString(fonts.resolve("bundled.ttf"), "font-placeholder");

        RuntimeCapabilitiesService service = new RuntimeCapabilitiesService(
                executable.toString(), components.toString(), "true", fonts.toString(), new ObjectMapper());
        service.registerImageIoPlugins();

        CapabilitiesResponse response = service.snapshot();

        assertThat(response.getInput().get("heic")).isTrue();
        assertThat(response.getInput().get("heif")).isTrue();
        assertThat(response.getComponents().get("fonts").isAvailable()).isTrue();
    }

    @Test
    void missingBundledFontsDisableFontCapability(@TempDir final Path tempDir) throws IOException {
        RuntimeCapabilitiesService service = new RuntimeCapabilitiesService(
                tempDir.resolve("missing-exiftool").toString(), "", "true",
                tempDir.resolve("missing-fonts").toString(), new ObjectMapper());
        service.registerImageIoPlugins();

        assertThat(service.snapshot().getComponents().get("fonts").isAvailable()).isFalse();
    }

    @Test
    void librawDecoderIsReportedOnlyWhenManifestAndChecksumMatch(@TempDir final Path tempDir)
            throws IOException {
        Assumptions.assumeFalse(System.getProperty("os.name", "").toLowerCase().contains("win"));
        final Path helper = tempDir.resolve("film-raw-helper");
        Files.writeString(helper, "#!/bin/sh\nprintf 'film-raw-helper 1.1.0 libraw 0.22.3-Release\\n'\n");
        assertThat(helper.toFile().setExecutable(true)).isTrue();
        Files.writeString(tempDir.resolve("helper.json"), helperManifest(helper));

        final RuntimeCapabilitiesService service = new RuntimeCapabilitiesService(
                tempDir.resolve("missing-exiftool").toString(), "", "false", "",
                helper.toString(), new ObjectMapper());
        service.registerImageIoPlugins();

        final CapabilitiesResponse response = service.snapshot();
        assertThat(response.getComponents().get("libraw").isAvailable()).isTrue();
        assertThat(response.getComponents().get("libraw").getVersion()).isEqualTo("0.22.3");
        assertThat(response.getComponents().get("libraw").getLicense()).contains("LGPL");
        assertThat(response.getComponents().get("libraw").getSha256()).hasSize(64);
        // T10 起底片预览/分析可用；真实 RAW 仍取决于 LibRaw helper，导出组合单独为 false。
        assertThat(response.getFilmDigitization().isAvailable()).isTrue();
        assertThat(response.getFilmDigitization().getDecoder()).isEqualTo("libraw");
        assertThat(response.getFilmDigitization().getInputModes()).contains("sensor-raw");
        assertThat(response.getFilmDigitization().getReason()).contains("预览/分析");
    }

    @Test
    void tamperedLibRawHelperIsUnavailable(@TempDir final Path tempDir) throws IOException {
        Assumptions.assumeFalse(System.getProperty("os.name", "").toLowerCase().contains("win"));
        final Path helper = tempDir.resolve("film-raw-helper");
        Files.writeString(helper, "#!/bin/sh\nprintf 'film-raw-helper 1.1.0 libraw 0.22.3-Release\\n'\n");
        assertThat(helper.toFile().setExecutable(true)).isTrue();
        Files.writeString(tempDir.resolve("helper.json"), helperManifest(helper));
        Files.writeString(helper, "#!/bin/sh\nexit 0\n");

        final RuntimeCapabilitiesService service = new RuntimeCapabilitiesService(
                tempDir.resolve("missing-exiftool").toString(), "", "false", "",
                helper.toString(), new ObjectMapper());
        service.registerImageIoPlugins();

        assertThat(service.snapshot().getComponents().get("libraw").isAvailable()).isFalse();
        assertThat(service.snapshot().getComponents().get("libraw").getReason()).contains("校验和");
    }

    @Test
    void libRawHelperWithoutExecutePermissionIsUnavailable(@TempDir final Path tempDir) throws IOException {
        Assumptions.assumeFalse(System.getProperty("os.name", "").toLowerCase().contains("win"));
        final Path helper = tempDir.resolve("film-raw-helper");
        Files.writeString(helper, "#!/bin/sh\nexit 0\n");
        assertThat(helper.toFile().setExecutable(false)).isTrue();

        final RuntimeCapabilitiesService service = new RuntimeCapabilitiesService(
                tempDir.resolve("missing-exiftool").toString(), "", "false", "",
                helper.toString(), new ObjectMapper());
        service.registerImageIoPlugins();

        assertThat(service.snapshot().getComponents().get("libraw").isAvailable()).isFalse();
        assertThat(service.snapshot().getComponents().get("libraw").getReason()).contains("不存在或不可执行");
    }

    @Test
    void wrongArchitectureLibRawManifestIsUnavailableOnMac(@TempDir final Path tempDir) throws IOException {
        Assumptions.assumeTrue(System.getProperty("os.name", "").toLowerCase().contains("mac"));
        final Path helper = tempDir.resolve("film-raw-helper");
        Files.writeString(helper, "#!/bin/sh\nprintf 'film-raw-helper 1.1.0 libraw 0.22.3-Release\\n'\n");
        assertThat(helper.toFile().setExecutable(true)).isTrue();
        final String manifest = helperManifest(helper).replace(
                System.getProperty("os.arch", "").contains("aarch64") ? "macos-arm64" : "macos-x64",
                "macos-wrong");
        Files.writeString(tempDir.resolve("helper.json"), manifest);

        final RuntimeCapabilitiesService service = new RuntimeCapabilitiesService(
                tempDir.resolve("missing-exiftool").toString(), "", "false", "",
                helper.toString(), new ObjectMapper());
        service.registerImageIoPlugins();

        assertThat(service.snapshot().getComponents().get("libraw").isAvailable()).isFalse();
        assertThat(service.snapshot().getComponents().get("libraw").getReason()).contains("架构");
    }

    private static String helperManifest(final Path helper) throws IOException {
        try {
            final byte[] digest = java.security.MessageDigest.getInstance("SHA-256")
                    .digest(Files.readAllBytes(helper));
            final StringBuilder sha = new StringBuilder(64);
            for (byte value : digest) sha.append(String.format("%02x", value));
            final String architecture = System.getProperty("os.name", "").toLowerCase().contains("mac")
                    ? "macos-" + (System.getProperty("os.arch", "").contains("aarch64") ? "arm64" : "x64")
                    : "test";
            return "{\"schemaVersion\":1,\"component\":\"libraw\",\"helperVersion\":\"1.1.0\","
                    + "\"librawVersion\":\"0.22.3\",\"architecture\":\"" + architecture + "\","
                    + "\"binarySha256\":\"" + sha + "\"}";
        } catch (Exception exception) {
            throw new IOException(exception);
        }
    }
}
