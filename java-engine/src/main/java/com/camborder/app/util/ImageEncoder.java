package com.camborder.app.util;

import com.camborder.app.dto.ExportSettings;
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
 * 单一职责：把 BufferedImage 编码为 PNG 字节或按导出设置写入 PNG/JPEG/TIFF 文件。
 *
 * JPEG 质量控制：jpegQuality 收敛到 [1,100] 再映射为 [0.01,1.0] 压缩质量；
 * 未传（<=0）时使用默认高质量 95。JPEG 不支持透明通道，统一拍平到白底 RGB 画布。
 *
 * 专业导出能力当前真实状态（诚实声明）：
 * - preserveMetadata：当前版本暂未实现 EXIF 保留，标记为 SKIPPED
 * - preserveColorProfile：当前版本暂未实现 ICC 嵌入，标记为 SKIPPED
 * - preferHighBitDepth：当前版本暂未实现真实 16bit 通道输出，标记为 SKIPPED
 * 所有能力通过 ExportResult 结构化返回，前端据此展示真实结果。
 */
@Component
public final class ImageEncoder {

    private static final int MIN_JPEG_QUALITY = 1;
    private static final int MAX_JPEG_QUALITY = 100;
    private static final int DEFAULT_JPEG_QUALITY = 95;
    private static final String DEFAULT_FORMAT = "png";

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
     * 把合成图按导出设置编码并写入文件。
     *
     * @return 导出结果，包含路径、实际格式、各项能力应用状态
     * @throws RenderExportException 当输出路径非法或写入失败时抛出
     */
    public ExportResult writeToFile(final BufferedImage image, final String outputPath,
                                    final ExportSettings export) {
        String resolvedFormat = resolveFormat(export.getFormat());
        File outputFile = OutputPathValidator.resolveAndPrepare(outputPath);

        if ("jpeg".equals(resolvedFormat)) {
            writeJpeg(image, outputFile, export.getJpegQuality());
        } else if ("tiff".equals(resolvedFormat)) {
            writeTiff(image, outputFile);
        } else {
            writePng(image, outputFile);
        }

        return buildExportResult(outputFile.getAbsolutePath(), resolvedFormat, export);
    }

    /**
     * 构建导出结果，包含各项专业能力的真实应用状态。
     * 当前版本三项能力均未实现，用户开启时标记为 SKIPPED。
     */
    private ExportResult buildExportResult(final String outputPath, final String format,
                                           final ExportSettings export) {
        FeatureResult metadata = export.isPreserveMetadata()
                ? new FeatureResult(FeatureStatus.SKIPPED, "当前版本暂不支持 EXIF 元数据保留，已跳过")
                : new FeatureResult(FeatureStatus.NOT_REQUESTED, null);

        FeatureResult colorProfile = export.isPreserveColorProfile()
                ? new FeatureResult(FeatureStatus.SKIPPED, "当前版本暂不支持 ICC 色彩配置文件嵌入，已跳过")
                : new FeatureResult(FeatureStatus.NOT_REQUESTED, null);

        FeatureResult highBitDepth = export.isPreferHighBitDepth()
                ? new FeatureResult(FeatureStatus.SKIPPED, "当前版本暂不支持高位深输出，已使用 8bit")
                : new FeatureResult(FeatureStatus.NOT_REQUESTED, null);

        return new ExportResult(outputPath, format, metadata, colorProfile, highBitDepth);
    }

    private String resolveFormat(final String format) {
        if (format == null || format.isBlank()) {
            return DEFAULT_FORMAT;
        }
        return format.trim().toLowerCase();
    }

    private void writePng(final BufferedImage image, final File outputFile) {
        try {
            if (!ImageIO.write(image, "png", outputFile)) {
                throw new RenderExportException("no PNG writer available");
            }
        } catch (IOException e) {
            throw new RenderExportException("failed to write output file");
        }
    }

    private void writeJpeg(final BufferedImage image, final File outputFile, final int jpegQuality) {
        BufferedImage rgb = flattenToRgb(image);
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

    private void writeTiff(final BufferedImage image, final File outputFile) {
        ImageWriter writer = lookupWriter("tiff");
        ImageWriteParam param = writer.getDefaultWriteParam();
        param.setCompressionMode(ImageWriteParam.MODE_DISABLED);

        try (FileImageOutputStream output = new FileImageOutputStream(outputFile)) {
            writer.setOutput(output);
            writer.write(null, new IIOImage(image, null, null), param);
        } catch (IOException e) {
            throw new RenderExportException("failed to write TIFF output file");
        } finally {
            writer.dispose();
        }
    }

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

    private ImageWriter lookupWriter(final String formatName) {
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName(formatName);
        if (!writers.hasNext()) {
            throw new RenderExportException("no " + formatName + " writer available");
        }
        return writers.next();
    }

    // ---- 结构化导出结果 --------------------------------------------------------

    /** 单项专业能力的应用状态。 */
    public enum FeatureStatus {
        NOT_REQUESTED,
        APPLIED,
        SKIPPED,
        DOWNGRADED
    }

    /** 单项能力的应用结果。 */
    public static final class FeatureResult {
        private final FeatureStatus status;
        private final String message;

        public FeatureResult(final FeatureStatus status, final String message) {
            this.status = status;
            this.message = message;
        }

        public FeatureStatus getStatus() { return status; }
        public String getMessage() { return message; }
    }

    /** 导出结果：包含路径、实际格式、各项能力应用状态。 */
    public static final class ExportResult {
        private final String outputPath;
        private final String actualFormat;
        private final FeatureResult metadataPreservation;
        private final FeatureResult colorProfilePreservation;
        private final FeatureResult highBitDepth;

        public ExportResult(final String outputPath, final String actualFormat,
                            final FeatureResult metadataPreservation,
                            final FeatureResult colorProfilePreservation,
                            final FeatureResult highBitDepth) {
            this.outputPath = outputPath;
            this.actualFormat = actualFormat;
            this.metadataPreservation = metadataPreservation;
            this.colorProfilePreservation = colorProfilePreservation;
            this.highBitDepth = highBitDepth;
        }

        public String getOutputPath() { return outputPath; }
        public String getActualFormat() { return actualFormat; }
        public FeatureResult getMetadataPreservation() { return metadataPreservation; }
        public FeatureResult getColorProfilePreservation() { return colorProfilePreservation; }
        public FeatureResult getHighBitDepth() { return highBitDepth; }
    }
}
