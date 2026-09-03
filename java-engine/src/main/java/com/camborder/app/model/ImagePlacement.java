package com.camborder.app.model;

/**
 * RenderRecipe v2 图片放置配置。
 *
 * mode=fit 保留完整图片并在目标框内留白，mode=fill 铺满目标框并按 focalX/focalY
 * 决定裁切焦点。rotation 使用角度，targetAspectRatio=null 表示使用旋转后原图比例。
 */
public final class ImagePlacement {

    private String mode = "fit";
    private double focalX = 0.5;
    private double focalY = 0.5;
    private double rotation = 0;
    private Double targetAspectRatio;

    public ImagePlacement() {
        this("fit", 0.5, 0.5, 0, null);
    }

    public ImagePlacement(final String mode, final double focalX, final double focalY,
                          final double rotation, final Double targetAspectRatio) {
        this.mode = mode;
        this.focalX = focalX;
        this.focalY = focalY;
        this.rotation = rotation;
        this.targetAspectRatio = targetAspectRatio;
    }

    public String getMode() {
        return mode;
    }

    public void setMode(final String mode) {
        this.mode = mode;
    }

    public double getFocalX() {
        return focalX;
    }

    public void setFocalX(final double focalX) {
        this.focalX = focalX;
    }

    public double getFocalY() {
        return focalY;
    }

    public void setFocalY(final double focalY) {
        this.focalY = focalY;
    }

    public double getRotation() {
        return rotation;
    }

    public void setRotation(final double rotation) {
        this.rotation = rotation;
    }

    public Double getTargetAspectRatio() {
        return targetAspectRatio;
    }

    public void setTargetAspectRatio(final Double targetAspectRatio) {
        this.targetAspectRatio = targetAspectRatio;
    }
}
