package com.camborder.app.util;

import com.camborder.app.exception.RenderExportException;
import org.springframework.stereotype.Component;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.FileImageOutputStream;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.util.Iterator;

/**
 * 图像编码器（无状态组件）。
 * 单一职责：把 BufferedImage 编码为 PNG 字节或按导出设置写入 PNG/JPEG 文件，
 * 不读取文件、不缩放、不合成边框、不绘制文字。
 *
 * JPEG 质量控制：jpegQuality 收敛到 [1,100] 再映射为 [0.01,1.0] 压缩质量；
 * 未传（<=0）时使用默认高质量 95，避免默认质量过低导致导出模糊。
 * JPEG 不支持透明通道，统一拍平到白底 RGB 画布。
 *
 * 注意：本类只收基本类型（outputPath/format/jpegQuality），不依赖 dto，保持 util 低层定位。
 */
@Component
public final class ImageEncoder {

    /** JPEG 压缩质量下限，避免传入 0 时编码器拒绝或产出空图。 */
    private static final int MIN_JPEG_QUALITY = 1;
    /** JPEG 压缩质量上限。 */
    private static final int MAX_JPEG_QUALITY = 100;
    /** 未指定 jpegQuality 时的默认压缩质量，避免默认质量过低导致导出模糊。 */
    private static final int DEFAULT_JPEG_QUALITY = 95;
    /** 未指定 format 时的默认导出格式。 */
    private static final String DEFAULT_FORMAT = "png";

    /**
     * 把合成图编码为 PNG 字节，供预览注册表存储。
     */
    public byte[] toPng(final BufferedImage image) {
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            if (!ImageIO.write(image, "png", output)) {
                throw new IllegalStateException("no PNG writer available");
            }
            return output.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("failed to encode preview PNG", e);
        }
    }

    /**
     * 把合成图按导出设置编码并写入 outputPath 指定的文件。
     * 父目录不存在或不可写时抛出受控异常，由控制器映射为 4xx。
     *
     * @param image       合成后的图像
     * @param outputPath  输出路径（由 OutputPathValidator 校验/准备父目录）
     * @param format      导出格式，null/blank 默认 png
     * @param jpegQuality JPEG 压缩质量，<=0 时默认 95
     * @return 实际写入的文件绝对路径
     * @throws RenderExportException 当输出路径非法或写入失败时抛出
     */
    public String writeToFile(final BufferedImage image, final String outputPath,
                              final String format, final int jpegQuality) {
        String resolvedFormat = resolveFormat(format);
        File outputFile = OutputPathValidator.resolveAndPrepare(outputPath);

        if ("jpeg".equals(resolvedFormat)) {
            writeJpeg(image, outputFile, jpegQuality);
        } else {
            writePng(image, outputFile);
        }
        return outputFile.getAbsolutePath();
    }

    /**
     * 解析导出格式。未指定时默认 png，并统一小写。
     */
    private String resolveFormat(final String format) {
        if (format == null || format.isBlank()) {
            return DEFAULT_FORMAT;
        }
        return format.trim().toLowerCase();
    }

    /**
     * 用 ImageIO 把 PNG 写入文件。
     */
    private void writePng(final BufferedImage image, final File outputFile) {
        try {
            if (!ImageIO.write(image, "png", outputFile)) {
                throw new RenderExportException("no PNG writer available");
            }
        } catch (IOException e) {
            throw new RenderExportException("failed to write output file");
        }
    }

    /**
     * 用 ImageWriter 按 jpegQuality 控制压缩质量写入 JPEG。
     */
    private void writeJpeg(final BufferedImage image, final File outputFile, final int jpegQuality) {
        // JPEG 不支持透明通道，统一绘制到不透明 RGB 画布上，避免黑底
        BufferedImage rgb = flattenToRgb(image);
        // jpegQuality <= 0 视为未指定，使用默认高质量 95，避免默认质量过低导致导出模糊
        int requested = jpegQuality <= 0 ? DEFAULT_JPEG_QUALITY : jpegQuality;
        int clamped = Math.max(MIN_JPEG_QUALITY, Math.min(MAX_JPEG_QUALITY, requested));
        float quality = clamped / (float) MAX_JPEG_QUALITY;

        ImageWriter writer = lookupWriter("jpeg");
        ImageWriteParam param = writer.getDefaultWriteParam();
        param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
        param.setCompressionQuality(quality);

        try (FileImageOutputStream output = new FileImageOutputStream(outputFile)) {
            writer.setOutput(output);
            writer.write(null, new IIOImage(rgb, null, null), param);
        } catch (IOException e) {
            throw new RenderExportException("failed to write output file");
        } finally {
            writer.dispose();
        }
    }

    /**
     * 把可能带透明通道的图像绘制到不透明 RGB 画布，背景为白色。
     * 仅用于 JPEG 导出，PNG 保留原始通道。
     */
    private BufferedImage flattenToRgb(final BufferedImage image) {
        if (!image.getColorModel().hasAlpha()) {
            return image;
        }
        BufferedImage rgb = new BufferedImage(image.getWidth(), image.getHeight(), BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = rgb.createGraphics();
        try {
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, rgb.getWidth(), rgb.getHeight());
            graphics.drawImage(image, 0, 0, null);
        } finally {
            graphics.dispose();
        }
        return rgb;
    }

    /**
     * 按格式名查找 ImageWriter，找不到时抛受控异常。
     */
    private ImageWriter lookupWriter(final String formatName) {
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName(formatName);
        if (!writers.hasNext()) {
            throw new RenderExportException("no " + formatName + " writer available");
        }
        return writers.next();
    }
}
