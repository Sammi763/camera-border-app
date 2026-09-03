package com.camborder.app.util;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.TreeMap;
import java.util.zip.InflaterInputStream;

/**
 * 源图中可安全搬运到输出文件的 EXIF 与 ICC 数据。
 *
 * 这里只保留原始 payload，不尝试修改 EXIF 中的尺寸或方向字段；渲染链路已经
 * 把方向应用到像素，输出端若需要继续写入原始 EXIF，调用方会明确报告其能力状态。
 * 解析器只读取 JPEG APP1/APP2 与 PNG eXIf/iCCP，损坏或超限数据会被忽略，不能阻断
 * 已经成功完成的像素导出。
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

    private final byte[] exif;
    private final byte[] icc;
    private final boolean sourceReadable;

    private ImageMetadataPayload(final byte[] exif, final byte[] icc,
                                 final boolean sourceReadable) {
        this.exif = exif;
        this.icc = icc;
        this.sourceReadable = sourceReadable;
    }

    /** 读取失败或没有可搬运数据时的空结果。 */
    public static ImageMetadataPayload empty() {
        return new ImageMetadataPayload(null, null, false);
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
                return new ImageMetadataPayload(null, null, true);
            }
            if (startsWith(bytes, JPEG_SIGNATURE)) {
                return readJpeg(bytes);
            }
            if (startsWith(bytes, PNG_SIGNATURE)) {
                return readPng(bytes);
            }
            return new ImageMetadataPayload(null, null, true);
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
        return exif != null && exif.length > 0;
    }

    public boolean hasIcc() {
        return icc != null && icc.length > 0;
    }

    public boolean isSourceReadable() {
        return sourceReadable;
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
        return new ImageMetadataPayload(exif, joinIccParts(iccParts), true);
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
        return new ImageMetadataPayload(exif, icc, true);
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
