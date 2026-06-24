package com.camborder.app.service;

import com.camborder.app.dto.PreviewRequest;
import com.camborder.app.dto.PreviewResponse;

/**
 * 预览服务接口：把预览请求转换为预览响应。
 */
public interface PreviewService {

    PreviewResponse generatePreview(PreviewRequest request);
}
