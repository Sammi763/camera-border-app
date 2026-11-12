package com.camborder.app.util;

import com.camborder.app.exception.FilmRawException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

/**
 * 受控 LibRaw helper 适配器（T03）。
 *
 * 只调用 Electron 注入的固定 helper 路径，不搜索系统 PATH，不在运行时下载。
 * helper 输出 RGB16 小端数据 + JSON 元数据；本类负责白名单参数、超时/取消、
 * 输出尺寸校验、临时文件清理、源文件版本核对和有界错误日志。
 */
@Component
public final class FilmRawDecoder {

    public static final String CODE_HELPER_UNAVAILABLE = "RAW_HELPER_UNAVAILABLE";
    public static final String CODE_INPUT_INVALID = "RAW_INPUT_INVALID";
    public static final String CODE_TIMEOUT = "RAW_DECODE_TIMEOUT";
    public static final String CODE_CANCELLED = "RAW_DECODE_CANCELLED";
    public static final String CODE_FAILED = "RAW_DECODE_FAILED";
    public static final String CODE_OUTPUT_INVALID = "RAW_OUTPUT_INVALID";
    public static final String CODE_SOURCE_CHANGED = "RAW_SOURCE_CHANGED";
    public static final String CODE_PIXEL_LIMIT = "RAW_PIXEL_LIMIT";
    public static final String CODE_PROBE_FAILED = "RAW_PROBE_FAILED";

    private static final int HEADER_BYTES = 28;
    private static final int MAX_HELPER_LOG_BYTES = 8 * 1024;
    private static final int DEFAULT_TIMEOUT_SECONDS = 60;
    private static final long DEFAULT_MAX_PIXELS = 150_000_000L;
    private static final String MAGIC = "FRW1";

    private final String helperPath;
    private final ObjectMapper objectMapper;
    private final RawDecoder rawDecoder;

    @Autowired
    public FilmRawDecoder(@Value("${CAMBORDER_LIBRAW_HELPER_PATH:}") final String helperPath,
                          final ObjectMapper objectMapper,
                          final RawDecoder rawDecoder) {
        this.helperPath = helperPath == null ? "" : helperPath.trim();
        this.objectMapper = objectMapper;
        this.rawDecoder = rawDecoder;
    }

    /** 测试/嵌入调用：不依赖 Spring。 */
    public FilmRawDecoder(final String helperPath, final ObjectMapper objectMapper) {
        this(helperPath, objectMapper, new RawDecoder());
    }

    /** 解码参数；第一版只开放白名单组合，字段与 ImageProcessingConfig.RawOptions 对齐。 */
    public static final class DecodeOptions {
        private String crop = "vendor-inset";
        private String whiteBalance = "camera";
        private String highlight = "clip";
        private long maxPixels = DEFAULT_MAX_PIXELS;
        private int timeoutSeconds = DEFAULT_TIMEOUT_SECONDS;

        public DecodeOptions() { }

        public String getCrop() { return crop; }
        public void setCrop(final String crop) { this.crop = crop; }
        public String getWhiteBalance() { return whiteBalance; }
        public void setWhiteBalance(final String whiteBalance) { this.whiteBalance = whiteBalance; }
        public String getHighlight() { return highlight; }
        public void setHighlight(final String highlight) { this.highlight = highlight; }
        public long getMaxPixels() { return maxPixels; }
        public void setMaxPixels(final long maxPixels) { this.maxPixels = maxPixels; }
        public int getTimeoutSeconds() { return timeoutSeconds; }
        public void setTimeoutSeconds(final int timeoutSeconds) { this.timeoutSeconds = timeoutSeconds; }
    }

    /** 解码结果：16-bit RGB（short 容器，按无符号读取）+ 源事实。 */
    public static final class DecodedRaw {
        private final int width;
        private final int height;
        private final short[] rgb;
        private final RawFacts facts;

        private DecodedRaw(final int width, final int height, final short[] rgb,
                           final RawFacts facts) {
            this.width = width;
            this.height = height;
            this.rgb = rgb;
            this.facts = facts;
        }

        public int getWidth() { return width; }
        public int getHeight() { return height; }
        public short[] getRgb() { return rgb; }
        public RawFacts getFacts() { return facts; }

        /** 按无符号 16-bit 读取交错 RGB。 */
        public int sample(final int x, final int y, final int channel) {
            final int index = (y * width + x) * 3 + channel;
            return rgb[index] & 0xffff;
        }
    }

    /** helper 返回的源/解码事实；方向不在 helper 内旋转。 */
    public static final class RawFacts {
        private final String helperVersion;
        private final String librawVersion;
        private final String make;
        private final String model;
        private final String software;
        private final int rawWidth;
        private final int rawHeight;
        private final String cropMode;
        private final int width;
        private final int height;
        private final int topMargin;
        private final int leftMargin;
        private final int flip;
        private final int exifOrientation;
        private final int sensorBitDepth;
        private final int black;
        private final int maximum;
        private final int[] linearMax;
        private final float[] camMul;
        private final float[] preMul;
        private final float[][] rgbCam;
        private final float[][] camXyz;
        private final String sourceSha256;
        private final long sourceSizeBytes;
        private final long sourceMtimeMillis;

        private RawFacts(final JsonNode json, final int width, final int height,
                         final String sourceSha256, final long sourceSizeBytes,
                         final long sourceMtimeMillis) {
            this.helperVersion = json.path("helperVersion").asText("");
            this.librawVersion = json.path("librawVersion").asText("");
            this.make = json.path("make").asText("");
            this.model = json.path("model").asText("");
            this.software = json.path("software").asText("");
            this.rawWidth = json.path("rawWidth").asInt();
            this.rawHeight = json.path("rawHeight").asInt();
            this.cropMode = json.path("cropMode").asText("");
            this.width = width;
            this.height = height;
            this.topMargin = json.path("topMargin").asInt();
            this.leftMargin = json.path("leftMargin").asInt();
            this.flip = json.path("flip").asInt();
            this.exifOrientation = json.path("exifOrientation").asInt();
            this.sensorBitDepth = json.path("sensorBitDepth").asInt();
            this.black = json.path("black").asInt();
            this.maximum = json.path("maximum").asInt();
            this.linearMax = intArray(json.path("linearMax"), 4);
            this.camMul = floatArray(json.path("camMul"), 4);
            this.preMul = floatArray(json.path("preMul"), 4);
            this.rgbCam = floatMatrix(json.path("rgbCam"), 3, 4);
            this.camXyz = floatMatrix(json.path("camXyz"), 4, 3);
            this.sourceSha256 = sourceSha256;
            this.sourceSizeBytes = sourceSizeBytes;
            this.sourceMtimeMillis = sourceMtimeMillis;
        }

        private static int[] intArray(final JsonNode node, final int length) {
            final int[] values = new int[length];
            for (int index = 0; index < length && node.isArray() && index < node.size(); index++) {
                values[index] = node.get(index).asInt();
            }
            return values;
        }

        private static float[] floatArray(final JsonNode node, final int length) {
            final float[] values = new float[length];
            for (int index = 0; index < length && node.isArray() && index < node.size(); index++) {
                values[index] = (float) node.get(index).asDouble();
            }
            return values;
        }

        private static float[][] floatMatrix(final JsonNode node, final int rows, final int columns) {
            final float[][] values = new float[rows][columns];
            for (int row = 0; row < rows && node.isArray() && row < node.size(); row++) {
                final JsonNode rowNode = node.get(row);
                for (int column = 0; column < columns && rowNode.isArray() && column < rowNode.size(); column++) {
                    values[row][column] = (float) rowNode.get(column).asDouble();
                }
            }
            return values;
        }

        public String getHelperVersion() { return helperVersion; }
        public String getLibrawVersion() { return librawVersion; }
        public String getMake() { return make; }
        public String getModel() { return model; }
        public String getSoftware() { return software; }
        public int getRawWidth() { return rawWidth; }
        public int getRawHeight() { return rawHeight; }
        public String getCropMode() { return cropMode; }
        public int getWidth() { return width; }
        public int getHeight() { return height; }
        public int getTopMargin() { return topMargin; }
        public int getLeftMargin() { return leftMargin; }
        public int getFlip() { return flip; }
        public int getExifOrientation() { return exifOrientation; }
        public int getSensorBitDepth() { return sensorBitDepth; }
        public int getBlack() { return black; }
        public int getMaximum() { return maximum; }
        public int[] getLinearMax() { return linearMax.clone(); }
        public float[] getCamMul() { return camMul.clone(); }
        public float[] getPreMul() { return preMul.clone(); }
        public float[][] getRgbCam() { return deepCopy(rgbCam); }
        public float[][] getCamXyz() { return deepCopy(camXyz); }
        public String getSourceSha256() { return sourceSha256; }
        public long getSourceSizeBytes() { return sourceSizeBytes; }
        public long getSourceMtimeMillis() { return sourceMtimeMillis; }

        /** 可放入缓存键/响应的事实版本。 */
        public String getSourceVersion() {
            return "sha256:" + sourceSha256 + ";size:" + sourceSizeBytes + ";mtime:" + sourceMtimeMillis;
        }

        private static float[][] deepCopy(final float[][] source) {
            final float[][] copy = new float[source.length][];
            for (int index = 0; index < source.length; index++) {
                copy[index] = source[index].clone();
            }
            return copy;
        }
    }

    /** 解码入口；调用方负责把源路径限制在用户选择的本地文件。 */
    public DecodedRaw decode(final String imagePath) {
        return decode(imagePath, new DecodeOptions());
    }

    /**
     * 尺寸探测入口：helper --probe --input 只打开文件并读取尺寸/源事实，
     * 不 unpack、不去马赛克、不生成像素输出。
     */
    public ProbeResult probe(final String imagePath) {
        final Path helper = requireHelper();
        final Path input = requireInput(imagePath);
        final FileFacts before;
        try {
            before = fileFacts(input);
        } catch (IOException exception) {
            throw new FilmRawException("RAW 源文件无法读取", HttpStatus.BAD_REQUEST, CODE_INPUT_INVALID);
        }
        final List<String> command = new ArrayList<>();
        command.add(helper.toString());
        command.add("--probe");
        command.add("--input");
        command.add(input.toString());
        command.add("--crop");
        command.add("vendor-inset");
        command.add("--max-pixels");
        command.add(Long.toString(DEFAULT_MAX_PIXELS));

        final Process process;
        try {
            process = new ProcessBuilder(command).start();
        } catch (IOException exception) {
            throw new FilmRawException("LibRaw helper 启动失败", HttpStatus.SERVICE_UNAVAILABLE,
                    CODE_HELPER_UNAVAILABLE);
        }
        final ByteArrayOutputStream stdout = new ByteArrayOutputStream();
        final ByteArrayOutputStream stderr = new ByteArrayOutputStream();
        final Thread outReader = new Thread(() -> readBounded(process.getInputStream(), stdout),
                "film-raw-probe-out");
        final Thread errReader = new Thread(() -> readBounded(process.getErrorStream(), stderr),
                "film-raw-probe-err");
        outReader.setDaemon(true);
        errReader.setDaemon(true);
        outReader.start();
        errReader.start();
        try {
            final long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(DEFAULT_TIMEOUT_SECONDS);
            boolean finished = false;
            while (System.nanoTime() < deadline) {
                FilmRequestGuard.check();
                if (process.waitFor(100, TimeUnit.MILLISECONDS)) { finished = true; break; }
            }
            if (!finished) {
                process.destroyForcibly();
                process.waitFor(2, TimeUnit.SECONDS);
                throw new FilmRawException("LibRaw helper 尺寸探测超时", HttpStatus.GATEWAY_TIMEOUT,
                        CODE_TIMEOUT);
            }
            outReader.join(1000);
            errReader.join(1000);
            final int exitCode = process.exitValue();
            if (exitCode != 0) {
                throw new FilmRawException("LibRaw helper 尺寸探测失败（exit=" + exitCode + "）："
                        + bounded(stderr.toString(StandardCharsets.UTF_8).trim()),
                        HttpStatus.UNPROCESSABLE_ENTITY, CODE_PROBE_FAILED);
            }
            final JsonNode meta;
            try {
                meta = objectMapper.readTree(stdout.toString(StandardCharsets.UTF_8));
            } catch (IOException exception) {
                throw new FilmRawException("LibRaw helper 尺寸探测输出无效",
                        HttpStatus.BAD_GATEWAY, CODE_PROBE_FAILED);
            }
            if (meta == null) {
                throw new FilmRawException("LibRaw helper 尺寸探测输出为空",
                        HttpStatus.BAD_GATEWAY, CODE_PROBE_FAILED);
            }
            final int width = meta.path("width").asInt();
            final int height = meta.path("height").asInt();
            if (width <= 0 || height <= 0 || (long) width * height > DEFAULT_MAX_PIXELS) {
                throw new FilmRawException("LibRaw helper 尺寸探测结果非法",
                        HttpStatus.BAD_GATEWAY, CODE_PROBE_FAILED);
            }
            final FileFacts after;
            try {
                after = fileFacts(input);
            } catch (IOException exception) {
                throw new FilmRawException("RAW 源文件在探测后无法读取", HttpStatus.CONFLICT,
                        CODE_SOURCE_CHANGED);
            }
            if (!before.equals(after)) {
                throw new FilmRawException("RAW 源文件在尺寸探测期间发生变化", HttpStatus.CONFLICT,
                        CODE_SOURCE_CHANGED);
            }
            return new ProbeResult(width, height,
                    new RawFacts(meta, width, height, before.sha256, before.size, before.mtimeMillis));
        } catch (InterruptedException exception) {
            process.destroyForcibly();
            Thread.currentThread().interrupt();
            throw new FilmRawException("LibRaw helper 尺寸探测被取消", HttpStatus.REQUEST_TIMEOUT,
                    CODE_CANCELLED);
        } finally {
            if (process.isAlive()) process.destroyForcibly();
            try {
                outReader.join(200);
                errReader.join(200);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        }
    }

    /** 尺寸探测结果：尺寸 + 源事实，不含像素缓冲。 */
    public static final class ProbeResult {
        private final int width;
        private final int height;
        private final RawFacts facts;

        private ProbeResult(final int width, final int height, final RawFacts facts) {
            this.width = width;
            this.height = height;
            this.facts = facts;
        }

        public int getWidth() { return width; }
        public int getHeight() { return height; }
        public RawFacts getFacts() { return facts; }
        public String getSourceVersion() { return facts.getSourceVersion(); }
    }

    public DecodedRaw decode(final String imagePath, final DecodeOptions requestedOptions) {
        final DecodeOptions options = requestedOptions == null ? new DecodeOptions() : requestedOptions;
        validateOptions(options);
        final Path helper = requireHelper();
        final Path input = requireInput(imagePath);

        final FileFacts before;
        try {
            before = fileFacts(input);
        } catch (IOException exception) {
            throw new FilmRawException("RAW 源文件无法读取", HttpStatus.BAD_REQUEST, CODE_INPUT_INVALID);
        }

        Path workDir = null;
        try {
            workDir = Files.createTempDirectory("camborder-film-raw-");
            final Path output = workDir.resolve("pixels.bin");
            final Path metadata = workDir.resolve("metadata.json");
            final String log = runHelper(helper, input, output, metadata, options);
            final DecodedRaw decoded = readOutput(output, metadata, before, options.getMaxPixels());
            final FileFacts after;
            try {
                after = fileFacts(input);
            } catch (IOException exception) {
                throw new FilmRawException("RAW 源文件在解码后无法读取", HttpStatus.CONFLICT, CODE_SOURCE_CHANGED);
            }
            if (!before.equals(after)) {
                throw new FilmRawException("RAW 源文件在解码期间发生变化", HttpStatus.CONFLICT, CODE_SOURCE_CHANGED);
            }
            return decoded;
        } catch (IOException exception) {
            throw new FilmRawException("RAW 临时文件创建失败", HttpStatus.INTERNAL_SERVER_ERROR, CODE_FAILED);
        } finally {
            cleanup(workDir);
        }
    }

    private Path requireHelper() {
        if (helperPath.isBlank()) {
            throw new FilmRawException("未配置随包 LibRaw helper", HttpStatus.SERVICE_UNAVAILABLE,
                    CODE_HELPER_UNAVAILABLE);
        }
        final Path helper;
        try {
            helper = Path.of(helperPath);
        } catch (RuntimeException exception) {
            throw new FilmRawException("LibRaw helper 路径非法", HttpStatus.SERVICE_UNAVAILABLE,
                    CODE_HELPER_UNAVAILABLE);
        }
        if (!Files.isRegularFile(helper) || !Files.isExecutable(helper)) {
            throw new FilmRawException("LibRaw helper 不存在或不可执行", HttpStatus.SERVICE_UNAVAILABLE,
                    CODE_HELPER_UNAVAILABLE);
        }
        return helper;
    }

    private Path requireInput(final String imagePath) {
        if (imagePath == null || imagePath.isBlank()) {
            throw new FilmRawException("RAW 路径不能为空", HttpStatus.BAD_REQUEST, CODE_INPUT_INVALID);
        }
        if (!rawDecoder.isRawFile(imagePath)) {
            throw new FilmRawException("不支持的真实 RAW 扩展名", HttpStatus.BAD_REQUEST, CODE_INPUT_INVALID);
        }
        final Path input;
        try {
            input = Path.of(imagePath);
        } catch (RuntimeException exception) {
            throw new FilmRawException("RAW 路径非法", HttpStatus.BAD_REQUEST, CODE_INPUT_INVALID);
        }
        if (!Files.isRegularFile(input) || !Files.isReadable(input)) {
            throw new FilmRawException("RAW 文件不存在或不可读", HttpStatus.BAD_REQUEST, CODE_INPUT_INVALID);
        }
        return input;
    }

    private static void validateOptions(final DecodeOptions options) {
        if (!"vendor-inset".equals(options.getCrop()) && !"full-sensor".equals(options.getCrop())) {
            throw new FilmRawException("crop 参数非法", HttpStatus.BAD_REQUEST, CODE_INPUT_INVALID);
        }
        if (!"camera".equals(options.getWhiteBalance()) && !"daylight".equals(options.getWhiteBalance())) {
            throw new FilmRawException("whiteBalance 参数非法", HttpStatus.BAD_REQUEST, CODE_INPUT_INVALID);
        }
        if (!"clip".equals(options.getHighlight()) && !"unclip".equals(options.getHighlight())) {
            throw new FilmRawException("highlight 参数非法", HttpStatus.BAD_REQUEST, CODE_INPUT_INVALID);
        }
        if (options.getMaxPixels() <= 0 || options.getMaxPixels() > 1_000_000_000L) {
            throw new FilmRawException("maxPixels 参数非法", HttpStatus.BAD_REQUEST, CODE_PIXEL_LIMIT);
        }
        if (options.getTimeoutSeconds() <= 0 || options.getTimeoutSeconds() > 600) {
            throw new FilmRawException("timeoutSeconds 参数非法", HttpStatus.BAD_REQUEST, CODE_INPUT_INVALID);
        }
    }

    private String runHelper(final Path helper, final Path input, final Path output,
                             final Path metadata, final DecodeOptions options) {
        final List<String> command = new ArrayList<>();
        command.add(helper.toString());
        command.add("--input");
        command.add(input.toString());
        command.add("--output");
        command.add(output.toString());
        command.add("--metadata");
        command.add(metadata.toString());
        command.add("--crop");
        command.add(options.getCrop());
        command.add("--white-balance");
        command.add(options.getWhiteBalance());
        command.add("--highlight");
        command.add(options.getHighlight());
        command.add("--max-pixels");
        command.add(Long.toString(options.getMaxPixels()));

        final Process process;
        try {
            process = new ProcessBuilder(command)
                    .redirectErrorStream(true)
                    .start();
        } catch (IOException exception) {
            throw new FilmRawException("LibRaw helper 启动失败", HttpStatus.SERVICE_UNAVAILABLE,
                    CODE_HELPER_UNAVAILABLE);
        }

        final ByteArrayOutputStream log = new ByteArrayOutputStream();
        final Thread logReader = new Thread(() -> readBounded(process.getInputStream(), log),
                "film-raw-helper-log");
        logReader.setDaemon(true);
        logReader.start();
        try {
            final long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(options.getTimeoutSeconds());
            boolean finished = false;
            while (System.nanoTime() < deadline) {
                FilmRequestGuard.check();
                if (process.waitFor(100, TimeUnit.MILLISECONDS)) { finished = true; break; }
            }
            if (!finished) {
                process.destroyForcibly();
                process.waitFor(2, TimeUnit.SECONDS);
                throw new FilmRawException("LibRaw helper 解码超时", HttpStatus.GATEWAY_TIMEOUT,
                        CODE_TIMEOUT);
            }
            logReader.join(1000);
            final int exitCode = process.exitValue();
            final String helperLog = log.toString(StandardCharsets.UTF_8).trim();
            if (exitCode != 0) {
                throw new FilmRawException(
                        "LibRaw helper 失败（exit=" + exitCode + "）：" + bounded(helperLog),
                        HttpStatus.UNPROCESSABLE_ENTITY, CODE_FAILED);
            }
            return helperLog;
        } catch (InterruptedException exception) {
            process.destroyForcibly();
            Thread.currentThread().interrupt();
            throw new FilmRawException("LibRaw helper 解码被取消", HttpStatus.REQUEST_TIMEOUT,
                    CODE_CANCELLED);
        } finally {
            if (process.isAlive()) process.destroyForcibly();
            try {
                logReader.join(200);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private DecodedRaw readOutput(final Path output, final Path metadata, final FileFacts before,
                                  final long maxPixels) throws IOException {
        if (!Files.isRegularFile(output) || !Files.isRegularFile(metadata)) {
            throw new FilmRawException("LibRaw helper 未生成输出", HttpStatus.BAD_GATEWAY,
                    CODE_OUTPUT_INVALID);
        }
        final long outputSize = Files.size(output);
        if (outputSize < HEADER_BYTES) {
            throw invalidOutput("输出头长度不足");
        }
        try (InputStream raw = new BufferedInputStream(Files.newInputStream(output))) {
            final byte[] header = readFully(raw, HEADER_BYTES);
            if (!MAGIC.equals(new String(header, 0, 4, StandardCharsets.US_ASCII))) {
                throw invalidOutput("输出 magic 不正确");
            }
            final int width = readU32(header, 4);
            final int height = readU32(header, 8);
            final int channels = readU16(header, 12);
            final int bits = readU16(header, 14);
            final int orientation = readI32(header, 16);
            final int sensorBitDepth = readU16(header, 20);
            final long dataBytes = readU32(header, 24);
            if (width <= 0 || height <= 0 || channels != 3 || bits != 16) {
                throw invalidOutput("输出尺寸/通道/位深不合法");
            }
            if (orientation < 1 || orientation > 8) {
                throw invalidOutput("输出 Orientation 不合法");
            }
            if (sensorBitDepth < 0 || sensorBitDepth > 16) {
                throw invalidOutput("传感器有效位深不合法");
            }
            if ((long) width * height * 3 * 2 != dataBytes
                    || outputSize != HEADER_BYTES + dataBytes) {
                throw invalidOutput("输出数据长度不匹配");
            }
            if ((long) width * height > maxPixels) {
                throw new FilmRawException("输出像素数超过上限", HttpStatus.UNPROCESSABLE_ENTITY,
                        CODE_PIXEL_LIMIT);
            }
            final short[] rgb = new short[width * height * 3];
            final byte[] row = new byte[width * 6];
            for (int y = 0; y < height; y++) {
                readFully(raw, row, 0, row.length);
                for (int x = 0; x < width; x++) {
                    final int source = x * 6;
                    final int target = (y * width + x) * 3;
                    rgb[target] = (short) ((row[source] & 0xff) | ((row[source + 1] & 0xff) << 8));
                    rgb[target + 1] = (short) ((row[source + 2] & 0xff) | ((row[source + 3] & 0xff) << 8));
                    rgb[target + 2] = (short) ((row[source + 4] & 0xff) | ((row[source + 5] & 0xff) << 8));
                }
            }
            final JsonNode meta = objectMapper.readTree(metadata.toFile());
            if (meta == null || meta.path("width").asInt() != width
                    || meta.path("height").asInt() != height
                    || meta.path("exifOrientation").asInt() != orientation) {
                throw invalidOutput("metadata 与二进制头不一致");
            }
            return new DecodedRaw(width, height, rgb,
                    new RawFacts(meta, width, height, before.sha256, before.size, before.mtimeMillis));
        } catch (FilmRawException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw invalidOutput("输出无法解析");
        }
    }

    private static FilmRawException invalidOutput(final String detail) {
        return new FilmRawException("LibRaw helper 输出无效：" + detail,
                HttpStatus.BAD_GATEWAY, CODE_OUTPUT_INVALID);
    }

    private static byte[] readFully(final InputStream input, final int length) throws IOException {
        final byte[] buffer = new byte[length];
        readFully(input, buffer, 0, length);
        return buffer;
    }

    private static void readFully(final InputStream input, final byte[] buffer, final int offset,
                                  final int length) throws IOException {
        int read = 0;
        while (read < length) {
            final int count = input.read(buffer, offset + read, length - read);
            if (count < 0) {
                throw new IOException("unexpected end of stream");
            }
            read += count;
        }
    }

    private static int readU16(final byte[] bytes, final int offset) {
        return (bytes[offset] & 0xff) | ((bytes[offset + 1] & 0xff) << 8);
    }

    private static int readU32(final byte[] bytes, final int offset) {
        return (bytes[offset] & 0xff)
                | ((bytes[offset + 1] & 0xff) << 8)
                | ((bytes[offset + 2] & 0xff) << 16)
                | ((bytes[offset + 3] & 0xff) << 24);
    }

    private static int readI32(final byte[] bytes, final int offset) {
        return readU32(bytes, offset);
    }

    private static void readBounded(final InputStream input, final ByteArrayOutputStream output) {
        try (InputStream stream = input) {
            final byte[] buffer = new byte[2048];
            int count;
            int total = 0;
            while ((count = stream.read(buffer)) >= 0) {
                if (total < MAX_HELPER_LOG_BYTES) {
                    final int keep = Math.min(count, MAX_HELPER_LOG_BYTES - total);
                    output.write(buffer, 0, keep);
                    total += keep;
                }
            }
        } catch (IOException ignored) {
            // helper 输出读取失败不应覆盖主错误；保留已有有界日志。
        }
    }

    private static String bounded(final String value) {
        if (value.length() <= MAX_HELPER_LOG_BYTES) return value;
        return value.substring(0, MAX_HELPER_LOG_BYTES) + "…";
    }

    private static FileFacts fileFacts(final Path path) throws IOException {
        return new FileFacts(Files.size(path), Files.getLastModifiedTime(path).toMillis(),
                sha256(path));
    }

    private static String sha256(final Path path) throws IOException {
        try (InputStream input = new BufferedInputStream(Files.newInputStream(path))) {
            final MessageDigest digest;
            try {
                digest = MessageDigest.getInstance("SHA-256");
            } catch (Exception exception) {
                throw new IOException("SHA-256 unavailable", exception);
            }
            final byte[] buffer = new byte[1024 * 1024];
            int read;
            while ((read = input.read(buffer)) >= 0) {
                FilmRequestGuard.check();
                digest.update(buffer, 0, read);
            }
            final StringBuilder result = new StringBuilder(64);
            for (byte value : digest.digest()) {
                result.append(String.format(Locale.ROOT, "%02x", value));
            }
            return result.toString();
        }
    }

    private static void cleanup(final Path directory) {
        if (directory == null) return;
        try {
            if (!Files.exists(directory)) return;
            try (java.util.stream.Stream<Path> paths = Files.walk(directory)) {
                paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                    try {
                        Files.deleteIfExists(path);
                    } catch (IOException ignored) {
                        // 临时目录清理失败不应覆盖主错误；下一次启动会重新创建。
                    }
                });
            }
        } catch (IOException ignored) {
            // 同上。
        }
    }

    private static final class FileFacts {
        private final long size;
        private final long mtimeMillis;
        private final String sha256;

        private FileFacts(final long size, final long mtimeMillis, final String sha256) {
            this.size = size;
            this.mtimeMillis = mtimeMillis;
            this.sha256 = sha256;
        }

        @Override
        public boolean equals(final Object other) {
            if (!(other instanceof FileFacts)) return false;
            final FileFacts that = (FileFacts) other;
            return size == that.size && mtimeMillis == that.mtimeMillis && sha256.equals(that.sha256);
        }

        @Override
        public int hashCode() {
            return java.util.Objects.hash(size, mtimeMillis, sha256);
        }
    }
}
