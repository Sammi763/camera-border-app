package com.camborder.app.model;

import java.util.ArrayList;
import java.util.List;

/**
 * RenderRecipe 的可选底片数字化处理配置（T02 冻结契约）。
 *
 * 缺省或为 null 时走普通模式：不读取传感器 RAW、不做负片转正、不改像素。
 * 存在时必须带 schemaVersion 与 algorithmVersion；字段、枚举、范围和默认值
 * 以 ADR-0007 的 T02 契约为准，校验统一由 ImageProcessingValidator 完成。
 *
 * 该模型只描述请求意图，不包含引擎内部实现（LibRaw 路径、临时文件、CMM 选择）。
 */
public final class ImageProcessingConfig {

    /** 当前唯一支持的 schema 版本。 */
    public static final int SCHEMA_VERSION = 1;

    /** 当前唯一支持的算法版本。 */
    public static final String ALGORITHM_VERSION = "film-digitization-v1";

    private int schemaVersion = SCHEMA_VERSION;
    private String algorithmVersion = ALGORITHM_VERSION;
    /** 输入模式：sensor-raw（真实传感器 RAW）或 linear-tiff（显式线性测试输入）。 */
    private String inputMode;
    private RawOptions raw;
    private LinearInput linearInput;
    private NegativeConfig negative;
    private PositiveAdjustments positive = new PositiveAdjustments();
    private SourceGeometry sourceGeometry = new SourceGeometry();

    public int getSchemaVersion() { return schemaVersion; }
    public void setSchemaVersion(final int schemaVersion) { this.schemaVersion = schemaVersion; }
    public String getAlgorithmVersion() { return algorithmVersion; }
    public void setAlgorithmVersion(final String algorithmVersion) { this.algorithmVersion = algorithmVersion; }
    public String getInputMode() { return inputMode; }
    public void setInputMode(final String inputMode) { this.inputMode = inputMode; }
    public RawOptions getRaw() { return raw; }
    public void setRaw(final RawOptions raw) { this.raw = raw; }
    public LinearInput getLinearInput() { return linearInput; }
    public void setLinearInput(final LinearInput linearInput) { this.linearInput = linearInput; }
    public NegativeConfig getNegative() { return negative; }
    public void setNegative(final NegativeConfig negative) { this.negative = negative; }
    public PositiveAdjustments getPositive() { return positive; }
    public void setPositive(final PositiveAdjustments positive) { this.positive = positive; }
    public SourceGeometry getSourceGeometry() { return sourceGeometry; }
    public void setSourceGeometry(final SourceGeometry sourceGeometry) { this.sourceGeometry = sourceGeometry; }

    /** 真实传感器 RAW 的解码选项；第一版禁止隐式自动变化。 */
    public static final class RawOptions {
        /** 白平衡来源：camera 使用相机记录，daylight 使用固定日光系数。 */
        private String whiteBalance = "camera";
        /** 是否自动提亮；第一版只允许 false，true 明确拒绝。 */
        private boolean autoBright = false;
        /** 输出传递函数；第一版只允许 linear。 */
        private String gamma = "linear";
        /** 高光处理：clip 或 unclip。 */
        private String highlight = "clip";
        /** 裁切方式：vendor-inset 使用厂商有效区域，full-sensor 使用完整传感器区域。 */
        private String crop = "vendor-inset";

        public String getWhiteBalance() { return whiteBalance; }
        public void setWhiteBalance(final String whiteBalance) { this.whiteBalance = whiteBalance; }
        public boolean isAutoBright() { return autoBright; }
        public void setAutoBright(final boolean autoBright) { this.autoBright = autoBright; }
        public String getGamma() { return gamma; }
        public void setGamma(final String gamma) { this.gamma = gamma; }
        public String getHighlight() { return highlight; }
        public void setHighlight(final String highlight) { this.highlight = highlight; }
        public String getCrop() { return crop; }
        public void setCrop(final String crop) { this.crop = crop; }
    }

    /** 显式线性栅格输入的解释方式；无 ICC/未知传递函数不得猜成线性。 */
    public static final class LinearInput {
        private String transferFunction = "linear";
        /** 线性色彩空间：linear-srgb / linear-rec2020 / linear-camera-rgb。 */
        private String colorSpace;
        private int bitDepth = 16;
        /** 输入 ICC 的内容指纹；没有 ICC 时必须为 null，并依赖显式 colorSpace。 */
        private String iccSha256;

        public String getTransferFunction() { return transferFunction; }
        public void setTransferFunction(final String transferFunction) { this.transferFunction = transferFunction; }
        public String getColorSpace() { return colorSpace; }
        public void setColorSpace(final String colorSpace) { this.colorSpace = colorSpace; }
        public int getBitDepth() { return bitDepth; }
        public void setBitDepth(final int bitDepth) { this.bitDepth = bitDepth; }
        public String getIccSha256() { return iccSha256; }
        public void setIccSha256(final String iccSha256) { this.iccSha256 = iccSha256; }
    }

    /** 负片参数：光源校准、片基参考、密度模型与转换配置。 */
    public static final class NegativeConfig {
        private String calibrationSpaceKey;
        public String getCalibrationSpaceKey() { return calibrationSpaceKey; }
        public void setCalibrationSpaceKey(final String value) { calibrationSpaceKey = value; }
        private boolean enabled = true;
        private LightSourceConfig lightSource;
        private FilmBaseConfig filmBase;
        private DensityConfig density;
        /** 转换配置：第一版只允许通用彩负，Gold/Portra 需有校准证据后再登记。 */
        private String profile = "generic-color-negative-v1";

        public boolean isEnabled() { return enabled; }
        public void setEnabled(final boolean enabled) { this.enabled = enabled; }
        public LightSourceConfig getLightSource() { return lightSource; }
        public void setLightSource(final LightSourceConfig lightSource) { this.lightSource = lightSource; }
        public FilmBaseConfig getFilmBase() { return filmBase; }
        public void setFilmBase(final FilmBaseConfig filmBase) { this.filmBase = filmBase; }
        public DensityConfig getDensity() { return density; }
        public void setDensity(final DensityConfig density) { this.density = density; }
        public String getProfile() { return profile; }
        public void setProfile(final String profile) { this.profile = profile; }
    }

    /** 翻拍光源校准；引用必须能解析为可复现的有效数值。 */
    public static final class LightSourceConfig {
        /** camera-white-balance 或 calibration。 */
        private String kind = "camera-white-balance";
        private String calibrationId;
        private Integer calibrationVersion;
        /** 线性工作空间的光源增益，长度 3；kind=calibration 时可用数值替代引用。 */
        private double[] rgbGain;
        /** 参考帧路径与内容指纹；与 calibrationId 二选一或同时存在。 */
        private String referenceImagePath;
        private String referenceFingerprint;

        public String getKind() { return kind; }
        public void setKind(final String kind) { this.kind = kind; }
        public String getCalibrationId() { return calibrationId; }
        public void setCalibrationId(final String calibrationId) { this.calibrationId = calibrationId; }
        public Integer getCalibrationVersion() { return calibrationVersion; }
        public void setCalibrationVersion(final Integer calibrationVersion) { this.calibrationVersion = calibrationVersion; }
        public double[] getRgbGain() { return rgbGain; }
        public void setRgbGain(final double[] rgbGain) { this.rgbGain = rgbGain; }
        public String getReferenceImagePath() { return referenceImagePath; }
        public void setReferenceImagePath(final String referenceImagePath) { this.referenceImagePath = referenceImagePath; }
        public String getReferenceFingerprint() { return referenceFingerprint; }
        public void setReferenceFingerprint(final String referenceFingerprint) { this.referenceFingerprint = referenceFingerprint; }
    }

    /** 片基参考；可来自同图 ROI、同卷参考帧或手工数值。 */
    public static final class FilmBaseConfig {
        /** roi / reference-frame / manual。 */
        private String kind = "roi";
        /** 同图 ROI，归一化源图坐标（已应用 EXIF 方向，未应用编辑几何）。 */
        private NormalizedCrop roi;
        private String referenceImagePath;
        private String referenceFingerprint;
        /** 手工片基 RGB（线性值，长度 3）。 */
        private double[] rgb;
        /** 参考所在阶段：linear-camera-rgb 或 linear-working。 */
        private String stage = "linear-working";
        private String calibrationId;
        private Integer calibrationVersion;

        public String getKind() { return kind; }
        public void setKind(final String kind) { this.kind = kind; }
        public NormalizedCrop getRoi() { return roi; }
        public void setRoi(final NormalizedCrop roi) { this.roi = roi; }
        public String getReferenceImagePath() { return referenceImagePath; }
        public void setReferenceImagePath(final String referenceImagePath) { this.referenceImagePath = referenceImagePath; }
        public String getReferenceFingerprint() { return referenceFingerprint; }
        public void setReferenceFingerprint(final String referenceFingerprint) { this.referenceFingerprint = referenceFingerprint; }
        public double[] getRgb() { return rgb; }
        public void setRgb(final double[] rgb) { this.rgb = rgb; }
        public String getStage() { return stage; }
        public void setStage(final String stage) { this.stage = stage; }
        public String getCalibrationId() { return calibrationId; }
        public void setCalibrationId(final String calibrationId) { this.calibrationId = calibrationId; }
        public Integer getCalibrationVersion() { return calibrationVersion; }
        public void setCalibrationVersion(final Integer calibrationVersion) { this.calibrationVersion = calibrationVersion; }
    }

    /** 密度范围（D = -log10(T)），用于正片映射；不含自动估计。 */
    public static final class DensityConfig {
        private double min = 0.0;
        private double max = 3.0;

        public double getMin() { return min; }
        public void setMin(final double min) { this.min = min; }
        public double getMax() { return max; }
        public void setMax(final double max) { this.max = max; }
    }

    /** 正片调整；零调整必须是恒等映射。 */
    public static final class PositiveAdjustments {
        private double exposureEv = 0;
        /** 每通道 EV 偏移，长度 3，零值恒等。 */
        private double[] rgbBalanceEv = new double[]{0, 0, 0};
        private double blackPoint = 0;
        private double whitePoint = 1;
        private double saturation = 1;
        private Curve masterCurve;
        private Curve redCurve;
        private Curve greenCurve;
        private Curve blueCurve;

        public double getExposureEv() { return exposureEv; }
        public void setExposureEv(final double exposureEv) { this.exposureEv = exposureEv; }
        public double[] getRgbBalanceEv() { return rgbBalanceEv; }
        public void setRgbBalanceEv(final double[] rgbBalanceEv) { this.rgbBalanceEv = rgbBalanceEv; }
        public double getBlackPoint() { return blackPoint; }
        public void setBlackPoint(final double blackPoint) { this.blackPoint = blackPoint; }
        public double getWhitePoint() { return whitePoint; }
        public void setWhitePoint(final double whitePoint) { this.whitePoint = whitePoint; }
        public double getSaturation() { return saturation; }
        public void setSaturation(final double saturation) { this.saturation = saturation; }
        public Curve getMasterCurve() { return masterCurve; }
        public void setMasterCurve(final Curve masterCurve) { this.masterCurve = masterCurve; }
        public Curve getRedCurve() { return redCurve; }
        public void setRedCurve(final Curve redCurve) { this.redCurve = redCurve; }
        public Curve getGreenCurve() { return greenCurve; }
        public void setGreenCurve(final Curve greenCurve) { this.greenCurve = greenCurve; }
        public Curve getBlueCurve() { return blueCurve; }
        public void setBlueCurve(final Curve blueCurve) { this.blueCurve = blueCurve; }
    }

    /** 单调曲线；第一版只允许线性插值，端点固定为 (0,0) 与 (1,1)。 */
    public static final class Curve {
        private String interpolation = "linear";
        private List<CurvePoint> points = new ArrayList<>();

        public String getInterpolation() { return interpolation; }
        public void setInterpolation(final String interpolation) { this.interpolation = interpolation; }
        public List<CurvePoint> getPoints() { return points; }
        public void setPoints(final List<CurvePoint> points) { this.points = points; }
    }

    /** 归一化曲线控制点。 */
    public static final class CurvePoint {
        private double x;
        private double y;

        public CurvePoint() { }

        public CurvePoint(final double x, final double y) {
            this.x = x;
            this.y = y;
        }

        public double getX() { return x; }
        public void setX(final double x) { this.x = x; }
        public double getY() { return y; }
        public void setY(final double y) { this.y = y; }
    }

    /** 源图几何：裁切与校平，独立于版式 imagePlacement。 */
    public static final class SourceGeometry {
        private NormalizedCrop crop = new NormalizedCrop();
        /** 校平角度，围绕裁切区域中心旋转；输出取同比例最大内接矩形。 */
        private double rotationDegrees = 0;

        public NormalizedCrop getCrop() { return crop; }
        public void setCrop(final NormalizedCrop crop) { this.crop = crop; }
        public double getRotationDegrees() { return rotationDegrees; }
        public void setRotationDegrees(final double rotationDegrees) { this.rotationDegrees = rotationDegrees; }
    }

    /** 归一化矩形；坐标基于已应用 EXIF 方向、未应用编辑几何的完整源图。 */
    public static final class NormalizedCrop {
        private double x = 0;
        private double y = 0;
        private double width = 1;
        private double height = 1;

        public NormalizedCrop() { }

        public NormalizedCrop(final double x, final double y, final double width, final double height) {
            this.x = x;
            this.y = y;
            this.width = width;
            this.height = height;
        }

        public double getX() { return x; }
        public void setX(final double x) { this.x = x; }
        public double getY() { return y; }
        public void setY(final double y) { this.y = y; }
        public double getWidth() { return width; }
        public void setWidth(final double width) { this.width = width; }
        public double getHeight() { return height; }
        public void setHeight(final double height) { this.height = height; }
    }
}
