package com.camborder.app.dto;

/**
 * 图片解码来源状态：随预览/导出响应返回，向界面如实说明像素来源。
 *
 * mode 取值：
 * - standard：标准格式（JPEG/PNG/TIFF 等）由 ImageIO 直接读取；
 * - raw-developed：RAW 经 LibRaw 子进程完成默认显影（真实传感器数据）；
 * - embedded-preview-fallback：RAW 真实显影不可用/失败，降级为文件内嵌 JPEG 预览。
 *
 * warning：非空时给出可解释的降级原因；standard/raw-developed 成功时为 null。
 */
public final class SourceDecode {

    public static final String MODE_STANDARD = "standard";
    public static final String MODE_RAW_DEVELOPED = "raw-developed";
    public static final String MODE_EMBEDDED_FALLBACK = "embedded-preview-fallback";

    private String mode;
    private String format;
    private String warning;

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

    /** RAW 真实显影成功。 */
    public static SourceDecode rawDeveloped(final String format) {
        return new SourceDecode(MODE_RAW_DEVELOPED, format, null);
    }

    /** RAW 降级为嵌入预览，附中文原因。 */
    public static SourceDecode embeddedFallback(final String format, final String warning) {
        return new SourceDecode(MODE_EMBEDDED_FALLBACK, format, warning);
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
}
