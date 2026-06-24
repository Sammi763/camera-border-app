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
 */
@Component
public final class ImageReader {

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
            // 文件存在且可读，但读取仍失败，视为服务内部错误
            throw new IllegalStateException("failed to read image file: " + imagePath, e);
        }
        if (source == null) {
            throw new PreviewGenerationException(
                    "image content is not a supported image: " + imagePath);
        }
        return source;
    }
}
