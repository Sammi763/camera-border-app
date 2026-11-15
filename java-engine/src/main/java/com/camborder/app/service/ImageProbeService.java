package com.camborder.app.service;

import com.camborder.app.dto.ImageProbeRequest;
import com.camborder.app.dto.ImageProbeResponse;

/** 只读图像探针：头部、来源事实与声明核对，不解码整幅像素。 */
public interface ImageProbeService {

    ImageProbeResponse probe(ImageProbeRequest request);
}
