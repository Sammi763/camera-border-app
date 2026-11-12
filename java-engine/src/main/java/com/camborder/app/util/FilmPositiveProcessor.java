package com.camborder.app.util;

import com.camborder.app.exception.FilmProcessingException;
import com.camborder.app.model.ImageProcessingConfig;
import org.springframework.http.HttpStatus;

import java.util.List;

/**
 * 正片基础调整与曲线（T06）。
 *
 * 冻结顺序：曝光 -> RGB 平衡 -> 黑白点 -> 总曲线 -> R/G/B 分通道曲线 -> 饱和度。
 * 所有步骤在 float32 线性工作图上进行；零调整必须是恒等映射（不夹断、不量化）。
 * 曲线只支持线性插值，输入域 [0,1]，越域先夹到端点；单调曲线不会反向或过冲。
 */
public final class FilmPositiveProcessor {

    public static final String ALGORITHM_VERSION = "film-positive-v1";
    public static final String CODE_INVALID_RANGE = "POSITIVE_INVALID_RANGE";
    public static final String CODE_INVALID_BLACK_WHITE = "POSITIVE_INVALID_BLACK_WHITE";
    public static final String CODE_INVALID_CURVE = "POSITIVE_INVALID_CURVE";

    private static final int MIN_CURVE_POINTS = 2;
    private static final int MAX_CURVE_POINTS = 17;
    private static final double EPSILON = 1e-9;

    public FloatRgbImage process(final FloatRgbImage input,
                                 final ImageProcessingConfig.PositiveAdjustments adjustments) {
        if (input == null) {
            throw new FilmProcessingException("正片调整输入为空",
                    HttpStatus.BAD_REQUEST, CODE_INVALID_RANGE);
        }
        if (adjustments == null) {
            return input.copy();
        }
        validate(adjustments);

        final float[] exposure = new float[3];
        final double global = Math.pow(2.0, adjustments.getExposureEv());
        final double[] balance = adjustments.getRgbBalanceEv();
        exposure[0] = (float) (global * Math.pow(2.0, balance[0]));
        exposure[1] = (float) (global * Math.pow(2.0, balance[1]));
        exposure[2] = (float) (global * Math.pow(2.0, balance[2]));

        final double black = adjustments.getBlackPoint();
        final double span = adjustments.getWhitePoint() - black;
        final double saturation = adjustments.getSaturation();
        final FloatRgbImage result = new FloatRgbImage(input.getWidth(), input.getHeight());
        final float[] rgb = new float[3];
        for (int y = 0; y < input.getHeight(); y++) {
            FilmRequestGuard.check();
            for (int x = 0; x < input.getWidth(); x++) {
                rgb[0] = input.get(x, y, 0) * exposure[0];
                rgb[1] = input.get(x, y, 1) * exposure[1];
                rgb[2] = input.get(x, y, 2) * exposure[2];

                for (int channel = 0; channel < 3; channel++) {
                    rgb[channel] = (float) ((rgb[channel] - black) / span);
                }
                if (adjustments.getMasterCurve() != null) {
                    for (int channel = 0; channel < 3; channel++) {
                        rgb[channel] = evaluate(adjustments.getMasterCurve(), rgb[channel]);
                    }
                }
                rgb[0] = applyCurve(adjustments.getRedCurve(), rgb[0]);
                rgb[1] = applyCurve(adjustments.getGreenCurve(), rgb[1]);
                rgb[2] = applyCurve(adjustments.getBlueCurve(), rgb[2]);

                if (saturation != 1.0) {
                    final double luma = 0.2627 * rgb[0] + 0.6780 * rgb[1] + 0.0593 * rgb[2];
                    for (int channel = 0; channel < 3; channel++) {
                        rgb[channel] = (float) (luma + (rgb[channel] - luma) * saturation);
                    }
                }
                if (!Float.isFinite(rgb[0]) || !Float.isFinite(rgb[1]) || !Float.isFinite(rgb[2])) {
                    throw new FilmProcessingException("正片调整产生非有限值",
                            HttpStatus.INTERNAL_SERVER_ERROR, CODE_INVALID_RANGE);
                }
                result.set(x, y, 0, rgb[0]);
                result.set(x, y, 1, rgb[1]);
                result.set(x, y, 2, rgb[2]);
            }
        }
        return result;
    }

    private static float applyCurve(final ImageProcessingConfig.Curve curve, final float value) {
        return curve == null ? value : evaluate(curve, value);
    }

    /** 线性插值；输入越域夹到 [0,1]；输出端点精确。 */
    static float evaluate(final ImageProcessingConfig.Curve curve, final float value) {
        final List<ImageProcessingConfig.CurvePoint> points = curve.getPoints();
        final double clamped = value <= 0 ? 0 : Math.min(value, 1.0);
        for (int index = 0; index < points.size() - 1; index++) {
            final ImageProcessingConfig.CurvePoint left = points.get(index);
            final ImageProcessingConfig.CurvePoint right = points.get(index + 1);
            if (clamped <= right.getX() + EPSILON) {
                if (right.getX() - left.getX() <= EPSILON) {
                    return (float) left.getY();
                }
                final double fraction = (clamped - left.getX()) / (right.getX() - left.getX());
                return (float) (left.getY() + (right.getY() - left.getY()) * fraction);
            }
        }
        return (float) points.get(points.size() - 1).getY();
    }

    private static void validate(final ImageProcessingConfig.PositiveAdjustments adjustments) {
        require(Double.isFinite(adjustments.getExposureEv())
                        && adjustments.getExposureEv() >= -5 && adjustments.getExposureEv() <= 5,
                "exposureEv 超出范围", CODE_INVALID_RANGE);
        final double[] balance = adjustments.getRgbBalanceEv();
        require(balance != null && balance.length == 3,
                "rgbBalanceEv 必须是 3 个值", CODE_INVALID_RANGE);
        for (double value : balance) {
            require(Double.isFinite(value) && value >= -4 && value <= 4,
                    "rgbBalanceEv 超出范围", CODE_INVALID_RANGE);
        }
        require(Double.isFinite(adjustments.getBlackPoint())
                        && adjustments.getBlackPoint() >= 0 && adjustments.getBlackPoint() < 1,
                "blackPoint 超出范围", CODE_INVALID_BLACK_WHITE);
        require(Double.isFinite(adjustments.getWhitePoint())
                        && adjustments.getWhitePoint() > adjustments.getBlackPoint()
                        && adjustments.getWhitePoint() <= 1,
                "whitePoint 必须大于 blackPoint 且 <= 1", CODE_INVALID_BLACK_WHITE);
        require(Double.isFinite(adjustments.getSaturation())
                        && adjustments.getSaturation() >= 0 && adjustments.getSaturation() <= 2,
                "saturation 超出范围", CODE_INVALID_RANGE);
        validateCurve(adjustments.getMasterCurve());
        validateCurve(adjustments.getRedCurve());
        validateCurve(adjustments.getGreenCurve());
        validateCurve(adjustments.getBlueCurve());
    }

    static void validateCurve(final ImageProcessingConfig.Curve curve) {
        if (curve == null) return;
        require("linear".equals(curve.getInterpolation()),
                "曲线只支持 linear 插值", CODE_INVALID_CURVE);
        final List<ImageProcessingConfig.CurvePoint> points = curve.getPoints();
        require(points != null && points.size() >= MIN_CURVE_POINTS && points.size() <= MAX_CURVE_POINTS,
                "曲线点数必须在 2–17 之间", CODE_INVALID_CURVE);
        double previousX = -1;
        double previousY = -1;
        for (int index = 0; index < points.size(); index++) {
            final ImageProcessingConfig.CurvePoint point = points.get(index);
            require(point != null && Double.isFinite(point.getX()) && Double.isFinite(point.getY()),
                    "曲线点必须是有限值", CODE_INVALID_CURVE);
            require(point.getX() >= 0 && point.getX() <= 1 && point.getY() >= 0 && point.getY() <= 1,
                    "曲线点必须在 [0,1]", CODE_INVALID_CURVE);
            if (index == 0) {
                require(Math.abs(point.getX()) <= EPSILON && Math.abs(point.getY()) <= EPSILON,
                        "曲线必须从 (0,0) 开始", CODE_INVALID_CURVE);
            } else {
                require(point.getX() > previousX, "曲线 x 必须严格递增", CODE_INVALID_CURVE);
                require(point.getY() >= previousY, "曲线 y 必须单调不减", CODE_INVALID_CURVE);
            }
            previousX = point.getX();
            previousY = point.getY();
        }
        final ImageProcessingConfig.CurvePoint last = points.get(points.size() - 1);
        require(Math.abs(last.getX() - 1) <= EPSILON && Math.abs(last.getY() - 1) <= EPSILON,
                "曲线必须到 (1,1) 结束", CODE_INVALID_CURVE);
    }

    private static void require(final boolean condition, final String message, final String code) {
        if (!condition) {
            throw new FilmProcessingException(message, HttpStatus.BAD_REQUEST, code);
        }
    }
}
