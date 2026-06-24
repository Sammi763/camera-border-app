package com.camborder.app.dto;

import java.util.List;

/**
 * 开发期样片列表响应 DTO：{"photos":[...]}。
 * 序列化结构与历史 {@code Map<String,List<Map>>} 一致，保持前端契约兼容。
 */
public final class DevPhotosResponse {

    private final List<DevPhotoEntry> photos;

    public DevPhotosResponse(final List<DevPhotoEntry> photos) {
        this.photos = photos;
    }

    public List<DevPhotoEntry> getPhotos() {
        return photos;
    }
}
