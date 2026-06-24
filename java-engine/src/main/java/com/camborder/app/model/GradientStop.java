package com.camborder.app.model;

/**
 * 渐变停靠点（内部业务模型）：偏移量与颜色。
 *
 * 当前兼具 DTO 嵌套模型角色：作为 {@code GradientConfig.stops[]} 嵌套字段参与 JSON 序列化，字段不变。
 */
public final class GradientStop {

    private double offset;
    private String color;

    public GradientStop() {
    }

    public GradientStop(final double offset, final String color) {
        this.offset = offset;
        this.color = color;
    }

    public double getOffset() {
        return offset;
    }

    public void setOffset(final double offset) {
        this.offset = offset;
    }

    public String getColor() {
        return color;
    }

    public void setColor(final String color) {
        this.color = color;
    }
}
