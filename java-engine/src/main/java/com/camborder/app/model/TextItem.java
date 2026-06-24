package com.camborder.app.model;

/**
 * 单段文字配置（内部业务模型）：内容、字体、字号、颜色、placement、margin。
 *
 * 当前兼具 DTO 嵌套模型角色：作为 {@code RenderRecipe.texts[]} 嵌套字段参与 JSON 序列化，字段不变。
 */
public final class TextItem {

    private String content;
    private String fontFamily;
    private int fontSize;
    private String color;
    private String placement;
    private int marginX;
    private int marginY;

    public TextItem() {
    }

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
}
