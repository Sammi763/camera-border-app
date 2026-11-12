package com.camborder.app.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/** T04 线性工作空间矩阵：恒等与往返误差，不依赖 CMM。 */
final class FilmColorSpaceTest {

    @Test
    void srgbRec2020RoundTripKeepsFloatPrecision() {
        final int[][] samples = {{0, 0, 0}, {65535, 65535, 65535}, {12345, 23456, 34567}};
        final float[] rec2020 = new float[3];
        final float[] back = new float[3];
        for (int[] sample : samples) {
            final float[] srgb = {sample[0] / 65535f, sample[1] / 65535f, sample[2] / 65535f};
            FilmColorSpace.linearSrgbToRec2020(srgb, rec2020);
            FilmColorSpace.linearRec2020ToSrgb(rec2020, back);
            assertThat(back[0]).isCloseTo(srgb[0], within(2e-6f));
            assertThat(back[1]).isCloseTo(srgb[1], within(2e-6f));
            assertThat(back[2]).isCloseTo(srgb[2], within(2e-6f));
        }
    }

    @Test
    void encodedSrgbRoundTripKeepsPrecision() {
        for (double value : new double[]{0, 0.02, 0.5, 1.0}) {
            final double linear = FilmColorSpace.encodedSrgbToLinear(value);
            final double back = FilmColorSpace.linearToEncodedSrgb(linear);
            assertThat(back).isCloseTo(value, within(1e-7));
        }
    }

    @Test
    void identityCameraMatrixEqualsSrgbToRec2020() {
        final double[][] identity = {{1, 0, 0}, {0, 1, 0}, {0, 0, 1}};
        final float[] rgb = {0.25f, 0.5f, 0.75f};
        final float[] camera = new float[3];
        final float[] direct = new float[3];
        FilmColorSpace.cameraRgbToLinearRec2020(identity, rgb, camera);
        FilmColorSpace.linearSrgbToRec2020(rgb, direct);

        assertThat(camera[0]).isCloseTo(direct[0], within(1e-6f));
        assertThat(camera[1]).isCloseTo(direct[1], within(1e-6f));
        assertThat(camera[2]).isCloseTo(direct[2], within(1e-6f));
    }
}
