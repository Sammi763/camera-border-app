package com.camborder.app.util;

import java.awt.color.ColorSpace;
import java.awt.color.ICC_ColorSpace;
import java.awt.color.ICC_Profile;
import java.awt.image.BufferedImage;
import java.awt.image.ColorConvertOp;

/**
 * 图像渲染工作空间的颜色转换边界。
 *
 * JPEG 的 JDK 解码器可能已经按 JPEG ICC 转换到 sRGB，而 PNG/TIFF 解码器可能只把
 * ICC 留在 metadata 中、仍返回源数值。因此只有 PNG/TIFF/HEIC 等未由 JPEG 解码器
 * 处理的输入在进入 Java2D 合成前显式转换到 sRGB，避免后续把源数值误当成 sRGB。
 */
public final class ImageColorConverter {

    private ImageColorConverter() { }

    public static BufferedImage normalizeForRendering(final BufferedImage image,
                                                       final String imagePath) {
        if (image == null || imagePath == null || isJpeg(imagePath)) return image;
        final ImageMetadataPayload payload = ImageMetadataPayload.read(imagePath);
        final byte[] sourceIcc = payload.getIcc();
        if (sourceIcc == null || sourceIcc.length == 0) return image;
        try {
            final ICC_ColorSpace source = new ICC_ColorSpace(ICC_Profile.getInstance(sourceIcc));
            if (source.isCS_sRGB()) return image;
            // ImageIO 可能把 PNG/TIFF 的 ICC 只留在 metadata 中，却给返回图像挂上
            // sRGB ColorModel。先把原始 sample 装入真实源 profile，ColorConvertOp 才会
            // 按源色彩空间解释这些数值，而不是把 Adobe RGB sample 当成 sRGB sample。
            final BufferedImage profiledSource = PixelBufferFactory.create(
                    image.getWidth(), image.getHeight(), PixelBufferFactory.bitDepth(image),
                    image.getColorModel().hasAlpha(), source);
            copySamples(image, profiledSource);
            final BufferedImage target = PixelBufferFactory.create(
                    image.getWidth(), image.getHeight(), PixelBufferFactory.bitDepth(image),
                    image.getColorModel().hasAlpha(), ColorSpace.getInstance(ColorSpace.CS_sRGB));
            new ColorConvertOp(source, ColorSpace.getInstance(ColorSpace.CS_sRGB), null)
                    .filter(profiledSource, target);
            return target;
        } catch (RuntimeException exception) {
            throw new IllegalStateException("源 ICC 转换到 sRGB 失败", exception);
        }
    }

    private static void copySamples(final BufferedImage source, final BufferedImage target) {
        final int sourceBits = PixelBufferFactory.bitDepth(source);
        final int targetBits = PixelBufferFactory.bitDepth(target);
        final int bands = Math.min(source.getRaster().getNumBands(), target.getRaster().getNumBands());
        for (int y = 0; y < source.getHeight(); y++) {
            for (int x = 0; x < source.getWidth(); x++) {
                for (int band = 0; band < bands; band++) {
                    int value = source.getRaster().getSample(x, y, band);
                    if (sourceBits != targetBits) {
                        value = (int) Math.round(value * ((double) ((1 << targetBits) - 1)
                                / ((1 << sourceBits) - 1)));
                    }
                    target.getRaster().setSample(x, y, band, value);
                }
            }
        }
    }

    private static boolean isJpeg(final String imagePath) {
        final String lower = imagePath.toLowerCase(java.util.Locale.ROOT);
        return lower.endsWith(".jpg") || lower.endsWith(".jpeg");
    }
}
