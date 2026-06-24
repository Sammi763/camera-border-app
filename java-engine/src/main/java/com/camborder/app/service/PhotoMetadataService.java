package com.camborder.app.service;

import com.camborder.app.dto.PhotoMetadataResponse;

/**
 * 摄影元数据读取服务接口：从本地图片读取基础 EXIF。
 */
public interface PhotoMetadataService {

    PhotoMetadataResponse readMetadata(String imagePath);
}
