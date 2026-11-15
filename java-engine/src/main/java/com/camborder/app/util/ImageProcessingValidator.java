package com.camborder.app.util;

import com.camborder.app.exception.ApiException;
import com.camborder.app.model.ImageProcessingConfig;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 底片数字化处理配置的结构校验（T02 冻结契约）。
 *
 * 这里只判断请求是否完整、有限、在范围内、组合合法；不执行 RAW 解码或负片算法。
 * 生产入口在结构校验通过后还会检查处理能力是否已落地（见 ensureFilmProcessingAvailable）。
 */
public final class ImageProcessingValidator {

    public static final String CODE_UNSUPPORTED_SCHEMA = "IMAGE_PROCESSING_UNSUPPORTED_SCHEMA";
    public static final String CODE_UNSUPPORTED_ALGORITHM = "IMAGE_PROCESSING_UNSUPPORTED_ALGORITHM";
    public static final String CODE_INVALID_INPUT_MODE = "IMAGE_PROCESSING_INVALID_INPUT_MODE";
    public static final String CODE_MISSING_RAW_OPTIONS = "IMAGE_PROCESSING_MISSING_RAW_OPTIONS";
    public static final String CODE_UNSUPPORTED_OPTION = "IMAGE_PROCESSING_UNSUPPORTED_OPTION";
    public static final String CODE_INVALID_LINEAR_INPUT = "IMAGE_PROCESSING_INVALID_LINEAR_INPUT";
    public static final String CODE_INVALID_NEGATIVE = "IMAGE_PROCESSING_INVALID_NEGATIVE";
    public static final String CODE_INVALID_LIGHT_SOURCE = "IMAGE_PROCESSING_INVALID_LIGHT_SOURCE";
    public static final String CODE_INVALID_FILM_BASE = "IMAGE_PROCESSING_INVALID_FILM_BASE";
    public static final String CODE_INVALID_DENSITY = "IMAGE_PROCESSING_INVALID_DENSITY";
    public static final String CODE_INVALID_POSITIVE = "IMAGE_PROCESSING_INVALID_POSITIVE";
    public static final String CODE_INVALID_CURVE = "IMAGE_PROCESSING_INVALID_CURVE";
    public static final String CODE_INVALID_GEOMETRY = "IMAGE_PROCESSING_INVALID_GEOMETRY";
    public static final String CODE_NOT_AVAILABLE = "IMAGE_PROCESSING_NOT_AVAILABLE";
    public static final String CODE_FILM_OUTPUT_REQUIRED = "IMAGE_PROCESSING_FILM_OUTPUT_REQUIRED";
    public static final String CODE_FILM_OUTPUT_INVALID = "IMAGE_PROCESSING_FILM_OUTPUT_INVALID";
    public static final String CODE_INVALID_INPUT_SOURCE = "IMAGE_PROCESSING_INVALID_INPUT_SOURCE";
    public static final String CODE_INVALID_POLARITY = "IMAGE_PROCESSING_INVALID_POLARITY";
    public static final String CODE_INVALID_ENCODED_INPUT = "IMAGE_PROCESSING_INVALID_ENCODED_INPUT";
    public static final String CODE_INVALID_FLEXTIGHT_INPUT = "IMAGE_PROCESSING_INVALID_FLEXTIGHT_INPUT";

    public static final Set<String> INPUT_MODES = Set.of("sensor-raw", "linear-tiff");
    public static final Set<String> INPUT_SOURCES = Set.of(
            "camera-raw", "encoded-raster", "linear-tiff", "flextight-fff");
    public static final Set<String> FILM_POLARITIES = Set.of("positive", "color-negative");
    public static final Set<String> ANALYSIS_STAGES = Set.of("raw-linear", "base-positive", "current-positive");
    public static final Set<String> ANALYSIS_PURPOSES = Set.of("histogram", "neutral-balance");
    public static final Set<String> FILM_OUTPUTS = Set.of("srgb-jpeg", "tiff16-srgb", "tiff16-rec2020");
    public static final Set<String> ENCODED_COLOR_SPACES = Set.of(
            "embedded", "srgb", "adobe-rgb", "prophoto-rgb", "linear-srgb", "linear-rec2020");
    public static final Set<String> ALPHA_BACKGROUNDS = Set.of("white", "black");
    public static final Set<String> FLEXTIGHT_COLOR_SPACES = Set.of("linear-srgb", "linear-rec2020");
    public static final Set<String> LIGHT_SOURCE_KINDS = Set.of("camera-white-balance", "calibration");
    public static final Set<String> FILM_BASE_KINDS = Set.of("roi", "reference-frame", "manual");
    public static final Set<String> FILM_BASE_STAGES = Set.of("linear-camera-rgb", "linear-working");
    public static final Set<String> RAW_WHITE_BALANCES = Set.of("camera", "daylight");
    public static final Set<String> RAW_HIGHLIGHTS = Set.of("clip", "unclip");
    public static final Set<String> RAW_CROPS = Set.of("vendor-inset", "full-sensor");
    public static final Set<String> LINEAR_COLOR_SPACES = Set.of("linear-srgb", "linear-rec2020", "linear-camera-rgb");
    public static final String PROFILE_GENERIC = "generic-color-negative-v1";

    private static final double EPSILON = 1e-9;
    private static final int MIN_CURVE_POINTS = 2;
    private static final int MAX_CURVE_POINTS = 17;
    private static final Pattern SHA256 = Pattern.compile("^[0-9a-fA-F]{64}$");

    private ImageProcessingValidator() { }

    /** 结构校验；null 表示普通模式，直接通过。 */
    public static void validate(final ImageProcessingConfig config, final String prefix) {
        if (config == null) return;
        final boolean v2 = config.getSchemaVersion() == ImageProcessingConfig.SCHEMA_VERSION_V2;
        if (v2) {
            require(ImageProcessingConfig.ALGORITHM_VERSION_V2.equals(config.getAlgorithmVersion()),
                    prefix + "imageProcessing.algorithmVersion is unsupported", CODE_UNSUPPORTED_ALGORITHM);
            validateV2(config, prefix);
            return;
        }
        require(config.getSchemaVersion() == ImageProcessingConfig.SCHEMA_VERSION_V1,
                prefix + "imageProcessing.schemaVersion is unsupported", CODE_UNSUPPORTED_SCHEMA);
        require(ImageProcessingConfig.ALGORITHM_VERSION_V1.equals(config.getAlgorithmVersion()),
                prefix + "imageProcessing.algorithmVersion is unsupported", CODE_UNSUPPORTED_ALGORITHM);
        final String inputMode = config.getInputMode();
        require(inputMode != null && INPUT_MODES.contains(inputMode),
                prefix + "imageProcessing.inputMode must be sensor-raw or linear-tiff",
                CODE_INVALID_INPUT_MODE);

        if ("sensor-raw".equals(inputMode)) {
            require(config.getRaw() != null, prefix + "imageProcessing.raw is required for sensor-raw",
                    CODE_MISSING_RAW_OPTIONS);
            require(config.getLinearInput() == null,
                    prefix + "imageProcessing.linearInput must be omitted for sensor-raw",
                    CODE_INVALID_LINEAR_INPUT);
            validateRaw(config.getRaw(), prefix);
        } else {
            require(config.getLinearInput() != null,
                    prefix + "imageProcessing.linearInput is required for linear-tiff",
                    CODE_INVALID_LINEAR_INPUT);
            require(config.getRaw() == null,
                    prefix + "imageProcessing.raw must be omitted for linear-tiff",
                    CODE_INVALID_LINEAR_INPUT);
            validateLinearInput(config.getLinearInput(), prefix);
        }

        if (config.getNegative() != null) validateNegative(config.getNegative(), prefix);
        if (config.getPositive() != null) validatePositive(config.getPositive(), prefix);
        if (config.getSourceGeometry() != null) validateGeometry(config.getSourceGeometry(), prefix);
    }

    /** v2：输入来源与正负性质分离；正片跳过反相，彩负必须完整配置。 */
    private static void validateV2(final ImageProcessingConfig config, final String prefix) {
        final String source = config.getInputSource();
        require(source != null && INPUT_SOURCES.contains(source),
                prefix + "imageProcessing.inputSource is unsupported", CODE_INVALID_INPUT_SOURCE);
        final String polarity = config.getFilmPolarity();
        require(polarity != null && FILM_POLARITIES.contains(polarity),
                prefix + "imageProcessing.filmPolarity must be positive or color-negative",
                CODE_INVALID_POLARITY);
        require(config.getInputMode() == null,
                prefix + "imageProcessing.inputMode must be omitted in schemaVersion 2",
                CODE_INVALID_INPUT_MODE);

        if ("camera-raw".equals(source)) {
            require(config.getRaw() != null,
                    prefix + "imageProcessing.raw is required for camera-raw", CODE_MISSING_RAW_OPTIONS);
            requireNullInputs(config, prefix, "encodedInput", "linearInput", "flextightInput");
            validateRaw(config.getRaw(), prefix);
        } else if ("encoded-raster".equals(source)) {
            require(config.getEncodedInput() != null,
                    prefix + "imageProcessing.encodedInput is required for encoded-raster",
                    CODE_INVALID_ENCODED_INPUT);
            requireNullInputs(config, prefix, "raw", "linearInput", "flextightInput");
            validateEncodedInput(config.getEncodedInput(), prefix);
        } else if ("linear-tiff".equals(source)) {
            require(config.getLinearInput() != null,
                    prefix + "imageProcessing.linearInput is required for linear-tiff",
                    CODE_INVALID_LINEAR_INPUT);
            requireNullInputs(config, prefix, "raw", "encodedInput", "flextightInput");
            validateLinearInput(config.getLinearInput(), prefix);
        } else {
            require(config.getFlextightInput() != null,
                    prefix + "imageProcessing.flextightInput is required for flextight-fff",
                    CODE_INVALID_FLEXTIGHT_INPUT);
            requireNullInputs(config, prefix, "raw", "linearInput", "encodedInput");
            validateFlextightInput(config.getFlextightInput(), prefix);
        }

        if ("positive".equals(polarity)) {
            require(config.getNegative() == null || !config.getNegative().isEnabled(),
                    prefix + "imageProcessing.negative must be disabled for positive polarity",
                    CODE_INVALID_NEGATIVE);
        } else {
            require(config.getNegative() != null && config.getNegative().isEnabled(),
                    prefix + "imageProcessing.negative is required for color-negative",
                    CODE_INVALID_NEGATIVE);
            validateNegative(config.getNegative(), prefix);
        }
        if (config.getPositive() != null) validatePositive(config.getPositive(), prefix);
        if (config.getSourceGeometry() != null) validateGeometry(config.getSourceGeometry(), prefix);
    }

    private static void requireNullInputs(final ImageProcessingConfig config, final String prefix,
                                          final String... fields) {
        for (String field : fields) {
            final boolean present;
            switch (field) {
                case "raw": present = config.getRaw() != null; break;
                case "encodedInput": present = config.getEncodedInput() != null; break;
                case "linearInput": present = config.getLinearInput() != null; break;
                case "flextightInput": present = config.getFlextightInput() != null; break;
                default: present = false;
            }
            require(!present, prefix + "imageProcessing." + field
                    + " is not allowed for inputSource=" + config.getInputSource(),
                    "raw".equals(field) || "encodedInput".equals(field) || "flextightInput".equals(field)
                            ? CODE_INVALID_INPUT_SOURCE : CODE_INVALID_LINEAR_INPUT);
        }
    }

    private static void validateEncodedInput(final ImageProcessingConfig.EncodedInput input,
                                             final String prefix) {
        require(input.getColorSpace() != null && ENCODED_COLOR_SPACES.contains(input.getColorSpace()),
                prefix + "imageProcessing.encodedInput.colorSpace is unsupported",
                CODE_INVALID_ENCODED_INPUT);
        require(input.getBitDepth() == 8 || input.getBitDepth() == 16,
                prefix + "imageProcessing.encodedInput.bitDepth must be 8 or 16",
                CODE_INVALID_ENCODED_INPUT);
        require(input.getAlphaBackground() != null
                        && ALPHA_BACKGROUNDS.contains(input.getAlphaBackground()),
                prefix + "imageProcessing.encodedInput.alphaBackground must be white or black",
                CODE_INVALID_ENCODED_INPUT);
        if ("embedded".equals(input.getColorSpace())) {
            require(input.getIccSha256() != null && SHA256.matcher(input.getIccSha256()).matches(),
                    prefix + "imageProcessing.encodedInput.iccSha256 is required for embedded colorSpace",
                    CODE_INVALID_ENCODED_INPUT);
        } else if (input.getIccSha256() != null && !input.getIccSha256().isBlank()) {
            require(SHA256.matcher(input.getIccSha256()).matches(),
                    prefix + "imageProcessing.encodedInput.iccSha256 must be a SHA-256 hex string",
                    CODE_INVALID_ENCODED_INPUT);
        }
    }

    private static void validateFlextightInput(final ImageProcessingConfig.FlextightInput input,
                                               final String prefix) {
        require("flextight".equals(input.getDevice()),
                prefix + "imageProcessing.flextightInput.device must be flextight",
                CODE_INVALID_FLEXTIGHT_INPUT);
        require("rgb16".equals(input.getMainImage()),
                prefix + "imageProcessing.flextightInput.mainImage must be rgb16",
                CODE_INVALID_FLEXTIGHT_INPUT);
        require("linear".equals(input.getTransferFunction()),
                prefix + "imageProcessing.flextightInput.transferFunction must be linear",
                CODE_INVALID_FLEXTIGHT_INPUT);
        require(input.getColorSpace() != null
                        && FLEXTIGHT_COLOR_SPACES.contains(input.getColorSpace()),
                prefix + "imageProcessing.flextightInput.colorSpace must be linear-srgb or linear-rec2020",
                CODE_INVALID_FLEXTIGHT_INPUT);
        require(input.getBitDepth() == 16,
                prefix + "imageProcessing.flextightInput.bitDepth must be 16",
                CODE_INVALID_FLEXTIGHT_INPUT);
        if (input.getIccSha256() != null && !input.getIccSha256().isBlank()) {
            require(SHA256.matcher(input.getIccSha256()).matches(),
                    prefix + "imageProcessing.flextightInput.iccSha256 must be a SHA-256 hex string",
                    CODE_INVALID_FLEXTIGHT_INPUT);
        }
    }

    private static void validateRaw(final ImageProcessingConfig.RawOptions raw, final String prefix) {
        require(raw.getWhiteBalance() != null && RAW_WHITE_BALANCES.contains(raw.getWhiteBalance()),
                prefix + "imageProcessing.raw.whiteBalance must be camera or daylight",
                CODE_UNSUPPORTED_OPTION);
        require(!raw.isAutoBright(),
                prefix + "imageProcessing.raw.autoBright=true is not supported",
                CODE_UNSUPPORTED_OPTION);
        require("linear".equals(raw.getGamma()),
                prefix + "imageProcessing.raw.gamma must be linear",
                CODE_UNSUPPORTED_OPTION);
        require(raw.getHighlight() != null && RAW_HIGHLIGHTS.contains(raw.getHighlight()),
                prefix + "imageProcessing.raw.highlight must be clip or unclip",
                CODE_UNSUPPORTED_OPTION);
        require(raw.getCrop() != null && RAW_CROPS.contains(raw.getCrop()),
                prefix + "imageProcessing.raw.crop must be vendor-inset or full-sensor",
                CODE_UNSUPPORTED_OPTION);
    }

    private static void validateLinearInput(final ImageProcessingConfig.LinearInput input,
                                            final String prefix) {
        require("linear".equals(input.getTransferFunction()),
                prefix + "imageProcessing.linearInput.transferFunction must be linear",
                CODE_INVALID_LINEAR_INPUT);
        require(input.getColorSpace() != null && LINEAR_COLOR_SPACES.contains(input.getColorSpace()),
                prefix + "imageProcessing.linearInput.colorSpace is invalid",
                CODE_INVALID_LINEAR_INPUT);
        require(input.getBitDepth() == 16,
                prefix + "imageProcessing.linearInput.bitDepth must be 16",
                CODE_INVALID_LINEAR_INPUT);
        if (input.getIccSha256() != null && !input.getIccSha256().isBlank()) {
            require(SHA256.matcher(input.getIccSha256()).matches(),
                    prefix + "imageProcessing.linearInput.iccSha256 must be a SHA-256 hex string",
                    CODE_INVALID_LINEAR_INPUT);
        }
    }

    private static void validateNegative(final ImageProcessingConfig.NegativeConfig negative,
                                         final String prefix) {
        require(PROFILE_GENERIC.equals(negative.getProfile()),
                prefix + "imageProcessing.negative.profile is unsupported",
                CODE_INVALID_NEGATIVE);
        if (!negative.isEnabled()) return;
        require(negative.getLightSource() != null,
                prefix + "imageProcessing.negative.lightSource is required when enabled",
                CODE_INVALID_NEGATIVE);
        require(negative.getFilmBase() != null,
                prefix + "imageProcessing.negative.filmBase is required when enabled",
                CODE_INVALID_NEGATIVE);
        require(negative.getDensity() != null,
                prefix + "imageProcessing.negative.density is required when enabled",
                CODE_INVALID_NEGATIVE);
        validateLightSource(negative.getLightSource(), prefix);
        validateFilmBase(negative.getFilmBase(), prefix);
        validateDensity(negative.getDensity(), prefix);
    }

    private static void validateLightSource(final ImageProcessingConfig.LightSourceConfig source,
                                            final String prefix) {
        require(source.getKind() != null && LIGHT_SOURCE_KINDS.contains(source.getKind()),
                prefix + "imageProcessing.negative.lightSource.kind is invalid",
                CODE_INVALID_LIGHT_SOURCE);
        if ("camera-white-balance".equals(source.getKind())) {
            require(source.getRgbGain() == null,
                    prefix + "imageProcessing.negative.lightSource.rgbGain must be omitted for camera-white-balance",
                    CODE_INVALID_LIGHT_SOURCE);
            return;
        }
        final boolean hasId = source.getCalibrationId() != null && !source.getCalibrationId().isBlank();
        final boolean hasGain = source.getRgbGain() != null;
        final boolean hasReference = source.getReferenceImagePath() != null
                && !source.getReferenceImagePath().isBlank();
        require(hasId || hasGain || hasReference,
                prefix + "imageProcessing.negative.lightSource.calibration needs an id, gain or reference",
                CODE_INVALID_LIGHT_SOURCE);
        if (hasGain) {
            requireFiniteRange(source.getRgbGain(), 3, 0.1, 10.0,
                    prefix + "imageProcessing.negative.lightSource.rgbGain", CODE_INVALID_LIGHT_SOURCE);
        }
        validateCalibrationVersion(source.getCalibrationVersion(), prefix, CODE_INVALID_LIGHT_SOURCE);
        if (source.getReferenceFingerprint() != null) {
            require(SHA256.matcher(source.getReferenceFingerprint()).matches(),
                    prefix + "imageProcessing.negative.lightSource.referenceFingerprint must be a SHA-256 hex string",
                    CODE_INVALID_LIGHT_SOURCE);
            require(hasReference,
                    prefix + "imageProcessing.negative.lightSource.referenceFingerprint requires referenceImagePath",
                    CODE_INVALID_LIGHT_SOURCE);
        }
    }

    private static void validateFilmBase(final ImageProcessingConfig.FilmBaseConfig base,
                                         final String prefix) {
        require(base.getKind() != null && FILM_BASE_KINDS.contains(base.getKind()),
                prefix + "imageProcessing.negative.filmBase.kind is invalid",
                CODE_INVALID_FILM_BASE);
        require(base.getStage() != null && FILM_BASE_STAGES.contains(base.getStage()),
                prefix + "imageProcessing.negative.filmBase.stage is invalid",
                CODE_INVALID_FILM_BASE);
        if (base.getRoi() != null) validateCrop(base.getRoi(), prefix + "imageProcessing.negative.filmBase.roi",
                CODE_INVALID_FILM_BASE, 0.001);
        if ("roi".equals(base.getKind())) {
            require(base.getRoi() != null,
                    prefix + "imageProcessing.negative.filmBase.roi is required for kind=roi",
                    CODE_INVALID_FILM_BASE);
        } else if ("reference-frame".equals(base.getKind())) {
            require(base.getReferenceImagePath() != null && !base.getReferenceImagePath().isBlank(),
                    prefix + "imageProcessing.negative.filmBase.referenceImagePath is required for reference-frame",
                    CODE_INVALID_FILM_BASE);
        } else {
            requireFiniteRange(base.getRgb(), 3, 0.0, 4.0,
                    prefix + "imageProcessing.negative.filmBase.rgb", CODE_INVALID_FILM_BASE);
        }
        if (base.getReferenceFingerprint() != null) {
            require(SHA256.matcher(base.getReferenceFingerprint()).matches(),
                    prefix + "imageProcessing.negative.filmBase.referenceFingerprint must be a SHA-256 hex string",
                    CODE_INVALID_FILM_BASE);
        }
        validateCalibrationVersion(base.getCalibrationVersion(), prefix, CODE_INVALID_FILM_BASE);
    }

    private static void validateDensity(final ImageProcessingConfig.DensityConfig density,
                                        final String prefix) {
        require(Double.isFinite(density.getMin()) && Double.isFinite(density.getMax()),
                prefix + "imageProcessing.negative.density values must be finite",
                CODE_INVALID_DENSITY);
        require(density.getMin() >= 0 && density.getMax() <= 6 && density.getMax() - density.getMin() >= 0.1,
                prefix + "imageProcessing.negative.density range must satisfy 0 <= min < min+0.1 <= max <= 6",
                CODE_INVALID_DENSITY);
    }

    private static void validatePositive(final ImageProcessingConfig.PositiveAdjustments positive,
                                         final String prefix) {
        requireFinite(positive.getExposureEv(), prefix + "imageProcessing.positive.exposureEv",
                CODE_INVALID_POSITIVE);
        require(positive.getExposureEv() >= -5 && positive.getExposureEv() <= 5,
                prefix + "imageProcessing.positive.exposureEv must be between -5 and 5",
                CODE_INVALID_POSITIVE);
        requireFiniteRange(positive.getRgbBalanceEv(), 3, -4.0, 4.0,
                prefix + "imageProcessing.positive.rgbBalanceEv", CODE_INVALID_POSITIVE);
        requireFinite(positive.getBlackPoint(), prefix + "imageProcessing.positive.blackPoint",
                CODE_INVALID_POSITIVE);
        requireFinite(positive.getWhitePoint(), prefix + "imageProcessing.positive.whitePoint",
                CODE_INVALID_POSITIVE);
        require(positive.getBlackPoint() >= 0 && positive.getBlackPoint() < 1,
                prefix + "imageProcessing.positive.blackPoint must be between 0 (inclusive) and 1",
                CODE_INVALID_POSITIVE);
        require(positive.getWhitePoint() > positive.getBlackPoint() && positive.getWhitePoint() <= 1,
                prefix + "imageProcessing.positive.whitePoint must be greater than blackPoint and <= 1",
                CODE_INVALID_POSITIVE);
        requireFinite(positive.getSaturation(), prefix + "imageProcessing.positive.saturation",
                CODE_INVALID_POSITIVE);
        require(positive.getSaturation() >= 0 && positive.getSaturation() <= 2,
                prefix + "imageProcessing.positive.saturation must be between 0 and 2",
                CODE_INVALID_POSITIVE);
        validateCurve(positive.getMasterCurve(), prefix + "imageProcessing.positive.masterCurve");
        validateCurve(positive.getRedCurve(), prefix + "imageProcessing.positive.redCurve");
        validateCurve(positive.getGreenCurve(), prefix + "imageProcessing.positive.greenCurve");
        validateCurve(positive.getBlueCurve(), prefix + "imageProcessing.positive.blueCurve");
    }

    private static void validateCurve(final ImageProcessingConfig.Curve curve, final String prefix) {
        if (curve == null) return;
        require("linear".equals(curve.getInterpolation()),
                prefix + ".interpolation must be linear", CODE_INVALID_CURVE);
        final List<ImageProcessingConfig.CurvePoint> points = curve.getPoints();
        require(points != null && points.size() >= MIN_CURVE_POINTS && points.size() <= MAX_CURVE_POINTS,
                prefix + ".points must contain between 2 and 17 points", CODE_INVALID_CURVE);
        double previousX = -1;
        double previousY = -1;
        for (int index = 0; index < points.size(); index++) {
            final ImageProcessingConfig.CurvePoint point = points.get(index);
            require(point != null && Double.isFinite(point.getX()) && Double.isFinite(point.getY()),
                    prefix + ".points[" + index + "] must be finite", CODE_INVALID_CURVE);
            require(point.getX() >= 0 && point.getX() <= 1 && point.getY() >= 0 && point.getY() <= 1,
                    prefix + ".points[" + index + "] must be within [0,1]", CODE_INVALID_CURVE);
            if (index == 0) {
                require(Math.abs(point.getX()) <= EPSILON && Math.abs(point.getY()) <= EPSILON,
                        prefix + " must start at (0,0)", CODE_INVALID_CURVE);
            } else {
                require(point.getX() > previousX,
                        prefix + ".points x must be strictly increasing", CODE_INVALID_CURVE);
                require(point.getY() >= previousY,
                        prefix + ".points y must be monotonic non-decreasing", CODE_INVALID_CURVE);
            }
            previousX = point.getX();
            previousY = point.getY();
        }
        final ImageProcessingConfig.CurvePoint last = points.get(points.size() - 1);
        require(Math.abs(last.getX() - 1) <= EPSILON && Math.abs(last.getY() - 1) <= EPSILON,
                prefix + " must end at (1,1)", CODE_INVALID_CURVE);
    }

    private static void validateGeometry(final ImageProcessingConfig.SourceGeometry geometry,
                                         final String prefix) {
        require(geometry.getCrop() != null,
                prefix + "imageProcessing.sourceGeometry.crop is required",
                CODE_INVALID_GEOMETRY);
        validateCrop(geometry.getCrop(), prefix + "imageProcessing.sourceGeometry.crop",
                CODE_INVALID_GEOMETRY, 0.01);
        requireFinite(geometry.getRotationDegrees(),
                prefix + "imageProcessing.sourceGeometry.rotationDegrees", CODE_INVALID_GEOMETRY);
        require(geometry.getRotationDegrees() >= -45 && geometry.getRotationDegrees() <= 45,
                prefix + "imageProcessing.sourceGeometry.rotationDegrees must be between -45 and 45",
                CODE_INVALID_GEOMETRY);
    }

    private static void validateCrop(final ImageProcessingConfig.NormalizedCrop crop, final String prefix,
                                     final String code, final double minimumSize) {
        require(crop != null && Double.isFinite(crop.getX()) && Double.isFinite(crop.getY())
                        && Double.isFinite(crop.getWidth()) && Double.isFinite(crop.getHeight()),
                prefix + " must be finite", code);
        require(crop.getX() >= 0 && crop.getY() >= 0
                        && crop.getWidth() >= minimumSize && crop.getHeight() >= minimumSize
                        && crop.getX() + crop.getWidth() <= 1 + EPSILON
                        && crop.getY() + crop.getHeight() <= 1 + EPSILON,
                prefix + " must be a normalized rectangle inside the source", code);
    }

    private static void requireFinite(final double value, final String name, final String code) {
        require(Double.isFinite(value), name + " must be finite", code);
    }

    private static void requireFiniteRange(final double[] values, final int length,
                                           final double min, final double max,
                                           final String name, final String code) {
        require(values != null && values.length == length,
                name + " must contain exactly " + length + " values", code);
        for (int index = 0; index < values.length; index++) {
            require(Double.isFinite(values[index]) && values[index] >= min && values[index] <= max,
                    name + "[" + index + "] must be finite and between " + min + " and " + max, code);
        }
    }

    private static void validateCalibrationVersion(final Integer version, final String prefix,
                                                   final String code) {
        if (version == null) return;
        require(version >= 1, prefix + " calibrationVersion must be >= 1", code);
    }

    private static void require(final boolean condition, final String message, final String code) {
        if (!condition) {
            throw new ApiException(message, HttpStatus.BAD_REQUEST, code);
        }
    }

    /**
     * 底片模式生产入口的显式不可用闸门（导出仍依赖 T11 输出链路时使用）。
     * 预览/分析已可用，普通模式不受影响。
     */
    public static void ensureFilmProcessingAvailable(final ImageProcessingConfig config) {
        if (config == null) return;
        // v2 校色管线已实现；v1 的 501 闸门保留给旧生产入口/旧测试，
        // 避免旧代码把“结构合法”误当成“处理已完成”。
        if (config.getSchemaVersion() == ImageProcessingConfig.SCHEMA_VERSION_V2) return;
        throw new ApiException(
                "v1 底片数字化入口仍保留兼容闸门；请使用 v2 胶片校色配方",
                HttpStatus.NOT_IMPLEMENTED, CODE_NOT_AVAILABLE);
    }

    /** 校验底片模式的显式输出组合；普通模式 export.filmOutput 必须为 null。 */
    public static void validateFilmOutput(final com.camborder.app.dto.ExportSettings export,
                                          final ImageProcessingConfig config,
                                          final String prefix) {
        if (config == null) {
            if (export != null && export.getFilmOutput() != null) {
                throw new ApiException(prefix + "filmOutput 只能用于底片模式",
                        HttpStatus.BAD_REQUEST, CODE_FILM_OUTPUT_INVALID);
            }
            return;
        }
        if (export == null || export.getFilmOutput() == null || export.getFilmOutput().isBlank()) {
            throw new ApiException(prefix + "底片模式必须指定 filmOutput",
                    HttpStatus.BAD_REQUEST, CODE_FILM_OUTPUT_REQUIRED);
        }
        final String filmOutput = export.getFilmOutput();
        if (!FILM_OUTPUTS.contains(filmOutput)) {
            throw new ApiException(prefix + "filmOutput 非法",
                    HttpStatus.BAD_REQUEST, CODE_FILM_OUTPUT_INVALID);
        }
        final String expectedFormat = "srgb-jpeg".equals(filmOutput) ? "jpeg" : "tiff";
        if (export.getFormat() != null && !expectedFormat.equals(export.getFormat())) {
            throw new ApiException(prefix + "filmOutput 与 format 不匹配",
                    HttpStatus.BAD_REQUEST, CODE_FILM_OUTPUT_INVALID);
        }
    }
}
