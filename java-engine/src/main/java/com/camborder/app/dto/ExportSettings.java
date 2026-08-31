package com.camborder.app.dto;

/**
 * 图像导出设置 DTO：输出路径、格式（png/jpeg/tiff）、JPEG 压缩质量、目标尺寸、专业导出选项。
 * 作为请求字段嵌套在 {@link RenderJobSnapshot} 中，故归入 dto 包。
 *
 * 目标尺寸（maxWidth/maxHeight）：导出前对原图做等比缩小的上限，0 表示不限制（原图尺寸）。
 * 与预览请求的 maxWidth/maxHeight 语义一致（见 ImageScaler）。
 *
 * 专业导出字段（v2 新增）：
 * - preserveMetadata：是否保留 EXIF 元数据（仅 JPEG/TIFF 支持基础保留）
 * - preserveColorProfile：是否保留 ICC 色彩配置文件
 * - preferHighBitDepth：是否优先保留高位深（仅 TIFF 支持）
 */
public final class ExportSettings {

    private String outputPath;
    private String format;
    private int jpegQuality;
    private int maxWidth;
    private int maxHeight;
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
}
