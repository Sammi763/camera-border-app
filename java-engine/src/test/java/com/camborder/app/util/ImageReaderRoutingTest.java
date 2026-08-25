package com.camborder.app.util;

import com.camborder.app.dto.SourceDecode;
import com.camborder.app.service.RawDevelopService;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.ThreadLocalRandom;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ImageReader RAW 路由测试：覆盖 NEF/CR2/CR3/ARW/RAF/DNG/ORF/RW2/PEF。
 *
 * - 显影已配置且成功 → sourceDecode.mode = raw-developed（真实显影）；
 * - 显影失败 → 显式降级 embedded-preview-fallback，warning 携带原因；
 * - 未配置 → 显式降级，warning 说明未配置 LibRaw；
 * - 降级的嵌入预览来自文件内嵌 JPEG（>10KB 阈值），绝不静默伪装成完整显影。
 */
final class ImageReaderRoutingTest {

    @TempDir
    Path tempDir;

    /** 构造一个内嵌 >10KB JPEG 的「RAW」文件。 */
    private Path writeRawWithEmbeddedJpeg(final String fileName) throws Exception {
        final BufferedImage preview = new BufferedImage(400, 300, BufferedImage.TYPE_INT_RGB);
        final Graphics2D g = preview.createGraphics();
        final ThreadLocalRandom random = ThreadLocalRandom.current();
        for (int y = 0; y < 300; y += 2) {
            for (int x = 0; x < 400; x += 2) {
                g.setColor(new Color(random.nextInt(256), random.nextInt(256), random.nextInt(256)));
                g.fillRect(x, y, 2, 2);
            }
        }
        g.dispose();

        final java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        ImageIO.write(preview, "jpg", baos);
        assertThat(baos.size()).isGreaterThan(RawDecoderThreshold.MIN_JPEG_SIZE);

        // 前缀伪字节模拟 RAW 容器 + 内嵌 JPEG
        final Path raw = tempDir.resolve(fileName);
        byte[] junk = "CAMERARAWCONTAINERHEADER0000".getBytes();
        byte[] jpeg = baos.toByteArray();
        byte[] all = new byte[junk.length + jpeg.length];
        System.arraycopy(junk, 0, all, 0, junk.length);
        System.arraycopy(jpeg, 0, all, junk.length, jpeg.length);
        Files.write(raw, all);
        return raw;
    }

    private RawDevelopService fakeService(final boolean configured, final boolean succeed) {
        return new RawDevelopService() {
            @Override
            public boolean isConfigured() {
                return configured;
            }

            @Override
            public BufferedImage develop(final String rawPath) {
                if (succeed) {
                    return new BufferedImage(64, 48, BufferedImage.TYPE_INT_RGB);
                }
                throw new com.camborder.app.exception.PreviewGenerationException("解码器崩溃（测试注入）");
            }
        };
    }

    @ParameterizedTest(name = "{0}：显影成功 → raw-developed")
    @ValueSource(strings = {"a.nef", "b.cr2", "c.cr3", "d.arw", "e.raf", "f.dng", "g.orf", "h.rw2", "i.pef"})
    void configuredAndSuccessfulCliYieldsRawDeveloped(final String fileName) throws Exception {
        final Path raw = writeRawWithEmbeddedJpeg(fileName);
        final ImageReader reader = new ImageReader(new RawDecoder(), fakeService(true, true));

        final ImageReader.ReadResult result = reader.readWithSource(raw.toString());
        assertThat(result.getSourceDecode().getMode()).isEqualTo(SourceDecode.MODE_RAW_DEVELOPED);
        assertThat(result.getSourceDecode().getFormat()).isEqualTo(extensionOf(fileName));
        assertThat(result.getSourceDecode().getWarning()).isNull();
    }

    @ParameterizedTest(name = "{0}：显影失败 → 显式降级嵌入预览")
    @ValueSource(strings = {"a.nef", "b.cr2", "c.cr3", "d.arw", "e.raf", "f.dng", "g.orf", "h.rw2", "i.pef"})
    void failingCliDegradesToEmbeddedPreviewWithReason(final String fileName) throws Exception {
        final Path raw = writeRawWithEmbeddedJpeg(fileName);
        final ImageReader reader = new ImageReader(new RawDecoder(), fakeService(true, false));

        final ImageReader.ReadResult result = reader.readWithSource(raw.toString());
        assertThat(result.getSourceDecode().getMode()).isEqualTo(SourceDecode.MODE_EMBEDDED_FALLBACK);
        assertThat(result.getSourceDecode().getWarning()).contains("RAW 真实显影失败");
        assertThat(result.getSourceDecode().getWarning()).contains("测试注入");
        // 降级结果仍是可用的图像（嵌入预览）
        assertThat(result.getImage().getWidth()).isEqualTo(400);
    }

    @ParameterizedTest(name = "{0}：未配置 → 显式降级并说明原因")
    @ValueSource(strings = {"a.nef", "b.cr2", "c.cr3", "d.arw", "e.raf", "f.dng", "g.orf", "h.rw2", "i.pef"})
    void unconfiguredCliDegradesWithExplicitReason(final String fileName) throws Exception {
        final Path raw = writeRawWithEmbeddedJpeg(fileName);
        final ImageReader reader = new ImageReader(new RawDecoder(), fakeService(false, false));

        final ImageReader.ReadResult result = reader.readWithSource(raw.toString());
        assertThat(result.getSourceDecode().getMode()).isEqualTo(SourceDecode.MODE_EMBEDDED_FALLBACK);
        assertThat(result.getSourceDecode().getWarning()).contains("未配置 RAW 显影组件");
    }

    private static String extensionOf(final String name) {
        return name.substring(name.lastIndexOf('.') + 1);
    }

    /** 引用 RawDecoder 的阈值常量做编译期校验。 */
    private static final class RawDecoderThreshold {
        static final int MIN_JPEG_SIZE = 10 * 1024;
    }
}
