package com.camborder.app.service;

import com.camborder.app.dto.ExportSettings;
import com.camborder.app.model.RenderRecipe;

import java.awt.image.BufferedImage;

/**
 * 图像渲染服务接口。
 * 预览（Preview）和导出（RenderJob）共用同一套核心渲染能力：
 * 读取本地图片 -> 可选等比缩放 -> 合成边框 -> 绘制单段文字 -> 编码为 PNG/JPEG。
 *
 * 实现类（{@code Java2DImageRenderService}）编排各 util 组件，具体渲染职责已拆分到
 * ImageReader / ImageScaler / BorderComposer / TextRenderer / ImageEncoder。
 */
public interface ImageRenderService {

    /**
     * 读取本地图片并按 recipe 合成最终图像。
     * 预览传入 maxWidth/maxHeight 做等比缩小；导出传 0/0 表示用原图尺寸不缩放。
     *
     * @throws com.camborder.app.exception.PreviewGenerationException 当图片不存在、不可读、不是支持的图片、颜色非法或 placement 不支持时抛出
     */
    BufferedImage compose(RenderRecipe recipe, int maxWidth, int maxHeight);

    /** 把合成图编码为 PNG 字节，供预览存储使用。 */
    byte[] toPng(BufferedImage image);

    /**
     * 把合成图按 export 设置编码并写入文件。
     *
     * @return 实际写入的文件绝对路径
     * @throws com.camborder.app.exception.RenderExportException 当输出路径非法或写入失败时抛出
     */
    String writeToFile(BufferedImage image, ExportSettings export);
}
