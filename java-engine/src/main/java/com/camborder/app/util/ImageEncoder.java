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
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Iterator;
import java.util.zip.CRC32;
import java.util.zip.DeflaterOutputStream;

/**
 * 图像编码器（无状态组件）。
 * 单一职责：把 BufferedImage 编码为 PNG 字节或按导出设置写入 PNG/JPEG/TIFF 文件。
 *
 * JPEG 质量控制：jpegQuality 收敛到 [1,100] 再映射为 [0.01,1.0] 压缩质量；
 * 未传（<=0）时使用默认高质量 95。JPEG 不支持透明通道，统一拍平到白底 RGB 画布。
 *
 * 专业导出能力：
 * - preserveMetadata：从源图读取 EXIF，并写入 PNG eXIf 或 JPEG APP1；
 * - preserveColorProfile：从源图读取 ICC，并写入 PNG iCCP 或 JPEG APP2；
 * - preferHighBitDepth：只有合成结果仍为高位深 TIFF 时标记为 APPLIED，其他组合明确降级。
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
        return writeToFile(image, outputPath, export, null);
    }

    /**
     * 带源图路径的编码入口。导出快照冻结的 recipe.imagePath 传入这里，避免
     * 仅凭合成后的 BufferedImage 猜测原始 EXIF/ICC。
     */
    public ExportResult writeToFile(final BufferedImage image, final String outputPath,
                                    final ExportSettings export, final String sourcePath) {
        String resolvedFormat = resolveFormat(export.getFormat());
        File outputFile = OutputPathValidator.resolveAndPrepare(outputPath);
        ImageMetadataPayload metadata = export.isPreserveMetadata() || export.isPreserveColorProfile()
                ? ImageMetadataPayload.read(sourcePath)
                : ImageMetadataPayload.empty();

        if ("jpeg".equals(resolvedFormat)) {
            writeJpeg(image, outputFile, export.getJpegQuality());
        } else if ("tiff".equals(resolvedFormat)) {
            writeTiff(image, outputFile);
        } else {
            writePng(image, outputFile);
        }

        MetadataWriteResult metadataWrite = applyMetadata(outputFile, resolvedFormat, metadata,
                export.isPreserveMetadata(), export.isPreserveColorProfile());
        return buildExportResult(outputFile.getAbsolutePath(), resolvedFormat, export,
                image, metadata, metadataWrite);
    }

    /**
     * 构建导出结果，包含各项专业能力的真实应用状态。
     */
    private ExportResult buildExportResult(final String outputPath, final String format,
                                           final ExportSettings export,
                                           final BufferedImage image,
                                           final ImageMetadataPayload metadata,
                                           final MetadataWriteResult metadataWrite) {
        FeatureResult metadataResult = featureResult(
                export.isPreserveMetadata(), metadata.isSourceReadable(), metadata.hasExif(),
                metadataWrite.exifWritten, "EXIF", format);
        FeatureResult colorProfile = featureResult(
                export.isPreserveColorProfile(), metadata.isSourceReadable(), metadata.hasIcc(),
                metadataWrite.iccWritten, "ICC", format);
        FeatureResult highBitDepth = highBitDepthResult(export.isPreferHighBitDepth(), image, format);

        return new ExportResult(outputPath, format, metadataResult, colorProfile, highBitDepth);
    }

    private FeatureResult featureResult(final boolean requested, final boolean sourceReadable,
                                        final boolean sourceHasData, final boolean written,
                                        final String label, final String format) {
        if (!requested) {
            return new FeatureResult(FeatureStatus.NOT_REQUESTED, null);
        }
        if (!sourceReadable) {
            return new FeatureResult(FeatureStatus.DOWNGRADED,
                    "无法读取源图，" + label + " 未保留");
        }
        if (!sourceHasData) {
            return new FeatureResult(FeatureStatus.APPLIED,
                    "源图没有可读取的 " + label + "，已完成输出");
        }
        if (written) {
            return new FeatureResult(FeatureStatus.APPLIED, label + " 已写入输出文件");
        }
        return new FeatureResult(FeatureStatus.DOWNGRADED,
                format.toUpperCase() + " 编码器无法安全写入 " + label + "，像素已正常输出");
    }

    private FeatureResult highBitDepthResult(final boolean requested, final BufferedImage image,
                                             final String format) {
        if (!requested) {
            return new FeatureResult(FeatureStatus.NOT_REQUESTED, null);
        }
        if ("tiff".equals(format) && isHighBitDepth(image)) {
            return new FeatureResult(FeatureStatus.APPLIED, "TIFF 已保留合成图高位深通道");
        }
        return new FeatureResult(FeatureStatus.DOWNGRADED,
                "合成图按 8bit 输出，无法在 " + format.toUpperCase() + " 中保留高位深");
    }

    private boolean isHighBitDepth(final BufferedImage image) {
        for (int bits : image.getColorModel().getComponentSize()) {
            if (bits > 8) return true;
        }
        return false;
    }

    private String resolveFormat(final String format) {
        if (format == null || format.isBlank()) {
            return DEFAULT_FORMAT;
        }
        return format.trim().toLowerCase();
    }

    /**
     * 把源图元数据写回编码结果。PNG/JPEG 有稳定的标准块格式；TIFF 的 ImageIO
     * 写入器在当前运行时没有可靠的通用 EXIF/ICC 注入接口，因此该组合由结果状态
     * 明确报告降级，而不会写入可能破坏文件的伪块。
     */
    private MetadataWriteResult applyMetadata(final File outputFile, final String format,
                                              final ImageMetadataPayload metadata,
                                              final boolean preserveExif,
                                              final boolean preserveIcc) {
        if ((!preserveExif || !metadata.hasExif()) && (!preserveIcc || !metadata.hasIcc())) {
            return MetadataWriteResult.none();
        }
        if ("png".equals(format)) {
            return injectPngMetadata(outputFile, metadata, preserveExif, preserveIcc);
        }
        if ("jpeg".equals(format)) {
            return injectJpegMetadata(outputFile, metadata, preserveExif, preserveIcc);
        }
        return MetadataWriteResult.none();
    }

    private MetadataWriteResult injectJpegMetadata(final File outputFile,
                                                   final ImageMetadataPayload metadata,
                                                   final boolean preserveExif,
                                                   final boolean preserveIcc) {
        if ((!preserveExif || !metadata.hasExif()) && (!preserveIcc || !metadata.hasIcc())) {
            return MetadataWriteResult.none();
        }
        try {
            final byte[] encoded = Files.readAllBytes(outputFile.toPath());
            if (encoded.length < 2 || encoded[0] != (byte) 0xff || encoded[1] != (byte) 0xd8) {
                return MetadataWriteResult.none();
            }
            final ByteArrayOutputStream output = new ByteArrayOutputStream(encoded.length + 4096);
            output.write(encoded, 0, 2);

            boolean exifWritten = false;
            if (preserveExif && metadata.hasExif()) {
                exifWritten = writeJpegSegment(output, 0xe1,
                        normalizeExifPayload(metadata.getExif()));
            }

            boolean iccWritten = false;
            if (preserveIcc && metadata.hasIcc()) {
                final byte[] profile = metadata.getIcc();
                final int partSize = 65_519;
                final int partCount = (profile.length + partSize - 1) / partSize;
                if (partCount > 0 && partCount <= 255) {
                    iccWritten = true;
                    for (int sequence = 1; sequence <= partCount; sequence++) {
                        final int start = (sequence - 1) * partSize;
                        final int end = Math.min(profile.length, start + partSize);
                        final ByteArrayOutputStream part = new ByteArrayOutputStream(end - start + 14);
                        part.write("ICC_PROFILE".getBytes(StandardCharsets.US_ASCII));
                        part.write(0);
                        part.write(sequence);
                        part.write(partCount);
                        part.write(profile, start, end - start);
                        if (!writeJpegSegment(output, 0xe2, part.toByteArray())) {
                            iccWritten = false;
                            break;
                        }
                    }
                }
            }

            output.write(encoded, 2, encoded.length - 2);
            Files.write(outputFile.toPath(), output.toByteArray());
            return new MetadataWriteResult(exifWritten, iccWritten);
        } catch (IOException ignored) {
            return MetadataWriteResult.none();
        }
    }

    private boolean writeJpegSegment(final ByteArrayOutputStream output, final int marker,
                                     final byte[] payload) {
        if (payload == null || payload.length > 65_533) {
            return false;
        }
        final int length = payload.length + 2;
        output.write(0xff);
        output.write(marker);
        output.write((length >>> 8) & 0xff);
        output.write(length & 0xff);
        output.write(payload, 0, payload.length);
        return true;
    }

    private byte[] normalizeExifPayload(final byte[] exif) {
        final byte[] prefix = "Exif\0\0".getBytes(StandardCharsets.US_ASCII);
        if (exif.length >= prefix.length) {
            boolean alreadyPrefixed = true;
            for (int index = 0; index < prefix.length; index++) {
                if (exif[index] != prefix[index]) {
                    alreadyPrefixed = false;
                    break;
                }
            }
            if (alreadyPrefixed) return exif;
        }
        final byte[] result = new byte[prefix.length + exif.length];
        System.arraycopy(prefix, 0, result, 0, prefix.length);
        System.arraycopy(exif, 0, result, prefix.length, exif.length);
        return result;
    }

    private MetadataWriteResult injectPngMetadata(final File outputFile,
                                                  final ImageMetadataPayload metadata,
                                                  final boolean preserveExif,
                                                  final boolean preserveIcc) {
        if ((!preserveExif || !metadata.hasExif()) && (!preserveIcc || !metadata.hasIcc())) {
            return MetadataWriteResult.none();
        }
        try {
            final byte[] encoded = Files.readAllBytes(outputFile.toPath());
            final byte[] signature = {
                    (byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
            };
            if (encoded.length < signature.length || !startsWith(encoded, signature)) {
                return MetadataWriteResult.none();
            }
            final ByteArrayOutputStream output = new ByteArrayOutputStream(encoded.length + 4096);
            output.write(signature, 0, signature.length);
            int offset = signature.length;
            boolean exifPresent = false;
            boolean iccPresent = false;
            boolean inserted = false;
            while (offset + 12 <= encoded.length) {
                final long unsignedLength = readU32(encoded, offset);
                if (unsignedLength > Integer.MAX_VALUE) return MetadataWriteResult.none();
                final int length = (int) unsignedLength;
                final int end = offset + 12 + length;
                if (length < 0 || end < offset || end > encoded.length) {
                    return MetadataWriteResult.none();
                }
                final String type = new String(encoded, offset + 4, 4, StandardCharsets.US_ASCII);
                output.write(encoded, offset, end - offset);
                if ("eXIf".equals(type)) exifPresent = true;
                if ("iCCP".equals(type)) iccPresent = true;
                if ("IHDR".equals(type) && !inserted) {
                    if (preserveExif && metadata.hasExif() && !exifPresent) {
                        output.write(pngChunk("eXIf", metadata.getExif()));
                        exifPresent = true;
                    }
                    if (preserveIcc && metadata.hasIcc() && !iccPresent) {
                        output.write(pngChunk("iCCP", buildPngIccPayload(metadata.getIcc())));
                        iccPresent = true;
                    }
                    inserted = true;
                }
                offset = end;
                if ("IEND".equals(type)) break;
            }
            if (!inserted) return MetadataWriteResult.none();
            Files.write(outputFile.toPath(), output.toByteArray());
            return new MetadataWriteResult(exifPresent && preserveExif && metadata.hasExif(),
                    iccPresent && preserveIcc && metadata.hasIcc());
        } catch (IOException ignored) {
            return MetadataWriteResult.none();
        }
    }

    private byte[] buildPngIccPayload(final byte[] profile) throws IOException {
        final ByteArrayOutputStream compressed = new ByteArrayOutputStream(profile.length);
        try (DeflaterOutputStream deflater = new DeflaterOutputStream(compressed)) {
            deflater.write(profile);
        }
        final ByteArrayOutputStream payload = new ByteArrayOutputStream(compressed.size() + 14);
        payload.write("CameraBorder".getBytes(StandardCharsets.US_ASCII));
        payload.write(0);
        payload.write(0);
        payload.write(compressed.toByteArray());
        return payload.toByteArray();
    }

    private byte[] pngChunk(final String typeName, final byte[] data) {
        final byte[] type = typeName.getBytes(StandardCharsets.US_ASCII);
        final ByteArrayOutputStream chunk = new ByteArrayOutputStream(data.length + 12);
        writeU32(chunk, data.length);
        chunk.write(type, 0, type.length);
        chunk.write(data, 0, data.length);
        final CRC32 crc = new CRC32();
        crc.update(type, 0, type.length);
        crc.update(data, 0, data.length);
        writeU32(chunk, crc.getValue());
        return chunk.toByteArray();
    }

    private static boolean startsWith(final byte[] bytes, final byte[] prefix) {
        if (bytes.length < prefix.length) return false;
        for (int index = 0; index < prefix.length; index++) {
            if (bytes[index] != prefix[index]) return false;
        }
        return true;
    }

    private static long readU32(final byte[] bytes, final int offset) {
        return ((long) (bytes[offset] & 0xff) << 24)
                | ((long) (bytes[offset + 1] & 0xff) << 16)
                | ((long) (bytes[offset + 2] & 0xff) << 8)
                | (bytes[offset + 3] & 0xffL);
    }

    private static void writeU32(final ByteArrayOutputStream output, final long value) {
        output.write((int) ((value >>> 24) & 0xff));
        output.write((int) ((value >>> 16) & 0xff));
        output.write((int) ((value >>> 8) & 0xff));
        output.write((int) (value & 0xff));
    }

    private static final class MetadataWriteResult {
        private final boolean exifWritten;
        private final boolean iccWritten;

        private MetadataWriteResult(final boolean exifWritten, final boolean iccWritten) {
            this.exifWritten = exifWritten;
            this.iccWritten = iccWritten;
        }

        private static MetadataWriteResult none() {
            return new MetadataWriteResult(false, false);
        }
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
