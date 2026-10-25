package com.camborder.app.util;

import com.camborder.app.dto.ExportSettings;
import com.camborder.app.dto.FidelityReport;
import com.camborder.app.exception.RenderExportException;
import com.camborder.app.service.ExifToolService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.metadata.IIOInvalidTreeException;
import javax.imageio.metadata.IIOMetadata;
import javax.imageio.stream.FileImageOutputStream;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.awt.image.WritableRaster;
import java.awt.color.ColorSpace;
import java.awt.color.ICC_ColorSpace;
import java.awt.color.ICC_Profile;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Iterator;
import java.util.HashSet;
import java.util.Set;
import java.util.zip.CRC32;
import java.util.zip.DeflaterOutputStream;
import org.w3c.dom.NamedNodeMap;
import org.w3c.dom.Node;

/**
 * 图像编码器（无状态组件）。
 * 单一职责：把 BufferedImage 编码为 PNG 字节或按导出设置写入 PNG/JPEG/TIFF 文件。
 *
 * JPEG 质量控制：jpegQuality 收敛到 [1,100] 再映射为 [0.01,1.0] 压缩质量；
 * 未传（<=0）时使用默认高质量 95。JPEG 不支持透明通道，统一拍平到白底 RGB 画布。
 *
 * 专业导出能力由 tier 与三个策略字段控制：JPEG 固定 8-bit，PNG/TIFF 真实保留 8/16-bit；
 * 像素先按源 ICC 转换到目标色彩空间，再由受控 ExifTool 写回 ICC 和元数据。写回后必须
 * 独立读取输出文件，只有事实校验通过才返回 verified=true；所有能力通过 ExportResult
 * 和 FidelityReport 结构化返回，前端据此展示真实结果。
 */
@Component
public final class ImageEncoder {

    private final ExifToolService exifToolService;

    private static final int MIN_JPEG_QUALITY = 1;
    private static final int MAX_JPEG_QUALITY = 100;
    private static final int DEFAULT_JPEG_QUALITY = 95;
    private static final String DEFAULT_FORMAT = "png";
    private static final byte[] JPEG_EXIF_PREFIX = {'E', 'x', 'i', 'f', 0, 0};
    private static final String TIFF_NATIVE_METADATA_FORMAT = "javax_imageio_tiff_image_1.0";
    private static final int TIFF_EXIF_IFD_POINTER = 34665;
    private static final int TIFF_GPS_IFD_POINTER = 34853;
    private static final int TIFF_INTEROPERABILITY_IFD_POINTER = 40965;
    private static final int TIFF_ICC_PROFILE = 34675;
    private static final long MAX_TIFF_METADATA_BYTES = 16L * 1024L * 1024L;
    private static final String TIFF_TAG_SETS =
            "javax.imageio.plugins.tiff.BaselineTIFFTagSet,"
                    + "javax.imageio.plugins.tiff.FaxTIFFTagSet,"
                    + "javax.imageio.plugins.tiff.ExifParentTIFFTagSet,"
                    + "javax.imageio.plugins.tiff.GeoTIFFTagSet";
    private static final Set<Integer> TIFF_IMAGE_STRUCTURE_TAGS = Set.of(
            254, 256, 257, 258, 259, 262, 273, 277, 278, 279, 284,
            322, 323, 324, 325, 338, 339, 530, 531, 532);

    /** 旧单元测试/非 Spring 调用只使用兼容的内置编码路径。 */
    public ImageEncoder() {
        this(null);
    }

    @Autowired
    public ImageEncoder(final ExifToolService exifToolService) {
        this.exifToolService = exifToolService;
    }

    public byte[] toPng(final BufferedImage image) {
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            if (!ImageIO.write(image, "png", output)) {
                throw new IllegalStateException("no PNG writer available");
            }
            return injectPngIcc(output.toByteArray(), actualIccProfile(image));
        } catch (IOException e) {
            throw new IllegalStateException("failed to encode preview PNG", e);
        }
    }

    /** 预览 PNG 使用与像素缓冲区相同的 ICC；无 profile 的 Java 图像按 sRGB 处理。 */
    public static byte[] actualIccProfile(final BufferedImage image) {
        try {
            if (image != null && image.getColorModel().getColorSpace() instanceof ICC_ColorSpace) {
                return ((ICC_ColorSpace) image.getColorModel().getColorSpace()).getProfile().getData();
            }
            return ICC_Profile.getInstance(ColorSpace.CS_sRGB).getData();
        } catch (RuntimeException exception) {
            throw new RenderExportException("无法取得输出 ICC");
        }
    }

    private byte[] injectPngIcc(final byte[] encoded, final byte[] profile) throws IOException {
        final byte[] signature = {
                (byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
        };
        if (!startsWith(encoded, signature) || profile == null || profile.length == 0) {
            throw new IOException("PNG 编码结果无效或 ICC 为空");
        }
        final ByteArrayOutputStream output = new ByteArrayOutputStream(encoded.length + profile.length);
        output.write(signature);
        int offset = signature.length;
        boolean inserted = false;
        while (offset + 12 <= encoded.length) {
            final long length = readU32(encoded, offset);
            if (length > Integer.MAX_VALUE) throw new IOException("PNG chunk 过大");
            final int end = offset + 12 + (int) length;
            if (end < offset || end > encoded.length) throw new IOException("PNG chunk 无效");
            final String type = new String(encoded, offset + 4, 4, StandardCharsets.US_ASCII);
            output.write(encoded, offset, end - offset);
            if ("IHDR".equals(type) && !inserted) {
                output.write(pngChunk("iCCP", buildPngIccPayload(profile)));
                inserted = true;
            }
            offset = end;
            if ("IEND".equals(type)) break;
        }
        if (!inserted) throw new IOException("PNG 缺少 IHDR");
        return output.toByteArray();
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
        return writeToFile(image, outputPath, export, sourcePath, null);
    }

    /** 阶段五入口：使用渲染阶段已经读取的源事实，避免二次解码造成报告漂移。 */
    public ExportResult writeToFile(final BufferedImage image, final String outputPath,
                                    final ExportSettings export, final String sourcePath,
                                    final SourceImageInfo sourceInfo) {
        if (export.hasProfessionalPolicy()) {
            return writeProfessional(image, outputPath, export, sourcePath, sourceInfo);
        }
        String resolvedFormat = resolveFormat(export.getFormat());
        File outputFile = OutputPathValidator.resolveAndPrepare(outputPath);
        ImageMetadataPayload metadata = export.isPreserveMetadata() || export.isPreserveColorProfile()
                ? ImageMetadataPayload.read(sourcePath)
                : ImageMetadataPayload.empty();

        if ("jpeg".equals(resolvedFormat)) {
            writeJpeg(image, outputFile, export.getJpegQuality());
            MetadataWriteResult metadataWrite = applyMetadata(outputFile, resolvedFormat, metadata,
                    export.isPreserveMetadata(), export.isPreserveColorProfile());
            return buildExportResult(outputFile.getAbsolutePath(), resolvedFormat, export,
                    image, metadata, metadataWrite);
        } else if ("tiff".equals(resolvedFormat)) {
            MetadataWriteResult metadataWrite = writeTiff(image, outputFile, metadata,
                    export.isPreserveMetadata(), export.isPreserveColorProfile());
            return buildExportResult(outputFile.getAbsolutePath(), resolvedFormat, export,
                    image, metadata, metadataWrite);
        } else {
            writePng(image, outputFile);
        }

        MetadataWriteResult metadataWrite = applyMetadata(outputFile, resolvedFormat, metadata,
                export.isPreserveMetadata(), export.isPreserveColorProfile());
        return buildExportResult(outputFile.getAbsolutePath(), resolvedFormat, export,
                image, metadata, metadataWrite);
    }

    private ExportResult writeProfessional(final BufferedImage image, final String outputPath,
                                           final ExportSettings export, final String sourcePath,
                                           final SourceImageInfo suppliedSourceInfo) {
        if (exifToolService == null || !exifToolService.isAvailable()) {
            throw new RenderExportException("ExifTool 不可用，专业导出失败");
        }
        if (sourcePath == null || sourcePath.isBlank()) {
            throw new RenderExportException("专业导出必须提供源图路径");
        }
        final SourceImageInfo sourceInfo = suppliedSourceInfo == null
                ? new ImageReader(new RawDecoder(), exifToolService)
                .readWithSource(sourcePath).getSourceInfo()
                : suppliedSourceInfo;
        final String format = resolveFormat(export.getFormat());
        final int targetBitDepth = targetBitDepth(export, format, sourceInfo.getBitDepth());
        final byte[] targetIcc = targetIcc(export, sourceInfo);
        final BufferedImage prepared = prepareProfessionalImage(image, targetBitDepth, targetIcc);
        final File outputFile = OutputPathValidator.resolveAndPrepare(outputPath);
        final File parent = outputFile.getParentFile() == null
                ? new File(".") : outputFile.getParentFile();
        final String suffix = "." + ("jpeg".equals(format) ? "jpg" : format);
        final Path staging;
        try {
            staging = Files.createTempFile(parent.toPath(), ".camborder-export-", suffix);
        } catch (IOException exception) {
            throw new RenderExportException("无法创建导出临时文件");
        }
        boolean moved = false;
        try {
            if ("jpeg".equals(format)) {
                writeJpeg(prepared, staging.toFile(), export.getJpegQuality());
            } else if ("tiff".equals(format)) {
                writeTiff(prepared, staging.toFile(), ImageMetadataPayload.empty(), false, false, true);
            } else if ("png".equals(format)) {
                writePng(prepared, staging.toFile());
            } else {
                throw new RenderExportException("format must be png, jpeg or tiff");
            }

            final String metadataPolicy = export.effectiveMetadataPolicy();
            exifToolService.rewrite(Path.of(sourcePath), staging, metadataPolicy,
                    targetIcc, prepared.getWidth(), prepared.getHeight(), targetBitDepth,
                    outputColorSpace(export, sourceInfo));
            final ExifToolService.Inspection outputInspection = exifToolService.inspect(staging);
            if (!outputInspection.isValid()
                    || outputInspection.getWidth() != prepared.getWidth()
                    || outputInspection.getHeight() != prepared.getHeight()
                    || outputInspection.getBitDepth() != targetBitDepth
                    || outputInspection.getOrientation() != 1) {
                throw new RenderExportException("输出文件独立事实校验失败");
            }
            validateProfessionalMetadata(export, sourceInfo, outputInspection, targetIcc);
            final FidelityReport report = buildProfessionalReport(
                    export, format, sourceInfo, outputInspection, targetBitDepth, targetIcc,
                    prepared.getWidth(), prepared.getHeight());
            try {
                Files.move(staging, outputFile.toPath(), java.nio.file.StandardCopyOption.ATOMIC_MOVE);
            } catch (java.nio.file.AtomicMoveNotSupportedException exception) {
                Files.move(staging, outputFile.toPath());
            }
            moved = true;
            return new ExportResult(outputFile.getAbsolutePath(), format,
                    report.getFeatures().get("metadata"),
                    report.getFeatures().get("colorProfile"),
                    report.getFeatures().get("bitDepth"), report);
        } catch (IOException exception) {
            throw new RenderExportException("导出文件写入失败");
        } finally {
            if (!moved) {
                try { Files.deleteIfExists(staging); } catch (IOException ignored) { }
            }
        }
    }

    private int targetBitDepth(final ExportSettings export, final String format, final int sourceBitDepth) {
        if ("jpeg".equals(format)) return 8;
        if (!"source".equals(export.effectiveBitDepthPolicy())) return 8;
        if (sourceBitDepth == 8 || sourceBitDepth == 16) return sourceBitDepth;
        throw new RenderExportException("源图位深不是可保留的 8/16-bit");
    }

    private byte[] targetIcc(final ExportSettings export, final SourceImageInfo sourceInfo) {
        final String policy = export.effectiveColorProfilePolicy();
        if ("none".equals(policy)) return null;
        if ("source".equals(policy) && sourceInfo.getIcc() != null) return sourceInfo.getIcc();
        try {
            return ICC_Profile.getInstance(ColorSpace.CS_sRGB).getData();
        } catch (RuntimeException exception) {
            throw new RenderExportException("内置 sRGB ICC 不可用");
        }
    }

    private String outputColorSpace(final ExportSettings export, final SourceImageInfo sourceInfo) {
        if ("srgb".equalsIgnoreCase(export.effectiveColorProfilePolicy())
                || sourceInfo.getIcc() == null) {
            return "sRGB";
        }
        return "icc";
    }

    private void validateProfessionalMetadata(final ExportSettings export,
                                              final SourceImageInfo sourceInfo,
                                              final ExifToolService.Inspection output,
                                              final byte[] targetIcc) {
        if (targetIcc != null && (output.getIcc() == null
                || !"present".equalsIgnoreCase(output.getIcc().getState()))) {
            throw new RenderExportException("输出文件未包含策略要求的 ICC");
        }
        final String policy = export.effectiveMetadataPolicy();
        final FidelityReport.MetadataFacts source = sourceInfo.getMetadata();
        final FidelityReport.MetadataFacts actual = output.getMetadata();
        if (actual == null) throw new RenderExportException("输出文件元数据事实无效");
        if ("remove-location".equals(policy) && actual.isGps()) {
            throw new RenderExportException("分享档位置元数据未能移除");
        }
        if (!"preserve".equals(policy) || source == null) return;
        if (source.isXmp() && !actual.isXmp()) throw new RenderExportException("XMP 元数据写回失败");
        if (source.isIptc() && !actual.isIptc()) throw new RenderExportException("IPTC 元数据写回失败");
        if (source.isDpi() && !actual.isDpi()) throw new RenderExportException("DPI 元数据写回失败");
        if (source.isGps() && !actual.isGps()) throw new RenderExportException("GPS 元数据写回失败");
        if (source.isExif() && !actual.isExif()) throw new RenderExportException("EXIF 元数据写回失败");
    }

    /**
     * 合成结果来自明确的 sRGB 工作缓冲区；目标是源 ICC 时也必须先把 sRGB 像素转换到
     * 目标 profile，再交给 ExifTool 嵌入，禁止把工作缓冲区数值直接标成源 ICC。
     */
    private BufferedImage prepareProfessionalImage(final BufferedImage input, final int targetBitDepth,
                                                   final byte[] targetIcc) {
        final ColorSpace sourceColorSpace = ColorSpace.getInstance(ColorSpace.CS_sRGB);
        final ColorSpace targetColorSpace = targetIcc == null
                ? sourceColorSpace
                : new ICC_ColorSpace(ICC_Profile.getInstance(targetIcc));
        final BufferedImage sourceProfiled = copyToColorSpace(input,
                PixelBufferFactory.bitDepth(input), sourceColorSpace);
        final boolean sameColorSpace = targetColorSpace.isCS_sRGB();
        if (sameColorSpace && PixelBufferFactory.bitDepth(sourceProfiled) == targetBitDepth) {
            return sourceProfiled;
        }
        final BufferedImage target = PixelBufferFactory.create(
                input.getWidth(), input.getHeight(), targetBitDepth,
                input.getColorModel().hasAlpha(), targetColorSpace);
        if (!sameColorSpace) {
            new java.awt.image.ColorConvertOp(sourceColorSpace, targetColorSpace, null)
                    .filter(sourceProfiled, target);
            return target;
        }
        return copyImageSamples(sourceProfiled, target);
    }

    private BufferedImage copyToColorSpace(final BufferedImage source, final int bitDepth,
                                           final ColorSpace colorSpace) {
        final BufferedImage result = PixelBufferFactory.create(source.getWidth(), source.getHeight(),
                bitDepth, source.getColorModel().hasAlpha(), colorSpace);
        return copyImageSamples(source, result);
    }

    private BufferedImage copyImageSamples(final BufferedImage source, final BufferedImage target) {
        final WritableRaster sourceRaster = source.getRaster();
        final WritableRaster targetRaster = target.getRaster();
        final int sourceBits = PixelBufferFactory.bitDepth(source);
        final int targetBits = PixelBufferFactory.bitDepth(target);
        final int bands = Math.min(sourceRaster.getNumBands(), targetRaster.getNumBands());
        for (int y = 0; y < source.getHeight(); y++) {
            for (int x = 0; x < source.getWidth(); x++) {
                for (int band = 0; band < bands; band++) {
                    int value = sourceRaster.getSample(x, y, band);
                    if (sourceBits > targetBits) {
                        value = (int) Math.round(value * ((double) ((1 << targetBits) - 1)
                                / ((1 << sourceBits) - 1)));
                    } else if (sourceBits < targetBits) {
                        value = (int) Math.round(value * ((double) ((1 << targetBits) - 1)
                                / ((1 << sourceBits) - 1)));
                    }
                    targetRaster.setSample(x, y, band, value);
                }
            }
        }
        return target;
    }

    private FidelityReport buildProfessionalReport(final ExportSettings export, final String format,
                                                    final SourceImageInfo sourceInfo,
                                                    final ExifToolService.Inspection output,
                                                    final int targetBitDepth, final byte[] targetIcc,
                                                    final int width, final int height) {
        final FidelityReport report = FidelityReport.completed(export.getTier(), format);
        report.setPixelSource(sourceInfo.getPixelSource());
        report.setMetadataSource(sourceInfo.getMetadataSource());
        report.setSource(sourceInfo.toFacts());
        final FidelityReport.Facts outputFacts = factsFromInspection(output);
        report.setOutput(outputFacts);
        report.getTransformations().setColorConverted(
                colorConversionOccurred(sourceInfo.getIcc(), targetIcc));
        report.getTransformations().setResized(width != sourceInfo.getWidth() || height != sourceInfo.getHeight());
        report.getTransformations().setOrientationNormalized(true);
        report.getTransformations().setLocationPolicy(export.effectiveMetadataPolicy());
        report.getTransformations().setThumbnailPolicy("regenerated-or-removed");
        final ImageEncoder.FeatureResult metadata = metadataFeature(export, sourceInfo);
        final ImageEncoder.FeatureResult color = targetIcc == null
                ? new FeatureResult(FeatureStatus.NOT_REQUESTED, "未请求输出 ICC")
                : new FeatureResult(FeatureStatus.APPLIED,
                sourceInfo.getIcc() == null && "source".equals(export.effectiveColorProfilePolicy())
                        ? "源图无 ICC，按 sRGB 处理并写入输出" : "输出 ICC 已按策略处理");
        final ImageEncoder.FeatureResult bitDepth = new FeatureResult(
                export.effectiveBitDepthPolicy().equals("source") && sourceInfo.getBitDepth() != targetBitDepth
                        ? FeatureStatus.DOWNGRADED : FeatureStatus.APPLIED,
                "输出实际位深：" + targetBitDepth + "-bit");
        report.getFeatures().put("metadata", metadata);
        report.getFeatures().put("colorProfile", color);
        report.getFeatures().put("bitDepth", bitDepth);
        if ("embedded-jpeg".equals(sourceInfo.getPixelSource())) {
            report.setFidelityScope("limited");
            report.getWarnings().add("RAW 仅使用内嵌 JPEG 像素");
        }
        return report;
    }

    private boolean colorConversionOccurred(final byte[] sourceIcc, final byte[] targetIcc) {
        boolean sourceIsSrgb = sourceIcc == null;
        if (sourceIcc != null) {
            try {
                sourceIsSrgb = new ICC_ColorSpace(ICC_Profile.getInstance(sourceIcc)).isCS_sRGB();
            } catch (RuntimeException ignored) {
                sourceIsSrgb = false;
            }
        }
        if (!sourceIsSrgb) return sourceIcc != null;
        if (targetIcc == null) return false;
        try {
            return !new ICC_ColorSpace(ICC_Profile.getInstance(targetIcc)).isCS_sRGB();
        } catch (RuntimeException ignored) {
            return true;
        }
    }

    private ImageEncoder.FeatureResult metadataFeature(final ExportSettings export,
                                                       final SourceImageInfo sourceInfo) {
        final String policy = export.effectiveMetadataPolicy();
        if ("strip".equals(policy)) return new FeatureResult(FeatureStatus.NOT_REQUESTED, "未保留源元数据");
        final FidelityReport.MetadataFacts metadata = sourceInfo.getMetadata();
        final boolean any = metadata != null && (metadata.isExif() || metadata.isXmp()
                || metadata.isIptc() || metadata.isGps() || metadata.isDpi());
        return any ? new FeatureResult(FeatureStatus.APPLIED, "元数据已按策略写回")
                : new FeatureResult(FeatureStatus.SOURCE_ABSENT, "源图没有可保留的元数据");
    }

    private FidelityReport.Facts factsFromInspection(final ExifToolService.Inspection inspection) {
        final FidelityReport.Facts facts = new FidelityReport.Facts();
        facts.setWidth(inspection.getWidth());
        facts.setHeight(inspection.getHeight());
        facts.setDecodedWidth(inspection.getWidth());
        facts.setDecodedHeight(inspection.getHeight());
        facts.setOrientedWidth(inspection.getWidth());
        facts.setOrientedHeight(inspection.getHeight());
        facts.setBitDepth(inspection.getBitDepth());
        facts.setColorSpace(inspection.getColorSpace());
        facts.setOrientation(inspection.getOrientation());
        facts.setOrientationApplied(inspection.getOrientation() == 1);
        facts.setIcc(inspection.getIcc());
        facts.setMetadata(inspection.getMetadata());
        return facts;
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

    /** 把 JPEG/PNG 源图元数据写回编码结果。TIFF 在写入阶段使用原生 metadata tree。 */
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
        final byte[] exif = metadata.getExif();
        final byte[] profile = metadata.getIcc();
        final boolean writeExif = preserveExif && metadata.hasExif()
                && exif != null && exif.length > 0;
        final boolean writeIcc = preserveIcc && metadata.hasIcc()
                && profile != null && profile.length > 0;
        if (!writeExif && !writeIcc) {
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
            if (writeExif) {
                exifWritten = writeJpegSegment(output, 0xe1,
                        normalizeExifPayload(exif));
            }

            boolean iccWritten = false;
            if (writeIcc) {
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
        final byte[] prefix = JPEG_EXIF_PREFIX;
        final byte[] normalized = ImageOrientation.normalizeExifPayload(exif);
        if (startsWith(normalized, prefix)) return normalized;
        final byte[] result = new byte[prefix.length + normalized.length];
        System.arraycopy(prefix, 0, result, 0, prefix.length);
        System.arraycopy(normalized, 0, result, prefix.length, normalized.length);
        return result;
    }

    private MetadataWriteResult injectPngMetadata(final File outputFile,
                                                  final ImageMetadataPayload metadata,
                                                  final boolean preserveExif,
                                                  final boolean preserveIcc) {
        final byte[] exif = metadata.getExif();
        final byte[] profile = metadata.getIcc();
        final boolean writeExif = preserveExif && metadata.hasExif()
                && exif != null && exif.length > 0;
        final boolean writeIcc = preserveIcc && metadata.hasIcc()
                && profile != null && profile.length > 0;
        if (!writeExif && !writeIcc) {
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
                    if (writeExif && !exifPresent) {
                        output.write(pngChunk("eXIf", normalizePngExifPayload(exif)));
                        exifPresent = true;
                    }
                    if (writeIcc && !iccPresent) {
                        output.write(pngChunk("iCCP", buildPngIccPayload(profile)));
                        iccPresent = true;
                    }
                    inserted = true;
                }
                offset = end;
                if ("IEND".equals(type)) break;
            }
            if (!inserted) return MetadataWriteResult.none();
            Files.write(outputFile.toPath(), output.toByteArray());
            return new MetadataWriteResult(exifPresent && writeExif,
                    iccPresent && writeIcc);
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

    /** PNG eXIf chunk承载 TIFF payload，不包含 JPEG APP1 的 Exif 前缀。 */
    private byte[] normalizePngExifPayload(final byte[] exif) {
        final byte[] normalized = ImageOrientation.normalizeExifPayload(exif);
        if (startsWith(normalized, JPEG_EXIF_PREFIX)) {
            return Arrays.copyOfRange(normalized, JPEG_EXIF_PREFIX.length, normalized.length);
        }
        return normalized;
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

    private static final class TiffMetadataPreparation {
        private final IIOMetadata metadata;
        private final MetadataWriteResult writeResult;

        private TiffMetadataPreparation(final IIOMetadata metadata,
                                         final MetadataWriteResult writeResult) {
            this.metadata = metadata;
            this.writeResult = writeResult;
        }

        private static TiffMetadataPreparation empty() {
            return new TiffMetadataPreparation(null, MetadataWriteResult.none());
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

    private MetadataWriteResult writeTiff(final BufferedImage image, final File outputFile,
                                          final ImageMetadataPayload metadata,
                                          final boolean preserveExif,
                                          final boolean preserveIcc) {
        return writeTiff(image, outputFile, metadata, preserveExif, preserveIcc, false);
    }

    private MetadataWriteResult writeTiff(final BufferedImage image, final File outputFile,
                                          final ImageMetadataPayload metadata,
                                          final boolean preserveExif,
                                          final boolean preserveIcc,
                                          final boolean preferBundledWriter) {
        ImageWriter writer = lookupTiffWriter(image, preferBundledWriter);
        ImageWriteParam param = writer.getDefaultWriteParam();
        param.setCompressionMode(ImageWriteParam.MODE_DISABLED);
        TiffMetadataPreparation preparation = prepareTiffMetadata(
                image, writer, param, metadata, preserveExif, preserveIcc);

        try (FileImageOutputStream output = new FileImageOutputStream(outputFile)) {
            writer.setOutput(output);
            writer.write(null, new IIOImage(image, null, preparation.metadata), param);
        } catch (IOException e) {
            throw new RenderExportException("failed to write TIFF output file");
        } finally {
            writer.dispose();
        }
        return preparation.writeResult;
    }

    /**
     * TIFF 的元数据必须在 writer 写文件时提供。只删掉未请求的元数据树节点，保留
     * 其他 IFD、厂商字段和 ICC 原始字节；writer 会根据当前合成图更新尺寸与条带偏移。
     */
    private TiffMetadataPreparation prepareTiffMetadata(final BufferedImage image,
                                                        final ImageWriter writer,
                                                        final ImageWriteParam param,
                                                        final ImageMetadataPayload metadata,
                                                        final boolean preserveExif,
                                                        final boolean preserveIcc) {
        final IIOMetadata source = metadata.getTiffMetadata();
        if (source != null && source.getNativeMetadataFormatName() != null) {
            return prepareExistingTiffMetadata(source, metadata, preserveExif, preserveIcc);
        }
        if ((!preserveExif || !metadata.hasExif()) && (!preserveIcc || !metadata.hasIcc())) {
            return TiffMetadataPreparation.empty();
        }
        try {
            final IIOMetadata target = writer.getDefaultImageMetadata(
                    new javax.imageio.ImageTypeSpecifier(image), param);
            final Node root = target.getAsTree(TIFF_NATIVE_METADATA_FORMAT);
            final Node ifd = root.getFirstChild();
            if (ifd == null) return TiffMetadataPreparation.empty();
            if (ifd instanceof javax.imageio.metadata.IIOMetadataNode) {
                ((javax.imageio.metadata.IIOMetadataNode) ifd).setAttribute("tagSets", TIFF_TAG_SETS);
            }

            boolean exifWritten = false;
            if (preserveExif && metadata.hasExif()) {
                exifWritten = appendExifMetadata(ifd, metadata.getExif());
            }
            boolean iccWritten = false;
            if (preserveIcc && metadata.hasIcc() && metadata.getIcc() != null) {
                appendTiffField(ifd, TIFF_ICC_PROFILE, "TIFFUndefined", "TIFFUndefined",
                        metadata.getIcc());
                iccWritten = true;
            }
            if (!exifWritten && !iccWritten) {
                return TiffMetadataPreparation.empty();
            }
            target.setFromTree(TIFF_NATIVE_METADATA_FORMAT, root);
            return new TiffMetadataPreparation(target,
                    new MetadataWriteResult(exifWritten, iccWritten));
        } catch (IIOInvalidTreeException | RuntimeException e) {
            return TiffMetadataPreparation.empty();
        }
    }

    private TiffMetadataPreparation prepareExistingTiffMetadata(final IIOMetadata source,
                                                                  final ImageMetadataPayload metadata,
                                                                  final boolean preserveExif,
                                                                  final boolean preserveIcc) {
        try {
            final String formatName = source.getNativeMetadataFormatName();
            final Node tree = source.getAsTree(formatName);
            if (!preserveExif) {
                removeTiffExif(tree);
            }
            if (!preserveIcc) {
                removeTiffFields(tree, 34675);
            }
            source.setFromTree(formatName, tree);
            return new TiffMetadataPreparation(source, new MetadataWriteResult(
                    preserveExif && metadata.hasExif(),
                    preserveIcc && metadata.hasIcc()));
        } catch (IIOInvalidTreeException | RuntimeException e) {
            return TiffMetadataPreparation.empty();
        }
    }

    private static boolean appendExifMetadata(final Node target, final byte[] payload) {
        return new ExifTiffParser(payload).appendTo(target);
    }

    private static void appendTiffField(final Node ifd, final int number,
                                        final String containerName, final String valueName,
                                        final byte[] values) {
        final javax.imageio.metadata.IIOMetadataNode field =
                new javax.imageio.metadata.IIOMetadataNode("TIFFField");
        field.setAttribute("number", Integer.toString(number));
        final javax.imageio.metadata.IIOMetadataNode value =
                new javax.imageio.metadata.IIOMetadataNode(valueName);
        value.setAttribute("value", unsignedByteList(values));
        if ("TIFFUndefined".equals(containerName)) {
            // TIFFUndefined 是 TIFFField 的直接子节点，不再套一层容器。
            field.appendChild(value);
        } else {
            final javax.imageio.metadata.IIOMetadataNode container =
                    new javax.imageio.metadata.IIOMetadataNode(containerName);
            container.appendChild(value);
            field.appendChild(container);
        }
        ifd.appendChild(field);
    }

    private static String unsignedByteList(final byte[] values) {
        final StringBuilder result = new StringBuilder(values.length * 4);
        for (int index = 0; index < values.length; index++) {
            if (index > 0) result.append(',');
            result.append(values[index] & 0xff);
        }
        return result.toString();
    }

    /**
     * 把 JPEG/PNG 中的标准 EXIF TIFF payload 转成输出 TIFF 的原生 IFD 节点。
     * 这是容器转换，不重新计算拍摄字段；输出像素的结构字段由 TIFF writer 自己生成。
     */
    private static final class ExifTiffParser {
        private static final int MAX_IFD_ENTRIES = 4096;
        private static final byte[] EXIF_PREFIX = {'E', 'x', 'i', 'f', 0, 0};

        private final byte[] payload;
        private final Set<Long> visitedIfds = new HashSet<>();
        private int tiffStart;
        private boolean littleEndian;

        private ExifTiffParser(final byte[] payload) {
            this.payload = payload;
        }

        private boolean appendTo(final Node target) {
            if (payload == null || payload.length < 8) return false;
            tiffStart = startsWith(payload, EXIF_PREFIX) ? EXIF_PREFIX.length : 0;
            if (tiffStart + 8 > payload.length) return false;
            if (payload[tiffStart] == 'I' && payload[tiffStart + 1] == 'I') {
                littleEndian = true;
            } else if (payload[tiffStart] == 'M' && payload[tiffStart + 1] == 'M') {
                littleEndian = false;
            } else {
                return false;
            }
            if (readUnsigned(tiffStart + 2, 2) != 42) return false;
            final long firstIfdOffset = readUnsigned(tiffStart + 4, 4);
            return appendIfd(target, firstIfdOffset, true);
        }

        private boolean appendIfd(final Node target, final long relativeOffset,
                                  final boolean rootIfd) {
            if (!visitedIfds.add(relativeOffset)) return true;
            if (relativeOffset < 0 || relativeOffset > Integer.MAX_VALUE) return false;
            final long absoluteLong = (long) tiffStart + relativeOffset;
            if (absoluteLong < 0 || absoluteLong + 2 > payload.length) return false;
            final int absolute = (int) absoluteLong;
            final int entryCount = (int) readUnsigned(absolute, 2);
            if (entryCount < 0 || entryCount > MAX_IFD_ENTRIES) return false;
            final long end = absoluteLong + 2L + entryCount * 12L;
            if (end > payload.length) return false;

            boolean complete = true;
            for (int index = 0; index < entryCount; index++) {
                final int entry = absolute + 2 + index * 12;
                final int tag = (int) readUnsigned(entry, 2);
                final int type = (int) readUnsigned(entry + 2, 2);
                final long count = readUnsigned(entry + 4, 4);
                final int typeSize = typeSize(type);
                if (typeSize == 0 || count > Integer.MAX_VALUE / (long) typeSize) {
                    complete = false;
                    continue;
                }
                final long byteCount = count * typeSize;
                final byte[] data = readFieldBytes(entry, byteCount);
                if (data == null) {
                    complete = false;
                    continue;
                }
                if (isPointerTag(tag)) {
                    final long childOffset = firstUnsignedValue(data, type, count);
                    if (childOffset <= 0) {
                        complete = false;
                        continue;
                    }
                    final javax.imageio.metadata.IIOMetadataNode childIfd =
                            new javax.imageio.metadata.IIOMetadataNode("TIFFIFD");
                    childIfd.setAttribute("parentTagNumber", Integer.toString(tag));
                    childIfd.setAttribute("parentTagName", parentTagName(tag));
                    childIfd.setAttribute("tagSets", tagSetName(tag));
                    if (!appendIfd(childIfd, childOffset, false)) {
                        complete = false;
                    } else {
                        target.appendChild(childIfd);
                    }
                    continue;
                }
                if (rootIfd && TIFF_IMAGE_STRUCTURE_TAGS.contains(tag)) {
                    continue;
                }
                if (tag == 274 && type == 3 && count == 1) {
                    // 像素链路已经物理应用方向，导出 TIFF 不能再次触发旋转。
                    appendParsedField(target, tag, type, count, new byte[]{1, 0});
                    continue;
                }
                if (!appendParsedField(target, tag, type, count, data)) {
                    complete = false;
                }
            }
            return complete;
        }

        private byte[] readFieldBytes(final int entry, final long byteCount) {
            if (byteCount < 0 || byteCount > MAX_TIFF_METADATA_BYTES) return null;
            final long dataOffset = byteCount <= 4
                    ? entry + 8L
                    : (long) tiffStart + readUnsigned(entry + 8, 4);
            if (dataOffset < 0 || dataOffset + byteCount > payload.length) return null;
            return Arrays.copyOfRange(payload, (int) dataOffset,
                    (int) (dataOffset + byteCount));
        }

        private long firstUnsignedValue(final byte[] data, final int type, final long count) {
            if (count <= 0 || data.length < typeSize(type)) return 0;
            if (type == 3) return unsignedAt(data, 0, 2);
            if (type == 4 || type == 13) return unsignedAt(data, 0, 4);
            return 0;
        }

        private boolean appendParsedField(final Node target, final int tag, final int type,
                                          final long count, final byte[] data) {
            final String[] names = valueNodeNames(type);
            if (names == null || count == 0) return false;
            final javax.imageio.metadata.IIOMetadataNode field =
                    new javax.imageio.metadata.IIOMetadataNode("TIFFField");
            field.setAttribute("number", Integer.toString(tag));
            if (type == 7) {
                final javax.imageio.metadata.IIOMetadataNode value =
                        new javax.imageio.metadata.IIOMetadataNode("TIFFUndefined");
                value.setAttribute("value", unsignedByteList(data));
                field.appendChild(value);
                target.appendChild(field);
                return true;
            }
            final javax.imageio.metadata.IIOMetadataNode container =
                    new javax.imageio.metadata.IIOMetadataNode(names[0]);
            if (type == 1 || type == 6) {
                for (byte datum : data) {
                    final javax.imageio.metadata.IIOMetadataNode value =
                            new javax.imageio.metadata.IIOMetadataNode(names[1]);
                    value.setAttribute("value", Integer.toString(type == 6 ? datum : datum & 0xff));
                    container.appendChild(value);
                }
            } else if (type == 2) {
                final String ascii = new String(data, java.nio.charset.StandardCharsets.US_ASCII);
                final String[] strings = ascii.split("\\u0000", -1);
                boolean appended = false;
                for (String valueText : strings) {
                    if (valueText.isEmpty() && strings.length > 1) continue;
                    final javax.imageio.metadata.IIOMetadataNode value =
                            new javax.imageio.metadata.IIOMetadataNode(names[1]);
                    value.setAttribute("value", valueText);
                    container.appendChild(value);
                    appended = true;
                }
                if (!appended) return false;
            } else {
                final int size = typeSize(type);
                for (int index = 0; index < count; index++) {
                    final javax.imageio.metadata.IIOMetadataNode value =
                            new javax.imageio.metadata.IIOMetadataNode(names[1]);
                    value.setAttribute("value", valueText(type, data, index * size));
                    container.appendChild(value);
                }
            }
            field.appendChild(container);
            target.appendChild(field);
            return true;
        }

        private String valueText(final int type, final byte[] data, final int offset) {
            if (type == 3) return Long.toString(unsignedAt(data, offset, 2));
            if (type == 4 || type == 13) return Long.toString(unsignedAt(data, offset, 4));
            if (type == 5) {
                return unsignedAt(data, offset, 4) + "/" + unsignedAt(data, offset + 4, 4);
            }
            if (type == 8) return Long.toString(signedAt(data, offset, 2));
            if (type == 9) return Long.toString(signedAt(data, offset, 4));
            if (type == 10) {
                return signedAt(data, offset, 4) + "/" + signedAt(data, offset + 4, 4);
            }
            if (type == 11) return Float.toString(Float.intBitsToFloat((int) unsignedAt(data, offset, 4)));
            if (type == 12) return Double.toString(Double.longBitsToDouble(unsignedAt(data, offset, 8)));
            return Long.toString(unsignedAt(data, offset, 1));
        }

        private long unsignedAt(final byte[] data, final int offset, final int size) {
            long value = 0;
            if (littleEndian) {
                for (int index = size - 1; index >= 0; index--) {
                    value = (value << 8) | (data[offset + index] & 0xffL);
                }
            } else {
                for (int index = 0; index < size; index++) {
                    value = (value << 8) | (data[offset + index] & 0xffL);
                }
            }
            return value;
        }

        private long signedAt(final byte[] data, final int offset, final int size) {
            final long unsigned = unsignedAt(data, offset, size);
            if (size == 2 && (unsigned & 0x8000) != 0) return unsigned - 0x10000;
            if (size == 4 && (unsigned & 0x80000000L) != 0) return unsigned - 0x100000000L;
            return unsigned;
        }

        private long readUnsigned(final int offset, final int size) {
            return unsignedAt(payload, offset, size);
        }

        private static int typeSize(final int type) {
            switch (type) {
                case 1: case 2: case 6: case 7: return 1;
                case 3: case 8: return 2;
                case 4: case 9: case 11: case 13: return 4;
                case 5: case 10: case 12: return 8;
                default: return 0;
            }
        }

        private static String[] valueNodeNames(final int type) {
            switch (type) {
                case 1: return new String[]{"TIFFBytes", "TIFFByte"};
                case 2: return new String[]{"TIFFAsciis", "TIFFAscii"};
                case 3: return new String[]{"TIFFShorts", "TIFFShort"};
                case 4: return new String[]{"TIFFLongs", "TIFFLong"};
                case 5: return new String[]{"TIFFRationals", "TIFFRational"};
                case 6: return new String[]{"TIFFSBytes", "TIFFSByte"};
                case 7: return new String[]{"TIFFUndefined", "TIFFUndefined"};
                case 8: return new String[]{"TIFFSShorts", "TIFFSShort"};
                case 9: return new String[]{"TIFFSLongs", "TIFFSLong"};
                case 10: return new String[]{"TIFFSRationals", "TIFFSRational"};
                case 11: return new String[]{"TIFFFloats", "TIFFFloat"};
                case 12: return new String[]{"TIFFDoubles", "TIFFDouble"};
                default: return null;
            }
        }

        private static boolean isPointerTag(final int tag) {
            return tag == TIFF_EXIF_IFD_POINTER
                    || tag == TIFF_GPS_IFD_POINTER
                    || tag == TIFF_INTEROPERABILITY_IFD_POINTER;
        }

        private static String parentTagName(final int tag) {
            if (tag == TIFF_EXIF_IFD_POINTER) return "ExifIFDPointer";
            if (tag == TIFF_GPS_IFD_POINTER) return "GPSInfoIFDPointer";
            return "InteroperabilityIFDPointer";
        }

        private static String tagSetName(final int tag) {
            if (tag == TIFF_GPS_IFD_POINTER) return "javax.imageio.plugins.tiff.ExifGPSTagSet";
            if (tag == TIFF_INTEROPERABILITY_IFD_POINTER) {
                return "javax.imageio.plugins.tiff.ExifInteroperabilityTagSet";
            }
            return "javax.imageio.plugins.tiff.ExifTIFFTagSet";
        }

    }

    private void removeTiffExif(final Node parent) {
        for (Node child = parent.getFirstChild(); child != null; ) {
            final Node next = child.getNextSibling();
            if ("TIFFIFD".equals(child.getNodeName())
                    && hasAttribute(child, "parentTagNumber", "34665")) {
                parent.removeChild(child);
            } else if ("TIFFField".equals(child.getNodeName())
                    && hasAttribute(child, "number", "34665")) {
                parent.removeChild(child);
            } else {
                removeTiffExif(child);
            }
            child = next;
        }
    }

    private void removeTiffFields(final Node parent, final int fieldNumber) {
        final String expected = Integer.toString(fieldNumber);
        for (Node child = parent.getFirstChild(); child != null; ) {
            final Node next = child.getNextSibling();
            if ("TIFFField".equals(child.getNodeName())
                    && hasAttribute(child, "number", expected)) {
                parent.removeChild(child);
            } else {
                removeTiffFields(child, fieldNumber);
            }
            child = next;
        }
    }

    private boolean hasAttribute(final Node node, final String name, final String expected) {
        final NamedNodeMap attributes = node.getAttributes();
        final Node value = attributes == null ? null : attributes.getNamedItem(name);
        return value != null && expected.equals(value.getNodeValue());
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
        return lookupWriter(formatName, false);
    }

    private ImageWriter lookupWriter(final String formatName, final boolean preferBundledWriter) {
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName(formatName);
        if (!writers.hasNext()) {
            throw new RenderExportException("no " + formatName + " writer available");
        }
        ImageWriter selected = writers.next();
        if (!preferBundledWriter) {
            while (writers.hasNext()) selected = writers.next();
        }
        return selected;
    }

    /**
     * TwelveMonkeys 3.14 的 TIFF writer 对自定义 USHORT raster 仍会拒绝 data type 1；
     * 16-bit 输出改用同样随 JRE 提供的 TIFF writer，实际文件仍由 ExifTool 独立校验。
     * 8-bit 路径继续优先使用已锁定的 TwelveMonkeys writer。
     */
    private ImageWriter lookupTiffWriter(final BufferedImage image, final boolean preferBundledWriter) {
        if (!preferBundledWriter || PixelBufferFactory.bitDepth(image) <= 8) {
            return lookupWriter("tiff", preferBundledWriter);
        }
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("tiff");
        ImageWriter fallback = null;
        while (writers.hasNext()) {
            ImageWriter writer = writers.next();
            if (fallback == null) fallback = writer;
            if (writer.getClass().getName().startsWith("com.sun.")) {
                if (fallback != writer) fallback.dispose();
                return writer;
            }
            if (fallback != writer) writer.dispose();
        }
        if (fallback != null) return fallback;
        throw new RenderExportException("no tiff writer available");
    }

    // ---- 结构化导出结果 --------------------------------------------------------

    /** 单项专业能力的应用状态。 */
    public enum FeatureStatus {
        NOT_REQUESTED,
        APPLIED,
        SOURCE_ABSENT,
        UNSUPPORTED,
        DOWNGRADED,
        FAILED
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
        private final com.camborder.app.dto.FidelityReport fidelityReport;

        public ExportResult(final String outputPath, final String actualFormat,
                            final FeatureResult metadataPreservation,
                            final FeatureResult colorProfilePreservation,
                            final FeatureResult highBitDepth) {
            this(outputPath, actualFormat, metadataPreservation, colorProfilePreservation,
                    highBitDepth, null);
        }

        public ExportResult(final String outputPath, final String actualFormat,
                            final FeatureResult metadataPreservation,
                            final FeatureResult colorProfilePreservation,
                            final FeatureResult highBitDepth,
                            final com.camborder.app.dto.FidelityReport fidelityReport) {
            this.outputPath = outputPath;
            this.actualFormat = actualFormat;
            this.metadataPreservation = metadataPreservation;
            this.colorProfilePreservation = colorProfilePreservation;
            this.highBitDepth = highBitDepth;
            this.fidelityReport = fidelityReport;
        }

        public String getOutputPath() { return outputPath; }
        public String getActualFormat() { return actualFormat; }
        public FeatureResult getMetadataPreservation() { return metadataPreservation; }
        public FeatureResult getColorProfilePreservation() { return colorProfilePreservation; }
        public FeatureResult getHighBitDepth() { return highBitDepth; }
        public com.camborder.app.dto.FidelityReport getFidelityReport() { return fidelityReport; }
    }
}
