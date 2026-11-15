package com.camborder.app.util;

import com.camborder.app.exception.FilmProcessingException;
import com.camborder.app.model.ImageProcessingConfig;
import org.springframework.http.HttpStatus;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.awt.color.ColorSpace;
import java.awt.color.ICC_ColorSpace;
import java.awt.color.ICC_Profile;
import java.awt.image.BufferedImage;
import java.awt.image.Raster;
import java.awt.image.DataBuffer;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Iterator;
import java.util.Locale;

/**
 * v2 已编码栅格读取器：JPEG/PNG/8-16-bit TIFF → 线性 Rec.2020 float32 工作图。
 *
 * 这是「扫描成片 / 数码正片」入口，不做负片反相。读取时按声明或嵌入 ICC 解释源样本，
 * 不先经过 8-bit Canvas；透明像素按配方声明的背景在浮点域合成。没有色彩定义且未显式
 * 选择时明确失败，不把未知文件猜成 sRGB。
 */
public final class FilmEncodedRasterReader {

    public static final String CODE_INPUT_UNSUPPORTED = "ENCODED_INPUT_UNSUPPORTED";
    public static final String CODE_ICC_MISMATCH = "ENCODED_INPUT_ICC_MISMATCH";
    public static final String CODE_ICC_MISSING = "ENCODED_INPUT_ICC_MISSING";
    public static final String CODE_BIT_DEPTH_MISMATCH = "ENCODED_INPUT_BIT_DEPTH_MISMATCH";
    public static final String CODE_TOO_LARGE = "ENCODED_INPUT_PIXEL_LIMIT";
    public static final String CODE_READ_FAILED = "ENCODED_INPUT_READ_FAILED";
    public static final String CODE_COLOR_SPACE_UNSUPPORTED = "ENCODED_INPUT_COLOR_SPACE_UNSUPPORTED";
    public static final long MAX_PIXELS = 200_000_000L;

    /** 头部事实；不分配整幅像素。 */
    public static final class ProbeResult {
        private final int width;
        private final int height;
        private final int bitDepth;
        private final boolean alpha;
        private final String colorModel;
        private final int imageCount;
        private final String iccSha256;
        private final int orientation;

        private ProbeResult(final int width, final int height, final int bitDepth,
                            final boolean alpha, final String colorModel, final int imageCount,
                            final String iccSha256, final int orientation) {
            this.width = width;
            this.height = height;
            this.bitDepth = bitDepth;
            this.alpha = alpha;
            this.colorModel = colorModel;
            this.imageCount = imageCount;
            this.iccSha256 = iccSha256;
            this.orientation = orientation;
        }

        public int getWidth() { return width; }
        public int getHeight() { return height; }
        public int getBitDepth() { return bitDepth; }
        public boolean hasAlpha() { return alpha; }
        public String getColorModel() { return colorModel; }
        public int getImageCount() { return imageCount; }
        public String getIccSha256() { return iccSha256; }
        public int getOrientation() { return orientation; }
    }

    /** 完整读取结果；像素已经转换为线性 Rec.2020 并应用方向。 */
    public static final class ReadResult {
        private final FloatRgbImage image;
        private final ProbeResult probe;
        private final String sourceColorSpace;
        private final String warning;

        private ReadResult(final FloatRgbImage image, final ProbeResult probe,
                           final String sourceColorSpace, final String warning) {
            this.image = image;
            this.probe = probe;
            this.sourceColorSpace = sourceColorSpace;
            this.warning = warning;
        }

        public FloatRgbImage getImage() { return image; }
        public ProbeResult getProbe() { return probe; }
        public String getSourceColorSpace() { return sourceColorSpace; }
        public String getWarning() { return warning; }
    }

    public ProbeResult probe(final Path path) {
        if (path == null || !Files.isRegularFile(path) || !Files.isReadable(path)) {
            throw failure("输入文件不存在或不可读", HttpStatus.BAD_REQUEST, CODE_INPUT_UNSUPPORTED);
        }
        try (ImageInputStream input = ImageIO.createImageInputStream(path.toFile())) {
            if (input == null) {
                throw failure("无法创建图像输入流", HttpStatus.BAD_REQUEST, CODE_INPUT_UNSUPPORTED);
            }
            final Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) {
                throw failure("文件不是支持的编码栅格格式", HttpStatus.BAD_REQUEST, CODE_INPUT_UNSUPPORTED);
            }
            final ImageReader reader = readers.next();
            try {
                reader.setInput(input, false, true);
                final int width = reader.getWidth(0);
                final int height = reader.getHeight(0);
                validateSize(width, height);
                final java.awt.image.ColorModel colorModel = reader.getImageTypes(0).next().getColorModel();
                final int bitDepth = maxComponentSize(colorModel);
                final boolean alpha = colorModel.hasAlpha();
                final int imageCount = safeImageCount(reader);
                final String iccSha256 = sha256OrNull(ImageMetadataPayload.read(path.toString()).getIcc());
                return new ProbeResult(width, height, bitDepth, alpha,
                        colorModel.getColorSpace() == null ? "unknown"
                                : colorModel.getColorSpace().getType() == ColorSpace.TYPE_GRAY ? "gray" : "rgb",
                        imageCount, iccSha256, ImageOrientation.read(path));
            } finally {
                reader.dispose();
            }
        } catch (FilmProcessingException exception) {
            throw exception;
        } catch (IOException | RuntimeException exception) {
            throw failure("编码栅格头部读取失败", HttpStatus.BAD_REQUEST, CODE_INPUT_UNSUPPORTED);
        }
    }

    public ReadResult read(final String imagePath, final ImageProcessingConfig.EncodedInput config) {
        if (config == null) {
            throw failure("encodedInput 配置缺失", HttpStatus.BAD_REQUEST, CODE_INPUT_UNSUPPORTED);
        }
        final Path path = Path.of(imagePath);
        final ProbeResult probe = probe(path);
        validateSize(probe.getWidth(), probe.getHeight());
        if (probe.getBitDepth() != config.getBitDepth()) {
            throw failure("源文件实际位深为 " + probe.getBitDepth()
                            + "，与配方声明的 " + config.getBitDepth() + " 不一致",
                    HttpStatus.BAD_REQUEST, CODE_BIT_DEPTH_MISMATCH);
        }
        final byte[] icc = ImageMetadataPayload.read(imagePath).getIcc();
        final String actualIccSha = sha256OrNull(icc);
        if ("embedded".equals(config.getColorSpace())) {
            if (icc == null || icc.length == 0) {
                throw failure("配方要求 embedded ICC，但源文件没有嵌入 profile",
                        HttpStatus.BAD_REQUEST, CODE_ICC_MISSING);
            }
            if (config.getIccSha256() == null
                    || !config.getIccSha256().equalsIgnoreCase(actualIccSha)) {
                throw failure("嵌入 ICC 与配方指纹不一致，请重新探测后保存",
                        HttpStatus.BAD_REQUEST, CODE_ICC_MISMATCH);
            }
        } else if (config.getIccSha256() != null && !config.getIccSha256().isBlank()
                && !config.getIccSha256().equalsIgnoreCase(actualIccSha)) {
            throw failure("源文件 ICC 与配方指纹不一致，请重新探测后保存",
                    HttpStatus.BAD_REQUEST, CODE_ICC_MISMATCH);
        }
        if (!"embedded".equals(config.getColorSpace()) && icc != null && icc.length > 0) {
            // 用户显式选择了其它源色彩空间；允许继续，但必须把“没有采用嵌入 ICC”写进事实，
            // 不能让嵌入 profile 被静默覆盖。
            return decode(path, probe, config, icc, actualIccSha, true);
        }
        return decode(path, probe, config, icc, actualIccSha, false);
    }

    private ReadResult decode(final Path path, final ProbeResult probe,
                              final ImageProcessingConfig.EncodedInput config,
                              final byte[] icc, final String actualIccSha,
                              final boolean explicitButUnverifiedIcc) {
        BufferedImage source = null;
        try (ImageInputStream input = ImageIO.createImageInputStream(path.toFile())) {
            if (input == null) {
                throw failure("无法创建图像输入流", HttpStatus.BAD_REQUEST, CODE_INPUT_UNSUPPORTED);
            }
            final Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) {
                throw failure("文件不是支持的编码栅格格式", HttpStatus.BAD_REQUEST, CODE_INPUT_UNSUPPORTED);
            }
            final ImageReader reader = readers.next();
            try {
                reader.setInput(input, false, true);
                final javax.imageio.ImageReadParam param = reader.getDefaultReadParam();
                if ("JPEG".equalsIgnoreCase(reader.getFormatName()) && icc != null && icc.length > 0) {
                    // JPEG reader 默认可能把 ICC 转成 sRGB。指定原 profile 为目标，
                    // 使得到的样本仍属于源空间，之后只进行一次工作空间转换。
                    final ICC_ColorSpace original = embeddedSpace(icc);
                    final int[] offsets = original.getNumComponents() == 1 ? new int[]{0} : new int[]{0, 1, 2};
                    if (original.getNumComponents() != 1 && original.getNumComponents() != 3) {
                        throw failure("JPEG ICC 只支持灰阶或 RGB", HttpStatus.BAD_REQUEST,
                                CODE_COLOR_SPACE_UNSUPPORTED);
                    }
                    param.setDestination(javax.imageio.ImageTypeSpecifier.createInterleaved(
                            original, offsets, DataBuffer.TYPE_BYTE, false, false)
                            .createBufferedImage(probe.getWidth(), probe.getHeight()));
                }
                source = reader.read(0, param);
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException exception) {
            throw failure("编码栅格解码失败", HttpStatus.BAD_REQUEST, CODE_READ_FAILED);
        }
        if (source == null) {
            throw failure("编码栅格解码结果为空", HttpStatus.BAD_REQUEST, CODE_READ_FAILED);
        }
        final FloatRgbImage linear = toLinear(source, config, icc);
        final FloatRgbImage oriented = FloatImageOps.orient(linear, probe.getOrientation());
        final String sourceSpace = "embedded".equals(config.getColorSpace())
                ? "icc:" + actualIccSha : config.getColorSpace();
        final String warning = explicitButUnverifiedIcc
                ? "源文件含嵌入 ICC，但配方选择了显式 " + config.getColorSpace()
                + "；嵌入 profile 未被静默采用"
                : (probe.hasAlpha()
                    ? "透明输入已按 " + config.getAlphaBackground() + " 背景在浮点域合成" : null);
        return new ReadResult(oriented, probe, sourceSpace, warning);
    }

    private FloatRgbImage toLinear(final BufferedImage source,
                                   final ImageProcessingConfig.EncodedInput config,
                                   final byte[] icc) {
        final int width = source.getWidth();
        final int height = source.getHeight();
        final int pixelCount = Math.multiplyExact(width, height);
        final FloatRgbImage target = new FloatRgbImage(width, height);
        final Raster raster = source.getRaster();
        final java.awt.image.ColorModel model = source.getColorModel();
        final int colorBands = model.getNumColorComponents();
        if (colorBands != 1 && colorBands != 3) {
            throw failure("编码栅格仅支持灰阶或 RGB 颜色模型", HttpStatus.BAD_REQUEST,
                    CODE_COLOR_SPACE_UNSUPPORTED);
        }
        final float[] encoded = new float[Math.multiplyExact(pixelCount, 3)];
        final float[] alpha = new float[pixelCount];
        Object element = null;
        float[] components = null;
        for (int y = 0; y < height; y++) {
            FilmRequestGuard.check();
            for (int x = 0; x < width; x++) {
                final int pixel = y * width + x;
                element = raster.getDataElements(x, y, element);
                // 按颜色模型展开 palette/灰阶，并解除预乘；不能把索引或预乘值当 RGB。
                components = model.getNormalizedComponents(element, components, 0);
                for (int channel = 0; channel < 3; channel++) {
                    encoded[pixel * 3 + channel] = components[colorBands == 1 ? 0 : channel];
                }
                alpha[pixel] = model.hasAlpha() ? components[colorBands] : 1f;
            }
        }
        final float[] converted = convertBuffer(encoded, pixelCount, config, icc);
        final double background = "black".equals(config.getAlphaBackground()) ? 0 : 1;
        for (int pixel = 0; pixel < pixelCount; pixel++) {
            final double a = alpha[pixel];
            for (int channel = 0; channel < 3; channel++) {
                final double value = converted[pixel * 3 + channel] * a + background * (1 - a);
                target.set(pixel % width, pixel / width, channel, (float) value);
            }
        }
        return target;
    }

    /** CMM 只处理真正的 profile/编码空间转换；同线性空间直接矩阵，避免无谓误差。 */
    private static float[] convertBuffer(final float[] encoded, final int pixelCount,
                                         final ImageProcessingConfig.EncodedInput config,
                                         final byte[] icc) {
        final String colorSpace = config.getColorSpace();
        if (("srgb".equals(colorSpace) || "adobe-rgb".equals(colorSpace)
                || "prophoto-rgb".equals(colorSpace) || "embedded".equals(colorSpace))
                && Lcms2ColorTransform.isAvailable()) {
            return Lcms2ColorTransform.toLinearRec2020(encoded, pixelCount, colorSpace, icc);
        }
        final float[] converted = new float[encoded.length];
        final double[] source = new double[3];
        final float[] out = new float[3];
        final ICC_ColorSpace embedded = "embedded".equals(colorSpace) ? embeddedSpace(icc) : null;
        for (int pixel = 0; pixel < pixelCount; pixel++) {
            source[0] = encoded[pixel * 3];
            source[1] = encoded[pixel * 3 + 1];
            source[2] = encoded[pixel * 3 + 2];
            convert(source, out, embedded, colorSpace);
            converted[pixel * 3] = out[0];
            converted[pixel * 3 + 1] = out[1];
            converted[pixel * 3 + 2] = out[2];
        }
        return converted;
    }

    private static ICC_ColorSpace embeddedSpace(final byte[] icc) {
        try {
            return new ICC_ColorSpace(ICC_Profile.getInstance(icc));
        } catch (RuntimeException exception) {
            throw failure("嵌入 ICC 无法解析", HttpStatus.BAD_REQUEST, CODE_ICC_MISSING);
        }
    }

    /** 把已编码样本转换为线性 Rec.2020；embedded profile 走浮点 CMM。 */
    private static void convert(final double[] encoded, final float[] out,
                                final ICC_ColorSpace embedded, final String colorSpace) {
        if (embedded != null) {
            final float[] input = {(float) encoded[0], (float) encoded[1], (float) encoded[2]};
            try {
                final float[] xyz = embedded.toCIEXYZ(input);
                FilmColorSpace.d50XyzToLinearRec2020(xyz, out);
            } catch (RuntimeException exception) {
                throw failure("嵌入 ICC 转换失败", HttpStatus.BAD_REQUEST, CODE_COLOR_SPACE_UNSUPPORTED);
            }
            return;
        }
        if ("srgb".equals(colorSpace)) {
            final float[] linear = {
                    (float) FilmColorSpace.encodedSrgbToLinear(encoded[0]),
                    (float) FilmColorSpace.encodedSrgbToLinear(encoded[1]),
                    (float) FilmColorSpace.encodedSrgbToLinear(encoded[2])};
            FilmColorSpace.linearSrgbToRec2020(linear, out);
        } else if ("adobe-rgb".equals(colorSpace)) {
            final double gamma = 563.0 / 256.0;
            final float[] xyz = new float[3];
            FilmColorSpace.adobeRgbToXyzD65(
                    new float[]{(float) Math.pow(encoded[0], gamma),
                            (float) Math.pow(encoded[1], gamma),
                            (float) Math.pow(encoded[2], gamma)}, xyz);
            FilmColorSpace.xyzD65ToLinearRec2020(xyz, out);
        } else if ("prophoto-rgb".equals(colorSpace)) {
            final float[] xyzD50 = new float[3];
            FilmColorSpace.proPhotoToXyzD50(
                    new float[]{(float) Math.pow(encoded[0], 1.8),
                            (float) Math.pow(encoded[1], 1.8),
                            (float) Math.pow(encoded[2], 1.8)}, xyzD50);
            FilmColorSpace.d50XyzToLinearRec2020(xyzD50, out);
        } else if ("linear-srgb".equals(colorSpace)) {
            FilmColorSpace.linearSrgbToRec2020(
                    new float[]{(float) encoded[0], (float) encoded[1], (float) encoded[2]}, out);
        } else if ("linear-rec2020".equals(colorSpace)) {
            out[0] = (float) encoded[0];
            out[1] = (float) encoded[1];
            out[2] = (float) encoded[2];
        } else {
            throw failure("显式输入色彩空间不受支持", HttpStatus.BAD_REQUEST,
                    CODE_COLOR_SPACE_UNSUPPORTED);
        }
    }

    private static int maxComponentSize(final java.awt.image.ColorModel model) {
        if (model == null) return 8;
        final int[] sizes = model.getComponentSize();
        int max = 0;
        for (int size : sizes) max = Math.max(max, size);
        // 带 alpha 的 ColorModel 会包含 alpha 位数；样本位深取颜色分量最大值更稳妥。
        if (model.hasAlpha() && sizes.length > 1) {
            max = 0;
            for (int index = 0; index < sizes.length - 1; index++) {
                max = Math.max(max, sizes[index]);
            }
        }
        if (max <= 0) max = 8;
        if (max <= 8) return 8;
        return 16;
    }

    private static int safeImageCount(final ImageReader reader) {
        try {
            return reader.getNumImages(true);
        } catch (IOException | RuntimeException exception) {
            return 1;
        }
    }

    private static void validateSize(final int width, final int height) {
        if (width <= 0 || height <= 0) {
            throw failure("输入尺寸非正数", HttpStatus.UNPROCESSABLE_ENTITY, CODE_TOO_LARGE);
        }
        final long pixels;
        try {
            pixels = Math.multiplyExact((long) width, (long) height);
        } catch (ArithmeticException exception) {
            throw failure("输入像素尺寸溢出", HttpStatus.UNPROCESSABLE_ENTITY, CODE_TOO_LARGE);
        }
        if (pixels > MAX_PIXELS) {
            throw failure("输入像素数超过 " + MAX_PIXELS + " 上限",
                    HttpStatus.UNPROCESSABLE_ENTITY, CODE_TOO_LARGE);
        }
    }

    private static String sha256OrNull(final byte[] value) {
        if (value == null || value.length == 0) return null;
        try {
            final byte[] digest = MessageDigest.getInstance("SHA-256").digest(value);
            final StringBuilder result = new StringBuilder(64);
            for (byte datum : digest) result.append(String.format(Locale.ROOT, "%02x", datum));
            return result.toString();
        } catch (Exception exception) {
            return null;
        }
    }

    private static FilmProcessingException failure(final String message,
                                                   final HttpStatus status, final String code) {
        return new FilmProcessingException(message, status, code);
    }
}
