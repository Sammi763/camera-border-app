package com.camborder.app.dto;

import java.util.ArrayList;
import java.util.List;

/**
 * 图像探针响应：只报告头部、来源与能力事实。
 *
 * width/height 为未应用方向重排的容器尺寸；orientation 为 EXIF/TIFF 方向。
 * 不把容器位深、传感器位深、工作位深混成一个字段。
 */
public final class ImageProbeResponse {

    private String status = "ok";
    private String imagePath;
    private String format;
    private String sourceVersion;
    private int orientation;
    private int width;
    private int height;
    private Container container;
    private Icc icc;
    private Preview preview;
    private Raw raw;
    private Flextight flextight;
    private List<String> inputSources = new ArrayList<>();
    private String recommendedInputSource;
    private List<String> warnings = new ArrayList<>();
    private Declared declared;
    private Pairing pairing;

    public String getStatus() { return status; }
    public void setStatus(final String status) { this.status = status; }
    public String getImagePath() { return imagePath; }
    public void setImagePath(final String imagePath) { this.imagePath = imagePath; }
    public String getFormat() { return format; }
    public void setFormat(final String format) { this.format = format; }
    public String getSourceVersion() { return sourceVersion; }
    public void setSourceVersion(final String sourceVersion) { this.sourceVersion = sourceVersion; }
    public int getOrientation() { return orientation; }
    public void setOrientation(final int orientation) { this.orientation = orientation; }
    public int getWidth() { return width; }
    public void setWidth(final int width) { this.width = width; }
    public int getHeight() { return height; }
    public void setHeight(final int height) { this.height = height; }
    public Container getContainer() { return container; }
    public void setContainer(final Container container) { this.container = container; }
    public Icc getIcc() { return icc; }
    public void setIcc(final Icc icc) { this.icc = icc; }
    public Preview getPreview() { return preview; }
    public void setPreview(final Preview preview) { this.preview = preview; }
    public Raw getRaw() { return raw; }
    public void setRaw(final Raw raw) { this.raw = raw; }
    public Flextight getFlextight() { return flextight; }
    public void setFlextight(final Flextight flextight) { this.flextight = flextight; }
    public List<String> getInputSources() { return inputSources; }
    public void setInputSources(final List<String> inputSources) { this.inputSources = inputSources; }
    public String getRecommendedInputSource() { return recommendedInputSource; }
    public void setRecommendedInputSource(final String recommendedInputSource) {
        this.recommendedInputSource = recommendedInputSource;
    }
    public List<String> getWarnings() { return warnings; }
    public void setWarnings(final List<String> warnings) { this.warnings = warnings; }
    public Declared getDeclared() { return declared; }
    public void setDeclared(final Declared declared) { this.declared = declared; }
    public Pairing getPairing() { return pairing; }
    public void setPairing(final Pairing pairing) { this.pairing = pairing; }

    /** FFF 与既有 TIFF 候选的只读配对事实；不复制像素或宣称原始输入已还原。 */
    public static final class Pairing {
        private String candidatePath;
        private String candidateFormat;
        private boolean dimensionsMatch;
        private boolean orientationMatch;
        private boolean bitDepthMatch;
        private boolean aspectRatioMatch;
        private double aspectRatioDelta;
        private List<String> warnings = new ArrayList<>();

        public String getCandidatePath() { return candidatePath; }
        public void setCandidatePath(final String candidatePath) { this.candidatePath = candidatePath; }
        public String getCandidateFormat() { return candidateFormat; }
        public void setCandidateFormat(final String candidateFormat) { this.candidateFormat = candidateFormat; }
        public boolean isDimensionsMatch() { return dimensionsMatch; }
        public void setDimensionsMatch(final boolean dimensionsMatch) { this.dimensionsMatch = dimensionsMatch; }
        public boolean isOrientationMatch() { return orientationMatch; }
        public void setOrientationMatch(final boolean orientationMatch) { this.orientationMatch = orientationMatch; }
        public boolean isBitDepthMatch() { return bitDepthMatch; }
        public void setBitDepthMatch(final boolean bitDepthMatch) { this.bitDepthMatch = bitDepthMatch; }
        public boolean isAspectRatioMatch() { return aspectRatioMatch; }
        public void setAspectRatioMatch(final boolean aspectRatioMatch) { this.aspectRatioMatch = aspectRatioMatch; }
        public double getAspectRatioDelta() { return aspectRatioDelta; }
        public void setAspectRatioDelta(final double aspectRatioDelta) { this.aspectRatioDelta = aspectRatioDelta; }
        public List<String> getWarnings() { return warnings; }
        public void setWarnings(final List<String> warnings) { this.warnings = warnings; }
    }

    /** 容器事实；这里不声称传感器或工作位深。 */
    public static final class Container {
        private int width;
        private int height;
        private int bitDepth;
        private int bands;
        private boolean alpha;
        private String colorModel;
        private int imageCount;
        private boolean tiffContainer;

        public int getWidth() { return width; }
        public void setWidth(final int width) { this.width = width; }
        public int getHeight() { return height; }
        public void setHeight(final int height) { this.height = height; }
        public int getBitDepth() { return bitDepth; }
        public void setBitDepth(final int bitDepth) { this.bitDepth = bitDepth; }
        public int getBands() { return bands; }
        public void setBands(final int bands) { this.bands = bands; }
        public boolean isAlpha() { return alpha; }
        public void setAlpha(final boolean alpha) { this.alpha = alpha; }
        public String getColorModel() { return colorModel; }
        public void setColorModel(final String colorModel) { this.colorModel = colorModel; }
        public int getImageCount() { return imageCount; }
        public void setImageCount(final int imageCount) { this.imageCount = imageCount; }
        public boolean isTiffContainer() { return tiffContainer; }
        public void setTiffContainer(final boolean tiffContainer) { this.tiffContainer = tiffContainer; }
    }

    public static final class Icc {
        private boolean present;
        private String sha256;
        private String source;

        public boolean isPresent() { return present; }
        public void setPresent(final boolean present) { this.present = present; }
        public String getSha256() { return sha256; }
        public void setSha256(final String sha256) { this.sha256 = sha256; }
        public String getSource() { return source; }
        public void setSource(final String source) { this.source = source; }
    }

    /** 内嵌预览事实；无内嵌预览时 available=false，不能把缩略图当结果。 */
    public static final class Preview {
        private boolean available;
        private int width;
        private int height;
        private String note;

        public boolean isAvailable() { return available; }
        public void setAvailable(final boolean available) { this.available = available; }
        public int getWidth() { return width; }
        public void setWidth(final int width) { this.width = width; }
        public int getHeight() { return height; }
        public void setHeight(final int height) { this.height = height; }
        public String getNote() { return note; }
        public void setNote(final String note) { this.note = note; }
    }

    /** 真实传感器 RAW 事实（LibRaw probe）。 */
    public static final class Raw {
        private boolean available;
        private String decoder;
        private String decoderVersion;
        private String make;
        private String model;
        private int rawWidth;
        private int rawHeight;
        private int width;
        private int height;
        private int sensorBitDepth;
        private int black;
        private int maximum;
        private int[] linearMax;
        private String cropMode;
        private int flip;
        private int exifOrientation;
        private String reason;

        public boolean isAvailable() { return available; }
        public void setAvailable(final boolean available) { this.available = available; }
        public String getDecoder() { return decoder; }
        public void setDecoder(final String decoder) { this.decoder = decoder; }
        public String getDecoderVersion() { return decoderVersion; }
        public void setDecoderVersion(final String decoderVersion) { this.decoderVersion = decoderVersion; }
        public String getMake() { return make; }
        public void setMake(final String make) { this.make = make; }
        public String getModel() { return model; }
        public void setModel(final String model) { this.model = model; }
        public int getRawWidth() { return rawWidth; }
        public void setRawWidth(final int rawWidth) { this.rawWidth = rawWidth; }
        public int getRawHeight() { return rawHeight; }
        public void setRawHeight(final int rawHeight) { this.rawHeight = rawHeight; }
        public int getWidth() { return width; }
        public void setWidth(final int width) { this.width = width; }
        public int getHeight() { return height; }
        public void setHeight(final int height) { this.height = height; }
        public int getSensorBitDepth() { return sensorBitDepth; }
        public void setSensorBitDepth(final int sensorBitDepth) { this.sensorBitDepth = sensorBitDepth; }
        public int getBlack() { return black; }
        public void setBlack(final int black) { this.black = black; }
        public int getMaximum() { return maximum; }
        public void setMaximum(final int maximum) { this.maximum = maximum; }
        public int[] getLinearMax() { return linearMax; }
        public void setLinearMax(final int[] linearMax) { this.linearMax = linearMax; }
        public String getCropMode() { return cropMode; }
        public void setCropMode(final String cropMode) { this.cropMode = cropMode; }
        public int getFlip() { return flip; }
        public void setFlip(final int flip) { this.flip = flip; }
        public int getExifOrientation() { return exifOrientation; }
        public void setExifOrientation(final int exifOrientation) { this.exifOrientation = exifOrientation; }
        public String getReason() { return reason; }
        public void setReason(final String reason) { this.reason = reason; }
    }

    /** Flextight FFF 主图与附属图事实。 */
    public static final class Flextight {
        private boolean available;
        private String mainImage;
        private int width;
        private int height;
        private int bitDepth;
        private int bands;
        private int attachedImageCount;
        private String reason;

        public boolean isAvailable() { return available; }
        public void setAvailable(final boolean available) { this.available = available; }
        public String getMainImage() { return mainImage; }
        public void setMainImage(final String mainImage) { this.mainImage = mainImage; }
        public int getWidth() { return width; }
        public void setWidth(final int width) { this.width = width; }
        public int getHeight() { return height; }
        public void setHeight(final int height) { this.height = height; }
        public int getBitDepth() { return bitDepth; }
        public void setBitDepth(final int bitDepth) { this.bitDepth = bitDepth; }
        public int getBands() { return bands; }
        public void setBands(final int bands) { this.bands = bands; }
        public int getAttachedImageCount() { return attachedImageCount; }
        public void setAttachedImageCount(final int attachedImageCount) {
            this.attachedImageCount = attachedImageCount;
        }
        public String getReason() { return reason; }
        public void setReason(final String reason) { this.reason = reason; }
    }

    /** 请求中声明的处理配置与文件事实的核对结果。 */
    public static final class Declared {
        private boolean valid;
        private String inputSource;
        private String filmPolarity;
        private String reason;

        public boolean isValid() { return valid; }
        public void setValid(final boolean valid) { this.valid = valid; }
        public String getInputSource() { return inputSource; }
        public void setInputSource(final String inputSource) { this.inputSource = inputSource; }
        public String getFilmPolarity() { return filmPolarity; }
        public void setFilmPolarity(final String filmPolarity) { this.filmPolarity = filmPolarity; }
        public String getReason() { return reason; }
        public void setReason(final String reason) { this.reason = reason; }
    }
}
