package com.camborder.app.util;

import com.camborder.app.dto.SourceDecode;
import com.camborder.app.exception.PreviewGenerationException;
import com.camborder.app.service.ExifToolService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.imageio.ImageReadParam;
import javax.imageio.ImageIO;
import javax.imageio.stream.ImageInputStream;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.nio.file.Path;
import java.util.Iterator;

/**
 * 图片读取器（无状态组件）。
 * 负责按 imagePath 读取本地图片文件，校验存在性、可读性与图片格式合法性，
 * 并如实返回解码来源（sourceDecode）。单一职责：只做读取与校验，不关心缩放、边框或文字。
 *
 * 读取流程：标准格式由 ImageIO 读取；RAW 只扫描并读取内嵌 JPEG。
 * 不存在生产 RAW 显影分支，也不把内嵌 JPEG 声称为传感器 RAW。
 */
@Component
public final class ImageReader {

    /** 标准图片读取结果，同时保留 ImageIO header 中的完整源尺寸。 */
    private static final class StandardReadResult {
        private final BufferedImage image;
        private final int fullWidth;
        private final int fullHeight;

        private StandardReadResult(final BufferedImage image, final int fullWidth, final int fullHeight) {
            this.image = image;
            this.fullWidth = fullWidth;
            this.fullHeight = fullHeight;
        }
    }

    private final RawDecoder rawDecoder;
    private final ExifToolService exifToolService;

    @Autowired
    public ImageReader(final RawDecoder rawDecoder, final ExifToolService exifToolService) {
        this.rawDecoder = rawDecoder;
        this.exifToolService = exifToolService;
    }

    /** 供不启用 Spring 的读取测试使用。 */
    public ImageReader(final RawDecoder rawDecoder) {
        this(rawDecoder, null);
    }

    /** 读取结果：解码图像 + 来源状态。 */
    public static final class ReadResult {
        private final BufferedImage image;
        private final SourceDecode sourceDecode;
        private final SourceImageInfo sourceInfo;

        public ReadResult(final BufferedImage image, final SourceDecode sourceDecode,
                          final SourceImageInfo sourceInfo) {
            this.image = image;
            this.sourceDecode = sourceDecode;
            this.sourceInfo = sourceInfo;
        }

        public BufferedImage getImage() {
            return image;
        }

        public SourceDecode getSourceDecode() {
            return sourceDecode;
        }

        public SourceImageInfo getSourceInfo() {
            return sourceInfo;
        }
    }

    /**
     * 读取本地图片文件并返回来源状态。
     *
     * @throws PreviewGenerationException 文件不存在、不可读或不是支持的图片时抛出
     */
    public ReadResult readWithSource(final String imagePath) {
        return readWithSource(imagePath, 0, 0);
    }

    /**
     * 读取本地图片，并在预览有尺寸约束时于 ImageIO 解码阶段做 subsampling。
     * 导出传入 0/0，因此始终读取原图，不会缓存或复用完整分辨率 BufferedImage。
     */
    public ReadResult readWithSource(final String imagePath, final int maxWidth, final int maxHeight) {
        final File file = new File(imagePath);
        if (!file.exists()) {
            throw new PreviewGenerationException("image file not found: " + imagePath);
        }
        if (!file.isFile() || !file.canRead()) {
            throw new PreviewGenerationException("image file is not readable: " + imagePath);
        }

        final String format = extensionOf(imagePath);

        // RAW 的生产边界固定为内嵌 JPEG。即使某个 ImageIO provider 恰好能识别
        // TIFF-based RAW，也不能把它当作传感器像素或标准栅格文件读取。
        if (rawDecoder.isRawFile(imagePath)) {
            return decodeEmbedded(imagePath, format, maxWidth, maxHeight);
        }

        final StandardReadResult read = readStandardImage(file, maxWidth, maxHeight, imagePath);

        // 标准格式直接成功
        if (read != null && read.image != null) {
            final BufferedImage working = ImageColorConverter.normalizeForRendering(read.image, imagePath);
            final int decodedWidth = working.getWidth();
            final int decodedHeight = working.getHeight();
            final int orientation = ImageOrientation.read(Path.of(imagePath));
            final BufferedImage oriented = ImageOrientation.apply(working, orientation);
            final SourceDecode decode = SourceDecode.standard(format);
            populateOrientationFacts(decode, decodedWidth, decodedHeight, oriented, orientation,
                    read.fullWidth, read.fullHeight);
            return new ReadResult(oriented, decode,
                    SourceImageInfo.from(oriented, imagePath, decode, exifToolService,
                            decodedWidth, decodedHeight, oriented.getWidth(), oriented.getHeight(), orientation));
        }

        // 非 RAW 且 ImageIO 不支持
        throw new PreviewGenerationException(
                "image content is not a supported image: " + imagePath);
    }

    /** 兼容旧调用：只取图像。 */
    public BufferedImage read(final String imagePath) {
        return readWithSource(imagePath).getImage();
    }

    /**
     * 标准栅格格式通过 ImageReader 获取原始宽高后再设置 source subsampling。
     * 不使用 ImageIO.read(file) 的全量解码路径，避免缩略图/预览先把原图展开到内存。
     */
    private StandardReadResult readStandardImage(final File file, final int maxWidth, final int maxHeight,
                                                 final String imagePath) {
        try (ImageInputStream input = ImageIO.createImageInputStream(file)) {
            if (input == null) {
                return null;
            }
            final Iterator<javax.imageio.ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) {
                return null;
            }
            final javax.imageio.ImageReader reader = readers.next();
            try {
                reader.setInput(input, true, true);
                final int width = reader.getWidth(0);
                final int height = reader.getHeight(0);
                final int subsampling = ImageDecodeSizing.subsamplingFor(width, height, maxWidth, maxHeight);
                final ImageReadParam parameter = reader.getDefaultReadParam();
                if (subsampling > 1) {
                    parameter.setSourceSubsampling(subsampling, subsampling, 0, 0);
                }
                return new StandardReadResult(reader.read(0, parameter), width, height);
            } finally {
                reader.dispose();
            }
        } catch (final IOException e) {
            throw new IllegalStateException("failed to read image file: " + imagePath, e);
        }
    }

    /** 提取内嵌 JPEG；失败时抛受控异常。 */
    private ReadResult decodeEmbedded(final String imagePath, final String format,
                                      final int maxWidth, final int maxHeight) {
        final RawDecoder.DecodeResult decoded = rawDecoder.decodeWithSource(imagePath, maxWidth, maxHeight);
        final BufferedImage embedded = decoded.getImage();
        final int decodedWidth = embedded.getWidth();
        final int decodedHeight = embedded.getHeight();
        final int orientation = ImageOrientation.read(Path.of(imagePath));
        final BufferedImage oriented = ImageOrientation.apply(embedded, orientation);
        final SourceDecode decode = SourceDecode.embeddedJpeg(format);
        populateOrientationFacts(decode, decodedWidth, decodedHeight, oriented, orientation,
                decoded.getFullWidth(), decoded.getFullHeight());
        return new ReadResult(oriented, decode,
                SourceImageInfo.from(oriented, imagePath, decode, exifToolService,
                        decodedWidth, decodedHeight, oriented.getWidth(), oriented.getHeight(), orientation));
    }

    private static void populateOrientationFacts(final SourceDecode decode,
                                                 final int decodedWidth,
                                                 final int decodedHeight,
                                                 final BufferedImage oriented,
                                                 final int orientation,
                                                 final int fullWidth,
                                                 final int fullHeight) {
        decode.setOrientation(ImageOrientation.normalize(orientation));
        decode.setDecodedWidth(decodedWidth);
        decode.setDecodedHeight(decodedHeight);
        decode.setOrientedWidth(oriented.getWidth());
        decode.setOrientedHeight(oriented.getHeight());
        final boolean swapsDimensions = ImageOrientation.normalize(orientation) >= 5;
        decode.setFullWidth(swapsDimensions ? fullHeight : fullWidth);
        decode.setFullHeight(swapsDimensions ? fullWidth : fullHeight);
        decode.setOrientationApplied(true);
    }

    private static String extensionOf(final String path) {
        final int dot = path.lastIndexOf('.');
        if (dot < 0) {
            return "";
        }
        return path.substring(dot + 1).toLowerCase();
    }
}
