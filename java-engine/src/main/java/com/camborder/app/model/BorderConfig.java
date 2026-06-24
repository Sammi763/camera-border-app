package com.camborder.app.model;

/**
 * 边框配置（内部业务模型）：四边宽度与颜色。
 * 负值在合成时会被收敛为 0，避免把图片裁小。
 *
 * 当前兼具 DTO 嵌套模型角色：作为 {@code RenderRecipe.border} 嵌套字段参与 JSON 序列化，字段不变。
 */
public final class BorderConfig {

    private int top;
    private int bottom;
    private int left;
    private int right;
    private String color;

    public BorderConfig() {
    }

    public BorderConfig(final int top, final int bottom, final int left,
                        final int right, final String color) {
        this.top = top;
        this.bottom = bottom;
        this.left = left;
        this.right = right;
        this.color = color;
    }

    public int getTop() {
        return top;
    }

    public void setTop(final int top) {
        this.top = top;
    }

    public int getBottom() {
        return bottom;
    }

    public void setBottom(final int bottom) {
        this.bottom = bottom;
    }

    public int getLeft() {
        return left;
    }

    public void setLeft(final int left) {
        this.left = left;
    }

    public int getRight() {
        return right;
    }

    public void setRight(final int right) {
        this.right = right;
    }

    public String getColor() {
        return color;
    }

    public void setColor(final String color) {
        this.color = color;
    }
}
