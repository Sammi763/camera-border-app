package com.camborder.app.util;

import com.camborder.app.exception.PreviewGenerationException;
import org.springframework.stereotype.Component;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;

/**
 * 图片读取器（无状态组件）。
 * 负责按 imagePath 读取本地图片文件，校验存在性、可读性与图片格式合法性。
 * 单一职责：只做读取与校验，不关心缩放、边框或文字。
 *
 * RAW 文件处理流程：
 * 1. ImageIO 尝试直接读取（覆盖标准格式：JPEG/PNG/TIFF/BMP/WebP）
 * 2. 若 ImageIO 返回 null 且文件为 RAW 格式，委托 {@link RawDecoder} 提取嵌入式预览
 * 3. 若 RAW 解码也失败，抛受控异常（不 500 堆栈直出）
 */
@Component
public final class ImageReader {

    private final RawDecoder rawDecoder;

    public ImageReader(final RawDecoder rawDecoder) {
        this.rawDecoder = rawDecoder;
    }

    /**
     * 读取本地图片文件。
     *
     * @throws PreviewGenerationException 文件不存在、不可读或不是支持的图片时抛出
     */
    public BufferedImage read(final String imagePath) {
        File file = new File(imagePath);
        if (!file.exists()) {
            throw new PreviewGenerationException("image file not found: " + imagePath);
        }
        if (!file.isFile() || !file.canRead()) {
            throw new PreviewGenerationException("image file is not readable: " + imagePath);
        }

        BufferedImage source;
        try {
            source = ImageIO.read(file);
        } catch (IOException e) {
            throw new IllegalStateException("failed to read image file: " + imagePath, e);
        }

        // ImageIO 直接读取成功（标准格式）
        if (source != null) {
            return source;
        }

        // ImageIO 不认识该格式，尝试 RAW 解码
        if (rawDecoder.isRawFile(imagePath)) {
            return rawDecoder.decode(imagePath);
        }

        // 非 RAW 且 ImageIO 不支持
        throw new PreviewGenerationException(
                "image content is not a supported image: " + imagePath);
    }
}
