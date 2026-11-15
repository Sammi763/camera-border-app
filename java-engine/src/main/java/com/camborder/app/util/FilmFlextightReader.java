package com.camborder.app.util;

import com.camborder.app.exception.FilmProcessingException;
import com.camborder.app.model.ImageProcessingConfig;
import org.springframework.http.HttpStatus;

import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.awt.Rectangle;
import java.awt.image.BufferedImage;
import java.awt.image.ColorModel;
import java.awt.image.Raster;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Iterator;

/**
 * Flextight FFF（Hasselblad Flexible File Format，TIFF 容器）读取器。
 *
 * 只读取 image 0 的完整 RGB16 主图；预览、缩略图、附属 IFD 和历史图层不冒充主图。
 * 输入域必须由配方显式声明，文件里的输出 Adobe RGB / 历史 gamma 不自动成为扫描输入。
 * 采用横向宽带读取，避免先把约 80MP 长条扫描展开成整幅 16-bit BufferedImage。
 */
public final class FilmFlextightReader {

    public static final String CODE_NOT_TIFF = "FFF_CONTAINER_UNSUPPORTED";
    public static final String CODE_MAIN_IMAGE_UNSUPPORTED = "FFF_MAIN_IMAGE_UNSUPPORTED";
    public static final String CODE_READ_FAILED = "FFF_READ_FAILED";
    public static final String CODE_PIXEL_LIMIT = "FFF_PIXEL_LIMIT";
    public static final String CODE_INPUT_SPACE_UNSUPPORTED = "FFF_INPUT_SPACE_UNSUPPORTED";
    public static final long MAX_PIXELS = 200_000_000L;
    private static final int BAND_HEIGHT = 256;

    /** FFF 头部事实；imageCount>1 时包含附属图，不能把附属图当主图。 */
    public static final class ProbeResult {
        private final int width;
        private final int height;
        private final int bitDepth;
        private final int bands;
        private final int imageCount;
        private final int orientation;

        private ProbeResult(final int width, final int height, final int bitDepth,
                            final int bands, final int imageCount, final int orientation) {
            this.width = width;
            this.height = height;
            this.bitDepth = bitDepth;
            this.bands = bands;
            this.imageCount = imageCount;
            this.orientation = orientation;
        }

        public int getWidth() { return width; }
        public int getHeight() { return height; }
        public int getBitDepth() { return bitDepth; }
        public int getBands() { return bands; }
        public int getImageCount() { return imageCount; }
        public int getAttachedImageCount() { return Math.max(0, imageCount - 1); }
        public int getOrientation() { return orientation; }
    }

    public static final class ReadResult {
        private final FloatRgbImage image;
        private final ProbeResult probe;
        private final String warning;

        private ReadResult(final FloatRgbImage image, final ProbeResult probe,
                           final String warning) {
            this.image = image;
            this.probe = probe;
            this.warning = warning;
        }

        public FloatRgbImage getImage() { return image; }
        public ProbeResult getProbe() { return probe; }
        public String getWarning() { return warning; }
    }

    public ProbeResult probe(final Path path) {
        if (path == null || !Files.isRegularFile(path) || !Files.isReadable(path)) {
            throw failure("FFF 文件不存在或不可读", HttpStatus.BAD_REQUEST, CODE_NOT_TIFF);
        }
        if (!isTiffContainer(path)) {
            throw failure("文件不是 TIFF 容器的 Flextight FFF", HttpStatus.BAD_REQUEST, CODE_NOT_TIFF);
        }
        try (ImageInputStream input = ImageIO.createImageInputStream(path.toFile())) {
            if (input == null) {
                throw failure("无法创建 FFF 输入流", HttpStatus.BAD_REQUEST, CODE_NOT_TIFF);
            }
            final Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) {
                throw failure("FFF TIFF 容器无法解析", HttpStatus.BAD_REQUEST, CODE_NOT_TIFF);
            }
            final ImageReader reader = readers.next();
            try {
                reader.setInput(input, false, true);
                final int width = reader.getWidth(0);
                final int height = reader.getHeight(0);
                validateSize(width, height);
                final ColorModel model = reader.getImageTypes(0).next().getColorModel();
                final int bitDepth = maxComponentSize(model);
                final int bands = model.getNumColorComponents();
                final int imageCount = safeImageCount(reader);
                if (bitDepth != 16 || bands != 3) {
                    throw failure("FFF 主图必须是 RGB16（实际 " + bands + " 通道 / "
                                    + bitDepth + "-bit）", HttpStatus.BAD_REQUEST,
                            CODE_MAIN_IMAGE_UNSUPPORTED);
                }
                return new ProbeResult(width, height, bitDepth, bands, imageCount,
                        ImageOrientation.read(path));
            } finally {
                reader.dispose();
            }
        } catch (FilmProcessingException exception) {
            throw exception;
        } catch (IOException | RuntimeException exception) {
            throw failure("FFF 头信息读取失败", HttpStatus.BAD_REQUEST, CODE_NOT_TIFF);
        }
    }

    public ReadResult read(final String imagePath,
                           final ImageProcessingConfig.FlextightInput config) {
        if (config == null) {
            throw failure("flextightInput 配置缺失", HttpStatus.BAD_REQUEST,
                    CODE_INPUT_SPACE_UNSUPPORTED);
        }
        final Path path = Path.of(imagePath);
        final ProbeResult probe = probe(path);
        final boolean srgbInput = "linear-srgb".equals(config.getColorSpace());
        if (!srgbInput && !"linear-rec2020".equals(config.getColorSpace())) {
            throw failure("FFF 输入色彩空间必须是 linear-srgb 或 linear-rec2020",
                    HttpStatus.BAD_REQUEST, CODE_INPUT_SPACE_UNSUPPORTED);
        }
        final byte[] embeddedIcc = ImageMetadataPayload.read(imagePath).getIcc();
        final String actualIcc = sha256(embeddedIcc);
        if (config.getIccSha256() != null && !config.getIccSha256().isBlank()
                && !config.getIccSha256().equalsIgnoreCase(actualIcc)) {
            throw failure("FFF 输入 ICC 指纹与文件不一致，请重新探测",
                    HttpStatus.BAD_REQUEST, "FFF_INPUT_ICC_MISMATCH");
        }
        final FloatRgbImage target = new FloatRgbImage(probe.getWidth(), probe.getHeight());
        try (ImageInputStream input = ImageIO.createImageInputStream(path.toFile())) {
            if (input == null) {
                throw failure("无法创建 FFF 输入流", HttpStatus.BAD_REQUEST, CODE_NOT_TIFF);
            }
            final Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) {
                throw failure("FFF TIFF 容器无法解析", HttpStatus.BAD_REQUEST, CODE_NOT_TIFF);
            }
            final ImageReader reader = readers.next();
            try {
                reader.setInput(input, false, true);
                final ImageReadParam parameter = reader.getDefaultReadParam();
                for (int top = 0; top < probe.getHeight(); top += BAND_HEIGHT) {
                    FilmRequestGuard.check();
                    final int height = Math.min(BAND_HEIGHT, probe.getHeight() - top);
                    parameter.setSourceRegion(new Rectangle(0, top, probe.getWidth(), height));
                    final BufferedImage band = reader.read(0, parameter);
                    copyBand(band, target, top, srgbInput);
                }
            } finally {
                reader.dispose();
            }
        } catch (FilmProcessingException exception) {
            throw exception;
        } catch (IOException | RuntimeException exception) {
            throw failure("FFF 主图读取失败", HttpStatus.BAD_REQUEST, CODE_READ_FAILED);
        }
        final FloatRgbImage oriented = FloatImageOps.orient(target, probe.getOrientation());
        final String warning = config.getIccSha256() == null || config.getIccSha256().isBlank()
                ? "FFF 按显式 " + config.getColorSpace()
                + " 解释主图；文件内输出 profile/历史 gamma 未被当作输入定义"
                : "FFF 按显式 " + config.getColorSpace()
                + " 解释主图；输入 ICC 指纹仅作追溯，不作为输出 profile";
        return new ReadResult(oriented, probe, warning);
    }

    private static void copyBand(final BufferedImage band, final FloatRgbImage target,
                                 final int top, final boolean srgbInput) {
        final Raster raster = band.getRaster();
        if (raster.getNumBands() < 3) {
            throw failure("FFF 读取条带缺少 RGB 通道", HttpStatus.BAD_REQUEST,
                    CODE_MAIN_IMAGE_UNSUPPORTED);
        }
        final float[] rgb = new float[3];
        final float[] out = new float[3];
        for (int y = 0; y < band.getHeight(); y++) {
            for (int x = 0; x < band.getWidth(); x++) {
                for (int channel = 0; channel < 3; channel++) {
                    rgb[channel] = raster.getSample(x, y, channel) / 65535.0f;
                }
                if (srgbInput) {
                    FilmColorSpace.linearSrgbToRec2020(rgb, out);
                } else {
                    out[0] = rgb[0];
                    out[1] = rgb[1];
                    out[2] = rgb[2];
                }
                target.set(x, top + y, 0, out[0]);
                target.set(x, top + y, 1, out[1]);
                target.set(x, top + y, 2, out[2]);
            }
        }
    }

    private static boolean isTiffContainer(final Path path) {
        try (java.io.RandomAccessFile file = new java.io.RandomAccessFile(path.toFile(), "r")) {
            if (file.length() < 4) return false;
            final int b0 = file.read();
            final int b1 = file.read();
            final int b2 = file.read();
            final int b3 = file.read();
            return (b0 == 'I' && b1 == 'I' && (b2 == 42 || b2 == 43) && b3 == 0)
                    || (b0 == 'M' && b1 == 'M' && b2 == 0 && (b3 == 42 || b3 == 43));
        } catch (IOException exception) {
            return false;
        }
    }

    private static int maxComponentSize(final ColorModel model) {
        if (model == null) return 8;
        int max = 0;
        for (int size : model.getComponentSize()) max = Math.max(max, size);
        if (model.hasAlpha() && model.getComponentSize().length > 1) {
            final int[] sizes = model.getComponentSize();
            max = 0;
            for (int index = 0; index < sizes.length - 1; index++) {
                max = Math.max(max, sizes[index]);
            }
        }
        return max <= 0 ? 8 : max;
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
            throw failure("FFF 主图尺寸非正数", HttpStatus.UNPROCESSABLE_ENTITY, CODE_PIXEL_LIMIT);
        }
        final long pixels;
        try {
            pixels = Math.multiplyExact((long) width, (long) height);
        } catch (ArithmeticException exception) {
            throw failure("FFF 像素尺寸溢出", HttpStatus.UNPROCESSABLE_ENTITY, CODE_PIXEL_LIMIT);
        }
        if (pixels > MAX_PIXELS) {
            throw failure("FFF 主图像素数超过 " + MAX_PIXELS + " 上限",
                    HttpStatus.UNPROCESSABLE_ENTITY, CODE_PIXEL_LIMIT);
        }
    }

    private static String sha256(final byte[] value) {
        if (value == null || value.length == 0) return null;
        try {
            final byte[] digest = java.security.MessageDigest.getInstance("SHA-256").digest(value);
            final StringBuilder result = new StringBuilder(64);
            for (byte datum : digest) result.append(String.format(java.util.Locale.ROOT, "%02x", datum));
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
