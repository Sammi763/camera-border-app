package com.camborder.app.service.impl;

import com.camborder.app.dto.FidelityReport;
import com.camborder.app.exception.RenderExportException;
import com.camborder.app.service.ExifToolService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

/**
 * ExifTool 的固定参数、超时和输出校验边界。
 *
 * 不通过 shell 执行，不接收 PATH 中的同名程序；每次写回后重新读取 JSON 并校验结构事实。
 */
@Service
public final class ControlledExifToolService implements ExifToolService {

    private static final String EXPECTED_VERSION = "13.59";
    private static final int MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

    private final Path executable;
    private final long timeoutMs;
    private final ObjectMapper objectMapper;
    private final ProcessRunner processRunner;

    @Autowired
    public ControlledExifToolService(
            @Value("${CAMBORDER_EXIFTOOL_PATH:}") final String configuredPath,
            @Value("${camborder.exiftool.timeout-ms:5000}") final long timeoutMs,
            final ObjectMapper objectMapper) {
        this(configuredPath, timeoutMs, objectMapper, new DefaultProcessRunner());
    }

    public ControlledExifToolService(final String configuredPath, final long timeoutMs,
                                     final ObjectMapper objectMapper,
                                     final ProcessRunner processRunner) {
        this.executable = configuredPath == null || configuredPath.isBlank()
                ? null : Path.of(configuredPath.trim());
        this.timeoutMs = Math.max(100, timeoutMs);
        this.objectMapper = objectMapper;
        this.processRunner = processRunner;
    }

    @Override
    public boolean isAvailable() {
        if (executable == null || !Files.isRegularFile(executable) || !Files.isExecutable(executable)) {
            return false;
        }
        try {
            ProcessResult result = run(Arrays.asList("-ver"));
            return result.exitCode == 0 && EXPECTED_VERSION.equals(firstLine(result.stdout));
        } catch (RuntimeException exception) {
            return false;
        }
    }

    @Override
    public String version() {
        if (executable == null) return null;
        try {
            return firstLine(run(Arrays.asList("-ver")).stdout);
        } catch (RuntimeException exception) {
            return null;
        }
    }

    @Override
    public Inspection inspect(final Path file) {
        if (!isAvailable()) {
            return invalid("ExifTool 不可用");
        }
        try {
            ProcessResult result = run(Arrays.asList(
                    "-json", "-a", "-G1", "-s", "-all", "-validate", "-warning", "-error", "--",
                    file.toAbsolutePath().normalize().toString()));
            if (result.exitCode != 0) {
                return invalid("ExifTool 读取失败");
            }
            JsonNode root = objectMapper.readTree(result.stdout);
            if (!root.isArray() || root.isEmpty() || !root.get(0).isObject()) {
                return invalid("ExifTool 输出无效");
            }
            return parseInspection(root.get(0));
        } catch (IOException | RuntimeException exception) {
            return invalid("ExifTool 输出解析失败");
        }
    }

    @Override
    public void rewrite(final Path source, final Path output, final String metadataPolicy,
                        final byte[] targetIcc, final int width, final int height,
                        final int bitDepth, final String colorSpace) {
        if (!isAvailable()) {
            throw new RenderExportException("ExifTool 不可用，专业元数据导出失败");
        }
        final Path normalizedOutput = output.toAbsolutePath().normalize();
        Path iccFile = null;
        try {
            List<String> arguments = new ArrayList<>();
            arguments.add("-overwrite_original");
            arguments.add("-m");
            if ("strip".equals(metadataPolicy)) {
                arguments.add("-all=");
            } else {
                arguments.add("-TagsFromFile");
                arguments.add(source.toAbsolutePath().normalize().toString());
                arguments.add("-all:all");
                arguments.add("-unsafe");
                if ("remove-location".equals(metadataPolicy)) {
                    arguments.add("-GPS:all=");
                    arguments.add("-XMP-exif:GPS*=");
                    arguments.add("-XMP-iptcCore:Location*=");
                    arguments.add("-IPTC:Location*=");
                    arguments.add("-Composite:GPSPosition=");
                }
            }
            // 源文件的缩略图尺寸属于旧文件事实，不能随 metadata copy 原样带到新尺寸输出。
            // 统一移除，报告中的 thumbnailPolicy 会明确记录这一事实。
            arguments.add("-ThumbnailImage=");
            arguments.add("-PreviewImage=");
            arguments.add("-JpgFromRaw=");
            arguments.add("-OtherImage=");
            arguments.add("-Orientation=Horizontal (normal)");
            arguments.add("-ExifIFD:ExifImageWidth=" + width);
            arguments.add("-ExifIFD:ExifImageHeight=" + height);
            if ("tif".equalsIgnoreCase(extension(normalizedOutput))
                    || "tiff".equalsIgnoreCase(extension(normalizedOutput))) {
                arguments.add("-IFD0:ImageWidth=" + width);
                arguments.add("-IFD0:ImageHeight=" + height);
                arguments.add("-IFD0:BitsPerSample=" + bitDepth);
            } else {
                // JPEG/PNG 的实际尺寸和位深来自编码后的文件结构；移除源 IFD0
                // 中可能指向旧像素尺寸的字段，避免保留过期的嵌入事实。
                arguments.add("-IFD0:ImageWidth=");
                arguments.add("-IFD0:ImageHeight=");
                arguments.add("-IFD0:BitsPerSample=");
            }
            if ("srgb".equalsIgnoreCase(colorSpace)) {
                arguments.add("-ExifIFD:ColorSpace=sRGB");
            }
            if (targetIcc != null && targetIcc.length > 0) {
                iccFile = Files.createTempFile(normalizedOutput.getParent(), ".camborder-icc-", ".icc");
                Files.write(iccFile, targetIcc);
                arguments.add("-ICC_Profile<=" + iccFile.toAbsolutePath().normalize());
            }
            arguments.add(normalizedOutput.toString());
            ProcessResult result = run(arguments);
            if (result.exitCode != 0) {
                throw new RenderExportException("ExifTool 写回失败");
            }
            Inspection inspection = inspect(normalizedOutput);
            if (!inspection.isValid() || inspection.getWidth() != width || inspection.getHeight() != height
                    || inspection.getBitDepth() != bitDepth) {
                throw new RenderExportException("ExifTool 写回后文件事实校验失败");
            }
            if ("remove-location".equals(metadataPolicy)
                    && inspection.getMetadata() != null && inspection.getMetadata().isGps()) {
                throw new RenderExportException("分享档位置元数据未能移除");
            }
        } catch (IOException exception) {
            throw new RenderExportException("ExifTool 临时文件处理失败");
        } finally {
            if (iccFile != null) {
                try { Files.deleteIfExists(iccFile); } catch (IOException ignored) { }
            }
        }
    }

    private Inspection parseInspection(final JsonNode node) {
        int width = intValue(node, "File:ImageWidth", "PNG:ImageWidth", "ImageWidth",
                "IFD0:ImageWidth", "TIFF:ImageWidth");
        int height = intValue(node, "File:ImageHeight", "PNG:ImageHeight", "ImageHeight",
                "IFD0:ImageHeight", "TIFF:ImageHeight");
        int bitDepth = intValue(node, "File:BitDepth", "File:BitsPerSample", "PNG:BitDepth", "BitDepth",
                "IFD0:BitsPerSample", "BitsPerSample", "TIFF:BitsPerSample");
        int orientation = orientationValue(node, "EXIF:Orientation", "ExifIFD:Orientation",
                "IFD0:Orientation", "Orientation");
        String colorSpace = textValue(node, "ExifIFD:ColorSpace", "EXIF:ColorSpace",
                "ICC_Profile:ColorSpaceData", "ICC-header:ColorSpaceData", "ColorSpace");
        FidelityReport.IccFacts icc = new FidelityReport.IccFacts();
        boolean hasIcc = hasGroup(node, "ICC_Profile") || hasGroup(node, "ICC-header")
                || hasKey(node, "ICC_Profile");
        icc.setState(hasIcc ? "present" : "absent");
        icc.setProfileName(textValue(node, "ICC_Profile:ProfileDescription", "ProfileDescription"));
        icc.setByteLength(integerValue(node, "ICC_Profile:ProfileSize", "ProfileSize"));
        FidelityReport.MetadataFacts metadata = new FidelityReport.MetadataFacts();
        metadata.setExif(hasGroupPrefix(node, "exif") || hasGroupPrefix(node, "exififd")
                || hasGroupPrefix(node, "ifd0"));
        metadata.setXmp(hasGroupPrefix(node, "xmp"));
        metadata.setIptc(hasGroupPrefix(node, "iptc") || hasGroupPrefix(node, "photoshop"));
        metadata.setGps(hasGroupPrefix(node, "gps") || hasKeyContaining(node, "gps"));
        metadata.setDpi(hasKeyContaining(node, "XResolution") || hasKeyContaining(node, "YResolution"));
        metadata.setThumbnail(hasKeyContaining(node, "Thumbnail"));
        boolean valid = width > 0 && height > 0 && bitDepth > 0
                && !hasKeyContaining(node, "Error");
        return new Inspection(valid, width, height, bitDepth, orientation, colorSpace,
                icc, metadata, valid ? null : "输出文件结构无效");
    }

    private ProcessResult run(final List<String> arguments) {
        if (executable == null) throw new RenderExportException("ExifTool 路径未配置");
        List<String> command = new ArrayList<>();
        command.add(executable.toString());
        command.addAll(arguments);
        return processRunner.run(command, timeoutMs, MAX_OUTPUT_BYTES);
    }

    private static Inspection invalid(final String message) {
        return new Inspection(false, 0, 0, 0, 0, null, null, null, message);
    }

    private static int intValue(final JsonNode node, final String... names) {
        Integer value = integerValue(node, names);
        return value == null ? 0 : value;
    }

    private static Integer integerValue(final JsonNode node, final String... names) {
        for (String name : names) {
            JsonNode value = node.get(name);
            if (value != null && value.isNumber()) return value.asInt();
            if (value != null && value.isTextual()) {
                java.util.regex.Matcher matcher = java.util.regex.Pattern
                        .compile("-?\\d+").matcher(value.asText());
                if (matcher.find()) {
                    try { return Integer.parseInt(matcher.group()); }
                    catch (NumberFormatException ignored) { }
                }
            }
        }
        return null;
    }

    private static int orientationValue(final JsonNode node, final String... names) {
        for (String name : names) {
            JsonNode value = node.get(name);
            if (value == null || value.isNull()) continue;
            if (value.isNumber()) return value.asInt();
            String text = value.asText().trim().toLowerCase(Locale.ROOT);
            Integer numeric = integerValue(node, name);
            if (numeric != null && numeric >= 1 && numeric <= 8) return numeric;
            if (text.contains("horizontal (normal)")) return 1;
            if (text.contains("mirror horizontal") && text.contains("270")) return 5;
            if (text.contains("mirror horizontal") && text.contains("90")) return 7;
            if (text.contains("mirror horizontal")) return 2;
            if (text.contains("mirror vertical")) return 4;
            if (text.contains("rotate 180")) return 3;
            if (text.contains("rotate 90")) return 6;
            if (text.contains("rotate 270")) return 8;
        }
        return 0;
    }

    private static String textValue(final JsonNode node, final String... names) {
        for (String name : names) {
            JsonNode value = node.get(name);
            if (value != null && !value.isNull()) return value.asText().trim();
        }
        return null;
    }

    private static boolean hasGroup(final JsonNode node, final String group) {
        return hasKeyContaining(node, group + ":");
    }

    private static boolean hasKey(final JsonNode node, final String key) {
        return node.has(key);
    }

    private static boolean hasKeyContaining(final JsonNode node, final String value) {
        final String lower = value.toLowerCase(Locale.ROOT);
        final java.util.Iterator<String> names = node.fieldNames();
        while (names.hasNext()) {
            if (names.next().toLowerCase(Locale.ROOT).contains(lower)) return true;
        }
        return false;
    }

    private static boolean hasGroupPrefix(final JsonNode node, final String value) {
        final String lower = value.toLowerCase(Locale.ROOT);
        final java.util.Iterator<String> names = node.fieldNames();
        while (names.hasNext()) {
            final String name = names.next().toLowerCase(Locale.ROOT);
            if (name.equals(lower) || name.startsWith(lower + ":") || name.startsWith(lower + "-")) {
                return true;
            }
        }
        return false;
    }

    private static String firstLine(final String output) {
        if (output == null) return "";
        return output.lines().findFirst().orElse("").trim();
    }

    private static String extension(final Path path) {
        final String name = path.getFileName() == null ? "" : path.getFileName().toString();
        final int dot = name.lastIndexOf('.');
        return dot < 0 ? "" : name.substring(dot + 1);
    }

    public interface ProcessRunner {
        ProcessResult run(List<String> command, long timeoutMs, int maxOutputBytes);
    }

    public static final class ProcessResult {
        private final int exitCode;
        private final String stdout;
        private final String stderr;

        public ProcessResult(final int exitCode, final String stdout, final String stderr) {
            this.exitCode = exitCode;
            this.stdout = stdout == null ? "" : stdout;
            this.stderr = stderr == null ? "" : stderr;
        }

        public int getExitCode() { return exitCode; }
        public String getStdout() { return stdout; }
        public String getStderr() { return stderr; }
    }

    private static final class DefaultProcessRunner implements ProcessRunner {
        @Override
        public ProcessResult run(final List<String> command, final long timeoutMs,
                                 final int maxOutputBytes) {
            ExecutorService readerExecutor = Executors.newSingleThreadExecutor(runnable -> {
                Thread thread = new Thread(runnable, "camborder-exiftool-output");
                thread.setDaemon(true);
                return thread;
            });
            Process process = null;
            Future<String> outputFuture = null;
            try {
                process = new ProcessBuilder(command).redirectErrorStream(true).start();
                final Process runningProcess = process;
                outputFuture = readerExecutor.submit(() -> readLimited(
                        runningProcess.getInputStream(), maxOutputBytes));
                boolean finished = process.waitFor(timeoutMs, TimeUnit.MILLISECONDS);
                if (!finished) {
                    process.destroyForcibly();
                    throw new RenderExportException("ExifTool 执行超时");
                }
                String stdout = outputFuture.get();
                return new ProcessResult(process.exitValue(), stdout, "");
            } catch (InterruptedException exception) {
                if (process != null) process.destroyForcibly();
                Thread.currentThread().interrupt();
                throw new RenderExportException("ExifTool 执行被中断");
            } catch (ExecutionException exception) {
                if (process != null) process.destroyForcibly();
                Throwable cause = exception.getCause();
                if (cause instanceof RenderExportException) throw (RenderExportException) cause;
                throw new RenderExportException("ExifTool 输出读取失败");
            } catch (IOException exception) {
                throw new RenderExportException("ExifTool 启动失败");
            } finally {
                if (outputFuture != null && !outputFuture.isDone()) outputFuture.cancel(true);
                readerExecutor.shutdownNow();
            }
        }

        private static String readLimited(final InputStream input, final int maxBytes) throws IOException {
            byte[] buffer = new byte[8192];
            java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
            int total = 0;
            int read;
            while ((read = input.read(buffer)) >= 0) {
                total += read;
                if (total > maxBytes) throw new RenderExportException("ExifTool 输出过大");
                output.write(buffer, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }
}
