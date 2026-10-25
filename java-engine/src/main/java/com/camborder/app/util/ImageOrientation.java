package com.camborder.app.util;

import com.drew.imaging.ImageMetadataReader;
import com.drew.metadata.Directory;
import com.drew.metadata.Metadata;
import com.drew.metadata.exif.ExifDirectoryBase;

import java.awt.image.BufferedImage;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * 在解码边界读取并物理应用 EXIF Orientation。
 *
 * 方向只在这里转换一次；用户在 RenderRecipe 中设置的 rotation 仍然是独立的版式变换。
 * 使用 ColorModel/Raster 的 data elements 搬运像素，避免方向转换偷偷改变位深或颜色通道。
 */
public final class ImageOrientation {

    private ImageOrientation() { }

    /** 读取 IFD0/Exif 中的 Orientation；缺失、损坏或越界时按普通方向处理。 */
    public static int read(final Path imagePath) {
        if (imagePath == null) return 1;
        try {
            final Metadata metadata = ImageMetadataReader.readMetadata(imagePath.toFile());
            for (Directory directory : metadata.getDirectories()) {
                if (!directory.containsTag(ExifDirectoryBase.TAG_ORIENTATION)) continue;
                final Integer value = directory.getInteger(ExifDirectoryBase.TAG_ORIENTATION);
                if (value != null && value >= 1 && value <= 8) return value;
            }
        } catch (Exception ignored) {
            // 方向元数据读取失败不应让可解码的像素完全不可用，按 Orientation=1 继续。
        }
        return 1;
    }

    /** 将外部输入收敛到 EXIF 规定的 1–8；无效值按 1 处理。 */
    public static int normalize(final int orientation) {
        return orientation >= 1 && orientation <= 8 ? orientation : 1;
    }

    /**
     * 把 JPEG APP1/PNG eXIf 中的 Orientation 改为 1，避免输出像素已经转正后被查看器再次旋转。
     * 输入可以带有 Exif\0\0 前缀，也可以是裸 TIFF payload；格式无效时原样返回副本。
     */
    public static byte[] normalizeExifPayload(final byte[] payload) {
        if (payload == null || payload.length == 0) return payload;
        final byte[] result = Arrays.copyOf(payload, payload.length);
        final int tiffStart = startsWith(result, EXIF_PREFIX) ? EXIF_PREFIX.length : 0;
        if (tiffStart + 8 > result.length) return result;
        final boolean littleEndian;
        if (result[tiffStart] == 'I' && result[tiffStart + 1] == 'I') {
            littleEndian = true;
        } else if (result[tiffStart] == 'M' && result[tiffStart + 1] == 'M') {
            littleEndian = false;
        } else {
            return result;
        }
        if (readUnsigned(result, tiffStart + 2, 2, littleEndian) != 42) return result;
        final Set<Long> visited = new HashSet<>();
        normalizeIfd(result, tiffStart,
                readUnsigned(result, tiffStart + 4, 4, littleEndian), littleEndian, visited, 0);
        return result;
    }

    /**
     * 按 EXIF Orientation 物理重排像素。
     * Orientation=1 直接返回原对象；其余方向保持原 ColorModel、Raster 数据类型和位深。
     */
    public static BufferedImage apply(final BufferedImage source, final int rawOrientation) {
        if (source == null) return null;
        final int orientation = normalize(rawOrientation);
        if (orientation == 1) return source;

        final boolean swapsDimensions = orientation >= 5;
        final int destinationWidth = swapsDimensions ? source.getHeight() : source.getWidth();
        final int destinationHeight = swapsDimensions ? source.getWidth() : source.getHeight();
        final BufferedImage destination = new BufferedImage(
                source.getColorModel(),
                source.getColorModel().createCompatibleWritableRaster(destinationWidth, destinationHeight),
                source.isAlphaPremultiplied(),
                null
        );

        for (int sourceY = 0; sourceY < source.getHeight(); sourceY++) {
            for (int sourceX = 0; sourceX < source.getWidth(); sourceX++) {
                final int destinationX;
                final int destinationY;
                switch (orientation) {
                    case 2:
                        destinationX = source.getWidth() - 1 - sourceX;
                        destinationY = sourceY;
                        break;
                    case 3:
                        destinationX = source.getWidth() - 1 - sourceX;
                        destinationY = source.getHeight() - 1 - sourceY;
                        break;
                    case 4:
                        destinationX = sourceX;
                        destinationY = source.getHeight() - 1 - sourceY;
                        break;
                    case 5:
                        destinationX = sourceY;
                        destinationY = sourceX;
                        break;
                    case 6:
                        destinationX = source.getHeight() - 1 - sourceY;
                        destinationY = sourceX;
                        break;
                    case 7:
                        destinationX = source.getHeight() - 1 - sourceY;
                        destinationY = source.getWidth() - 1 - sourceX;
                        break;
                    case 8:
                        destinationX = sourceY;
                        destinationY = source.getWidth() - 1 - sourceX;
                        break;
                    default:
                        throw new IllegalStateException("normalized EXIF orientation is invalid");
                }
                destination.getRaster().setDataElements(destinationX, destinationY,
                        source.getRaster().getDataElements(sourceX, sourceY, null));
            }
        }
        return destination;
    }

    private static void normalizeIfd(final byte[] payload, final int tiffStart,
                                     final long relativeOffset, final boolean littleEndian,
                                     final Set<Long> visited, final int depth) {
        if (depth > 8 || relativeOffset < 0 || !visited.add(relativeOffset)) return;
        final long absoluteLong = (long) tiffStart + relativeOffset;
        if (absoluteLong < 0 || absoluteLong + 2 > payload.length) return;
        final int absolute = (int) absoluteLong;
        final int entryCount = (int) readUnsigned(payload, absolute, 2, littleEndian);
        if (entryCount < 0 || entryCount > 4096) return;
        final long entriesEnd = absoluteLong + 2L + entryCount * 12L;
        if (entriesEnd + 4 > payload.length) return;

        for (int index = 0; index < entryCount; index++) {
            final int entry = absolute + 2 + index * 12;
            final int tag = (int) readUnsigned(payload, entry, 2, littleEndian);
            final int type = (int) readUnsigned(payload, entry + 2, 2, littleEndian);
            final long count = readUnsigned(payload, entry + 4, 4, littleEndian);
            if (tag == 274 && type == 3 && count >= 1) {
                final long byteCount = count * 2L;
                final long valueOffset = byteCount <= 4
                        ? entry + 8L
                        : (long) tiffStart + readUnsigned(payload, entry + 8, 4, littleEndian);
                if (valueOffset >= 0 && valueOffset + 2 <= payload.length) {
                    writeUnsigned(payload, (int) valueOffset, 2, 1, littleEndian);
                }
            }
            if (tag == 34665 || tag == 34853 || tag == 40965) {
                final long pointer = readPointer(payload, tiffStart, entry, type, count, littleEndian);
                if (pointer > 0) {
                    normalizeIfd(payload, tiffStart, pointer, littleEndian, visited, depth + 1);
                }
            }
        }
        final long nextOffset = readUnsigned(payload, (int) entriesEnd, 4, littleEndian);
        if (nextOffset > 0) {
            normalizeIfd(payload, tiffStart, nextOffset, littleEndian, visited, depth + 1);
        }
    }

    private static long readPointer(final byte[] payload, final int tiffStart, final int entry,
                                    final int type, final long count, final boolean littleEndian) {
        if (count < 1 || (type != 3 && type != 4)) return 0;
        final int size = type == 3 ? 2 : 4;
        final long bytes = count * size;
        final long offset = bytes <= 4
                ? entry + 8L
                : (long) tiffStart + readUnsigned(payload, entry + 8, 4, littleEndian);
        if (offset < 0 || offset + size > payload.length) return 0;
        return readUnsigned(payload, (int) offset, size, littleEndian);
    }

    private static long readUnsigned(final byte[] payload, final int offset, final int size,
                                     final boolean littleEndian) {
        if (offset < 0 || size < 1 || size > 4 || offset + size > payload.length) return 0;
        long value = 0;
        if (littleEndian) {
            for (int index = size - 1; index >= 0; index--) {
                value = (value << 8) | (payload[offset + index] & 0xffL);
            }
        } else {
            for (int index = 0; index < size; index++) {
                value = (value << 8) | (payload[offset + index] & 0xffL);
            }
        }
        return value;
    }

    private static void writeUnsigned(final byte[] payload, final int offset, final int size,
                                      final long value, final boolean littleEndian) {
        if (offset < 0 || size < 1 || size > 4 || offset + size > payload.length) return;
        long remaining = value;
        if (littleEndian) {
            for (int index = 0; index < size; index++) {
                payload[offset + index] = (byte) (remaining & 0xff);
                remaining >>>= 8;
            }
        } else {
            for (int index = size - 1; index >= 0; index--) {
                payload[offset + index] = (byte) (remaining & 0xff);
                remaining >>>= 8;
            }
        }
    }

    private static boolean startsWith(final byte[] value, final byte[] prefix) {
        if (value.length < prefix.length) return false;
        for (int index = 0; index < prefix.length; index++) {
            if (value[index] != prefix[index]) return false;
        }
        return true;
    }

    private static final byte[] EXIF_PREFIX = {'E', 'x', 'i', 'f', 0, 0};
}
