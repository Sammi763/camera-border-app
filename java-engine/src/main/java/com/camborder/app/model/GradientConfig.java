package com.camborder.app.model;

import java.util.List;

/**
 * 渐变边框配置（内部业务模型）。
 *
 * 当前兼具 DTO 嵌套模型角色：作为 {@code RenderRecipe.gradient} 嵌套字段参与 JSON 序列化，字段不变。
 *
 * 字段：
 * - enabled：是否启用渐变；为 false 时退回纯色边框（border.color）。
 * - type："linear" 线性 / "radial" 径向；其它值视为非法，由渲染层抛受控异常。
 * - angle：线性渐变角度（度，0=从左到右，90=从上到下），径向忽略此值。
 * - stops：停靠点列表，至少 2 个；多于 2 个按 Java 2D 渐变 Paint 多点插值实现。
 */
public final class GradientConfig {

    private boolean enabled;
    private String type;
    private double angle;
    private List<GradientStop> stops;

    public GradientConfig() {
    }

    public GradientConfig(final boolean enabled, final String type, final double angle,
                          final List<GradientStop> stops) {
        this.enabled = enabled;
        this.type = type;
        this.angle = angle;
        this.stops = stops;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(final boolean enabled) {
        this.enabled = enabled;
    }

    public String getType() {
        return type;
    }

    public void setType(final String type) {
        this.type = type;
    }

    public double getAngle() {
        return angle;
    }

    public void setAngle(final double angle) {
        this.angle = angle;
    }

    public List<GradientStop> getStops() {
        return stops;
    }

    public void setStops(final List<GradientStop> stops) {
        this.stops = stops;
    }
}
