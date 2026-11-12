package com.camborder.app.service;

import com.camborder.app.dto.ImageAnalysisRequest;
import com.camborder.app.dto.ImageAnalysisResponse;

/** 图像分析入口：取样/直方图/统计，复用底片处理阶段，不绘制装饰。 */
public interface ImageAnalysisService {

    ImageAnalysisResponse analyze(ImageAnalysisRequest request);
}
