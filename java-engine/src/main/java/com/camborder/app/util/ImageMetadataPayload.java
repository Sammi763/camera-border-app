package com.camborder.app.util;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Iterator;
import java.util.Map;
import java.util.TreeMap;
import java.util.zip.InflaterInputStream;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.metadata.IIOMetadata;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import org.w3c.dom.NamedNodeMap;
import org.w3c.dom.Node;

/**
 * 源图中可安全搬运到输出文件的 EXIF 与 ICC 数据。
 *
 * 这里只保留原始 payload 或 TIFF 原生 metadata tree；JPEG/PNG 写回时由编码器把已经
 * 物理转正的像素对应的 EXIF Orientation 归一为 1，TIFF writer 路径也遵循同一规则。
 * 损坏或超限数据会被忽略，不能阻断已经成功完成的像素导出；若源文件可读但某项元数据
 * 不可搬运，导出结果会明确报告降级。
 */
public final class ImageMetadataPayload {

    private static final int MAX_METADATA_BYTES = 16 * 1024 * 1024;
    private static final byte[] JPEG_SIGNATURE = {(byte) 0xff, (byte) 0xd8};
    private static final byte[] PNG_SIGNATURE = {
            (byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
    };
    private static final byte[] EXIF_PREFIX = {
            'E', 'x', 'i', 'f', 0, 0
    };
    private static final byte[] ICC_PREFIX = {
            'I', 'C', 'C', '_', 'P', 'R', 'O', 'F', 'I', 'L', 'E', 0
    };
    private static final int TIFF_EXIF_IFD_POINTER = 34665;
    private static final int TIFF_ICC_PROFILE = 34675;

    private final byte[] exif;
    private final byte[] icc;
    private final boolean sourceReadable;
    private final IIOMetadata tiffMetadata;
    private final boolean tiffHasExif;
    private final boolean tiffHasIcc;

    private ImageMetadataPayload(final byte[] exif, final byte[] icc,
                                 final boolean sourceReadable,
                                 final IIOMetadata tiffMetadata,
                                 final boolean tiffHasExif,
                                 final boolean tiffHasIcc) {
        this.exif = exif;
        this.icc = icc;
        this.sourceReadable = sourceReadable;
        this.tiffMetadata = tiffMetadata;
        this.tiffHasExif = tiffHasExif;
        this.tiffHasIcc = tiffHasIcc;
    }

    /** 读取失败或没有可搬运数据时的空结果。 */
    public static ImageMetadataPayload empty() {
        return new ImageMetadataPayload(null, null, false, null, false, false);
    }

    /** 从本地源图读取可搬运的 EXIF/ICC；读取失败不会抛出到导出主流程。 */
    public static ImageMetadataPayload read(final String sourcePath) {
        if (sourcePath == null || sourcePath.isBlank()) {
            return empty();
        }
        try {
            final Path path = Path.of(sourcePath);
            if (!Files.isRegularFile(path) || !Files.isReadable(path)) {
                return empty();
            }
            final byte[] bytes = Files.readAllBytes(path);
            if (bytes.length == 0) {
                return new ImageMetadataPayload(null, null, true, null, false, false);
            }
            if (startsWith(bytes, JPEG_SIGNATURE)) {
                return readJpeg(bytes);
            }
            if (startsWith(bytes, PNG_SIGNATURE)) {
                return readPng(bytes);
            }
            if (isTiff(bytes)) {
                return readTiff(path);
            }
            return new ImageMetadataPayload(null, null, true, null, false, false);
        } catch (IOException | RuntimeException ignored) {
            return empty();
        }
    }

    public byte[] getExif() {
        return exif == null ? null : exif.clone();
    }

    public byte[] getIcc() {
        return icc == null ? null : icc.clone();
    }

    public boolean hasExif() {
        return (exif != null && exif.length > 0) || tiffHasExif;
    }

    public boolean hasIcc() {
        return (icc != null && icc.length > 0) || tiffHasIcc;
    }

    public boolean isSourceReadable() {
        return sourceReadable;
    }

    /** TIFF 输出时使用的原生 metadata；其他格式返回 null。 */
    IIOMetadata getTiffMetadata() {
        return tiffMetadata;
    }

    private static ImageMetadataPayload readJpeg(final byte[] bytes) {
        byte[] exif = null;
        final Map<Integer, byte[]> iccParts = new TreeMap<>();
        int offset = 2;
        while (offset + 4 <= bytes.length) {
            if ((bytes[offset] & 0xff) != 0xff) {
                break;
            }
            while (offset < bytes.length && (bytes[offset] & 0xff) == 0xff) {
                offset++;
            }
            if (offset >= bytes.length) break;
            final int marker = bytes[offset++] & 0xff;
            if (marker == 0xda || marker == 0xd9) break;
            if (marker == 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
            if (offset + 2 > bytes.length) break;
            final int length = readU16(bytes, offset);
            if (length < 2 || offset + length > bytes.length) break;
            final int payloadStart = offset + 2;
            final int payloadLength = length - 2;
            if (marker == 0xe1 && startsWith(bytes, payloadStart, EXIF_PREFIX)
                    && payloadLength <= MAX_METADATA_BYTES) {
                exif = copy(bytes, payloadStart, payloadLength);
            } else if (marker == 0xe2 && payloadLength >= ICC_PREFIX.length + 2
                    && startsWith(bytes, payloadStart, ICC_PREFIX)) {
                final int sequence = bytes[payloadStart + ICC_PREFIX.length] & 0xff;
                final int count = bytes[payloadStart + ICC_PREFIX.length + 1] & 0xff;
                final int profileLength = payloadLength - ICC_PREFIX.length - 2;
                if (sequence > 0 && sequence <= count && profileLength > 0
                        && profileLength <= MAX_METADATA_BYTES) {
                    iccParts.put(sequence, copy(bytes,
                            payloadStart + ICC_PREFIX.length + 2, profileLength));
                }
            }
            offset += length;
        }
        return new ImageMetadataPayload(exif, joinIccParts(iccParts), true,
                null, false, false);
    }

    private static ImageMetadataPayload readPng(final byte[] bytes) {
        byte[] exif = null;
        byte[] icc = null;
        int offset = PNG_SIGNATURE.length;
        while (offset + 12 <= bytes.length) {
            final long unsignedLength = readU32(bytes, offset);
            if (unsignedLength > Integer.MAX_VALUE) break;
            final int length = (int) unsignedLength;
            final int chunkEnd = offset + 12 + length;
            if (length < 0 || chunkEnd < offset || chunkEnd > bytes.length) break;
            final String type = new String(bytes, offset + 4, 4,
                    java.nio.charset.StandardCharsets.US_ASCII);
            final int dataStart = offset + 8;
            if ("eXIf".equals(type) && length <= MAX_METADATA_BYTES) {
                exif = copy(bytes, dataStart, length);
            } else if ("iCCP".equals(type)) {
                icc = inflatePngIcc(bytes, dataStart, length);
            }
            offset = chunkEnd;
            if ("IEND".equals(type)) break;
        }
        return new ImageMetadataPayload(exif, icc, true, null, false, false);
    }

    private static ImageMetadataPayload readTiff(final Path path) {
        try (ImageInputStream input = ImageIO.createImageInputStream(path.toFile())) {
            if (input == null) {
                return empty();
            }
            final java.util.Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) {
                return empty();
            }
            // 兼容旧的 JDK metadata-tree 注入路径；阶段五专业导出由 ExifTool 写回。
            ImageReader reader = readers.next();
            while (readers.hasNext()) reader = readers.next();
            try {
                reader.setInput(input, true, false);
                final IIOMetadata metadata = reader.getImageMetadata(0);
                if (metadata == null) {
                    return new ImageMetadataPayload(null, null, true,
                            null, false, false);
                }
                final Node tree = metadata.getAsTree(metadata.getNativeMetadataFormatName());
                final boolean hasExif = containsTiffField(tree, TIFF_EXIF_IFD_POINTER);
                final boolean hasIcc = containsTiffField(tree, TIFF_ICC_PROFILE);
                // JPEG/PNG 也需要能接收 TIFF 源图的可搬运元数据。用 JDK TIFF writer
                // 把原生树序列化成小型 TIFF payload，再交给现有容器注入路径；
                // TIFF→TIFF 仍直接使用原生树，避免重复解析。
                final byte[] exif = hasExif ? serializeTiffExifPayload(metadata) : null;
                final byte[] icc = hasIcc ? readTiffFieldBytes(tree, TIFF_ICC_PROFILE) : null;
                return new ImageMetadataPayload(exif, icc, true, metadata,
                        hasExif, hasIcc);
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException ignored) {
            return empty();
        }
    }

    /**
     * 将 TIFF 原生 metadata tree 序列化为可放入 JPEG APP1/PNG eXIf 的 TIFF payload。
     * 只从 writer 生成的内存 TIFF 中取元数据，不复制源图像素；ICC tag 从这个 EXIF
     * payload 中移除，由 JPEG APP2/PNG iCCP 的独立路径写入，保持两个开关独立。
     */
    private static byte[] serializeTiffExifPayload(final IIOMetadata source) {
        if (source == null || source.getNativeMetadataFormatName() == null) return null;
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("tiff");
        if (!writers.hasNext()) return null;
        ImageWriter writer = writers.next();
        while (writers.hasNext()) writer = writers.next();
        ImageWriteParam param = writer.getDefaultWriteParam();
        param.setCompressionMode(ImageWriteParam.MODE_DISABLED);
        BufferedImage image = new BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB);
        try {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (MemoryCacheImageOutputStream output = new MemoryCacheImageOutputStream(bytes)) {
                writer.setOutput(output);
                writer.write(null, new IIOImage(image, null, source), param);
                output.flush();
            }
            byte[] payload = bytes.toByteArray();
            byte[] exifPayload = removeTiffFieldTag(payload, TIFF_ICC_PROFILE);
            return exifPayload.length > 0 && exifPayload.length <= MAX_METADATA_BYTES
                    ? exifPayload : null;
        } catch (IOException | RuntimeException ignored) {
            return null;
        } finally {
            writer.dispose();
        }
    }

    private static byte[] readTiffFieldBytes(final Node root, final int fieldNumber) {
        if (root == null) return null;
        if ("TIFFField".equals(root.getNodeName())) {
            NamedNodeMap attributes = root.getAttributes();
            Node number = attributes == null ? null : attributes.getNamedItem("number");
            if (number != null && Integer.toString(fieldNumber).equals(number.getNodeValue())) {
                Node value = root.getFirstChild();
                while (value != null) {
                    if ("TIFFUndefined".equals(value.getNodeName())
                            || "TIFFBytes".equals(value.getNodeName())) {
                        NamedNodeMap valueAttributes = value.getAttributes();
                        Node encoded = valueAttributes == null
                                ? null : valueAttributes.getNamedItem("value");
                        byte[] parsed = parseUnsignedByteList(
                                encoded == null ? null : encoded.getNodeValue());
                        if (parsed != null) return parsed;
                    }
                    value = value.getNextSibling();
                }
            }
        }
        for (Node child = root.getFirstChild(); child != null; child = child.getNextSibling()) {
            byte[] result = readTiffFieldBytes(child, fieldNumber);
            if (result != null) return result;
        }
        return null;
    }

    private static byte[] parseUnsignedByteList(final String value) {
        if (value == null || value.isBlank()) return null;
        String[] parts = value.trim().split("[, ]+");
        if (parts.length > MAX_METADATA_BYTES) return null;
        byte[] result = new byte[parts.length];
        try {
            for (int index = 0; index < parts.length; index++) {
                int parsed = Integer.parseInt(parts[index]);
                if (parsed < 0 || parsed > 255) return null;
                result[index] = (byte) parsed;
            }
            return result;
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static boolean isTiff(final byte[] bytes) {
        if (bytes.length < 4) return false;
        final boolean littleEndian = bytes[0] == 'I' && bytes[1] == 'I';
        final boolean bigEndian = bytes[0] == 'M' && bytes[1] == 'M';
        if (!littleEndian && !bigEndian) return false;
        return (littleEndian && bytes[2] == 42 && bytes[3] == 0)
                || (bigEndian && bytes[2] == 0 && bytes[3] == 42);
    }

    private static boolean containsTiffField(final Node node, final int fieldNumber) {
        if (node == null) return false;
        if (fieldNumber == TIFF_EXIF_IFD_POINTER && "TIFFIFD".equals(node.getNodeName())) {
            final NamedNodeMap attributes = node.getAttributes();
            final Node parentTag = attributes == null
                    ? null : attributes.getNamedItem("parentTagNumber");
            if (parentTag != null && Integer.toString(fieldNumber).equals(parentTag.getNodeValue())) {
                return true;
            }
        }
        if ("TIFFField".equals(node.getNodeName())) {
            final NamedNodeMap attributes = node.getAttributes();
            final Node number = attributes == null ? null : attributes.getNamedItem("number");
            if (number != null && Integer.toString(fieldNumber).equals(number.getNodeValue())) {
                return true;
            }
        }
        for (Node child = node.getFirstChild(); child != null; child = child.getNextSibling()) {
            if (containsTiffField(child, fieldNumber)) return true;
        }
        return false;
    }

    private static byte[] inflatePngIcc(final byte[] bytes, final int start, final int length) {
        final int end = start + length;
        int nameEnd = start;
        while (nameEnd < end && bytes[nameEnd] != 0) nameEnd++;
        if (nameEnd >= end || nameEnd + 2 > end || (bytes[nameEnd + 1] & 0xff) != 0) {
            return null;
        }
        try (InputStream input = new InflaterInputStream(new ByteArrayInputStream(
                bytes, nameEnd + 2, end - nameEnd - 2));
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            final byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) >= 0) {
                if (read == 0) continue;
                total += read;
                if (total > MAX_METADATA_BYTES) return null;
                output.write(buffer, 0, read);
            }
            return total == 0 ? null : output.toByteArray();
        } catch (IOException ignored) {
            return null;
        }
    }

    private static byte[] joinIccParts(final Map<Integer, byte[]> parts) {
        if (parts.isEmpty()) return null;
        final int last = parts.keySet().stream().mapToInt(Integer::intValue).max().orElse(0);
        if (last != parts.size()) return null;
        int total = 0;
        for (int sequence = 1; sequence <= last; sequence++) {
            final byte[] part = parts.get(sequence);
            if (part == null || total > MAX_METADATA_BYTES - part.length) return null;
            total += part.length;
        }
        final ByteArrayOutputStream output = new ByteArrayOutputStream(total);
        for (int sequence = 1; sequence <= last; sequence++) {
            output.writeBytes(parts.get(sequence));
        }
        return output.toByteArray();
    }

    private static boolean startsWith(final byte[] bytes, final byte[] prefix) {
        return startsWith(bytes, 0, prefix);
    }

    private static boolean startsWith(final byte[] bytes, final int offset, final byte[] prefix) {
        if (offset < 0 || offset + prefix.length > bytes.length) return false;
        for (int index = 0; index < prefix.length; index++) {
            if (bytes[offset + index] != prefix[index]) return false;
        }
        return true;
    }

    private static int readU16(final byte[] bytes, final int offset) {
        return ((bytes[offset] & 0xff) << 8) | (bytes[offset + 1] & 0xff);
    }

    private static byte[] removeTiffFieldTag(final byte[] payload, final int fieldNumber) {
        int start = startsWith(payload, EXIF_PREFIX) ? EXIF_PREFIX.length : 0;
        if (start + 8 > payload.length) return payload;
        boolean littleEndian;
        if (payload[start] == 'I' && payload[start + 1] == 'I') {
            littleEndian = true;
        } else if (payload[start] == 'M' && payload[start + 1] == 'M') {
            littleEndian = false;
        } else {
            return payload;
        }
        if (readUnsigned(payload, start + 2, 2, littleEndian) != 42) return payload;
        long ifdOffset = readUnsigned(payload, start + 4, 4, littleEndian);
        long ifdStart = start + ifdOffset;
        if (ifdStart < 0 || ifdStart + 2 > payload.length) return payload;
        int entryCount = (int) readUnsigned(payload, (int) ifdStart, 2, littleEndian);
        long entriesEnd = ifdStart + 2L + entryCount * 12L;
        if (entryCount < 0 || entriesEnd > payload.length) return payload;
        byte[] result = payload.clone();
        for (int index = 0; index < entryCount; index++) {
            int entry = (int) ifdStart + 2 + index * 12;
            if (readUnsigned(payload, entry, 2, littleEndian) == fieldNumber) {
                result[entry] = 0;
                result[entry + 1] = 0;
            }
        }
        return result;
    }

    private static long readUnsigned(final byte[] bytes, final int offset,
                                     final int size, final boolean littleEndian) {
        long value = 0;
        if (littleEndian) {
            for (int index = size - 1; index >= 0; index--) {
                value = (value << 8) | (bytes[offset + index] & 0xffL);
            }
        } else {
            for (int index = 0; index < size; index++) {
                value = (value << 8) | (bytes[offset + index] & 0xffL);
            }
        }
        return value;
    }

    private static long readU32(final byte[] bytes, final int offset) {
        return ((long) (bytes[offset] & 0xff) << 24)
                | ((long) (bytes[offset + 1] & 0xff) << 16)
                | ((long) (bytes[offset + 2] & 0xff) << 8)
                | (bytes[offset + 3] & 0xffL);
    }

    private static byte[] copy(final byte[] bytes, final int start, final int length) {
        final byte[] result = new byte[length];
        System.arraycopy(bytes, start, result, 0, length);
        return result;
    }
}
