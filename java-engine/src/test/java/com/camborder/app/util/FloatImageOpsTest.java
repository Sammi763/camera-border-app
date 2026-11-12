package com.camborder.app.util;

import org.junit.jupiter.api.Test;

import java.awt.image.BufferedImage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/** T04 浮点底座：恒等、曝光、缩放、旋转、透明装饰、输出阶段量化。 */
final class FloatImageOpsTest {

    @Test
    void exifEightRotatesAsymmetricPixelsInsteadOfOnlyChangingFacts() {
        final FloatRgbImage image = new FloatRgbImage(2, 3);
        for (int y = 0; y < 3; y++) for (int x = 0; x < 2; x++) image.set(x, y, 0, y * 2 + x + 1);
        final FloatRgbImage oriented = FloatImageOps.orient(image, 8);
        assertThat(oriented.getWidth()).isEqualTo(3);
        assertThat(oriented.getHeight()).isEqualTo(2);
        assertThat(oriented.get(0, 0, 0)).isEqualTo(2);
        assertThat(oriented.get(2, 0, 0)).isEqualTo(6);
        assertThat(oriented.get(0, 1, 0)).isEqualTo(1);
        for (int orientation = 1; orientation <= 8; orientation++) {
            assertThat(FloatImageOps.orient(image, orientation).getRgb()).hasSize(18);
        }
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> FloatImageOps.orient(image, 9))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void sourceCropPreservesLowBitsAndStraighteningHasNoBlackCorners() {
        final FloatRgbImage image = new FloatRgbImage(100, 80);
        image.fill(0.123456f, -0.123456f, 1.23456f);
        final com.camborder.app.model.ImageProcessingConfig.SourceGeometry geometry =
                new com.camborder.app.model.ImageProcessingConfig.SourceGeometry();
        geometry.setCrop(new com.camborder.app.model.ImageProcessingConfig.NormalizedCrop(0.25, 0, 0.5, 1));
        final FloatRgbImage cropped = FloatImageOps.sourceGeometry(image, geometry);
        assertThat(cropped.getWidth()).isEqualTo(50);
        assertThat(cropped.getHeight()).isEqualTo(80);
        geometry.setRotationDegrees(15);
        final FloatRgbImage rotated = FloatImageOps.sourceGeometry(image, geometry);
        assertThat(rotated.getWidth()).isLessThan(50);
        for (int y = 0; y < rotated.getHeight(); y++) for (int x = 0; x < rotated.getWidth(); x++) {
            assertThat(rotated.get(x, y, 0)).isCloseTo(0.123456f, within(2e-6f));
            assertThat(rotated.get(x, y, 1)).isCloseTo(-0.123456f, within(2e-6f));
            assertThat(rotated.get(x, y, 2)).isCloseTo(1.23456f, within(2e-6f));
        }
    }

    @Test
    void identityKeepsNegativeAndOutOfRangeValuesExactly() {
        final FloatRgbImage source = new FloatRgbImage(2, 1,
                new float[]{-0.5f, 0.25f, 1.5f, 0.0f, 0.5f, 2.0f});

        final FloatRgbImage result = FloatImageOps.identity(source);

        assertThat(result.get(0, 0, 0)).isEqualTo(-0.5f);
        assertThat(result.get(0, 0, 1)).isEqualTo(0.25f);
        assertThat(result.get(0, 0, 2)).isEqualTo(1.5f);
        assertThat(result.get(1, 0, 2)).isEqualTo(2.0f);
        assertThat(result.hasNonFinite()).isFalse();
    }

    @Test
    void plusOneEvOnZeroToHalfIsExactMultiplyByTwo() {
        final FloatRgbImage source = new FloatRgbImage(2, 1,
                new float[]{0f, 0f, 0f, 0.5f, 0.5f, 0.5f});
        final FloatRgbImage result = FloatImageOps.exposure(source, 1.0);

        assertThat(result.get(0, 0, 0)).isCloseTo(0.0f, within(2e-6f));
        assertThat(result.get(1, 0, 0)).isCloseTo(1.0f, within(2e-6f));
        assertThat(result.get(1, 0, 0)).isEqualTo(source.get(1, 0, 0) * 2f);
    }

    @Test
    void resizeKeepsConstantAndDoesNotClampWorkingValues() {
        final FloatRgbImage source = new FloatRgbImage(7, 5);
        source.fill(0.123456f, -0.25f, 1.75f);

        final FloatRgbImage down = FloatImageOps.resize(source, 3, 2);
        final FloatRgbImage up = FloatImageOps.resize(source, 11, 9);

        for (int y = 0; y < down.getHeight(); y++) {
            for (int x = 0; x < down.getWidth(); x++) {
                assertThat(down.get(x, y, 0)).isCloseTo(0.123456f, within(1e-6f));
                assertThat(down.get(x, y, 1)).isCloseTo(-0.25f, within(1e-6f));
                assertThat(down.get(x, y, 2)).isCloseTo(1.75f, within(1e-6f));
            }
        }
        for (int y = 0; y < up.getHeight(); y++) {
            for (int x = 0; x < up.getWidth(); x++) {
                assertThat(up.get(x, y, 1)).isCloseTo(-0.25f, within(1e-6f));
                assertThat(up.get(x, y, 2)).isCloseTo(1.75f, within(1e-6f));
            }
        }
    }

    @Test
    void areaDownscaleOfRampIsMonotonicAndUsesFloat() {
        final FloatRgbImage source = new FloatRgbImage(8, 1);
        for (int x = 0; x < 8; x++) {
            source.set(x, 0, 0, x / 7f);
            source.set(x, 0, 1, x / 7f);
            source.set(x, 0, 2, x / 7f);
        }

        final FloatRgbImage result = FloatImageOps.resize(source, 4, 1);

        assertThat(result.getWidth()).isEqualTo(4);
        float previous = -1;
        for (int x = 0; x < 4; x++) {
            final float value = result.get(x, 0, 0);
            assertThat(value).isGreaterThan(previous);
            assertThat(value).isBetween(0f, 1f);
            previous = value;
        }
    }

    @Test
    void rotate90MapsPixelsOnce() {
        final FloatRgbImage source = new FloatRgbImage(2, 2, new float[]{
                1, 2, 3, 4, 5, 6,
                7, 8, 9, 10, 11, 12
        });

        final FloatRgbImage result = FloatImageOps.rotate(source, 90);

        assertThat(result.getWidth()).isEqualTo(2);
        assertThat(result.getHeight()).isEqualTo(2);
        assertThat(result.get(0, 0, 0)).isEqualTo(7f);
        assertThat(result.get(1, 0, 0)).isEqualTo(1f);
        assertThat(result.get(0, 1, 0)).isEqualTo(10f);
        assertThat(result.get(1, 1, 0)).isEqualTo(4f);
    }

    @Test
    void transparentDecorationLeavesPhotoPixelsUntouched() {
        final FloatRgbImage base = new FloatRgbImage(2, 1);
        base.fill(0.2f, 0.3f, 0.4f);
        final BufferedImage overlay = new BufferedImage(2, 1, BufferedImage.TYPE_INT_ARGB);
        overlay.setRGB(0, 0, 0x00000000);
        overlay.setRGB(1, 0, 0x80ff0000);

        final FloatRgbImage result = FloatImageOps.compositeOver(base, overlay);

        assertThat(result.get(0, 0, 0)).isEqualTo(base.get(0, 0, 0));
        assertThat(result.get(0, 0, 1)).isEqualTo(base.get(0, 0, 1));
        assertThat(result.get(1, 0, 0)).isGreaterThan(base.get(1, 0, 0));
        assertThat(result.get(1, 0, 1)).isLessThan(base.get(1, 0, 1));
    }

    @Test
    void wideGamutNegativeValuesSurviveUntilExplicitOutputQuantization() {
        final FloatRgbImage rec2020 = new FloatRgbImage(1, 1,
                new float[]{0f, 0.8f, 0f});

        final FloatRgbImage srgb = FloatImageOps.toLinearSrgb(rec2020);

        assertThat(srgb.channelRange()[0]).isLessThan(0f);
        final BufferedImage output = FloatImageOps.toBufferedImage16(rec2020);
        assertThat(output.getRaster().getSample(0, 0, 0)).isGreaterThanOrEqualTo(0);
        assertThat(output.getRaster().getSample(0, 0, 1)).isGreaterThan(0);
    }

    @Test
    void cameraRgbBecomesFloatWorkingImageWithoutClamp() {
        final double[][] rgbCam = {{1, 0, 0}, {0, 1, 0}, {0, 0, 1}};
        final short[] rgb = {(short) 0x4000, (short) 0x2000, (short) 0x6000};

        final FloatRgbImage result = FloatImageOps.fromCameraRgb(rgb, 1, 1, rgbCam);

        final float[] srgb = {0x4000 / 65535f, 0x2000 / 65535f, 0x6000 / 65535f};
        final float[] expected = new float[3];
        FilmColorSpace.linearSrgbToRec2020(srgb, expected);
        assertThat(result.get(0, 0, 0)).isCloseTo(expected[0], within(1e-6f));
        assertThat(result.hasNonFinite()).isFalse();
    }

    @Test
    void grayStaysNeutralThroughWorkingSpaceRoundTrip() {
        final FloatRgbImage gray = new FloatRgbImage(1, 1,
                new float[]{0.18f, 0.18f, 0.18f});

        final FloatRgbImage srgb = FloatImageOps.toLinearSrgb(gray);

        assertThat(srgb.get(0, 0, 0)).isCloseTo(srgb.get(0, 0, 1), within(1e-6f));
        assertThat(srgb.get(0, 0, 1)).isCloseTo(srgb.get(0, 0, 2), within(1e-6f));
        assertThat(srgb.get(0, 0, 0)).isCloseTo(0.18f, within(1e-5f));
    }

    @Test
    void sixteenBitOutputIsNotSilentlyEightBitQuantized() {
        final FloatRgbImage image = new FloatRgbImage(1, 1,
                new float[]{0.5f, 0.5f, 0.5f});

        final BufferedImage output = FloatImageOps.toBufferedImage16(image);

        assertThat(output.getRaster().getDataBuffer().getDataType()).isEqualTo(java.awt.image.DataBuffer.TYPE_USHORT);
        final int sample = output.getRaster().getSample(0, 0, 0);
        assertThat(sample).isGreaterThan(0);
        // 8-bit 扩展的样本一定是 257 的倍数；这里必须保留 16-bit 中间值。
        assertThat(sample % 257).isNotZero();
    }
}
