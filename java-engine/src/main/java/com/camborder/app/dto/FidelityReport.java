package com.camborder.app.dto;

import com.camborder.app.util.ImageEncoder;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 导出或预览的实际保真报告。
 *
 * preflight 阶段只能填写预期输出并将 verified 设为 false；只有完成编码、元数据写回
 * 和独立读取后，render job 才允许返回 verified=true。
 */
public final class FidelityReport {

    private String phase;
    private String tier;
    private String format;
    private boolean verified;
    private String fidelityScope = "full";
    private String pixelSource;
    private String metadataSource;
    private Facts source;
    private Facts output;
    private Transformations transformations = new Transformations();
    private Map<String, ImageEncoder.FeatureResult> features = new LinkedHashMap<>();
    private List<String> warnings = new ArrayList<>();
    private List<String> blockingReasons = new ArrayList<>();

    public String getPhase() { return phase; }
    public void setPhase(final String phase) { this.phase = phase; }
    public String getTier() { return tier; }
    public void setTier(final String tier) { this.tier = tier; }
    public String getFormat() { return format; }
    public void setFormat(final String format) { this.format = format; }
    public boolean isVerified() { return verified; }
    public void setVerified(final boolean verified) { this.verified = verified; }
    public String getFidelityScope() { return fidelityScope; }
    public void setFidelityScope(final String fidelityScope) { this.fidelityScope = fidelityScope; }
    public String getPixelSource() { return pixelSource; }
    public void setPixelSource(final String pixelSource) { this.pixelSource = pixelSource; }
    public String getMetadataSource() { return metadataSource; }
    public void setMetadataSource(final String metadataSource) { this.metadataSource = metadataSource; }
    public Facts getSource() { return source; }
    public void setSource(final Facts source) { this.source = source; }
    public Facts getOutput() { return output; }
    public void setOutput(final Facts output) { this.output = output; }
    public Transformations getTransformations() { return transformations; }
    public void setTransformations(final Transformations transformations) {
        this.transformations = transformations == null ? new Transformations() : transformations;
    }
    public Map<String, ImageEncoder.FeatureResult> getFeatures() { return features; }
    public void setFeatures(final Map<String, ImageEncoder.FeatureResult> features) {
        this.features = features == null ? new LinkedHashMap<>() : new LinkedHashMap<>(features);
    }
    public List<String> getWarnings() { return warnings; }
    public void setWarnings(final List<String> warnings) {
        this.warnings = warnings == null ? new ArrayList<>() : new ArrayList<>(warnings);
    }
    public List<String> getBlockingReasons() { return blockingReasons; }
    public void setBlockingReasons(final List<String> blockingReasons) {
        this.blockingReasons = blockingReasons == null ? new ArrayList<>() : new ArrayList<>(blockingReasons);
    }

    public static FidelityReport preflight(final String tier, final String format) {
        FidelityReport report = new FidelityReport();
        report.phase = "preflight";
        report.tier = tier;
        report.format = format;
        return report;
    }

    public static FidelityReport completed(final String tier, final String format) {
        FidelityReport report = new FidelityReport();
        report.phase = "completed";
        report.tier = tier;
        report.format = format;
        report.verified = true;
        return report;
    }

    /** 文件事实；字段来自实际读取而不是请求中的预测值。 */
    public static final class Facts {
        private int width;
        private int height;
        /** 解码器在物理应用 Orientation 前的像素尺寸。 */
        private int decodedWidth;
        private int decodedHeight;
        /** 进入渲染链路时的有向像素尺寸。 */
        private int orientedWidth;
        private int orientedHeight;
        private int bitDepth;
        private String colorSpace;
        private int orientation;
        private boolean orientationApplied;
        private IccFacts icc;
        private MetadataFacts metadata;

        public int getWidth() { return width; }
        public void setWidth(final int width) { this.width = width; }
        public int getHeight() { return height; }
        public void setHeight(final int height) { this.height = height; }
        public int getDecodedWidth() { return decodedWidth; }
        public void setDecodedWidth(final int decodedWidth) { this.decodedWidth = decodedWidth; }
        public int getDecodedHeight() { return decodedHeight; }
        public void setDecodedHeight(final int decodedHeight) { this.decodedHeight = decodedHeight; }
        public int getOrientedWidth() { return orientedWidth; }
        public void setOrientedWidth(final int orientedWidth) { this.orientedWidth = orientedWidth; }
        public int getOrientedHeight() { return orientedHeight; }
        public void setOrientedHeight(final int orientedHeight) { this.orientedHeight = orientedHeight; }
        public int getBitDepth() { return bitDepth; }
        public void setBitDepth(final int bitDepth) { this.bitDepth = bitDepth; }
        public String getColorSpace() { return colorSpace; }
        public void setColorSpace(final String colorSpace) { this.colorSpace = colorSpace; }
        public int getOrientation() { return orientation; }
        public void setOrientation(final int orientation) { this.orientation = orientation; }
        public boolean isOrientationApplied() { return orientationApplied; }
        public void setOrientationApplied(final boolean orientationApplied) { this.orientationApplied = orientationApplied; }
        public IccFacts getIcc() { return icc; }
        public void setIcc(final IccFacts icc) { this.icc = icc; }
        public MetadataFacts getMetadata() { return metadata; }
        public void setMetadata(final MetadataFacts metadata) { this.metadata = metadata; }
    }

    public static final class IccFacts {
        private String state;
        private String profileName;
        private Integer byteLength;
        private String sha256;

        public String getState() { return state; }
        public void setState(final String state) { this.state = state; }
        public String getProfileName() { return profileName; }
        public void setProfileName(final String profileName) { this.profileName = profileName; }
        public Integer getByteLength() { return byteLength; }
        public void setByteLength(final Integer byteLength) { this.byteLength = byteLength; }
        public String getSha256() { return sha256; }
        public void setSha256(final String sha256) { this.sha256 = sha256; }
    }

    public static final class MetadataFacts {
        private boolean exif;
        private boolean xmp;
        private boolean iptc;
        private boolean gps;
        private boolean dpi;
        private boolean thumbnail;

        public boolean isExif() { return exif; }
        public void setExif(final boolean exif) { this.exif = exif; }
        public boolean isXmp() { return xmp; }
        public void setXmp(final boolean xmp) { this.xmp = xmp; }
        public boolean isIptc() { return iptc; }
        public void setIptc(final boolean iptc) { this.iptc = iptc; }
        public boolean isGps() { return gps; }
        public void setGps(final boolean gps) { this.gps = gps; }
        public boolean isDpi() { return dpi; }
        public void setDpi(final boolean dpi) { this.dpi = dpi; }
        public boolean isThumbnail() { return thumbnail; }
        public void setThumbnail(final boolean thumbnail) { this.thumbnail = thumbnail; }
    }

    public static final class Transformations {
        private boolean colorConverted;
        private boolean resized;
        private boolean orientationNormalized;
        private String locationPolicy;
        private String thumbnailPolicy;

        public boolean isColorConverted() { return colorConverted; }
        public void setColorConverted(final boolean colorConverted) { this.colorConverted = colorConverted; }
        public boolean isResized() { return resized; }
        public void setResized(final boolean resized) { this.resized = resized; }
        public boolean isOrientationNormalized() { return orientationNormalized; }
        public void setOrientationNormalized(final boolean orientationNormalized) { this.orientationNormalized = orientationNormalized; }
        public String getLocationPolicy() { return locationPolicy; }
        public void setLocationPolicy(final String locationPolicy) { this.locationPolicy = locationPolicy; }
        public String getThumbnailPolicy() { return thumbnailPolicy; }
        public void setThumbnailPolicy(final String thumbnailPolicy) { this.thumbnailPolicy = thumbnailPolicy; }
    }
}
