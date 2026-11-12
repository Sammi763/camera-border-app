package com.camborder.app.util;

import com.camborder.app.exception.FilmProcessingException;
import com.camborder.app.model.ImageProcessingConfig;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * 大数组分配前读取输入尺寸（T10）。
 *
 * TIFF 直接解析头信息；真实 RAW 调用 helper 的 --probe，只读取尺寸与源事实，
 * 不执行 unpack、去马赛克或像素输出。未知尺寸或探测失败时明确失败，不猜测。
 */
@Component
public final class FilmInputProbe {

    public static final String CODE_SIZE_UNKNOWN = "FILM_INPUT_SIZE_UNKNOWN";

    private static final long MAX_PIXELS = 200_000_000L;
    private static final int MAX_IFD_ENTRIES = 4096;

    private final FilmRawDecoder rawDecoder;

    @Autowired
    public FilmInputProbe(final FilmRawDecoder rawDecoder) {
        this.rawDecoder = rawDecoder;
    }

    public Probed probe(final String imagePath, final ImageProcessingConfig config) {
        if (imagePath == null || imagePath.isBlank() || config == null) {
            throw unknown("输入路径或处理配置缺失");
        }
        final Path path;
        try {
            path = Path.of(imagePath);
        } catch (RuntimeException exception) {
            throw unknown("输入路径非法");
        }
        if (!Files.isRegularFile(path) || !Files.isReadable(path)) {
            throw unknown("输入文件不存在或不可读");
        }
        if ("sensor-raw".equals(config.getInputMode())) {
            final FilmRawDecoder.ProbeResult result = rawDecoder.probe(path.toString());
            validate(result.getWidth(), result.getHeight());
            return new Probed(result.getWidth(), result.getHeight(), "sensor-raw",
                    result.getSourceVersion(), result.getFacts().getHelperVersion() + "|"
                    + result.getFacts().getLibrawVersion());
        }
        if ("linear-tiff".equals(config.getInputMode())) {
            final int[] size = readTiffSize(path);
            validate(size[0], size[1]);
            return new Probed(size[0], size[1], "linear-tiff", FilmSourceVersion.read(path),
                    "linear-tiff-v1");
        }
        throw unknown("输入模式不支持尺寸探测");
    }

    private static int[] readTiffSize(final Path path) {
        try (RandomAccessFile file = new RandomAccessFile(path.toFile(), "r")) {
            final byte[] prefix = new byte[16];
            if (file.length() < 8) throw unknown("TIFF 头长度不足");
            file.readFully(prefix, 0, (int) Math.min(prefix.length, file.length()));
            final boolean little;
            if (prefix[0] == 'I' && prefix[1] == 'I') {
                little = true;
            } else if (prefix[0] == 'M' && prefix[1] == 'M') {
                little = false;
            } else {
                throw unknown("不是 TIFF 字节序标记");
            }
            final int magic = u16(prefix, 2, little);
            final boolean bigTiff;
            final long ifdOffset;
            if (magic == 42) {
                bigTiff = false;
                ifdOffset = u32(prefix, 4, little);
            } else if (magic == 43) {
                bigTiff = true;
                if (u16(prefix, 4, little) != 8) throw unknown("BigTIFF offset size 非 8");
                ifdOffset = u64(prefix, 8, little);
            } else {
                throw unknown("TIFF magic 不正确");
            }
            if (ifdOffset <= 0 || ifdOffset >= file.length()) throw unknown("IFD 偏移非法");
            file.seek(ifdOffset);
            final long count = bigTiff ? readLong(file, little) : readU16(file, little);
            if (count <= 0 || count > MAX_IFD_ENTRIES) throw unknown("IFD 条目数量非法");
            int width = -1;
            int height = -1;
            final int entrySize = bigTiff ? 20 : 12;
            for (long index = 0; index < count; index++) {
                final byte[] entry = new byte[entrySize];
                file.readFully(entry);
                final int tag = u16(entry, 0, little);
                if (tag != 256 && tag != 257) continue;
                final int type = u16(entry, 2, little);
                final long valueCount = bigTiff ? u64(entry, 4, little) : u32(entry, 4, little);
                if (valueCount != 1) throw unknown("TIFF 尺寸标签数量非 1");
                final long value = readInlineValue(entry, bigTiff, type, little);
                if (tag == 256) width = (int) value;
                else height = (int) value;
            }
            if (width <= 0 || height <= 0) throw unknown("TIFF 缺少有效尺寸标签");
            return new int[]{width, height};
        } catch (FilmProcessingException exception) {
            throw exception;
        } catch (IOException | RuntimeException exception) {
            throw unknown("TIFF 头信息无法读取");
        }
    }

    private static long readInlineValue(final byte[] entry, final boolean bigTiff,
                                        final int type, final boolean little) {
        final int offset = bigTiff ? 12 : 8;
        switch (type) {
            case 3: // SHORT
                return u16(entry, offset, little);
            case 4: // LONG
                return u32(entry, offset, little);
            case 16: // LONG8 (BigTIFF)
                if (!bigTiff) throw unknown("经典 TIFF 不支持 LONG8");
                return u64(entry, offset, little);
            default:
                throw unknown("TIFF 尺寸标签类型不支持");
        }
    }

    private static int readInt(final RandomAccessFile file, final boolean little) throws IOException {
        final byte[] bytes = new byte[4];
        file.readFully(bytes);
        return (int) u32(bytes, 0, little);
    }

    private static int readU16(final RandomAccessFile file, final boolean little) throws IOException {
        final byte[] bytes = new byte[2];
        file.readFully(bytes);
        return u16(bytes, 0, little);
    }

    private static long readLong(final RandomAccessFile file, final boolean little) throws IOException {
        final byte[] bytes = new byte[8];
        file.readFully(bytes);
        return u64(bytes, 0, little);
    }

    private static int u16(final byte[] bytes, final int offset, final boolean little) {
        final int a = bytes[offset] & 0xff;
        final int b = bytes[offset + 1] & 0xff;
        return little ? a | (b << 8) : (a << 8) | b;
    }

    private static long u32(final byte[] bytes, final int offset, final boolean little) {
        long result = 0;
        for (int index = 0; index < 4; index++) {
            final int source = little ? offset + 3 - index : offset + index;
            result = (result << 8) | (bytes[source] & 0xffL);
        }
        return result;
    }

    private static long u64(final byte[] bytes, final int offset, final boolean little) {
        long result = 0;
        for (int index = 0; index < 8; index++) {
            final int source = little ? offset + 7 - index : offset + index;
            result = (result << 8) | (bytes[source] & 0xffL);
        }
        return result;
    }

    private static void validate(final int width, final int height) {
        if (width <= 0 || height <= 0) throw unknown("输入尺寸非正数");
        final long pixels;
        try {
            pixels = Math.multiplyExact((long) width, (long) height);
        } catch (ArithmeticException exception) {
            throw unknown("输入像素尺寸溢出");
        }
        if (pixels > MAX_PIXELS) throw unknown("输入像素数超过上限");
    }

    private static FilmProcessingException unknown(final String detail) {
        return new FilmProcessingException("无法在分配前确认底片输入尺寸：" + detail,
                HttpStatus.UNPROCESSABLE_ENTITY, CODE_SIZE_UNKNOWN);
    }

    /** 探测结果：宽高为无方向重排的像素尺寸，sourceVersion 用于阶段键。 */
    public static final class Probed {
        private final int width;
        private final int height;
        private final String inputMode;
        private final String sourceVersion;
        private final String decoderVersion;

        public Probed(final int width, final int height, final String inputMode,
                      final String sourceVersion, final String decoderVersion) {
            this.width = width;
            this.height = height;
            this.inputMode = inputMode;
            this.sourceVersion = sourceVersion;
            this.decoderVersion = decoderVersion;
        }

        public int getWidth() { return width; }
        public int getHeight() { return height; }
        public String getInputMode() { return inputMode; }
        public String getSourceVersion() { return sourceVersion; }
        public String getDecoderVersion() { return decoderVersion; }
    }
}
