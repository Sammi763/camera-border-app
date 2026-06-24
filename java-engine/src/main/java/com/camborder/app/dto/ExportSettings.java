package com.camborder.app.dto;

/**
 * 图像导出设置 DTO：输出路径、格式（png/jpeg）、JPEG 压缩质量。
 * 作为请求字段嵌套在 {@link RenderJobRequest} 中，故归入 dto 包。
 */
public final class ExportSettings {

    private String outputPath;
    private String format;
    private int jpegQuality;

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
}
