package com.camborder.app.util;

import com.camborder.app.exception.FilmProcessingException;
import org.springframework.http.HttpStatus;

/**
 * 根据输入尺寸与执行阶段估算同时存活的缓冲（T10）。
 *
 * 估算只覆盖底片模式：RAW 解码、RGB16、float32 工作图、参考帧、几何变换、
 * 装饰层、编码与写出。共享数组只计一次；最终以最大同时存活量再加 25% 余量。
 * 这不是整个应用 RSS 的硬上限，而是准入控制使用的保守估算。
 */
public final class FilmMemoryEstimator {

    public static final String CODE_BUDGET_EXCEEDED = "FILM_MEMORY_BUDGET_EXCEEDED";
    public static final double DEFAULT_SAFETY_MARGIN = 0.25;

    private static final long FIXED_OVERHEAD = 16L * 1024L * 1024L;
    private static final long ANALYSIS_OVERHEAD = 1L * 1024L * 1024L;
    private static final long BYTES_PER_FLOAT_RGB_PIXEL = 12L;
    private static final long BYTES_PER_RGB16_PIXEL = 6L;
    private static final long BYTES_PER_ARGB_PIXEL = 4L;

    private FilmMemoryEstimator() { }

    /** 估算输入；所有尺寸必须是已探测到的真实像素尺寸。 */
    public static final class Workload {
        private int sourceWidth;
        private int sourceHeight;
        private int outputWidth;
        private int outputHeight;
        private boolean sensorRaw;
        private boolean encodedRaster;
        private boolean referenceFrame;
        private long referencePixelCount;
        private boolean sourceGeometry;
        private boolean placementTransform;
        private boolean border;
        private boolean decorations;
        private boolean gradient;
        private boolean borderless;
        private boolean analysis;
        private int outputBitDepth = 8;

        public Workload source(final int width, final int height) {
            this.sourceWidth = width;
            this.sourceHeight = height;
            return this;
        }

        public Workload output(final int width, final int height) {
            this.outputWidth = width;
            this.outputHeight = height;
            return this;
        }

        public Workload encodedRaster(final boolean value) {
            this.encodedRaster = value;
            return this;
        }

        public Workload sensorRaw(final boolean value) {
            this.sensorRaw = value;
            return this;
        }

        public Workload referenceFrame(final int width, final int height) {
            this.referenceFrame = width > 0 && height > 0;
            this.referencePixelCount = this.referenceFrame ? (long) width * height : 0L;
            return this;
        }

        /** 多个参考帧时按总像素数计入；相同路径的共享缓冲只调用一次。 */
        public Workload referencePixels(final long pixels) {
            this.referenceFrame = pixels > 0;
            this.referencePixelCount = pixels;
            return this;
        }

        public Workload sourceGeometry(final boolean value) {
            this.sourceGeometry = value;
            return this;
        }

        public Workload placementTransform(final boolean value) {
            this.placementTransform = value;
            return this;
        }

        public Workload border(final boolean value) {
            this.border = value;
            return this;
        }

        public Workload decorations(final boolean value) {
            this.decorations = value;
            return this;
        }

        public Workload gradient(final boolean value) {
            this.gradient = value;
            return this;
        }

        public Workload borderless(final boolean value) {
            this.borderless = value;
            return this;
        }

        public Workload analysis(final boolean value) {
            this.analysis = value;
            return this;
        }

        public Workload outputBitDepth(final int value) {
            this.outputBitDepth = value;
            return this;
        }
    }

    /** 估算结果：java 峰值用于 H，total 峰值（含原生 helper）用于 B。 */
    public static final class Estimate {
        private final long javaPeakBytes;
        private final long totalPeakBytes;
        private final long nativeHelperBytes;
        private final long rawLinearBytes;

        private Estimate(final long javaPeakBytes, final long totalPeakBytes,
                         final long nativeHelperBytes, final long rawLinearBytes) {
            this.javaPeakBytes = javaPeakBytes;
            this.totalPeakBytes = totalPeakBytes;
            this.nativeHelperBytes = nativeHelperBytes;
            this.rawLinearBytes = rawLinearBytes;
        }

        public long getJavaPeakBytes() { return javaPeakBytes; }
        public long getTotalPeakBytes() { return totalPeakBytes; }
        public long getNativeHelperBytes() { return nativeHelperBytes; }
        public long getRawLinearBytes() { return rawLinearBytes; }
    }

    public static Estimate estimate(final Workload workload) {
        return estimate(workload, DEFAULT_SAFETY_MARGIN);
    }

    public static Estimate estimate(final Workload workload, final double safetyMargin) {
        if (workload == null || workload.sourceWidth <= 0 || workload.sourceHeight <= 0) {
            throw invalid("输入尺寸未知");
        }
        if (workload.outputWidth <= 0 || workload.outputHeight <= 0) {
            throw invalid("输出尺寸未知");
        }
        final double margin = Double.isFinite(safetyMargin) && safetyMargin >= 0
                ? safetyMargin : DEFAULT_SAFETY_MARGIN;
        final long sourcePixels = pixels(workload.sourceWidth, workload.sourceHeight);
        final long outputPixels = pixels(workload.outputWidth, workload.outputHeight);
        final long referencePixels = workload.referenceFrame
                ? workload.referencePixelCount : 0;

        final long sourceFloat = multiply(sourcePixels, BYTES_PER_FLOAT_RGB_PIXEL);
        final long sourceRgb16 = multiply(sourcePixels, BYTES_PER_RGB16_PIXEL);
        final long referenceFloat = multiply(referencePixels, BYTES_PER_FLOAT_RGB_PIXEL);
        final long referenceRgb16 = multiply(referencePixels, BYTES_PER_RGB16_PIXEL);
        final long nativeHelper = workload.sensorRaw
                ? multiply(add(sourcePixels, referencePixels), 16L) : 0L;

        // RAW：helper 输出 RGB16 + 两份 float（解码图与方向重排临时图）。
        final long rawJava = workload.encodedRaster
                ? add(sourceRgb16, multiply(sourceFloat, 4L))
                : add(sourceRgb16, multiply(sourceFloat, 2L));

        // 基础转正：下游需要 RAW 工作图 + 光源增益副本 + 转正输出；参考帧独立解码。
        final long baseJava = add(add(sourceFloat, multiply(sourceFloat, 2L)),
                add(multiply(referenceFloat, 2L), referenceRgb16));

        // 当前正片：基础正片 + 正片输出。
        final long currentJava = multiply(sourceFloat, 2L);

        // 合成/编码：当前正片保留，同时创建几何/放置结果、画布、装饰与编码缓冲。
        final long outputFloat = multiply(outputPixels, BYTES_PER_FLOAT_RGB_PIXEL);
        final long outputArgb = multiply(outputPixels, BYTES_PER_ARGB_PIXEL);
        final long encode = multiply(outputPixels, workload.outputBitDepth >= 16 ? 8L : 5L);
        long composeJava = sourceFloat;
        if (workload.sourceGeometry) composeJava = add(composeJava, sourceFloat);
        if (workload.placementTransform) composeJava = add(composeJava, sourceFloat);
        if (!workload.borderless) composeJava = add(composeJava, outputFloat);
        if (workload.border) composeJava = add(composeJava, outputFloat);
        if (workload.decorations) composeJava = add(composeJava, outputArgb);
        if (workload.gradient) composeJava = add(composeJava, outputFloat);
        composeJava = add(composeJava, encode);

        final long analysisJava = workload.analysis ? add(currentJava, ANALYSIS_OVERHEAD) : 0L;
        final long maxJava = max(max(rawJava, baseJava), max(currentJava,
                max(composeJava, analysisJava)));
        // 总预算包含原生 helper；即使当前阶段 Java 峰值更高，也要把 helper 计入总量。
        final long totalWithoutMargin = add(add(max(maxJava, rawJava), nativeHelper),
                FIXED_OVERHEAD);
        return new Estimate(withMargin(maxJava, margin), withMargin(totalWithoutMargin, margin),
                nativeHelper, sourceFloat);
    }

    public static long floatImageBytes(final int width, final int height) {
        return multiply(pixels(width, height), BYTES_PER_FLOAT_RGB_PIXEL);
    }

    private static long pixels(final int width, final int height) {
        if (width <= 0 || height <= 0) {
            throw invalid("尺寸必须为正数");
        }
        final long result;
        try {
            result = Math.multiplyExact((long) width, (long) height);
        } catch (ArithmeticException exception) {
            throw invalid("像素尺寸溢出");
        }
        return result;
    }

    private static long multiply(final long value, final long factor) {
        try {
            return Math.multiplyExact(value, factor);
        } catch (ArithmeticException exception) {
            throw invalid("内存估算溢出");
        }
    }

    private static long add(final long left, final long right) {
        try {
            return Math.addExact(left, right);
        } catch (ArithmeticException exception) {
            throw invalid("内存估算溢出");
        }
    }

    private static long max(final long left, final long right) {
        return Math.max(left, right);
    }

    private static long withMargin(final long value, final double margin) {
        return add(value, (long) Math.ceil(value * margin));
    }

    private static FilmProcessingException invalid(final String message) {
        return new FilmProcessingException("内存预算估算失败：" + message,
                HttpStatus.UNPROCESSABLE_ENTITY, CODE_BUDGET_EXCEEDED);
    }
}
