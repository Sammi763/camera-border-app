package com.camborder.app.dto;

import com.camborder.app.model.ImageProcessingConfig;

/**
 * 图像探针请求：只读头部与源事实，不分配或解码整幅像素。
 *
 * imageProcessing 可选；提供时只用于核对声明输入是否与文件事实一致，
 * 不执行处理。导入、会话恢复、重新定位和预检都应先调用本接口。
 */
public final class ImageProbeRequest {

    private String imagePath;
    /** 可选：用于核验裁切/方向/输入域的 FFF↔TIFF 候选文件。 */
    private String pairedImagePath;
    private ImageProcessingConfig imageProcessing;

    public String getImagePath() { return imagePath; }
    public void setImagePath(final String imagePath) { this.imagePath = imagePath; }
    public String getPairedImagePath() { return pairedImagePath; }
    public void setPairedImagePath(final String pairedImagePath) { this.pairedImagePath = pairedImagePath; }
    public ImageProcessingConfig getImageProcessing() { return imageProcessing; }
    public void setImageProcessing(final ImageProcessingConfig imageProcessing) {
        this.imageProcessing = imageProcessing;
    }
}
