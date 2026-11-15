package com.camborder.app.util;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import java.awt.color.ColorSpace;
import java.awt.color.ICC_Profile;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/** 随包 LittleCMS 2 的 float、多 profile 与 embedded ICC 路径。 */
final class Lcms2ColorTransformTest {

    private static final Path SYSTEM_LCMS = Path.of("..", "professional-tools", "lcms", "macos-arm64", "liblcms2.2.dylib").toAbsolutePath().normalize();

    @AfterEach
    void reset() {
        System.clearProperty(Lcms2ColorTransform.TEST_PROPERTY);
        Lcms2ColorTransform.resetForTests();
    }

    @Test
    void grayProfileUsesSingleChannelNativeInput() {
        Assumptions.assumeTrue(Files.isRegularFile(SYSTEM_LCMS));
        System.setProperty(Lcms2ColorTransform.TEST_PROPERTY, SYSTEM_LCMS.toString());
        Lcms2ColorTransform.resetForTests();
        final byte[] gray = ICC_Profile.getInstance(ColorSpace.CS_GRAY).getData();
        final float[] result = Lcms2ColorTransform.toLinearRec2020(new float[]{0.25f, 0.25f, 0.25f}, 1, "embedded", gray);
        assertThat(result[0]).isCloseTo(result[1], within(0.002f));
        assertThat(result[1]).isCloseTo(result[2], within(0.002f));
        assertThat(result[0]).isBetween(0.24f, 0.26f);
    }

    @Test
    void convertsSrgbAndEmbeddedIccWithoutQuantizing() {
        Assumptions.assumeTrue(Files.isRegularFile(SYSTEM_LCMS), "本机 LittleCMS 仅用于探针");
        System.setProperty(Lcms2ColorTransform.TEST_PROPERTY, SYSTEM_LCMS.toString());
        Lcms2ColorTransform.resetForTests();
        assertThat(Lcms2ColorTransform.isAvailable()).isTrue();

        final float[] srgb = {1f, 0f, 0f};
        final float[] converted = Lcms2ColorTransform.toLinearRec2020(srgb, 1, "srgb", null);
        final float[] matrix = new float[3];
        FilmColorSpace.linearSrgbToRec2020(new float[]{1f, 0f, 0f}, matrix);
        assertThat(converted[0]).isCloseTo(matrix[0], within(2e-3f));
        assertThat(converted[1]).isCloseTo(matrix[1], within(2e-3f));
        assertThat(converted[2]).isCloseTo(matrix[2], within(2e-3f));

        final byte[] sRgbIcc = ICC_Profile.getInstance(ColorSpace.CS_sRGB).getData();
        final float[] embedded = Lcms2ColorTransform.toLinearRec2020(
                new float[]{0.5f, 0.5f, 0.5f}, 1, "embedded", sRgbIcc);
        final float[] expected = new float[3];
        FilmColorSpace.linearSrgbToRec2020(new float[]{
                (float) FilmColorSpace.encodedSrgbToLinear(0.5),
                (float) FilmColorSpace.encodedSrgbToLinear(0.5),
                (float) FilmColorSpace.encodedSrgbToLinear(0.5)}, expected);
        assertThat(embedded[0]).isCloseTo(expected[0], within(2e-3f));
    }

    @Test
    void corruptEmbeddedProfileFailsExplicitly() {
        Assumptions.assumeTrue(Files.isRegularFile(SYSTEM_LCMS), "本机 LittleCMS 仅用于探针");
        System.setProperty(Lcms2ColorTransform.TEST_PROPERTY, SYSTEM_LCMS.toString());
        Lcms2ColorTransform.resetForTests();
        org.assertj.core.api.Assertions.assertThatThrownBy(() ->
                        Lcms2ColorTransform.toLinearRec2020(new float[]{0.5f, 0.5f, 0.5f},
                                1, "embedded", "not-an-icc-profile".getBytes()))
                .isInstanceOfSatisfying(com.camborder.app.exception.FilmProcessingException.class,
                        exception -> assertThat(exception.getCode())
                                .isEqualTo(Lcms2ColorTransform.CODE_TRANSFORM_FAILED));
    }

    @Test
    void adobeAndProPhotoUseExplicitProfiles() {
        Assumptions.assumeTrue(Files.isRegularFile(SYSTEM_LCMS), "本机 LittleCMS 仅用于探针");
        System.setProperty(Lcms2ColorTransform.TEST_PROPERTY, SYSTEM_LCMS.toString());
        Lcms2ColorTransform.resetForTests();

        assertThat(Lcms2ColorTransform.toLinearRec2020(new float[]{0.5f, 0.5f, 0.5f},
                1, "adobe-rgb", null)).hasSize(3);
        assertThat(Lcms2ColorTransform.toLinearRec2020(new float[]{0.5f, 0.5f, 0.5f},
                1, "prophoto-rgb", null)).hasSize(3);
        assertThat(Lcms2ColorTransform.version()).isNotBlank();
    }
}
