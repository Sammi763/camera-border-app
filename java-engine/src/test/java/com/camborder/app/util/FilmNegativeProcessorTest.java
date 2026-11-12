package com.camborder.app.util;

import com.camborder.app.exception.FilmProcessingException;
import com.camborder.app.model.ImageProcessingConfig;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

/** T05 通用彩负/片基/密度模型的合成测试；期望值由独立公式手算，不复用实现。 */
final class FilmNegativeProcessorTest {

    private final FilmNegativeProcessor processor = new FilmNegativeProcessor();

    @Test
    void knownTransmittanceProducesExpectedDensityAndPositiveRelationship() {
        final double[] base = {0.8, 0.7, 0.6};
        final FloatRgbImage image = new FloatRgbImage(2, 1);
        setPixel(image, 0, base[0] * 0.5, base[1] * 0.5, base[2] * 0.5);
        setPixel(image, 1, base[0] * 0.25, base[1] * 0.25, base[2] * 0.25);

        final FilmNegativeProcessor.Result result = processor.process(image,
                manualConfig(base, 0, 1));

        final double expectedFirst = (-Math.log10(0.5) - 0) / (1 - 0);
        final double expectedSecond = (-Math.log10(0.25) - 0) / (1 - 0);
        assertClose(result.getImage().get(0, 0, 0), expectedFirst);
        assertClose(result.getImage().get(1, 0, 0), expectedSecond);
        // 更暗的负片（透过率更低、密度更高）对应更亮的正片。
        assertThat(result.getImage().get(1, 0, 0)).isGreaterThan(result.getImage().get(0, 0, 0));
        assertThat(result.getImage().hasNonFinite()).isFalse();
    }

    @Test
    void perChannelBaseIsAppliedIndependently() {
        final double[] base = {0.8, 0.7, 0.6};
        final FloatRgbImage image = new FloatRgbImage(1, 1);
        setPixel(image, 0, base[0] * 0.5, base[1] * 0.25, base[2] * 0.75);

        final FilmNegativeProcessor.Result result = processor.process(image,
                manualConfig(base, 0, 1));

        assertThat(result.getBase()).containsExactly(base[0], base[1], base[2]);
        for (int channel = 0; channel < 3; channel++) {
            final double transmittance = new double[]{0.5, 0.25, 0.75}[channel];
            final double expected = (-Math.log10(transmittance)) / 1.0;
            assertClose(result.getImage().get(0, 0, channel), expected);
        }
    }

    @Test
    void roiUsesPerChannelMedianAsFilmBase() {
        final FloatRgbImage image = new FloatRgbImage(10, 10);
        image.fill(0.1f, 0.1f, 0.1f);
        for (int y = 2; y < 5; y++) {
            for (int x = 2; x < 5; x++) {
                setPixel(image, y * 10 + x, 0.2, 0.3, 0.4);
            }
        }
        final ImageProcessingConfig.FilmBaseConfig filmBase = new ImageProcessingConfig.FilmBaseConfig();
        filmBase.setKind("roi");
        filmBase.setStage("linear-working");
        filmBase.setRoi(new ImageProcessingConfig.NormalizedCrop(0.2, 0.2, 0.3, 0.3));

        final FilmNegativeProcessor.Result result = processor.process(image,
                config(filmBase, 0, 1));

        assertThat(result.getBase()[0]).isCloseTo(0.2, within(1e-6));
        assertThat(result.getBase()[1]).isCloseTo(0.3, within(1e-6));
        assertThat(result.getBase()[2]).isCloseTo(0.4, within(1e-6));
        assertThat(result.getBaseKind()).isEqualTo("roi");
    }

    @Test
    void lightSourceGainIsAppliedBeforeTransmittance() {
        final ImageProcessingConfig.NegativeConfig config = manualConfig(new double[]{1, 1, 1}, 0, 1);
        config.getLightSource().setKind("calibration");
        config.getLightSource().setRgbGain(new double[]{2, 1, 0.5});
        final FloatRgbImage image = new FloatRgbImage(1, 1);
        setPixel(image, 0, 0.5, 0.5, 0.5);

        final FilmNegativeProcessor.Result result = processor.process(image, config);

        assertThat(result.getLightGain()).containsExactly(2, 1, 0.5);
        assertClose(result.getImage().get(0, 0, 0), 0.0);
        assertClose(result.getImage().get(0, 0, 1), -Math.log10(0.5));
        assertClose(result.getImage().get(0, 0, 2), -Math.log10(0.25));
        assertThat(result.getNegativeDensityCount()).isZero();
    }

    @Test
    void zeroAndNearZeroTransmittanceClipWithoutNan() {
        final FloatRgbImage image = new FloatRgbImage(2, 1);
        setPixel(image, 0, 0, 0, 0);
        setPixel(image, 1, 1e-12, 1e-12, 1e-12);

        final FilmNegativeProcessor.Result result = processor.process(image,
                manualConfig(new double[]{1, 1, 1}, 0, 3));

        assertThat(result.getLowClipCount()).isEqualTo(6);
        assertThat(result.getImage().hasNonFinite()).isFalse();
        assertThat(result.getImage().get(0, 0, 0)).isEqualTo(1f);
        assertThat(result.getImage().get(1, 0, 0)).isEqualTo(1f);
    }

    @Test
    void imageBrighterThanBaseReportsNegativeDensityAndClips() {
        final FloatRgbImage image = new FloatRgbImage(1, 1);
        setPixel(image, 0, 2, 2, 2);

        final FilmNegativeProcessor.Result result = processor.process(image,
                manualConfig(new double[]{1, 1, 1}, 0, 1));

        assertThat(result.getNegativeDensityCount()).isEqualTo(3);
        assertThat(result.getHighClipCount()).isEqualTo(3);
        assertThat(result.getImage().get(0, 0, 0)).isEqualTo(0f);
        assertThat(result.getImage().hasNonFinite()).isFalse();
    }

    @Test
    void zeroBaseIsRejected() {
        final FloatRgbImage image = new FloatRgbImage(1, 1);
        setPixel(image, 0, 0.5, 0.5, 0.5);

        assertThatThrownBy(() -> processor.process(image,
                manualConfig(new double[]{0, 1, 1}, 0, 1)))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(FilmNegativeProcessor.CODE_INVALID_BASE));
    }

    @Test
    void cameraRgbBaseStageIsExplicitlyUnsupportedUntilT12() {
        final ImageProcessingConfig.NegativeConfig config = manualConfig(new double[]{1, 1, 1}, 0, 1);
        config.getFilmBase().setStage("linear-camera-rgb");
        final FloatRgbImage image = new FloatRgbImage(1, 1);

        assertThatThrownBy(() -> processor.process(image, config))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(FilmNegativeProcessor.CODE_STAGE_MISMATCH));
    }

    @Test
    void referenceFrameBaseIsExplicitlyUnsupportedUntilT12() {
        final ImageProcessingConfig.NegativeConfig config = manualConfig(new double[]{1, 1, 1}, 0, 1);
        config.getFilmBase().setKind("reference-frame");
        config.getFilmBase().setReferenceImagePath("/tmp/reference.tif");
        final FloatRgbImage image = new FloatRgbImage(1, 1);

        assertThatThrownBy(() -> processor.process(image, config))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception ->
                        assertThat(exception.getCode())
                                .isEqualTo(FilmNegativeProcessor.CODE_BASE_REFERENCE_UNRESOLVED));
    }

    @Test
    void unresolvedCalibrationIdIsRejected() {
        final ImageProcessingConfig.NegativeConfig config = manualConfig(new double[]{1, 1, 1}, 0, 1);
        config.getLightSource().setKind("calibration");
        config.getLightSource().setCalibrationId("roll-cal-1");
        final FloatRgbImage image = new FloatRgbImage(1, 1);

        assertThatThrownBy(() -> processor.process(image, config))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception ->
                        assertThat(exception.getCode())
                                .isEqualTo(FilmNegativeProcessor.CODE_LIGHT_SOURCE_UNRESOLVED));
    }

    @Test
    void saturatedReferenceStaysFinite() {
        final FloatRgbImage image = new FloatRgbImage(1, 1);
        setPixel(image, 0, 1, 1, 1);

        final FilmNegativeProcessor.Result result = processor.process(image,
                manualConfig(new double[]{1, 1, 1}, 0, 1));

        assertThat(result.getImage().get(0, 0, 0)).isCloseTo(0.0f, within(1e-6f));
        assertThat(result.getImage().hasNonFinite()).isFalse();
    }

    private static ImageProcessingConfig.NegativeConfig manualConfig(final double[] base,
                                                                      final double min,
                                                                      final double max) {
        final ImageProcessingConfig.FilmBaseConfig filmBase = new ImageProcessingConfig.FilmBaseConfig();
        filmBase.setKind("manual");
        filmBase.setStage("linear-working");
        filmBase.setRgb(base);
        return config(filmBase, min, max);
    }

    private static ImageProcessingConfig.NegativeConfig config(
            final ImageProcessingConfig.FilmBaseConfig filmBase, final double min, final double max) {
        final ImageProcessingConfig.NegativeConfig config = new ImageProcessingConfig.NegativeConfig();
        config.setEnabled(true);
        final ImageProcessingConfig.LightSourceConfig light = new ImageProcessingConfig.LightSourceConfig();
        light.setKind("camera-white-balance");
        config.setLightSource(light);
        config.setFilmBase(filmBase);
        final ImageProcessingConfig.DensityConfig density = new ImageProcessingConfig.DensityConfig();
        density.setMin(min);
        density.setMax(max);
        config.setDensity(density);
        config.setProfile("generic-color-negative-v1");
        return config;
    }

    private static void setPixel(final FloatRgbImage image, final int index,
                                 final double r, final double g, final double b) {
        final int x = index % image.getWidth();
        final int y = index / image.getWidth();
        image.set(x, y, 0, (float) r);
        image.set(x, y, 1, (float) g);
        image.set(x, y, 2, (float) b);
    }

    private static void assertClose(final float actual, final double expected) {
        assertThat((double) actual).isCloseTo(expected, within(1e-6));
    }
}
