package com.camborder.app.util;

import com.camborder.app.exception.PreviewGenerationException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

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
}
