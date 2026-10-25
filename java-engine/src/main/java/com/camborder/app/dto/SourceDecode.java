package com.camborder.app.dto;

/**
 * 图片解码来源状态：随预览/导出响应返回，向界面如实说明像素来源。
 *
 * mode 取值：
 * - standard：标准格式（JPEG/PNG/TIFF 等）由 ImageIO 直接读取；
 * - embedded-jpeg：RAW 只使用文件内嵌 JPEG 作为像素来源。
 *
 * warning：非空时给出 RAW 像素来源受限等可解释说明。
 */
public final class SourceDecode {

    public static final String MODE_STANDARD = "standard";
    public static final String MODE_EMBEDDED_JPEG = "embedded-jpeg";

    private String mode;
    private String format;
    private String warning;
    /** 解码边界读取到的 EXIF Orientation，范围固定为 1–8。 */
    private int orientation = 1;
    /** Orientation 物理应用前的解码尺寸。 */
    private int decodedWidth;
    private int decodedHeight;
    /** Orientation 应用后的有向像素尺寸。 */
    private int orientedWidth;
    private int orientedHeight;
    /** 预览采样前的全分辨率有向源尺寸；RAW 指内嵌 JPEG 的全分辨率尺寸。 */
    private int fullWidth;
    private int fullHeight;
    /** 是否已经在解码边界处理过方向。 */
    private boolean orientationApplied;

    public SourceDecode() {
    }

    public SourceDecode(final String mode, final String format, final String warning) {
        this.mode = mode;
        this.format = format;
        this.warning = warning;
    }

    /** 标准格式解码成功。 */
    public static SourceDecode standard(final String format) {
        return new SourceDecode(MODE_STANDARD, format, null);
    }

    /** RAW 使用内嵌 JPEG，明确说明不会读取传感器 RAW。 */
    public static SourceDecode embeddedJpeg(final String format) {
        return new SourceDecode(MODE_EMBEDDED_JPEG, format,
                "RAW 仅使用文件内嵌 JPEG 像素，不代表传感器 RAW 显影");
    }

    public String getMode() {
        return mode;
    }

    public void setMode(final String mode) {
        this.mode = mode;
    }

    public String getFormat() {
        return format;
    }

    public void setFormat(final String format) {
        this.format = format;
    }

    public String getWarning() {
        return warning;
    }

    public void setWarning(final String warning) {
        this.warning = warning;
    }

    public int getOrientation() {
        return orientation;
    }

    public void setOrientation(final int orientation) {
        this.orientation = orientation;
    }

    public int getDecodedWidth() {
        return decodedWidth;
    }

    public void setDecodedWidth(final int decodedWidth) {
        this.decodedWidth = decodedWidth;
    }

    public int getDecodedHeight() {
        return decodedHeight;
    }

    public void setDecodedHeight(final int decodedHeight) {
        this.decodedHeight = decodedHeight;
    }

    public int getOrientedWidth() {
        return orientedWidth;
    }

    public void setOrientedWidth(final int orientedWidth) {
        this.orientedWidth = orientedWidth;
    }

    public int getOrientedHeight() {
        return orientedHeight;
    }

    public void setOrientedHeight(final int orientedHeight) {
        this.orientedHeight = orientedHeight;
    }

    public int getFullWidth() {
        return fullWidth;
    }

    public void setFullWidth(final int fullWidth) {
        this.fullWidth = fullWidth;
    }

    public int getFullHeight() {
        return fullHeight;
    }

    public void setFullHeight(final int fullHeight) {
        this.fullHeight = fullHeight;
    }

    public boolean isOrientationApplied() {
        return orientationApplied;
    }

    public void setOrientationApplied(final boolean orientationApplied) {
        this.orientationApplied = orientationApplied;
    }
}
