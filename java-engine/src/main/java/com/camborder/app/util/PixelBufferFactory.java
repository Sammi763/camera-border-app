package com.camborder.app.util;

import java.awt.Transparency;
import java.awt.color.ColorSpace;
import java.awt.image.BufferedImage;
import java.awt.image.ComponentColorModel;
import java.awt.image.DataBuffer;
import java.awt.image.PixelInterleavedSampleModel;
import java.awt.image.Raster;
import java.awt.image.WritableRaster;

/** 创建不偷偷降为 8-bit 的合成缓冲区。 */
public final class PixelBufferFactory {

    private PixelBufferFactory() { }

    public static BufferedImage createLike(final BufferedImage source, final int width, final int height) {
        final int bitDepth = bitDepth(source);
        final boolean alpha = source.getColorModel().hasAlpha();
        final ColorSpace colorSpace = source.getColorModel().getColorSpace();
        return create(width, height, bitDepth, alpha, colorSpace);
    }

    /**
     * 创建渲染工作缓冲区。Java2D 的 Graphics2D 合成会按目标颜色空间转换源像素，
     * 因此预览/版式中间结果必须显式声明为 sRGB，不能沿用源 ICC 后再把已转换的数值
     * 误标成源 profile；专业导出会在编码前从这个工作空间转换到目标 ICC。
     */
    public static BufferedImage createLikeInSrgb(final BufferedImage source,
                                                  final int width, final int height) {
        return create(width, height, bitDepth(source), source.getColorModel().hasAlpha(),
                ColorSpace.getInstance(ColorSpace.CS_sRGB));
    }

    public static BufferedImage create(final int width, final int height, final int bitDepth,
                                       final boolean alpha, final ColorSpace colorSpace) {
        final int channels = alpha ? 4 : 3;
        final int normalizedDepth = bitDepth > 8 ? 16 : 8;
        final int dataType = normalizedDepth == 16 ? DataBuffer.TYPE_USHORT : DataBuffer.TYPE_BYTE;
        final int[] componentBits = new int[channels];
        java.util.Arrays.fill(componentBits, normalizedDepth);
        final ComponentColorModel colorModel = new ComponentColorModel(
                colorSpace == null ? ColorSpace.getInstance(ColorSpace.CS_sRGB) : colorSpace,
                componentBits, alpha, false,
                alpha ? Transparency.TRANSLUCENT : Transparency.OPAQUE, dataType);
        final PixelInterleavedSampleModel sampleModel = new PixelInterleavedSampleModel(
                dataType, width, height, channels, width * channels,
                bandOffsets(channels));
        final WritableRaster raster = Raster.createWritableRaster(sampleModel, null);
        return new BufferedImage(colorModel, raster, false, null);
    }

    public static int bitDepth(final BufferedImage image) {
        int result = 8;
        for (int bits : image.getColorModel().getComponentSize()) {
            result = Math.max(result, bits);
        }
        return result > 8 ? 16 : 8;
    }

    private static int[] bandOffsets(final int channels) {
        int[] offsets = new int[channels];
        for (int index = 0; index < channels; index++) offsets[index] = index;
        return offsets;
    }
}
