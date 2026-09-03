package com.camborder.app.service;

import com.camborder.app.dto.ExportSettings;
import com.camborder.app.dto.SourceDecode;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.util.ImageEncoder;

import java.awt.image.BufferedImage;

/**
 * 图像渲染服务接口。
 * 预览（Preview）和导出（RenderJob）共用同一套核心渲染能力：
 * 读取本地图片 -> 可选等比缩放 -> 合成边框 -> 边框风格 -> 绘制文字 -> 品牌标识 -> 编码为 PNG/JPEG/TIFF。
 *
 * 实现类（{@code Java2DImageRenderService}）编排各 util 组件，具体渲染职责已拆分到
 * ImageReader / ImageScaler / BorderComposer / BorderStyleRenderer / TextRenderer / ImageEncoder。
 */
public interface ImageRenderService {

    /** 合成结果：最终图像 + 解码来源状态（预览/导出响应透传给界面）。 */
    final class ComposeOutcome {
        private final BufferedImage image;
        private final SourceDecode sourceDecode;

        public ComposeOutcome(final BufferedImage image, final SourceDecode sourceDecode) {
            this.image = image;
            this.sourceDecode = sourceDecode;
        }

        public BufferedImage getImage() {
            return image;
        }

        public SourceDecode getSourceDecode() {
            return sourceDecode;
        }
    }

    /**
     * 读取本地图片并按 recipe 合成最终图像。
     * 预览传入 maxWidth/maxHeight 做等比缩小；导出传 0/0 表示用原图尺寸不缩放。
     *
     * @throws com.camborder.app.exception.PreviewGenerationException 当图片不存在、不可读、不是支持的图片、颜色非法或 placement 不支持时抛出
     */
    ComposeOutcome compose(RenderRecipe recipe, int maxWidth, int maxHeight);

    /** 把合成图编码为 PNG 字节，供预览存储使用。 */
    byte[] toPng(BufferedImage image);

    /**
     * 把合成图按 export 设置编码并写入文件。
     *
     * @return 导出结果（包含路径、警告列表、实际格式）
     * @throws com.camborder.app.exception.RenderExportException 当输出路径非法或写入失败时抛出
     */
    ImageEncoder.ExportResult writeToFile(BufferedImage image, ExportSettings export);

    /**
     * 带源图路径的导出入口，用于保留源图 EXIF/ICC。
     * 旧实现默认转调无路径版本，保证测试替身和外部实现仍可工作。
     */
    default ImageEncoder.ExportResult writeToFile(final BufferedImage image,
                                                  final ExportSettings export,
                                                  final String sourcePath) {
        return writeToFile(image, export);
    }
}
