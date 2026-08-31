package com.camborder.app.service.impl;

import com.camborder.app.exception.PreviewGenerationException;
import com.camborder.app.service.RawDevelopService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * RAW 真实显影服务实现：通过受控子进程调用随包 LibRaw 原生程序。
 *
 * CLI 契约（native/libraw_sampler.cpp，构建见 scripts/build-libraw.sh）：
 *   camborder-libraw-sampler <input.raw> <output.tiff>
 * 输出为 8-bit TIFF（LibRaw 内置 TIFF writer，无第三方图像库依赖），由 ImageIO 读取。
 *
 * 进程控制：
 * - 超时（app.raw.timeout-ms，默认 30s）：destroyForcibly 终止进程并抛受控异常；
 * - 非零退出：读取 stderr 前 300 字符作为失败原因；
 * - 临时输出文件在 finally 中删除，超时/失败/成功均不残留；
 * - 不缓存 BufferedImage：显影结果在本次调用完成后立即交给渲染器，避免长会话持有
 *   完整分辨率像素数据；预览缓存只允许保存有字节上限的缩小 PNG。
 */
@Service
public final class LibRawCliDevelopServiceImpl implements RawDevelopService {

    private final String cliPath;
    private final long timeoutMs;

    public LibRawCliDevelopServiceImpl(
            @Value("${app.raw.cli-path:${CAMBORDER_LIBRAW_PATH:}}") final String cliPath,
            @Value("${app.raw.timeout-ms:30000}") final long timeoutMs) {
        this.cliPath = cliPath == null ? "" : cliPath.trim();
        this.timeoutMs = timeoutMs <= 0 ? 30_000 : timeoutMs;
    }

    @Override
    public boolean isConfigured() {
        if (cliPath.isEmpty()) {
            return false;
        }
        final Path path = Paths.get(cliPath);
        return Files.isRegularFile(path) && Files.isExecutable(path);
    }

    @Override
    public BufferedImage develop(final String rawPath) {
        if (!isConfigured()) {
            throw new PreviewGenerationException("未配置 RAW 显影组件（LibRaw 原生程序缺失或不可执行）");
        }

        Path output = null;
        try {
            output = Files.createTempFile("camborder-raw-", ".tiff");
            final Process process = startProcess(rawPath, output);
            final boolean finished = process.waitFor(timeoutMs, java.util.concurrent.TimeUnit.MILLISECONDS);

            if (!finished) {
                // 超时：强制终止解码进程，避免僵尸进程占用资源
                process.destroyForcibly();
                process.waitFor(2, java.util.concurrent.TimeUnit.SECONDS);
                throw new PreviewGenerationException(
                        "RAW 显影超时（超过 " + timeoutMs + "ms），已终止解码进程: " + rawPath);
            }

            if (process.exitValue() != 0) {
                throw new PreviewGenerationException(
                        "RAW 显影失败（退出码 " + process.exitValue() + "）: " + readStderr(process));
            }

            final BufferedImage image = ImageIO.read(output.toFile());
            if (image == null) {
                throw new PreviewGenerationException("RAW 显影输出无法解码为图像: " + rawPath);
            }

            return image;
        } catch (final InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new PreviewGenerationException("RAW 显影被中断: " + rawPath);
        } catch (final IOException e) {
            throw new PreviewGenerationException("RAW 显影进程启动失败: " + e.getMessage());
        } finally {
            deleteQuietly(output);
        }
    }

    private Process startProcess(final String rawPath, final Path output) throws IOException {
        final ProcessBuilder builder = new ProcessBuilder(cliPath, rawPath, output.toString());
        builder.redirectErrorStream(false);
        return builder.start();
    }

    /** 读取子进程 stderr 前 300 字符作为失败摘要。 */
    private String readStderr(final Process process) {
        try {
            final byte[] bytes = process.getErrorStream().readNBytes(300);
            final String text = new String(bytes).trim();
            return text.isEmpty() ? "无错误输出" : text;
        } catch (final IOException e) {
            return "无错误输出";
        }
    }

    private static void deleteQuietly(final Path path) {
        if (path == null) {
            return;
        }
        try {
            Files.deleteIfExists(path);
        } catch (final IOException ignored) {
            // 清理失败不影响主流程
        }
    }
}
