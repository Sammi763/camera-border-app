package com.camborder.app.util;

/**
 * 预览解码的采样尺寸计算。
 *
 * ImageReader 与 RAW 内嵌 JPEG 都要在解码前根据最终预览盒选择相同的采样倍数。
 * 单独放在此处避免两条读取链路各自推导尺寸而发生漂移；导出传入 0/0 时始终返回 1，
 * 因而不会把预览优化带入全分辨率导出。
 */
final class ImageDecodeSizing {

    private ImageDecodeSizing() {
    }

    /**
     * 返回安全的整数 subsampling 倍数。
     *
     * 先按 ImageScaler 的同一等比规则得到最终目标尺寸，再取两个方向中不会小于目标的
     * 最大采样倍数。这样解码后的图仍只需一次小幅缩放，不会把照片缩得比请求预览更小。
     */
    static int subsamplingFor(final int sourceWidth, final int sourceHeight,
                              final int maxWidth, final int maxHeight) {
        if (sourceWidth <= 0 || sourceHeight <= 0) {
            return 1;
        }
        final double scaleW = maxWidth > 0 ? (double) maxWidth / sourceWidth : Double.POSITIVE_INFINITY;
        final double scaleH = maxHeight > 0 ? (double) maxHeight / sourceHeight : Double.POSITIVE_INFINITY;
        final double scale = Math.min(scaleW, scaleH);
        if (scale >= 1.0) {
            return 1;
        }

        final int targetWidth = Math.max(1, (int) Math.round(sourceWidth * scale));
        final int targetHeight = Math.max(1, (int) Math.round(sourceHeight * scale));
        return Math.max(1, Math.min(sourceWidth / targetWidth, sourceHeight / targetHeight));
    }
}
