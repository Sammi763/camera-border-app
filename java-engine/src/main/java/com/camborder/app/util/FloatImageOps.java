package com.camborder.app.util;

import java.awt.color.ColorSpace;
import java.awt.image.BufferedImage;

/**
 * 浮点工作图的基础操作（T04）。
 *
 * 只实现底片模式当前需要的最短流水线：恒等、曝光、缩放、旋转、透明装饰合成、
 * 工作空间到输出栅格的转换。所有照片像素操作在 float32 线性空间完成；
 * Java2D 只用于生成 8-bit 装饰层，不参与照片重采样/合成。
 */
public final class FloatImageOps {

    private FloatImageOps() { }

    public static FloatRgbImage identity(final FloatRgbImage source) {
        return source.copy();
    }

    /**
     * helper 输出的线性 camera RGB（16-bit 无符号）-> 线性 Rec.2020 浮点工作图。
     * rgbCam 只做相机到 sRGB 的颜色矩阵；白平衡已在 helper 中显式应用，不重复。
     */
    public static FloatRgbImage fromCameraRgb(final short[] rgb, final int width, final int height,
                                              final float[][] rgbCam) {
        if (rgbCam == null) {
            throw new IllegalArgumentException("rgbCam matrix is required");
        }
        final double[][] matrix = new double[rgbCam.length][];
        for (int row = 0; row < rgbCam.length; row++) {
            matrix[row] = new double[rgbCam[row].length];
            for (int column = 0; column < rgbCam[row].length; column++) {
                matrix[row][column] = rgbCam[row][column];
            }
        }
        return fromCameraRgb(rgb, width, height, matrix);
    }

    public static FloatRgbImage fromCameraRgb(final short[] rgb, final int width, final int height,
                                              final double[][] rgbCam) {
        if (rgb == null || width <= 0 || height <= 0
                || rgb.length != width * height * 3) {
            throw new IllegalArgumentException("camera RGB buffer does not match dimensions");
        }
        final FloatRgbImage result = new FloatRgbImage(width, height);
        final double[][] fused = FilmColorSpace.cameraToRec2020Matrix(rgbCam);
        final float[] camera = new float[3];
        final float[] rec2020 = new float[3];
        for (int y = 0; y < height; y++) {
            FilmRequestGuard.check();
            for (int x = 0; x < width; x++) {
                final int index = (y * width + x) * 3;
                camera[0] = (rgb[index] & 0xffff) / 65535f;
                camera[1] = (rgb[index + 1] & 0xffff) / 65535f;
                camera[2] = (rgb[index + 2] & 0xffff) / 65535f;
                for (int c = 0; c < 3; c++) rec2020[c] = (float) (fused[c][0] * camera[0]
                        + fused[c][1] * camera[1] + fused[c][2] * camera[2]);
                result.set(x, y, 0, rec2020[0]);
                result.set(x, y, 1, rec2020[1]);
                result.set(x, y, 2, rec2020[2]);
            }
        }
        return result;
    }

    public static FloatRgbImage exposure(final FloatRgbImage source, final double ev) {
        final float multiplier = (float) Math.pow(2.0, ev);
        final FloatRgbImage result = source.copy();
        final float[] data = result.getRgb();
        for (int index = 0; index < data.length; index++) {
            data[index] *= multiplier;
        }
        return result;
    }

    /** 面积平均缩小 + 双线性放大；常量图在任意尺寸下保持常量（浮点误差内）。 */
    public static FloatRgbImage resize(final FloatRgbImage source, final int targetWidth,
                                       final int targetHeight) {
        if (targetWidth <= 0 || targetHeight <= 0) {
            throw new IllegalArgumentException("target size must be positive");
        }
        if (targetWidth == source.getWidth() && targetHeight == source.getHeight()) {
            return source.copy();
        }
        final FloatRgbImage horizontal = resampleHorizontal(source, targetWidth);
        return resampleVertical(horizontal, targetHeight);
    }

    public static FloatRgbImage rotate(final FloatRgbImage source, final double degrees) {
        final double normalized = ((degrees % 360) + 360) % 360;
        if (Math.abs(normalized) < 1e-9) return source.copy();
        if (Math.abs(normalized - 90) < 1e-9) return rotate90(source);
        if (Math.abs(normalized - 180) < 1e-9) return rotate180(source);
        if (Math.abs(normalized - 270) < 1e-9) return rotate270(source);
        return rotateArbitrary(source, normalized);
    }

    /** 版式几何复用已有规格；浮点逆向采样，照片不进入 Java2D。 */
    public static FloatRgbImage place(final FloatRgbImage source,
            final com.camborder.app.model.ImagePlacement placement, final java.awt.Color background) {
        final ImagePlacementRenderer.Geometry g = new ImagePlacementRenderer().calculate(
                source.getWidth(), source.getHeight(), placement);
        if (g.rotation() == 0 && g.scale() == 1 && Math.round(g.targetWidth()) == source.getWidth()
                && Math.round(g.targetHeight()) == source.getHeight()) return source;
        final int width = Math.max(1, (int) Math.round(g.targetWidth()));
        final int height = Math.max(1, (int) Math.round(g.targetHeight()));
        final FloatRgbImage out = new FloatRgbImage(width, height);
        final float[] linear = new float[]{(float) FilmColorSpace.encodedSrgbToLinear(background.getRed() / 255.0),
                (float) FilmColorSpace.encodedSrgbToLinear(background.getGreen() / 255.0),
                (float) FilmColorSpace.encodedSrgbToLinear(background.getBlue() / 255.0)};
        final float[] fill = new float[3];
        FilmColorSpace.linearSrgbToRec2020(linear, fill);
        out.fill(fill[0], fill[1], fill[2]);
        final double cos = Math.cos(Math.toRadians(g.rotation()));
        final double sin = Math.sin(Math.toRadians(g.rotation()));
        final double cx = g.offsetX() + g.rotatedWidth() * g.scale() / 2;
        final double cy = g.offsetY() + g.rotatedHeight() * g.scale() / 2;
        final float[] sample = new float[3];
        for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) {
            FilmRequestGuard.check();
            final double dx = (x + 0.5 - cx) / g.scale();
            final double dy = (y + 0.5 - cy) / g.scale();
            final double sx = cos * dx + sin * dy + source.getWidth() / 2.0 - 0.5;
            final double sy = -sin * dx + cos * dy + source.getHeight() / 2.0 - 0.5;
            if (sx < -0.5 || sy < -0.5 || sx >= source.getWidth() - 0.5 || sy >= source.getHeight() - 0.5) continue;
            sampleBilinear(source, Math.max(0, Math.min(source.getWidth() - 1, sx)),
                    Math.max(0, Math.min(source.getHeight() - 1, sy)), sample);
            for (int c = 0; c < 3; c++) out.set(x, y, c, sample[c]);
        }
        return out;
    }

    /** 将显示像素中心映射到原始版式、源裁切和缩略图，边距仍使用原版式缩放比。 */
    static FloatRgbImage placePreview(final FloatRgbImage proxy, final int sourceWidth,
            final int sourceHeight, final int[] crop, final double straighten,
            final ImagePlacementRenderer.Geometry placement, final java.awt.Color background,
            final int width, final int height) {
        final int cropWidth = crop[2] - crop[0];
        final int cropHeight = crop[3] - crop[1];
        final double placeCos = Math.cos(Math.toRadians(placement.rotation()));
        final double placeSin = Math.sin(Math.toRadians(placement.rotation()));
        final double cropCos = Math.cos(Math.toRadians(straighten));
        final double cropSin = Math.sin(Math.toRadians(straighten));
        final double fullWidth = Math.round(placement.targetWidth());
        final double fullHeight = Math.round(placement.targetHeight());
        final double centerX = placement.offsetX() + placement.rotatedWidth() * placement.scale() / 2;
        final double centerY = placement.offsetY() + placement.rotatedHeight() * placement.scale() / 2;
        final double proxyX = (double) proxy.getWidth() / sourceWidth;
        final double proxyY = (double) proxy.getHeight() / sourceHeight;
        final FloatRgbImage photo = new FloatRgbImage(width, height);
        final float[] fill = new float[3];
        FilmColorSpace.linearSrgbToRec2020(new float[]{
                (float) FilmColorSpace.encodedSrgbToLinear(background.getRed() / 255.0),
                (float) FilmColorSpace.encodedSrgbToLinear(background.getGreen() / 255.0),
                (float) FilmColorSpace.encodedSrgbToLinear(background.getBlue() / 255.0)}, fill);
        final float[] sample = new float[3];
        for (int y = 0; y < height; y++) {
            FilmRequestGuard.check();
            final double dy = ((y + 0.5) * fullHeight / height - centerY) / placement.scale();
            for (int x = 0; x < width; x++) {
                final double dx = ((x + 0.5) * fullWidth / width - centerX) / placement.scale();
                final double px = placeCos * dx + placeSin * dy + crop[4] / 2.0 - 0.5;
                final double py = -placeSin * dx + placeCos * dy + crop[5] / 2.0 - 0.5;
                if (px < -0.5 || py < -0.5 || px >= crop[4] - 0.5 || py >= crop[5] - 0.5) {
                    for (int c = 0; c < 3; c++) photo.set(x, y, c, fill[c]);
                    continue;
                }
                final double gx = Math.max(0, Math.min(crop[4] - 1, px)) - (crop[4] - 1) / 2.0;
                final double gy = Math.max(0, Math.min(crop[5] - 1, py)) - (crop[5] - 1) / 2.0;
                final double sx = crop[0] + (cropWidth - 1) / 2.0 + cropCos * gx + cropSin * gy;
                final double sy = crop[1] + (cropHeight - 1) / 2.0 - cropSin * gx + cropCos * gy;
                final double ix = (Math.max(crop[0], Math.min(crop[2] - 1, sx)) + 0.5) * proxyX - 0.5;
                final double iy = (Math.max(crop[1], Math.min(crop[3] - 1, sy)) + 0.5) * proxyY - 0.5;
                sampleBilinear(proxy, Math.max(0, Math.min(proxy.getWidth() - 1, ix)),
                        Math.max(0, Math.min(proxy.getHeight() - 1, iy)), sample);
                for (int c = 0; c < 3; c++) photo.set(x, y, c, sample[c]);
            }
        }
        return photo;
    }

    /** 按 EXIF 方向重排浮点像素；保持原数值，不经过整数栅格。 */
    public static FloatRgbImage orient(final FloatRgbImage source, final int orientation) {
        if (orientation < 1 || orientation > 8) throw new IllegalArgumentException("方向必须在 1–8 之间");
        if (orientation == 1) return source;
        final int w = source.getWidth();
        final int h = source.getHeight();
        final FloatRgbImage out = new FloatRgbImage(orientation >= 5 ? h : w, orientation >= 5 ? w : h);
        for (int y = 0; y < h; y++) {
            FilmRequestGuard.check();
            for (int x = 0; x < w; x++) {
                final int tx;
                final int ty;
                switch (orientation) {
                    case 2: tx = w - 1 - x; ty = y; break;
                    case 3: tx = w - 1 - x; ty = h - 1 - y; break;
                    case 4: tx = x; ty = h - 1 - y; break;
                    case 5: tx = y; ty = x; break;
                    case 6: tx = h - 1 - y; ty = x; break;
                    case 7: tx = h - 1 - y; ty = w - 1 - x; break;
                    case 8: tx = y; ty = w - 1 - x; break;
                    default: tx = x; ty = y;
                }
                setPixel(out, tx, ty, source, x, y);
            }
        }
        return out;
    }

    /** 返回源裁切边界与校平后尺寸；合成与预检共用同一取整规则。 */
    public static int[] sourceGeometryBounds(final int sourceWidth, final int sourceHeight,
            final com.camborder.app.model.ImageProcessingConfig.SourceGeometry geometry) {
        if (geometry == null) return new int[]{0, 0, sourceWidth, sourceHeight, sourceWidth, sourceHeight};
        final com.camborder.app.model.ImageProcessingConfig.NormalizedCrop crop = geometry.getCrop();
        final int x0 = crop == null ? 0 : (int) Math.floor(crop.getX() * sourceWidth);
        final int y0 = crop == null ? 0 : (int) Math.floor(crop.getY() * sourceHeight);
        final int right = crop == null ? sourceWidth : Math.min(sourceWidth,
                (int) Math.ceil((crop.getX() + crop.getWidth()) * sourceWidth));
        final int bottom = crop == null ? sourceHeight : Math.min(sourceHeight,
                (int) Math.ceil((crop.getY() + crop.getHeight()) * sourceHeight));
        final int w = right - x0;
        final int h = bottom - y0;
        if (x0 < 0 || y0 < 0 || w <= 0 || h <= 0) throw new IllegalArgumentException("裁切区域非法");
        final double angle = Math.toRadians(geometry.getRotationDegrees());
        final double cos = Math.cos(angle);
        final double sin = Math.sin(angle);
        final double scale = Math.min(w / (w * Math.abs(cos) + h * Math.abs(sin)),
                h / (w * Math.abs(sin) + h * Math.abs(cos)));
        final int ow = Math.max(1, (int) Math.floor(w * scale + 1e-9));
        final int oh = Math.max(1, (int) Math.floor(h * scale + 1e-9));
        return new int[]{x0, y0, right, bottom, ow, oh};
    }

    /** 源坐标裁切后校平，保留同比例最大内接区域，避免输出黑角。 */
    public static FloatRgbImage sourceGeometry(final FloatRgbImage source,
            final com.camborder.app.model.ImageProcessingConfig.SourceGeometry geometry) {
        if (geometry == null) return source;
        final int[] bounds = sourceGeometryBounds(source.getWidth(), source.getHeight(), geometry);
        final int x0 = bounds[0], y0 = bounds[1], right = bounds[2], bottom = bounds[3];
        final int w = right - x0, h = bottom - y0, ow = bounds[4], oh = bounds[5];
        if (x0 == 0 && y0 == 0 && w == source.getWidth() && h == source.getHeight()
                && geometry.getRotationDegrees() == 0) return source;
        final double angle = Math.toRadians(geometry.getRotationDegrees());
        final double cos = Math.cos(angle), sin = Math.sin(angle);
        final FloatRgbImage out = new FloatRgbImage(ow, oh);
        final float[] sample = new float[3];
        for (int y = 0; y < oh; y++) {
            FilmRequestGuard.check();
            for (int x = 0; x < ow; x++) {
                final double dx = x - (ow - 1) / 2.0;
                final double dy = y - (oh - 1) / 2.0;
                final double sx = x0 + (w - 1) / 2.0 + cos * dx + sin * dy;
                final double sy = y0 + (h - 1) / 2.0 - sin * dx + cos * dy;
                sampleBilinear(source, Math.max(x0, Math.min(right - 1, sx)),
                        Math.max(y0, Math.min(bottom - 1, sy)), sample);
                for (int c = 0; c < 3; c++) out.set(x, y, c, sample[c]);
            }
        }
        return out;
    }

    /** 按显式输出尺寸等比缩小，不放大。 */
    public static FloatRgbImage fitWithin(final FloatRgbImage source, final int maxWidth, final int maxHeight) {
        double scale = 1;
        if (maxWidth > 0) scale = Math.min(scale, (double) maxWidth / source.getWidth());
        if (maxHeight > 0) scale = Math.min(scale, (double) maxHeight / source.getHeight());
        return scale >= 1 ? source : resize(source, Math.max(1, (int) Math.round(source.getWidth() * scale)),
                Math.max(1, (int) Math.round(source.getHeight() * scale)));
    }

    /**
     * 把 sRGB 8-bit ARGB 装饰层合成到线性工作图。alpha=0 的像素不改变底图；
     * 这是“装饰层独立 sRGB、照片主体保持 float”的边界。
     */
    public static FloatRgbImage compositeOver(final FloatRgbImage base, final BufferedImage overlay) {
        return compositeOverInPlace(base.copy(), overlay);
    }

    /** 合成器持有独占画布时复用其缓冲，避免同时持有两份全幅副本。 */
    public static FloatRgbImage compositeOverInPlace(final FloatRgbImage base, final BufferedImage overlay) {
        if (overlay == null) return base;
        if (overlay.getWidth() != base.getWidth() || overlay.getHeight() != base.getHeight()) {
            throw new IllegalArgumentException("overlay size must match working image");
        }
        final FloatRgbImage result = base;
        final float[] rgb = new float[3];
        final float[] rec2020 = new float[3];
        for (int y = 0; y < base.getHeight(); y++) {
            FilmRequestGuard.check();
            for (int x = 0; x < base.getWidth(); x++) {
                final int argb = overlay.getRGB(x, y);
                final int alphaByte = (argb >>> 24) & 0xff;
                if (alphaByte == 0) continue;
                final float alpha = alphaByte / 255f;
                rgb[0] = (float) FilmColorSpace.encodedSrgbToLinear(((argb >> 16) & 0xff) / 255.0);
                rgb[1] = (float) FilmColorSpace.encodedSrgbToLinear(((argb >> 8) & 0xff) / 255.0);
                rgb[2] = (float) FilmColorSpace.encodedSrgbToLinear((argb & 0xff) / 255.0);
                FilmColorSpace.linearSrgbToRec2020(rgb, rec2020);
                for (int channel = 0; channel < 3; channel++) {
                    final float baseValue = result.get(x, y, channel);
                    result.set(x, y, channel, baseValue * (1f - alpha) + rec2020[channel] * alpha);
                }
            }
        }
        return result;
    }

    /** 工作图 -> 线性 sRGB（不夹断）；用于宽色域/负值断言。 */
    public static FloatRgbImage toLinearSrgb(final FloatRgbImage source) {
        final FloatRgbImage result = new FloatRgbImage(source.getWidth(), source.getHeight());
        final float[] rgb = new float[3];
        final float[] out = new float[3];
        for (int y = 0; y < source.getHeight(); y++) {
            FilmRequestGuard.check();
            for (int x = 0; x < source.getWidth(); x++) {
                rgb[0] = source.get(x, y, 0);
                rgb[1] = source.get(x, y, 1);
                rgb[2] = source.get(x, y, 2);
                FilmColorSpace.linearRec2020ToSrgb(rgb, out);
                result.set(x, y, 0, out[0]);
                result.set(x, y, 1, out[1]);
                result.set(x, y, 2, out[2]);
            }
        }
        return result;
    }

    /** 输出阶段：工作图 -> sRGB 编码 16-bit BufferedImage；只在输出阶段夹断/量化。 */
    public static BufferedImage toBufferedImage16(final FloatRgbImage source) {
        final BufferedImage image = PixelBufferFactory.create(
                source.getWidth(), source.getHeight(), 16, false,
                ColorSpace.getInstance(ColorSpace.CS_sRGB));
        final float[] rgb = new float[3];
        final float[] srgb = new float[3];
        for (int y = 0; y < source.getHeight(); y++) {
            FilmRequestGuard.check();
            for (int x = 0; x < source.getWidth(); x++) {
                rgb[0] = source.get(x, y, 0);
                rgb[1] = source.get(x, y, 1);
                rgb[2] = source.get(x, y, 2);
                FilmColorSpace.linearRec2020ToSrgb(rgb, srgb);
                for (int channel = 0; channel < 3; channel++) {
                    final double encoded = FilmColorSpace.linearToEncodedSrgb(srgb[channel]);
                    final int quantized = (int) Math.round(FilmColorSpace.clamp01(encoded) * 65535.0);
                    image.getRaster().setSample(x, y, channel, quantized);
                }
            }
        }
        return image;
    }

    /** 输出阶段：工作图 -> sRGB 编码 8-bit BufferedImage（Jr 预览/分享测试用）。 */
    public static BufferedImage toBufferedImage8(final FloatRgbImage source) {
        final BufferedImage image = new BufferedImage(
                source.getWidth(), source.getHeight(), BufferedImage.TYPE_INT_RGB);
        final float[] rgb = new float[3];
        final float[] srgb = new float[3];
        for (int y = 0; y < source.getHeight(); y++) {
            FilmRequestGuard.check();
            for (int x = 0; x < source.getWidth(); x++) {
                rgb[0] = source.get(x, y, 0);
                rgb[1] = source.get(x, y, 1);
                rgb[2] = source.get(x, y, 2);
                FilmColorSpace.linearRec2020ToSrgb(rgb, srgb);
                final int r = quantize8(srgb[0]);
                final int g = quantize8(srgb[1]);
                final int b = quantize8(srgb[2]);
                image.setRGB(x, y, (r << 16) | (g << 8) | b);
            }
        }
        return image;
    }

    private static int quantize8(final float linearSrgb) {
        final double encoded = FilmColorSpace.linearToEncodedSrgb(linearSrgb);
        return (int) Math.round(FilmColorSpace.clamp01(encoded) * 255.0);
    }

    private static FloatRgbImage resampleHorizontal(final FloatRgbImage source, final int targetWidth) {
        if (targetWidth == source.getWidth()) return source.copy();
        final FloatRgbImage result = new FloatRgbImage(targetWidth, source.getHeight());
        final int sourceWidth = source.getWidth();
        final float[] value = new float[3];
        for (int y = 0; y < source.getHeight(); y++) {
            FilmRequestGuard.check();
            for (int x = 0; x < targetWidth; x++) {
                if (targetWidth < sourceWidth) {
                    areaSampleHorizontal(source, y, x, targetWidth, value);
                } else {
                    bilinearHorizontal(source, y, x, targetWidth, value);
                }
                for (int channel = 0; channel < 3; channel++) {
                    result.set(x, y, channel, value[channel]);
                }
            }
        }
        return result;
    }

    private static FloatRgbImage resampleVertical(final FloatRgbImage source, final int targetHeight) {
        if (targetHeight == source.getHeight()) return source.copy();
        final FloatRgbImage result = new FloatRgbImage(source.getWidth(), targetHeight);
        final int sourceHeight = source.getHeight();
        final float[] value = new float[3];
        for (int y = 0; y < targetHeight; y++) {
            FilmRequestGuard.check();
            for (int x = 0; x < source.getWidth(); x++) {
                if (targetHeight < sourceHeight) {
                    areaSampleVertical(source, x, y, targetHeight, value);
                } else {
                    bilinearVertical(source, x, y, targetHeight, value);
                }
                for (int channel = 0; channel < 3; channel++) {
                    result.set(x, y, channel, value[channel]);
                }
            }
        }
        return result;
    }

    private static void areaSampleHorizontal(final FloatRgbImage source, final int y, final int x,
                                             final int targetWidth, final float[] out) {
        final double start = (double) x * source.getWidth() / targetWidth;
        final double end = (double) (x + 1) * source.getWidth() / targetWidth;
        final int first = Math.max(0, (int) Math.floor(start));
        final int last = Math.min(source.getWidth() - 1, (int) Math.ceil(end) - 1);
        double totalWeight = 0;
        double r = 0;
        double g = 0;
        double b = 0;
        for (int sourceX = first; sourceX <= last; sourceX++) {
            final double left = Math.max(start, sourceX);
            final double right = Math.min(end, sourceX + 1);
            final double weight = right - left;
            if (weight <= 0) continue;
            totalWeight += weight;
            r += source.get(sourceX, y, 0) * weight;
            g += source.get(sourceX, y, 1) * weight;
            b += source.get(sourceX, y, 2) * weight;
        }
        if (totalWeight <= 0) {
            out[0] = source.get(Math.max(0, Math.min(source.getWidth() - 1, first)), y, 0);
            out[1] = source.get(Math.max(0, Math.min(source.getWidth() - 1, first)), y, 1);
            out[2] = source.get(Math.max(0, Math.min(source.getWidth() - 1, first)), y, 2);
        } else {
            out[0] = (float) (r / totalWeight);
            out[1] = (float) (g / totalWeight);
            out[2] = (float) (b / totalWeight);
        }
    }

    private static void bilinearHorizontal(final FloatRgbImage source, final int y, final int x,
                                           final int targetWidth, final float[] out) {
        final double center = (x + 0.5) * source.getWidth() / targetWidth - 0.5;
        final int left = (int) Math.floor(center);
        final double fraction = center - left;
        final int x0 = Math.max(0, Math.min(source.getWidth() - 1, left));
        final int x1 = Math.max(0, Math.min(source.getWidth() - 1, left + 1));
        for (int channel = 0; channel < 3; channel++) {
            final double a = source.get(x0, y, channel);
            final double b = source.get(x1, y, channel);
            out[channel] = (float) (a + (b - a) * fraction);
        }
    }

    private static void areaSampleVertical(final FloatRgbImage source, final int x, final int y,
                                           final int targetHeight, final float[] out) {
        final double start = (double) y * source.getHeight() / targetHeight;
        final double end = (double) (y + 1) * source.getHeight() / targetHeight;
        final int first = Math.max(0, (int) Math.floor(start));
        final int last = Math.min(source.getHeight() - 1, (int) Math.ceil(end) - 1);
        double totalWeight = 0;
        double r = 0;
        double g = 0;
        double b = 0;
        for (int sourceY = first; sourceY <= last; sourceY++) {
            final double top = Math.max(start, sourceY);
            final double bottom = Math.min(end, sourceY + 1);
            final double weight = bottom - top;
            if (weight <= 0) continue;
            totalWeight += weight;
            r += source.get(x, sourceY, 0) * weight;
            g += source.get(x, sourceY, 1) * weight;
            b += source.get(x, sourceY, 2) * weight;
        }
        if (totalWeight <= 0) {
            final int clamped = Math.max(0, Math.min(source.getHeight() - 1, first));
            out[0] = source.get(x, clamped, 0);
            out[1] = source.get(x, clamped, 1);
            out[2] = source.get(x, clamped, 2);
        } else {
            out[0] = (float) (r / totalWeight);
            out[1] = (float) (g / totalWeight);
            out[2] = (float) (b / totalWeight);
        }
    }

    private static void bilinearVertical(final FloatRgbImage source, final int x, final int y,
                                         final int targetHeight, final float[] out) {
        final double center = (y + 0.5) * source.getHeight() / targetHeight - 0.5;
        final int top = (int) Math.floor(center);
        final double fraction = center - top;
        final int y0 = Math.max(0, Math.min(source.getHeight() - 1, top));
        final int y1 = Math.max(0, Math.min(source.getHeight() - 1, top + 1));
        for (int channel = 0; channel < 3; channel++) {
            final double a = source.get(x, y0, channel);
            final double b = source.get(x, y1, channel);
            out[channel] = (float) (a + (b - a) * fraction);
        }
    }

    private static FloatRgbImage rotate90(final FloatRgbImage source) {
        final FloatRgbImage result = new FloatRgbImage(source.getHeight(), source.getWidth());
        for (int y = 0; y < source.getHeight(); y++) {
            FilmRequestGuard.check();
            for (int x = 0; x < source.getWidth(); x++) {
                final int destX = source.getHeight() - 1 - y;
                final int destY = x;
                setPixel(result, destX, destY, source, x, y);
            }
        }
        return result;
    }

    private static FloatRgbImage rotate180(final FloatRgbImage source) {
        final FloatRgbImage result = new FloatRgbImage(source.getWidth(), source.getHeight());
        for (int y = 0; y < source.getHeight(); y++) {
            FilmRequestGuard.check();
            for (int x = 0; x < source.getWidth(); x++) {
                setPixel(result, source.getWidth() - 1 - x, source.getHeight() - 1 - y, source, x, y);
            }
        }
        return result;
    }

    private static FloatRgbImage rotate270(final FloatRgbImage source) {
        final FloatRgbImage result = new FloatRgbImage(source.getHeight(), source.getWidth());
        for (int y = 0; y < source.getHeight(); y++) {
            FilmRequestGuard.check();
            for (int x = 0; x < source.getWidth(); x++) {
                setPixel(result, y, source.getWidth() - 1 - x, source, x, y);
            }
        }
        return result;
    }

    private static FloatRgbImage rotateArbitrary(final FloatRgbImage source, final double degrees) {
        final FloatRgbImage result = new FloatRgbImage(source.getWidth(), source.getHeight());
        final double radians = Math.toRadians(degrees);
        final double cos = Math.cos(radians);
        final double sin = Math.sin(radians);
        final double centerX = (source.getWidth() - 1) / 2.0;
        final double centerY = (source.getHeight() - 1) / 2.0;
        final float[] value = new float[3];
        for (int y = 0; y < result.getHeight(); y++) {
            FilmRequestGuard.check();
            for (int x = 0; x < result.getWidth(); x++) {
                final double dx = x - centerX;
                final double dy = y - centerY;
                final double sourceX = cos * dx + sin * dy + centerX;
                final double sourceY = -sin * dx + cos * dy + centerY;
                if (sampleBilinear(source, sourceX, sourceY, value)) {
                    for (int channel = 0; channel < 3; channel++) {
                        result.set(x, y, channel, value[channel]);
                    }
                }
            }
        }
        return result;
    }

    private static boolean sampleBilinear(final FloatRgbImage source, final double x,
                                          final double y, final float[] out) {
        if (x < 0 || y < 0 || x > source.getWidth() - 1 || y > source.getHeight() - 1) {
            return false;
        }
        final int x0 = (int) Math.floor(x);
        final int y0 = (int) Math.floor(y);
        final int x1 = Math.min(source.getWidth() - 1, x0 + 1);
        final int y1 = Math.min(source.getHeight() - 1, y0 + 1);
        final double fx = x - x0;
        final double fy = y - y0;
        for (int channel = 0; channel < 3; channel++) {
            final double top = source.get(x0, y0, channel) * (1 - fx) + source.get(x1, y0, channel) * fx;
            final double bottom = source.get(x0, y1, channel) * (1 - fx) + source.get(x1, y1, channel) * fx;
            out[channel] = (float) (top * (1 - fy) + bottom * fy);
        }
        return true;
    }

    private static void setPixel(final FloatRgbImage target, final int targetX, final int targetY,
                                 final FloatRgbImage source, final int sourceX, final int sourceY) {
        for (int channel = 0; channel < 3; channel++) {
            target.set(targetX, targetY, channel, source.get(sourceX, sourceY, channel));
        }
    }
}
