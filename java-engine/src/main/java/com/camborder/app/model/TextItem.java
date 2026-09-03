package com.camborder.app.model;

/**
 * 单段文字配置（内部业务模型）。
 *
 * 阶段 2 扩展：支持多段文字、背景条、阴影、描边。
 * 所有新增字段都有默认值（boolean=false, 数值=0, String=null），
 * 旧请求缺少这些字段时 Jackson 反序列化自动用默认值，不破坏已有 API。
 *
 * 当前兼具 DTO 嵌套模型角色：作为 {@code RenderRecipe.texts[]} 嵌套字段参与 JSON 序列化。
 */
public final class TextItem {

    private String content;
    private String fontFamily;
    private int fontSize;
    private String color;
    private String placement;
    private int marginX;
    private int marginY;
    /** 多行文字行间额外间距（像素）。 */
    private int lineSpacing;
    /** 字符之间额外间距（像素）。 */
    private int letterSpacing;

    // ---- 背景条 -----------------------------------------------------------
    private boolean backgroundEnabled;
    private String backgroundColor;
    private int backgroundPaddingX;
    private int backgroundPaddingY;

    // ---- 阴影 -------------------------------------------------------------
    private boolean shadowEnabled;
    private String shadowColor;
    private int shadowBlur;
    private int shadowOffsetX;
    private int shadowOffsetY;

    // ---- 描边 -------------------------------------------------------------
    private boolean strokeEnabled;
    private String strokeColor;
    private int strokeWidth;

    public TextItem() {
    }

    /** 兼容旧构造：仅包含原有 7 个字段，新增样式字段全部关闭。 */
    public TextItem(final String content, final String fontFamily, final int fontSize,
                    final String color, final String placement,
                    final int marginX, final int marginY) {
        this.content = content;
        this.fontFamily = fontFamily;
        this.fontSize = fontSize;
        this.color = color;
        this.placement = placement;
        this.marginX = marginX;
        this.marginY = marginY;
    }

    public String getContent() {
        return content;
    }

    public void setContent(final String content) {
        this.content = content;
    }

    public String getFontFamily() {
        return fontFamily;
    }

    public void setFontFamily(final String fontFamily) {
        this.fontFamily = fontFamily;
    }

    public int getFontSize() {
        return fontSize;
    }

    public void setFontSize(final int fontSize) {
        this.fontSize = fontSize;
    }

    public String getColor() {
        return color;
    }

    public void setColor(final String color) {
        this.color = color;
    }

    public String getPlacement() {
        return placement;
    }

    public void setPlacement(final String placement) {
        this.placement = placement;
    }

    public int getMarginX() {
        return marginX;
    }

    public void setMarginX(final int marginX) {
        this.marginX = marginX;
    }

    public int getMarginY() {
        return marginY;
    }

    public void setMarginY(final int marginY) {
        this.marginY = marginY;
    }

    public int getLineSpacing() {
        return lineSpacing;
    }

    public void setLineSpacing(final int lineSpacing) {
        this.lineSpacing = lineSpacing;
    }

    public int getLetterSpacing() {
        return letterSpacing;
    }

    public void setLetterSpacing(final int letterSpacing) {
        this.letterSpacing = letterSpacing;
    }

    public boolean isBackgroundEnabled() {
        return backgroundEnabled;
    }

    public void setBackgroundEnabled(final boolean backgroundEnabled) {
        this.backgroundEnabled = backgroundEnabled;
    }

    public String getBackgroundColor() {
        return backgroundColor;
    }

    public void setBackgroundColor(final String backgroundColor) {
        this.backgroundColor = backgroundColor;
    }

    public int getBackgroundPaddingX() {
        return backgroundPaddingX;
    }

    public void setBackgroundPaddingX(final int backgroundPaddingX) {
        this.backgroundPaddingX = backgroundPaddingX;
    }

    public int getBackgroundPaddingY() {
        return backgroundPaddingY;
    }

    public void setBackgroundPaddingY(final int backgroundPaddingY) {
        this.backgroundPaddingY = backgroundPaddingY;
    }

    public boolean isShadowEnabled() {
        return shadowEnabled;
    }

    public void setShadowEnabled(final boolean shadowEnabled) {
        this.shadowEnabled = shadowEnabled;
    }

    public String getShadowColor() {
        return shadowColor;
    }

    public void setShadowColor(final String shadowColor) {
        this.shadowColor = shadowColor;
    }

    public int getShadowBlur() {
        return shadowBlur;
    }

    public void setShadowBlur(final int shadowBlur) {
        this.shadowBlur = shadowBlur;
    }

    public int getShadowOffsetX() {
        return shadowOffsetX;
    }

    public void setShadowOffsetX(final int shadowOffsetX) {
        this.shadowOffsetX = shadowOffsetX;
    }

    public int getShadowOffsetY() {
        return shadowOffsetY;
    }

    public void setShadowOffsetY(final int shadowOffsetY) {
        this.shadowOffsetY = shadowOffsetY;
    }

    public boolean isStrokeEnabled() {
        return strokeEnabled;
    }

    public void setStrokeEnabled(final boolean strokeEnabled) {
        this.strokeEnabled = strokeEnabled;
    }

    public String getStrokeColor() {
        return strokeColor;
    }

    public void setStrokeColor(final String strokeColor) {
        this.strokeColor = strokeColor;
    }

    public int getStrokeWidth() {
        return strokeWidth;
    }

    public void setStrokeWidth(final int strokeWidth) {
        this.strokeWidth = strokeWidth;
    }
}
