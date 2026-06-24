package com.camborder.app.dto;

/**
 * 摄影元数据响应 DTO。
 * 字段：相机型号、镜头型号、光圈、快门速度、ISO、焦距。
 * 读取不到的字段返回 null，不返回 500。当前仅支持 JPEG 基础 EXIF。
 */
public final class PhotoMetadataResponse {

    private final String cameraModel;
    private final String lensModel;
    private final String aperture;
    private final String shutterSpeed;
    private final String iso;
    private final String focalLength;

    public PhotoMetadataResponse(final String cameraModel, final String lensModel,
                                 final String aperture, final String shutterSpeed,
                                 final String iso, final String focalLength) {
        this.cameraModel = cameraModel;
        this.lensModel = lensModel;
        this.aperture = aperture;
        this.shutterSpeed = shutterSpeed;
        this.iso = iso;
        this.focalLength = focalLength;
    }

    public String getCameraModel() {
        return cameraModel;
    }

    public String getLensModel() {
        return lensModel;
    }

    public String getAperture() {
        return aperture;
    }

    public String getShutterSpeed() {
        return shutterSpeed;
    }

    public String getIso() {
        return iso;
    }

    public String getFocalLength() {
        return focalLength;
    }
}
