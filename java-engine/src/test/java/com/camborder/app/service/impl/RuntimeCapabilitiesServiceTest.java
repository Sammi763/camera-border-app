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
}
