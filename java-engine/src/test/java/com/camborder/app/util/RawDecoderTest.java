package com.camborder.app.util;

import com.camborder.app.exception.PreviewGenerationException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Random;

import static org.junit.jupiter.api.Assertions.*;

/**
 * RawDecoder 单元测试。
 * 测试扩展名判断、错误处理和不同 RAW 格式的错误提示。
 */
class RawDecoderTest {

    @TempDir
    Path tempDir;

    private final RawDecoder decoder = new RawDecoder();

    @Test
    void isRawFile_识别所有RAW扩展名且不识别非RAW() {
        // 所有 RAW 扩展名
        for (String ext : new String[]{".nef", ".cr2", ".cr3", ".arw", ".raf", ".dng", ".orf", ".rw2", ".pef"}) {
            assertTrue(decoder.isRawFile("/path/photo" + ext), "应识别 " + ext);
            assertTrue(decoder.isRawFile("/path/PHOTO" + ext.toUpperCase()), "应识别大写 " + ext.toUpperCase());
        }
        // 非 RAW
        for (String ext : new String[]{".jpg", ".png", ".tiff", ".jpeg"}) {
            assertFalse(decoder.isRawFile("/path/photo" + ext), "不应识别 " + ext);
        }
        assertFalse(decoder.isRawFile("/path/photo"));
        assertFalse(decoder.isRawFile(""));
        assertFalse(decoder.isRawFile(null));
    }

    @Test
    void decode_文件不存在时抛受控异常() {
        PreviewGenerationException ex = assertThrows(
                PreviewGenerationException.class,
                () -> decoder.decode("/nonexistent/photo.nef")
        );
        assertTrue(ex.getMessage().contains("RAW 文件不存在"));
        assertTrue(ex.getMessage().contains("/nonexistent/photo.nef"));
    }

    @Test
    void decode_无嵌入预览的RAW文件抛受控异常并带格式提示() throws IOException {
        // 创建一个空的 .nef 文件（无 JPEG 嵌入预览）
        Path nefFile = tempDir.resolve("test.nef");
        Files.write(nefFile, new byte[]{0x00, 0x00, 0x00, 0x00});

        PreviewGenerationException ex = assertThrows(
                PreviewGenerationException.class,
                () -> decoder.decode(nefFile.toString())
        );
        assertTrue(ex.getMessage().contains("无法从 RAW 文件提取嵌入预览"));
        // NEF 应有 NEF 特定提示
        assertTrue(ex.getMessage().contains("NEF"));
    }

    @Test
    void decode_CR3文件无预览时提示BMFF格式() throws IOException {
        Path cr3File = tempDir.resolve("test.cr3");
        Files.write(cr3File, new byte[]{0x00, 0x00, 0x00, 0x00});

        PreviewGenerationException ex = assertThrows(
                PreviewGenerationException.class,
                () -> decoder.decode(cr3File.toString())
        );
        assertTrue(ex.getMessage().contains("CR3"));
        assertTrue(ex.getMessage().contains("ISO BMFF"));
    }

    @Test
    void decode_RAF文件无预览时提示格式特殊() throws IOException {
        Path rafFile = tempDir.resolve("test.raf");
        Files.write(rafFile, new byte[]{0x00, 0x00, 0x00, 0x00});

        PreviewGenerationException ex = assertThrows(
                PreviewGenerationException.class,
                () -> decoder.decode(rafFile.toString())
        );
        assertTrue(ex.getMessage().contains("RAF"));
    }

    @Test
    void decode_选择像素面积最大的内嵌JPEG而不是传感器显影() throws IOException {
        byte[] small = jpeg(120, 80, 7);
        byte[] large = jpeg(640, 360, 11);
        ByteArrayOutputStream raw = new ByteArrayOutputStream();
        raw.write(new byte[]{0x12, 0x34, 0x56, 0x78});
        raw.write(small);
        raw.write(new byte[]{0x01, 0x02, 0x03});
        raw.write(large);
        Path file = tempDir.resolve("embedded.nef");
        Files.write(file, raw.toByteArray());

        BufferedImage result = decoder.decode(file.toString());

        assertEquals(640, result.getWidth());
        assertEquals(360, result.getHeight());
    }

    private static byte[] jpeg(final int width, final int height, final int seed) throws IOException {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Random random = new Random(seed);
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                image.setRGB(x, y, random.nextInt(0x1000000));
            }
        }
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        ImageIO.write(image, "jpeg", output);
        return output.toByteArray();
    }
}
