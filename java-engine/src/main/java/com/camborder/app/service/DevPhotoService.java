package com.camborder.app.service;

import com.camborder.app.dto.DevPhotoEntry;

import java.util.List;

/**
 * 开发期样片服务接口：列出本地 photos/ 目录下的样片。
 */
public interface DevPhotoService {

    List<DevPhotoEntry> listPhotos();
}
