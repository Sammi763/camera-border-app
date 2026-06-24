package com.camborder.app.dto;

/**
 * 摄影元数据读取请求 DTO：{imagePath}。
 */
public final class PhotoMetadataRequest {

    private String imagePath;

    public PhotoMetadataRequest() {
    }

    public PhotoMetadataRequest(final String imagePath) {
        this.imagePath = imagePath;
    }

    public String getImagePath() {
        return imagePath;
    }

    public void setImagePath(final String imagePath) {
        this.imagePath = imagePath;
    }
}
