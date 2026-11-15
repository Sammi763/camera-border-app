package com.camborder.app.util;

import com.camborder.app.exception.FilmProcessingException;
import com.sun.jna.Library;
import com.sun.jna.Native;
import com.sun.jna.Pointer;
import com.sun.jna.Structure;
import org.springframework.http.HttpStatus;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;

/**
 * 随包 LittleCMS 2 的 float RGB 色彩转换（v2）。
 *
 * 只在 Electron 注入固定库路径（CAMBORDER_LCMS2_PATH）或测试显式系统属性时加载；
 * 不在运行时搜索系统库，也不下载。输入/输出都使用 TYPE_RGB_FLT，避免先量化到 8/16-bit。
 * 转换失败明确报错，不静默退回未校色像素。
 */
public final class Lcms2ColorTransform {

    public static final String CODE_UNAVAILABLE = "LCMS2_UNAVAILABLE";
    public static final String CODE_TRANSFORM_FAILED = "LCMS2_TRANSFORM_FAILED";
    public static final String ENV_PATH = "CAMBORDER_LCMS2_PATH";
    public static final String TEST_PROPERTY = "camborder.lcms2.path";

    private static final int PT_RGB = 4;
    private static final int TYPE_RGB_FLT = (1 << 22) | (PT_RGB << 16) | (3 << 3) | 4;
    private static final int INTENT_RELATIVE_COLORIMETRIC = 1;
    private static final Object LOCK = new Object();
    private static volatile Loaded loaded;

    private Lcms2ColorTransform() { }

    /** 当前进程是否可加载固定路径的 LittleCMS。 */
    public static boolean isAvailable() {
        final Loaded value = load();
        return value != null && value.library != null;
    }

    public static String version() {
        final Loaded value = load();
        return value == null || value.library == null ? null : String.valueOf(value.version);
    }

    public static String libraryPath() {
        final Loaded value = load();
        return value == null || value.library == null ? null : value.path;
    }

    /**
     * 将已编码 float RGB（0..1）按 colorSpace/ICC 转换为线性 Rec.2020。
     *
     * @param icc 仅 colorSpace=embedded 时使用；其他情况可为 null。
     */
    public static float[] toLinearRec2020(final float[] encoded, final int pixelCount,
                                          final String colorSpace, final byte[] icc) {
        final Loaded value = load();
        if (value == null || value.library == null) {
            throw new FilmProcessingException("随包 LittleCMS 2 不可用",
                    HttpStatus.INTERNAL_SERVER_ERROR, CODE_UNAVAILABLE);
        }
        final Lcms2 lcms = value.library;
        Pointer inputProfile = null;
        Pointer outputProfile = null;
        Pointer transform = null;
        try {
            inputProfile = inputProfile(lcms, colorSpace, icc);
            outputProfile = outputProfile(lcms);
            if (inputProfile == null || outputProfile == null) {
                throw failure("LCMS profile 创建失败");
            }
            final int signature = lcms.cmsGetColorSpace(inputProfile);
            final boolean gray = signature == 0x47524159;
            if (!gray && signature != 0x52474220) throw failure("输入 ICC 必须为 RGB 或灰阶");
            final float[] samples;
            if (gray) {
                samples = new float[pixelCount];
                for (int i = 0; i < pixelCount; i++) samples[i] = encoded[i * 3];
            } else samples = encoded;
            final int inputType = gray ? (1 << 22) | (3 << 16) | (1 << 3) | 4 : TYPE_RGB_FLT;
            transform = lcms.cmsCreateTransform(inputProfile, inputType,
                    outputProfile, TYPE_RGB_FLT, INTENT_RELATIVE_COLORIMETRIC, 0);
            if (transform == null) {
                throw failure("LCMS transform 创建失败");
            }
            final float[] output = new float[pixelCount * 3];
            final int channels = gray ? 1 : 3;
            final int chunkPixels = 16384;
            final float[] inputChunk = new float[chunkPixels * channels];
            final float[] outputChunk = new float[chunkPixels * 3];
            for (int offset = 0; offset < pixelCount; offset += chunkPixels) {
                FilmRequestGuard.check();
                final int count = Math.min(chunkPixels, pixelCount - offset);
                System.arraycopy(samples, offset * channels, inputChunk, 0, count * channels);
                lcms.cmsDoTransform(transform, inputChunk, outputChunk, count);
                System.arraycopy(outputChunk, 0, output, offset * 3, count * 3);
            }
            for (float sample : output) {
                if (!Float.isFinite(sample)) throw failure("LCMS 输出包含非有限值");
            }
            return output;
        } catch (FilmProcessingException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw failure("LCMS 色彩转换失败");
        } finally {
            if (transform != null) lcms.cmsDeleteTransform(transform);
            if (inputProfile != null) lcms.cmsCloseProfile(inputProfile);
            if (outputProfile != null) lcms.cmsCloseProfile(outputProfile);
        }
    }

    private static Pointer inputProfile(final Lcms2 lcms, final String colorSpace,
                                        final byte[] icc) {
        if ("embedded".equals(colorSpace)) {
            if (icc == null || icc.length == 0) throw failure("embedded ICC 缺失");
            return lcms.cmsOpenProfileFromMem(icc, icc.length);
        }
        if ("srgb".equals(colorSpace)) {
            return lcms.cmsCreate_sRGBProfile();
        }
        if ("adobe-rgb".equals(colorSpace)) {
            return createRgb(lcms, d65(), new CIExyYTRIPLE(
                    new CIExyY(0.6400, 0.3300, 1.0),
                    new CIExyY(0.2100, 0.7100, 1.0),
                    new CIExyY(0.1500, 0.0600, 1.0)), 563.0 / 256.0);
        }
        if ("prophoto-rgb".equals(colorSpace)) {
            return createRgb(lcms, d50(), new CIExyYTRIPLE(
                    new CIExyY(0.7347, 0.2653, 1.0),
                    new CIExyY(0.1596, 0.8404, 1.0),
                    new CIExyY(0.0366, 0.0001, 1.0)), 1.8);
        }
        if ("linear-srgb".equals(colorSpace)) {
            return createRgb(lcms, d65(), new CIExyYTRIPLE(
                    new CIExyY(0.6400, 0.3300, 1.0),
                    new CIExyY(0.3000, 0.6000, 1.0),
                    new CIExyY(0.1500, 0.0600, 1.0)), 1.0);
        }
        if ("linear-rec2020".equals(colorSpace)) {
            return createRgb(lcms, d65(), rec2020Primaries(), 1.0);
        }
        throw failure("输入色彩空间不受 LittleCMS 路径支持");
    }

    private static Pointer outputProfile(final Lcms2 lcms) {
        return createRgb(lcms, d65(), rec2020Primaries(), 1.0);
    }

    private static Pointer createRgb(final Lcms2 lcms, final CIExyY white,
                                     final CIExyYTRIPLE primaries, final double gamma) {
        final Pointer curve = lcms.cmsBuildGamma(null, gamma);
        if (curve == null) throw failure("LCMS gamma 曲线创建失败");
        try {
            return lcms.cmsCreateRGBProfile(white, primaries,
                    new Pointer[]{curve, curve, curve});
        } finally {
            lcms.cmsFreeToneCurve(curve);
        }
    }

    private static CIExyY d65() {
        return new CIExyY(0.3127, 0.3290, 1.0);
    }

    private static CIExyY d50() {
        return new CIExyY(0.3457, 0.3585, 1.0);
    }

    private static CIExyYTRIPLE rec2020Primaries() {
        return new CIExyYTRIPLE(
                new CIExyY(0.708, 0.292, 1.0),
                new CIExyY(0.170, 0.797, 1.0),
                new CIExyY(0.131, 0.046, 1.0));
    }

    private static Loaded load() {
        if (loaded != null) return loaded;
        synchronized (LOCK) {
            if (loaded != null) return loaded;
            final String path = configuredPath();
            if (path == null || !Files.isRegularFile(Path.of(path))) {
                loaded = Loaded.unavailable();
                return loaded;
            }
            try {
                final Lcms2 library = Native.load(path, Lcms2.class);
                final int version = library.cmsGetEncodedCMMversion();
                loaded = new Loaded(library, path, version);
            } catch (UnsatisfiedLinkError | RuntimeException exception) {
                loaded = Loaded.unavailable();
            }
            return loaded;
        }
    }

    private static String configuredPath() {
        final String environment = System.getenv(ENV_PATH);
        if (environment != null && !environment.isBlank()) return environment.trim();
        final String property = System.getProperty(TEST_PROPERTY);
        return property == null || property.isBlank() ? null : property.trim();
    }

    private static FilmProcessingException failure(final String message) {
        return new FilmProcessingException(message, HttpStatus.INTERNAL_SERVER_ERROR,
                CODE_TRANSFORM_FAILED);
    }

    /** 测试/诊断可清除缓存后重新加载固定路径。 */
    public static void resetForTests() {
        synchronized (LOCK) {
            loaded = null;
        }
    }

    private static final class Loaded {
        private final Lcms2 library;
        private final String path;
        private final int version;

        private Loaded(final Lcms2 library, final String path, final int version) {
            this.library = library;
            this.path = path;
            this.version = version;
        }

        private static Loaded unavailable() {
            return new Loaded(null, null, 0);
        }
    }

    /** LittleCMS 2 的 JNA 子集；函数签名与 lcms2.h 对齐。 */
    interface Lcms2 extends Library {
        int cmsGetEncodedCMMversion();
        Pointer cmsCreate_sRGBProfile();
        Pointer cmsCreateRGBProfile(CIExyY whitePoint, CIExyYTRIPLE primaries,
                                    Pointer[] transferFunctions);
        Pointer cmsBuildGamma(Pointer context, double gamma);
        void cmsFreeToneCurve(Pointer curve);
        int cmsGetColorSpace(Pointer profile);
        Pointer cmsOpenProfileFromMem(byte[] memory, int size);
        Pointer cmsCreateTransform(Pointer input, int inputFormat, Pointer output,
                                   int outputFormat, int intent, int flags);
        void cmsDoTransform(Pointer transform, float[] input, float[] output, int size);
        void cmsDeleteTransform(Pointer transform);
        void cmsCloseProfile(Pointer profile);
    }

    @Structure.FieldOrder({"x", "y", "Y"})
    public static final class CIExyY extends Structure {
        public double x;
        public double y;
        public double Y;

        public CIExyY() { }

        public CIExyY(final double x, final double y, final double Y) {
            this.x = x;
            this.y = y;
            this.Y = Y;
        }

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("x", "y", "Y");
        }
    }

    @Structure.FieldOrder({"Red", "Green", "Blue"})
    public static final class CIExyYTRIPLE extends Structure {
        public CIExyY Red;
        public CIExyY Green;
        public CIExyY Blue;

        public CIExyYTRIPLE() { }

        public CIExyYTRIPLE(final CIExyY red, final CIExyY green, final CIExyY blue) {
            this.Red = red;
            this.Green = green;
            this.Blue = blue;
        }

        @Override
        protected List<String> getFieldOrder() {
            return Arrays.asList("Red", "Green", "Blue");
        }
    }
}
