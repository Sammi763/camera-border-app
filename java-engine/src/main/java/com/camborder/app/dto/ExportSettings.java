package com.camborder.app.dto;

/**
 * 图像导出设置 DTO。
 *
 * tier 与三个策略字段是阶段五的唯一专业导出契约。旧布尔字段只作为已保存模板和旧
 * 客户端的输入适配，不参与新客户端的 JSON 输出；新请求必须使用策略字段。
 */
public final class ExportSettings {

    private String outputPath;
    private String format;
    private int jpegQuality;
    private int maxWidth;
    private int maxHeight;
    private String tier;
    private String colorProfilePolicy;
    private String metadataPolicy;
    private String bitDepthPolicy;

    // 旧版本输入适配：由 getter 保留，待旧模板迁移完成后删除。
    private boolean preserveMetadata;
    private boolean preserveColorProfile;
    private boolean preferHighBitDepth;

    public ExportSettings() {
    }

    public ExportSettings(final String outputPath, final String format, final int jpegQuality) {
        this.outputPath = outputPath;
        this.format = format;
        this.jpegQuality = jpegQuality;
    }

    public String getOutputPath() {
        return outputPath;
    }

    public void setOutputPath(final String outputPath) {
        this.outputPath = outputPath;
    }

    public String getFormat() {
        return format;
    }

    public void setFormat(final String format) {
        this.format = format;
    }

    public int getJpegQuality() {
        return jpegQuality;
    }

    public void setJpegQuality(final int jpegQuality) {
        this.jpegQuality = jpegQuality;
    }

    public int getMaxWidth() {
        return maxWidth;
    }

    public void setMaxWidth(final int maxWidth) {
        this.maxWidth = maxWidth;
    }

    public int getMaxHeight() {
        return maxHeight;
    }

    public void setMaxHeight(final int maxHeight) {
        this.maxHeight = maxHeight;
    }

    public String getTier() {
        return tier;
    }

    public void setTier(final String tier) {
        this.tier = tier;
    }

    public String getColorProfilePolicy() {
        return colorProfilePolicy;
    }

    public void setColorProfilePolicy(final String colorProfilePolicy) {
        this.colorProfilePolicy = colorProfilePolicy;
    }

    public String getMetadataPolicy() {
        return metadataPolicy;
    }

    public void setMetadataPolicy(final String metadataPolicy) {
        this.metadataPolicy = metadataPolicy;
    }

    public String getBitDepthPolicy() {
        return bitDepthPolicy;
    }

    public void setBitDepthPolicy(final String bitDepthPolicy) {
        this.bitDepthPolicy = bitDepthPolicy;
    }

    public boolean isPreserveMetadata() {
        return preserveMetadata;
    }

    public void setPreserveMetadata(final boolean preserveMetadata) {
        this.preserveMetadata = preserveMetadata;
    }

    public boolean isPreserveColorProfile() {
        return preserveColorProfile;
    }

    public void setPreserveColorProfile(final boolean preserveColorProfile) {
        this.preserveColorProfile = preserveColorProfile;
    }

    public boolean isPreferHighBitDepth() {
        return preferHighBitDepth;
    }

    public void setPreferHighBitDepth(final boolean preferHighBitDepth) {
        this.preferHighBitDepth = preferHighBitDepth;
    }

    /** 阶段五请求是否已经使用新策略契约。 */
    public boolean hasProfessionalPolicy() {
        return tier != null && !tier.isBlank();
    }

    /** 旧客户端映射到元数据策略；新客户端直接使用 metadataPolicy。 */
    public String effectiveMetadataPolicy() {
        if (metadataPolicy != null && !metadataPolicy.isBlank()) {
            return metadataPolicy;
        }
        return preserveMetadata ? "preserve" : "strip";
    }

    /** 旧客户端映射到色彩策略；新客户端直接使用 colorProfilePolicy。 */
    public String effectiveColorProfilePolicy() {
        if (colorProfilePolicy != null && !colorProfilePolicy.isBlank()) {
            return colorProfilePolicy;
        }
        return preserveColorProfile ? "source" : "none";
    }

    /** 旧客户端映射到位深策略；新客户端直接使用 bitDepthPolicy。 */
    public String effectiveBitDepthPolicy() {
        if (bitDepthPolicy != null && !bitDepthPolicy.isBlank()) {
            return bitDepthPolicy;
        }
        return preferHighBitDepth ? "source" : "8";
    }
}
