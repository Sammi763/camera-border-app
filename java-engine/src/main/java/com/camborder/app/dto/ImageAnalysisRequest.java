package com.camborder.app.dto;

import com.camborder.app.model.ImageProcessingConfig;
import com.camborder.app.model.RenderRecipe;

/**
 * 图像分析请求（T02 冻结契约，T07 实现）。
 *
 * stage 只允许 raw-linear / base-positive / current-positive；统计阶段不含边框、文字、Logo。
 * ROI 使用已应用 EXIF 方向、未应用编辑几何的完整源图归一化坐标。
 */
public final class ImageAnalysisRequest {

    private String outputSpace;
    public String getOutputSpace() { return outputSpace; }
    public void setOutputSpace(final String value) { outputSpace = value; }
    private String clientId;
    private long generation;
    public String getClientId() { return clientId; }
    public void setClientId(final String value) { clientId = value; }
    public long getGeneration() { return generation; }
    public void setGeneration(final long value) { generation = value; }

    private RenderRecipe recipe;
    private String stage;
    /** 可选 ROI；null 表示完整源图。 */
    private ImageProcessingConfig.NormalizedCrop roi;

    public RenderRecipe getRecipe() { return recipe; }
    public void setRecipe(final RenderRecipe recipe) { this.recipe = recipe; }
    public String getStage() { return stage; }
    public void setStage(final String stage) { this.stage = stage; }
    public ImageProcessingConfig.NormalizedCrop getRoi() { return roi; }
    public void setRoi(final ImageProcessingConfig.NormalizedCrop roi) { this.roi = roi; }
}
