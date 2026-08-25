package com.camborder.app.util;

import com.camborder.app.dto.SourceDecode;
import com.camborder.app.exception.PreviewGenerationException;
import com.camborder.app.service.RawDevelopService;
import org.springframework.stereotype.Component;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;

/**
 * 图片读取器（无状态组件）。
 * 负责按 imagePath 读取本地图片文件，校验存在性、可读性与图片格式合法性，
 * 并如实返回解码来源（sourceDecode）。单一职责：只做读取与校验，不关心缩放、边框或文字。
 *
 * 读取流程：
 * 1. 标准格式：ImageIO 直接读取 → mode=standard；
 * 2. RAW 文件：
 *    a. LibRaw 显影已配置 → 尝试真实显影，成功则 mode=raw-developed；
 *    b. 显影失败/未配置 → 降级提取嵌入 JPEG 预览，
 *       mode=embedded-preview-fallback 且 warning 说明具体原因；
 *    c. 嵌入预览也失败 → 抛受控异常（不 500 堆栈直出）。
 *
 * 降级是显式的：sourceDecode.warning 始终携带可解释的中文原因，
 * 绝不把嵌入预览伪装成完整显影。
 */
@Component
public final class ImageReader {

    private final RawDecoder rawDecoder;
    private final RawDevelopService rawDevelopService;

    public ImageReader(final RawDecoder rawDecoder, final RawDevelopService rawDevelopService) {
        this.rawDecoder = rawDecoder;
        this.rawDevelopService = rawDevelopService;
    }

    /** 读取结果：解码图像 + 来源状态。 */
    public static final class ReadResult {
        private final BufferedImage image;
        private final SourceDecode sourceDecode;

        public ReadResult(final BufferedImage image, final SourceDecode sourceDecode) {
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
     * 读取本地图片文件并返回来源状态。
     *
     * @throws PreviewGenerationException 文件不存在、不可读或不是支持的图片时抛出
     */
    public ReadResult readWithSource(final String imagePath) {
        final File file = new File(imagePath);
        if (!file.exists()) {
            throw new PreviewGenerationException("image file not found: " + imagePath);
        }
        if (!file.isFile() || !file.canRead()) {
            throw new PreviewGenerationException("image file is not readable: " + imagePath);
        }

        final String format = extensionOf(imagePath);

        BufferedImage source;
        try {
            source = ImageIO.read(file);
        } catch (final IOException e) {
            throw new IllegalStateException("failed to read image file: " + imagePath, e);
        }

        // 标准格式直接成功
        if (source != null) {
            return new ReadResult(source, SourceDecode.standard(format));
        }

        // RAW：先尝试真实显影，失败显式降级为嵌入预览
        if (rawDecoder.isRawFile(imagePath)) {
            if (rawDevelopService.isConfigured()) {
                try {
                    final BufferedImage developed = rawDevelopService.develop(imagePath);
                    return new ReadResult(developed, SourceDecode.rawDeveloped(format));
                } catch (final PreviewGenerationException e) {
                    return decodeEmbeddedWithWarning(imagePath, format,
                            "RAW 真实显影失败，已降级为嵌入预览：" + e.getMessage());
                }
            }
            return decodeEmbeddedWithWarning(imagePath, format,
                    "未配置 RAW 显影组件（LibRaw），当前显示为相机嵌入预览");
        }

        // 非 RAW 且 ImageIO 不支持
        throw new PreviewGenerationException(
                "image content is not a supported image: " + imagePath);
    }

    /** 兼容旧调用：只取图像。 */
    public BufferedImage read(final String imagePath) {
        return readWithSource(imagePath).getImage();
    }

    /** 提取嵌入预览；失败时抛受控异常（保留降级原因链）。 */
    private ReadResult decodeEmbeddedWithWarning(final String imagePath, final String format,
                                                 final String warning) {
        final BufferedImage embedded = rawDecoder.decode(imagePath);
        return new ReadResult(embedded, SourceDecode.embeddedFallback(format, warning));
    }

    private static String extensionOf(final String path) {
        final int dot = path.lastIndexOf('.');
        if (dot < 0) {
            return "";
        }
        return path.substring(dot + 1).toLowerCase();
    }
}
