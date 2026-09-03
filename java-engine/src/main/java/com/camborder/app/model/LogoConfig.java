package com.camborder.app.model;

/**
 * 品牌标识（Logo）配置（内部业务模型）。
 *
 * MVP 首版支持两种模式：
 * - auto-brand：根据当前图片的相机信息自动识别品牌，绘制品牌文字
 * - brand-text：用户手动输入品牌文字
 *
 * 当前兼具 DTO 嵌套模型角色：作为 {@code RenderRecipe.logo} 嵌套字段参与 JSON 序列化。
 */
public final class LogoConfig {

    private boolean enabled;
    private String mode;
    private String brand;
    private String placement;
    private int size;
    private String colorMode;
    /** 自定义 PNG/签名的本地路径；为空时绘制 brand 文字。 */
    private String imagePath;
    /** 自定义 PNG/签名不透明度（0-1）。 */
    private double opacity = 1.0;
    /** 是否为 PNG/签名绘制反差阴影。 */
    private boolean autoContrast = true;

    public LogoConfig() {
    }

    public LogoConfig(final boolean enabled, final String mode, final String brand,
                      final String placement, final int size, final String colorMode) {
        this.enabled = enabled;
        this.mode = mode;
        this.brand = brand;
        this.placement = placement;
        this.size = size;
        this.colorMode = colorMode;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(final boolean enabled) {
        this.enabled = enabled;
    }

    public String getMode() {
        return mode;
    }

    public void setMode(final String mode) {
        this.mode = mode;
    }

    public String getBrand() {
        return brand;
    }

    public void setBrand(final String brand) {
        this.brand = brand;
    }

    public String getPlacement() {
        return placement;
    }

    public void setPlacement(final String placement) {
        this.placement = placement;
    }

    public int getSize() {
        return size;
    }

    public void setSize(final int size) {
        this.size = size;
    }

    public String getColorMode() {
        return colorMode;
    }

    public void setColorMode(final String colorMode) {
        this.colorMode = colorMode;
    }

    public String getImagePath() {
        return imagePath;
    }

    public void setImagePath(final String imagePath) {
        this.imagePath = imagePath;
    }

    public double getOpacity() {
        return opacity;
    }

    public void setOpacity(final double opacity) {
        this.opacity = opacity;
    }

    public boolean isAutoContrast() {
        return autoContrast;
    }

    public void setAutoContrast(final boolean autoContrast) {
        this.autoContrast = autoContrast;
    }
}
