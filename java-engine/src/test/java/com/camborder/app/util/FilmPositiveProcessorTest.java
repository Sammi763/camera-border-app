package com.camborder.app.util;

import com.camborder.app.exception.FilmProcessingException;
import com.camborder.app.model.ImageProcessingConfig;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

/** T06 正片调整：冻结顺序、恒等、曝光、黑白点、曲线、饱和度与非法输入。 */
final class FilmPositiveProcessorTest {

    private final FilmPositiveProcessor processor = new FilmPositiveProcessor();

    @Test
    void zeroAdjustmentIsIdentityEvenForNegativeAndOutOfRange() {
        final FloatRgbImage input = new FloatRgbImage(2, 1,
                new float[]{-0.5f, 0.25f, 1.5f, 0.0f, 0.5f, 2.0f});
        final ImageProcessingConfig.PositiveAdjustments adjustments =
                new ImageProcessingConfig.PositiveAdjustments();

        final FloatRgbImage result = processor.process(input, adjustments);

        for (int x = 0; x < 2; x++) {
            for (int channel = 0; channel < 3; channel++) {
                assertThat(result.get(x, 0, channel)).isEqualTo(input.get(x, 0, channel));
            }
        }
    }

    @Test
    void plusOneEvMultipliesByTwoWithinThreshold() {
        final FloatRgbImage input = new FloatRgbImage(2, 1,
                new float[]{0f, 0f, 0f, 0.5f, 0.5f, 0.5f});
        final ImageProcessingConfig.PositiveAdjustments adjustments =
                new ImageProcessingConfig.PositiveAdjustments();
        adjustments.setExposureEv(1);

        final FloatRgbImage result = processor.process(input, adjustments);

        assertThat(result.get(0, 0, 0)).isCloseTo(0.0f, within(2e-6f));
        assertThat(result.get(1, 0, 0)).isCloseTo(1.0f, within(2e-6f));
    }

    @Test
    void rgbBalanceIsChannelIsolated() {
        final FloatRgbImage input = new FloatRgbImage(1, 1,
                new float[]{0.25f, 0.25f, 0.25f});
        final ImageProcessingConfig.PositiveAdjustments adjustments =
                new ImageProcessingConfig.PositiveAdjustments();
        adjustments.setRgbBalanceEv(new double[]{1, 0, 0});

        final FloatRgbImage result = processor.process(input, adjustments);

        assertThat(result.get(0, 0, 0)).isCloseTo(0.5f, within(2e-6f));
        assertThat(result.get(0, 0, 1)).isCloseTo(0.25f, within(2e-6f));
        assertThat(result.get(0, 0, 2)).isCloseTo(0.25f, within(2e-6f));
    }

    @Test
    void blackAndWhitePointMapLinearlyWithoutClamp() {
        final FloatRgbImage input = new FloatRgbImage(2, 1,
                new float[]{0.2f, 0.2f, 0.2f, 0.8f, 0.8f, 0.8f});
        final ImageProcessingConfig.PositiveAdjustments adjustments =
                new ImageProcessingConfig.PositiveAdjustments();
        adjustments.setBlackPoint(0.2);
        adjustments.setWhitePoint(0.8);

        final FloatRgbImage result = processor.process(input, adjustments);

        assertThat(result.get(0, 0, 0)).isCloseTo(0.0f, within(1e-6f));
        assertThat(result.get(1, 0, 0)).isCloseTo(1.0f, within(1e-6f));
    }

    @Test
    void masterCurveHitsEndpointsAndMidpointAndDoesNotOvershoot() {
        final ImageProcessingConfig.PositiveAdjustments adjustments =
                new ImageProcessingConfig.PositiveAdjustments();
        final ImageProcessingConfig.Curve curve = curve(
                point(0, 0), point(0.25, 0.3), point(0.5, 0.8), point(1, 1));
        adjustments.setMasterCurve(curve);
        final FloatRgbImage input = new FloatRgbImage(4, 1);
        input.set(0, 0, 0, 0);
        input.set(1, 0, 0, 0.25f);
        input.set(2, 0, 0, 0.5f);
        input.set(3, 0, 0, 1);

        final FloatRgbImage result = processor.process(input, adjustments);

        assertThat(result.get(0, 0, 0)).isCloseTo(0.0f, within(1e-6f));
        assertThat(result.get(1, 0, 0)).isCloseTo(0.3f, within(1e-6f));
        assertThat(result.get(2, 0, 0)).isCloseTo(0.8f, within(1e-6f));
        assertThat(result.get(3, 0, 0)).isCloseTo(1.0f, within(1e-6f));
        for (int index = 0; index <= 100; index++) {
            final float value = FilmPositiveProcessor.evaluate(curve, index / 100f);
            assertThat(value).isBetween(0f, 1f);
        }
    }

    @Test
    void frozenOrderIsExposureThenCurve() {
        final ImageProcessingConfig.PositiveAdjustments adjustments =
                new ImageProcessingConfig.PositiveAdjustments();
        adjustments.setExposureEv(1);
        adjustments.setMasterCurve(curve(
                point(0, 0), point(0.25, 0.3), point(0.5, 0.8), point(1, 1)));
        final FloatRgbImage input = new FloatRgbImage(1, 1,
                new float[]{0.25f, 0.25f, 0.25f});

        final FloatRgbImage result = processor.process(input, adjustments);

        // 先曝光 0.25->0.5，再曲线命中 0.5 的 0.8；若顺序相反会得到 0.6。
        assertThat(result.get(0, 0, 0)).isCloseTo(0.8f, within(1e-6f));
    }

    @Test
    void channelCurvesAreIsolated() {
        final ImageProcessingConfig.PositiveAdjustments adjustments =
                new ImageProcessingConfig.PositiveAdjustments();
        adjustments.setRedCurve(curve(point(0, 0), point(0.5, 0.25), point(1, 1)));
        final FloatRgbImage input = new FloatRgbImage(1, 1,
                new float[]{0.5f, 0.5f, 0.5f});

        final FloatRgbImage result = processor.process(input, adjustments);

        assertThat(result.get(0, 0, 0)).isCloseTo(0.25f, within(1e-6f));
        assertThat(result.get(0, 0, 1)).isCloseTo(0.5f, within(1e-6f));
        assertThat(result.get(0, 0, 2)).isCloseTo(0.5f, within(1e-6f));
    }

    @Test
    void saturationKeepsNeutralGrayNeutral() {
        final ImageProcessingConfig.PositiveAdjustments adjustments =
                new ImageProcessingConfig.PositiveAdjustments();
        adjustments.setSaturation(1.8);
        final FloatRgbImage input = new FloatRgbImage(1, 1,
                new float[]{0.2f, 0.2f, 0.2f});

        final FloatRgbImage result = processor.process(input, adjustments);

        assertThat(result.get(0, 0, 0)).isCloseTo(0.2f, within(1e-6f));
        assertThat(result.get(0, 0, 1)).isCloseTo(0.2f, within(1e-6f));
        assertThat(result.get(0, 0, 2)).isCloseTo(0.2f, within(1e-6f));
    }

    @Test
    void duplicateCurveXIsRejected() {
        final ImageProcessingConfig.PositiveAdjustments adjustments =
                new ImageProcessingConfig.PositiveAdjustments();
        adjustments.setMasterCurve(curve(point(0, 0), point(0.5, 0.5), point(0.5, 0.8), point(1, 1)));

        assertThatThrownBy(() -> processor.process(new FloatRgbImage(1, 1), adjustments))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(FilmPositiveProcessor.CODE_INVALID_CURVE));
    }

    @Test
    void nonMonotonicCurveYIsRejected() {
        final ImageProcessingConfig.PositiveAdjustments adjustments =
                new ImageProcessingConfig.PositiveAdjustments();
        adjustments.setMasterCurve(curve(point(0, 0), point(0.4, 0.7), point(0.6, 0.6), point(1, 1)));

        assertThatThrownBy(() -> processor.process(new FloatRgbImage(1, 1), adjustments))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(FilmPositiveProcessor.CODE_INVALID_CURVE));
    }

    @Test
    void reversedBlackWhiteIsRejected() {
        final ImageProcessingConfig.PositiveAdjustments adjustments =
                new ImageProcessingConfig.PositiveAdjustments();
        adjustments.setBlackPoint(0.8);
        adjustments.setWhitePoint(0.7);

        assertThatThrownBy(() -> processor.process(new FloatRgbImage(1, 1), adjustments))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception ->
                        assertThat(exception.getCode())
                                .isEqualTo(FilmPositiveProcessor.CODE_INVALID_BLACK_WHITE));
    }

    @Test
    void tooManyCurvePointsAreRejected() {
        final List<ImageProcessingConfig.CurvePoint> points = new ArrayList<>();
        for (int index = 0; index <= 20; index++) {
            points.add(point(index / 20.0, index / 20.0));
        }
        final ImageProcessingConfig.PositiveAdjustments adjustments =
                new ImageProcessingConfig.PositiveAdjustments();
        adjustments.setMasterCurve(curve(points.toArray(new ImageProcessingConfig.CurvePoint[0])));

        assertThatThrownBy(() -> processor.process(new FloatRgbImage(1, 1), adjustments))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception ->
                        assertThat(exception.getCode()).isEqualTo(FilmPositiveProcessor.CODE_INVALID_CURVE));
    }

    @Test
    void serializedAdjustmentsReproduceSameResult() throws Exception {
        final ImageProcessingConfig.PositiveAdjustments adjustments =
                new ImageProcessingConfig.PositiveAdjustments();
        adjustments.setExposureEv(0.5);
        adjustments.setRgbBalanceEv(new double[]{0.1, 0, -0.1});
        adjustments.setBlackPoint(0.05);
        adjustments.setWhitePoint(0.95);
        adjustments.setSaturation(1.2);
        adjustments.setMasterCurve(curve(point(0, 0), point(0.5, 0.55), point(1, 1)));
        final FloatRgbImage input = new FloatRgbImage(2, 1,
                new float[]{0.1f, 0.4f, 0.7f, 0.9f, 0.2f, 0.5f});

        final ImageProcessingConfig.PositiveAdjustments roundTripped = new ObjectMapper()
                .readValue(new ObjectMapper().writeValueAsString(adjustments),
                        ImageProcessingConfig.PositiveAdjustments.class);
        final FloatRgbImage first = processor.process(input, adjustments);
        final FloatRgbImage second = processor.process(input, roundTripped);

        for (int x = 0; x < 2; x++) {
            for (int channel = 0; channel < 3; channel++) {
                assertThat(second.get(x, 0, channel)).isEqualTo(first.get(x, 0, channel));
            }
        }
    }

    private static ImageProcessingConfig.Curve curve(final ImageProcessingConfig.CurvePoint... points) {
        final ImageProcessingConfig.Curve curve = new ImageProcessingConfig.Curve();
        curve.setInterpolation("linear");
        curve.setPoints(List.of(points));
        return curve;
    }

    private static ImageProcessingConfig.CurvePoint point(final double x, final double y) {
        return new ImageProcessingConfig.CurvePoint(x, y);
    }
}
