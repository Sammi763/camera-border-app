package com.camborder.app.util;

import com.camborder.app.exception.PreviewGenerationException;
import org.springframework.stereotype.Component;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * RAW 文件解码器（无状态组件）。
 *
 * 从 RAW 文件中扫描并提取嵌入的 JPEG 预览图，再交给 ImageIO 解码为 BufferedImage。
 * 大多数相机 RAW 格式（NEF/CR2/ARW/DNG 等）内嵌全尺寸或接近全尺寸的 JPEG 预览，
 * 通过扫描 JPEG SOI 标记（0xFF 0xD8）定位嵌入式预览数据。
 *
 * 当前支持与限制：
 * - 已支持：NEF、CR2、ARW、DNG、ORF、RW2、PEF、RAF（TIFF-based 格式）
 * - CR3（ISO BMFF 格式）：取决于文件内是否嵌入标准 JPEG 预览
 * - 若无法提取嵌入式预览，抛受控异常（不 500 堆栈直出）
 *
 * 设计原则：
 * - 单一职责：只做 RAW 解码，不关心缩放、边框或文字
 * - 无状态 Spring 组件，由 ImageReader 注入使用
 */
@Component
public final class RawDecoder {

    /** 支持的 RAW 文件扩展名（小写，含前导点）。 */
    private static final Set<String> RAW_EXTENSIONS = new HashSet<>(Arrays.asList(
            ".nef", ".cr2", ".cr3", ".arw", ".raf", ".dng", ".orf", ".rw2", ".pef"
    ));

    /** JPEG SOI（Start of Image）标记：0xFF 0xD8。 */
    private static final byte JPEG_SOI_MARKER_1 = (byte) 0xFF;
    private static final byte JPEG_SOI_MARKER_2 = (byte) 0xD8;

    /** JPEG 第三字节应为 0xFF（APP0/APP1 标记前缀）。 */
    private static final byte JPEG_APP_MARKER = (byte) 0xFF;

    /** 最小有效 JPEG 预览尺寸（字节），小于此值的嵌入式数据跳过。 */
    private static final int MIN_JPEG_SIZE = 10 * 1024;

    /**
     * 判断文件路径是否为 RAW 格式（按扩展名）。
     */
    public boolean isRawFile(final String path) {
        if (path == null || path.isEmpty()) {
            return false;
        }
        return RAW_EXTENSIONS.contains(getExtension(path));
    }

    /**
     * 从 RAW 文件中解码出 BufferedImage。
     *
     * 提取流程：
     * 1. 读取 RAW 文件全部字节
     * 2. 扫描 JPEG SOI 标记（0xFF 0xD8）
     * 3. 对每个 SOI 偏移尝试 ImageIO 解码
     * 4. 返回第一个成功解码的有效图像
     *
     * @param imagePath RAW 文件绝对路径
     * @return 解码后的 BufferedImage
     * @throws PreviewGenerationException 当文件不存在、不可读或无法提取嵌入式预览时抛出
     */
    public BufferedImage decode(final String imagePath) {
        File file = new File(imagePath);
        if (!file.exists()) {
            throw new PreviewGenerationException("RAW 文件不存在: " + imagePath);
        }
        if (!file.isFile() || !file.canRead()) {
            throw new PreviewGenerationException("RAW 文件不可读: " + imagePath);
        }

        byte[] fileBytes;
        try {
            fileBytes = Files.readAllBytes(file.toPath());
        } catch (IOException e) {
            throw new PreviewGenerationException("RAW 文件读取失败: " + imagePath);
        }

        // 扫描 JPEG SOI 标记并尝试解码
        BufferedImage result = scanForJpegPreview(fileBytes);
        if (result != null) {
            return result;
        }

        // 没有找到可用的嵌入式预览
        String ext = getExtension(imagePath);
        String hint = getRawFormatHint(ext);
        throw new PreviewGenerationException(
                "无法从 RAW 文件提取嵌入预览: " + imagePath + hint);
    }

    /**
     * 根据 RAW 扩展名返回更具体的错误提示。
     */
    private String getRawFormatHint(final String ext) {
        switch (ext) {
            case ".cr3":
                return "（CR3 使用 ISO BMFF 容器格式，部分文件未嵌入标准 JPEG 预览）";
            case ".raf":
                return "（RAF 格式结构特殊，嵌入预览位置因机型而异）";
            case ".arw":
                return "（ARW 格式部分文件未嵌入全尺寸 JPEG 预览）";
            case ".nef":
                return "（NEF 通常嵌入 JPEG 预览，请检查文件是否完整）";
            case ".dng":
                return "（DNG 通常嵌入 JPEG 预览，请检查文件是否完整）";
            default:
                return "（该 RAW 格式可能未嵌入标准 JPEG 预览）";
        }
    }

    /**
     * 扫描字节数组中的 JPEG SOI 标记，尝试解码为 BufferedImage。
     * 返回第一个成功解码的有效图像；未找到时返回 null。
     */
    private BufferedImage scanForJpegPreview(final byte[] data) {
        int length = data.length;
        // 最少需要 SOI(2) + APP标记(1) + 其他(1) = 4 字节
        for (int i = 0; i < length - 3; i++) {
            if (data[i] == JPEG_SOI_MARKER_1
                    && data[i + 1] == JPEG_SOI_MARKER_2
                    && data[i + 2] == JPEG_APP_MARKER) {
                // 找到潜在的 JPEG SOI，尝试从该偏移解码
                BufferedImage image = tryDecodeJpeg(data, i, length);
                if (image != null) {
                    return image;
                }
            }
        }
        return null;
    }

    /**
     * 尝试从指定偏移解码 JPEG 数据。
     * 只返回尺寸大于最小阈值的有效图像，避免误取 EXIF 内嵌缩略图。
     */
    private BufferedImage tryDecodeJpeg(final byte[] data, final int offset, final int totalLength) {
        // 可用字节数
        int available = totalLength - offset;
        if (available < MIN_JPEG_SIZE) {
            return null;
        }

        try {
            ByteArrayInputStream bais = new ByteArrayInputStream(data, offset, available);
            BufferedImage image = ImageIO.read(bais);
            if (image != null && image.getWidth() > 0 && image.getHeight() > 0) {
                return image;
            }
        } catch (Exception ignored) {
            // 解码失败，继续扫描下一个 SOI
        }
        return null;
    }

    /**
     * 获取文件扩展名（小写，含前导点），无扩展名时返回空字符串。
     */
    private static String getExtension(final String path) {
        int dot = path.lastIndexOf('.');
        if (dot < 0) {
            return "";
        }
        return path.substring(dot).toLowerCase();
    }
}
