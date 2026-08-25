package com.camborder.app.service.impl;

import com.camborder.app.exception.PreviewGenerationException;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.ThreadLocalRandom;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * LibRaw 子进程桥接测试。
 *
 * 用真实可执行的 shell 脚本充当「LibRaw 原生程序」，覆盖：
 * - 成功路径：CLI 输出 TIFF/PNG → 解码为图像；
 * - 失败路径：非零退出码 → 受控异常携带 stderr 摘要；
 * - 超时路径：超时后抛受控异常，解码进程被强制终止；
 * - 临时文件清理：任何路径下都不残留 camborder-raw-* 临时文件；
 * - 未配置：isConfigured=false 且 develop 抛受控异常（调用方据此降级）。
 *
 * 说明：LibRaw 原生程序本身的构建与各格式真实验证依赖平台产物
 * （native/libraw_sampler.cpp + scripts/build-libraw.sh），不在单测范围内。
 */
final class LibRawCliDevelopServiceImplTest {

    @TempDir
    static Path tempDir;

    private static Path fixturePng;

    @BeforeAll
    static void setUp() throws IOException {
        // 生成噪声 PNG 作为假显影产物
        fixturePng = tempDir.resolve("fixture.png");
        final BufferedImage image = new BufferedImage(64, 48, BufferedImage.TYPE_INT_RGB);
        final Graphics2D g = image.createGraphics();
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                final ThreadLocalRandom random = ThreadLocalRandom.current();
                g.setColor(new Color(random.nextInt(256), random.nextInt(256), random.nextInt(256)));
                g.fillRect(x, y, 1, 1);
            }
        }
        g.dispose();
        ImageIO.write(image, "png", fixturePng.toFile());
    }

    @AfterAll
    static void tearDown() {
        // 无需清理：@TempDir 自动删除
    }

    /** 写一个可执行脚本。 */
    private static String writeScript(final String name, final String body) throws IOException {
        final Path script = tempDir.resolve(name);
        Files.writeString(script, "#!/bin/sh\n" + body + "\n");
        script.toFile().setExecutable(true);
        return script.toString();
    }

    private static long countTempOutputs() throws IOException {
        try (var stream = Files.list(Path.of(System.getProperty("java.io.tmpdir")))) {
            return stream.filter(p -> p.getFileName().toString().startsWith("camborder-raw-")).count();
        }
    }

    @Test
    void successPathDevelopsViaCliAndCachesResult() throws IOException {
        final String cli = writeScript("ok-cli.sh",
                "cp \"" + fixturePng + "\" \"$2\"");
        final LibRawCliDevelopServiceImpl service =
                new LibRawCliDevelopServiceImpl(cli, 10_000);

        assertThat(service.isConfigured()).isTrue();

        final Path raw = tempDir.resolve("sample.nef");
        Files.writeString(raw, "fake raw bytes");

        final BufferedImage first = service.develop(raw.toString());
        assertThat(first).isNotNull();
        assertThat(first.getWidth()).isEqualTo(64);

        // 二次 develop 走缓存（同路径同 mtime），仍返回有效图像
        final BufferedImage second = service.develop(raw.toString());
        assertThat(second).isNotNull();
    }

    @Test
    void failingCliProducesControlledExceptionWithStderr() throws IOException {
        final String cli = writeScript("fail-cli.sh",
                "echo \"unsupported RAW layout\" >&2; exit 3");
        final LibRawCliDevelopServiceImpl service =
                new LibRawCliDevelopServiceImpl(cli, 10_000);

        final Path raw = tempDir.resolve("bad.arw");
        Files.writeString(raw, "fake");

        assertThatThrownBy(() -> service.develop(raw.toString()))
                .isInstanceOf(PreviewGenerationException.class)
                .hasMessageContaining("退出码 3")
                .hasMessageContaining("unsupported RAW layout");
    }

    @Test
    void timeoutDestroysProcessAndThrowsControlledException() throws IOException {
        // sleep 远超超时阈值；输出文件永远不产生
        final String cli = writeScript("slow-cli.sh", "sleep 30");
        final LibRawCliDevelopServiceImpl service =
                new LibRawCliDevelopServiceImpl(cli, 400);

        final Path raw = tempDir.resolve("slow.raf");
        Files.writeString(raw, "fake");

        final long start = System.currentTimeMillis();
        assertThatThrownBy(() -> service.develop(raw.toString()))
                .isInstanceOf(PreviewGenerationException.class)
                .hasMessageContaining("超时");
        // 快速失败而不是等满 30s
        assertThat(System.currentTimeMillis() - start).isLessThan(5_000);
    }

    @Test
    void tempOutputFilesAreAlwaysCleanedUp() throws IOException {
        final long before = countTempOutputs();

        // 成功路径
        final String okCli = writeScript("cleanup-ok.sh", "cp \"" + fixturePng + "\" \"$2\"");
        final LibRawCliDevelopServiceImpl okService = new LibRawCliDevelopServiceImpl(okCli, 5_000);
        final Path raw1 = tempDir.resolve("a.dng");
        Files.writeString(raw1, "x");
        okService.develop(raw1.toString());

        // 失败路径
        final String failCli = writeScript("cleanup-fail.sh", "exit 2");
        final LibRawCliDevelopServiceImpl failService = new LibRawCliDevelopServiceImpl(failCli, 5_000);
        final Path raw2 = tempDir.resolve("b.orf");
        Files.writeString(raw2, "y");
        assertThatThrownBy(() -> failService.develop(raw2.toString())).isInstanceOf(PreviewGenerationException.class);

        assertThat(countTempOutputs()).isEqualTo(before);
    }

    @Test
    void unconfiguredServiceReportsFalseAndRefusesToDevelop() {
        final LibRawCliDevelopServiceImpl empty = new LibRawCliDevelopServiceImpl("", 5_000);
        assertThat(empty.isConfigured()).isFalse();
        assertThatThrownBy(() -> empty.develop("/tmp/x.nef"))
                .isInstanceOf(PreviewGenerationException.class)
                .hasMessageContaining("未配置 RAW 显影组件");

        final LibRawCliDevelopServiceImpl missingFile =
                new LibRawCliDevelopServiceImpl(tempDir.resolve("no-such-binary").toString(), 5_000);
        assertThat(missingFile.isConfigured()).isFalse();
    }
}
