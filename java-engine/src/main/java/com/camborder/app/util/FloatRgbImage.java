package com.camborder.app.util;

import java.util.Arrays;

/**
 * 线性浮点 RGB 工作图（T04）。
 *
 * 像素按 R/G/B 交错存放，数值是线性光，不夹断到 [0,1]；负值和超范围中间值保留到
 * 输出阶段才由明确的量化/夹断策略处理。默认工作空间为线性 Rec.2020。
 */
public final class FloatRgbImage {

    public static final String WORKING_COLOR_SPACE = "linear-rec2020";
    public static final String WORKING_DATA_TYPE = "float32";

    private final int width;
    private final int height;
    private final float[] rgb;

    public FloatRgbImage(final int width, final int height) {
        this(width, height, new float[Math.multiplyExact(Math.multiplyExact(width, height), 3)]);
    }

    public FloatRgbImage(final int width, final int height, final float[] rgb) {
        if (width <= 0 || height <= 0) {
            throw new IllegalArgumentException("width and height must be positive");
        }
        if (rgb == null || rgb.length != Math.multiplyExact(Math.multiplyExact(width, height), 3)) {
            throw new IllegalArgumentException("rgb length does not match width*height*3");
        }
        this.width = width;
        this.height = height;
        this.rgb = rgb;
    }

    public int getWidth() { return width; }
    public int getHeight() { return height; }
    public float[] getRgb() { return rgb; }

    /** 全幅 float32 RGB 缓冲的字节数，供阶段缓存和内存预算计量。 */
    public static long bytesFor(final int width, final int height) {
        if (width <= 0 || height <= 0) {
            throw new IllegalArgumentException("width and height must be positive");
        }
        return Math.multiplyExact(Math.multiplyExact((long) width, (long) height), 3L * 4L);
    }

    public float get(final int x, final int y, final int channel) {
        check(x, y, channel);
        return rgb[index(x, y, channel)];
    }

    public void set(final int x, final int y, final int channel, final float value) {
        check(x, y, channel);
        rgb[index(x, y, channel)] = value;
    }

    public FloatRgbImage copy() {
        return new FloatRgbImage(width, height, Arrays.copyOf(rgb, rgb.length));
    }

    public void fill(final float r, final float g, final float b) {
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                final int index = index(x, y, 0);
                rgb[index] = r;
                rgb[index + 1] = g;
                rgb[index + 2] = b;
            }
        }
    }

    /** 返回 {minR,minG,minB,maxR,maxG,maxB}，用于断言中间值没有被提前夹断。 */
    public float[] channelRange() {
        final float[] result = {Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY,
                Float.POSITIVE_INFINITY, Float.NEGATIVE_INFINITY, Float.NEGATIVE_INFINITY,
                Float.NEGATIVE_INFINITY};
        for (int index = 0; index < rgb.length; index += 3) {
            for (int channel = 0; channel < 3; channel++) {
                result[channel] = Math.min(result[channel], rgb[index + channel]);
                result[channel + 3] = Math.max(result[channel + 3], rgb[index + channel]);
            }
        }
        return result;
    }

    public boolean hasNonFinite() {
        for (float value : rgb) {
            if (!Float.isFinite(value)) return true;
        }
        return false;
    }

    private int index(final int x, final int y, final int channel) {
        return (y * width + x) * 3 + channel;
    }

    private void check(final int x, final int y, final int channel) {
        if (x < 0 || x >= width || y < 0 || y >= height || channel < 0 || channel > 2) {
            throw new IndexOutOfBoundsException("pixel/channel out of range");
        }
    }
}
