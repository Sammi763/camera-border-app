package com.camborder.app.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * 摄影元数据响应 DTO。
 * 字段：相机型号、镜头型号、光圈、快门速度、ISO、焦距、拍摄时间以及
 * 可选的 Make/Model 原始拆分字段。读取不到的字段返回 null，不返回 500。
 */
public final class PhotoMetadataResponse {

    private final String cameraModel;
    private final String lensModel;
    private final String aperture;
    private final String shutterSpeed;
    private final String fNumber;
    private final String exposureTime;
    private final String iso;
    private final String focalLength;
    private final String dateTimeOriginal;
    private final String make;
    private final String model;

    public PhotoMetadataResponse(final String cameraModel, final String lensModel,
                                 final String aperture, final String shutterSpeed,
                                 final String iso, final String focalLength) {
        this(cameraModel, lensModel, aperture, shutterSpeed, aperture, shutterSpeed,
                iso, focalLength, null, null, null);
    }

    public PhotoMetadataResponse(final String cameraModel, final String lensModel,
                                 final String aperture, final String shutterSpeed,
                                 final String fNumber, final String exposureTime,
                                 final String iso, final String focalLength) {
        this(cameraModel, lensModel, aperture, shutterSpeed, fNumber, exposureTime,
                iso, focalLength, null, null, null);
    }

    public PhotoMetadataResponse(final String cameraModel, final String lensModel,
                                 final String aperture, final String shutterSpeed,
                                 final String fNumber, final String exposureTime,
                                 final String iso, final String focalLength,
                                 final String dateTimeOriginal, final String make,
                                 final String model) {
        this.cameraModel = cameraModel;
        this.lensModel = lensModel;
        this.aperture = aperture;
        this.shutterSpeed = shutterSpeed;
        this.fNumber = fNumber;
        this.exposureTime = exposureTime;
        this.iso = iso;
        this.focalLength = focalLength;
        this.dateTimeOriginal = dateTimeOriginal;
        this.make = make;
        this.model = model;
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

    @JsonProperty("fNumber")
    public String getFNumber() {
        return fNumber;
    }

    public String getExposureTime() {
        return exposureTime;
    }

    public String getIso() {
        return iso;
    }

    public String getFocalLength() {
        return focalLength;
    }

    public String getDateTimeOriginal() {
        return dateTimeOriginal;
    }

    public String getMake() {
        return make;
    }

    public String getModel() {
        return model;
    }
}
