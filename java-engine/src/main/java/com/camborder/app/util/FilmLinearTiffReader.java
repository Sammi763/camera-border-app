package com.camborder.app.util;

import com.camborder.app.exception.FilmProcessingException;
import com.camborder.app.model.ImageProcessingConfig;
import org.springframework.http.HttpStatus;

import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.awt.image.BufferedImage;
import java.awt.image.DataBuffer;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.Iterator;

/**
 * 受控 16-bit 线性测试 TIFF 读取（T04）。
 *
 * 只在显式声明 transferFunction=linear 且 colorSpace 明确时读取；有 ICC 时核验其线性 TRC
 * 和基色与声明空间一致，未知传递函数不得猜成线性。读取后直接转成线性 Rec.2020 浮点工作图，
 * 不经过旧 sRGB 规范化或 8-bit Canvas。
 */
public final class FilmLinearTiffReader {

    public static final String CODE_INPUT_INVALID = "LINEAR_INPUT_INVALID";
    public static final String CODE_ICC_UNSUPPORTED = "LINEAR_INPUT_ICC_UNSUPPORTED";
    public static final String CODE_COLOR_SPACE_UNSUPPORTED = "LINEAR_INPUT_COLOR_SPACE_UNSUPPORTED";
    public static final String CODE_TOO_LARGE = "LINEAR_INPUT_TOO_LARGE";

    /** 单张线性输入上限：200M 像素，超过时在解码前拒绝，避免无界内存。 */
    static final long MAX_PIXELS = 200_000_000L;

    public static final class ReadResult {
        private final FloatRgbImage image;
        private final int sourceWidth;
        private final int sourceHeight;
        private final int sourceBitDepth;
        private final String sourceColorSpace;
        private final String sourcePath;

        private ReadResult(final FloatRgbImage image, final int sourceWidth, final int sourceHeight,
                           final int sourceBitDepth, final String sourceColorSpace,
                           final String sourcePath) {
            this.image = image;
            this.sourceWidth = sourceWidth;
            this.sourceHeight = sourceHeight;
            this.sourceBitDepth = sourceBitDepth;
            this.sourceColorSpace = sourceColorSpace;
            this.sourcePath = sourcePath;
        }

        public FloatRgbImage getImage() { return image; }
        public int getSourceWidth() { return sourceWidth; }
        public int getSourceHeight() { return sourceHeight; }
        public int getSourceBitDepth() { return sourceBitDepth; }
        public String getSourceColorSpace() { return sourceColorSpace; }
        public String getSourcePath() { return sourcePath; }

        public FilmProcessingFacts toFacts() {
            return new FilmProcessingFacts(sourcePath, sourceWidth, sourceHeight, sourceBitDepth,
                    sourceColorSpace, image.getWidth(), image.getHeight());
        }
    }

    public ReadResult read(final String imagePath, final ImageProcessingConfig.LinearInput input) {
        validateInput(input);
        requirePath(imagePath);
        final ImageMetadataPayload payload = ImageMetadataPayload.read(imagePath);
        if (!payload.hasIcc() && input.getIccSha256() != null && !input.getIccSha256().isBlank()) {
            throw new FilmProcessingException("线性输入声明了 ICC 指纹，但文件没有 ICC",
                    HttpStatus.BAD_REQUEST, CODE_INPUT_INVALID);
        }
        if (payload.hasIcc()) {
            if (input.getIccSha256() != null && !input.getIccSha256().isBlank()
                    && !input.getIccSha256().equalsIgnoreCase(sha256(payload.getIcc()))) {
                throw new FilmProcessingException("线性输入 ICC 指纹不匹配",
                        HttpStatus.BAD_REQUEST, CODE_INPUT_INVALID);
            }
            try {
                final java.awt.color.ICC_Profile profile = java.awt.color.ICC_Profile.getInstance(payload.getIcc());
                if (!(profile instanceof java.awt.color.ICC_ProfileRGB)) throw new IllegalArgumentException("非 RGB profile");
                final java.awt.color.ICC_ProfileRGB rgb = (java.awt.color.ICC_ProfileRGB) profile;
                for (int c = 0; c < 3; c++) if (Math.abs(rgb.getGamma(c) - 1) > 1e-4) throw new IllegalArgumentException("非线性 TRC");
                final java.awt.color.ICC_ProfileRGB expected = (java.awt.color.ICC_ProfileRGB) java.awt.color.ICC_Profile.getInstance(
                        "linear-rec2020".equals(input.getColorSpace()) ? FilmOutputProfile.linearRec2020()
                        : java.awt.color.ICC_Profile.getInstance(java.awt.color.ColorSpace.CS_LINEAR_RGB).getData());
                for (int row = 0; row < 3; row++) for (int col = 0; col < 3; col++)
                    if (Math.abs(rgb.getMatrix()[row][col] - expected.getMatrix()[row][col]) > 0.0005)
                        throw new IllegalArgumentException("基色不匹配");
            } catch (RuntimeException e) {
                throw new FilmProcessingException("输入 ICC 必须与声明的线性空间匹配", HttpStatus.BAD_REQUEST, CODE_ICC_UNSUPPORTED);
            }
        }

        FilmRequestGuard.check();
        final BufferedImage decoded;
        try (ImageInputStream stream = ImageIO.createImageInputStream(new File(imagePath))) {
            if (stream == null) {
                throw new FilmProcessingException("线性输入无法读取",
                        HttpStatus.BAD_REQUEST, CODE_INPUT_INVALID);
            }
            final Iterator<ImageReader> readers = ImageIO.getImageReaders(stream);
            if (!readers.hasNext()) {
                throw new FilmProcessingException("线性输入不是受支持的 TIFF",
                        HttpStatus.BAD_REQUEST, CODE_INPUT_INVALID);
            }
            final ImageReader reader = readers.next();
            try {
                reader.setInput(stream, true, true);
                validatePixelCount(reader.getWidth(0), reader.getHeight(0));
                final ImageReadParam param = reader.getDefaultReadParam();
                decoded = reader.read(0, param);
            } finally {
                reader.dispose();
            }
        } catch (FilmProcessingException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new FilmProcessingException("线性输入读取失败",
                    HttpStatus.BAD_REQUEST, CODE_INPUT_INVALID);
        }
        FilmRequestGuard.check();
        if (decoded == null) {
            throw new FilmProcessingException("线性输入为空",
                    HttpStatus.BAD_REQUEST, CODE_INPUT_INVALID);
        }
        final int bands = decoded.getRaster().getNumBands();
        if (decoded.getRaster().getDataBuffer().getDataType() != DataBuffer.TYPE_USHORT
                || bands != 3 || decoded.getColorModel().hasAlpha()) {
            throw new FilmProcessingException("线性输入必须是 16-bit RGB TIFF",
                    HttpStatus.BAD_REQUEST, CODE_INPUT_INVALID);
        }

        final int width = decoded.getWidth();
        final int height = decoded.getHeight();
        final FloatRgbImage image = new FloatRgbImage(width, height);
        final float[] srgb = new float[3];
        final float[] rec2020 = new float[3];
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                for (int channel = 0; channel < 3; channel++) {
                    srgb[channel] = decoded.getRaster().getSample(x, y, channel) / 65535f;
                }
                if ("linear-rec2020".equals(input.getColorSpace())) {
                    rec2020[0] = srgb[0];
                    rec2020[1] = srgb[1];
                    rec2020[2] = srgb[2];
                } else if ("linear-srgb".equals(input.getColorSpace())) {
                    FilmColorSpace.linearSrgbToRec2020(srgb, rec2020);
                } else {
                    throw new FilmProcessingException(
                            "linear-camera-rgb 测试输入需要相机矩阵，当前路径不支持",
                            HttpStatus.BAD_REQUEST, CODE_COLOR_SPACE_UNSUPPORTED);
                }
                for (int channel = 0; channel < 3; channel++) {
                    image.set(x, y, channel, rec2020[channel]);
                }
            }
        }
        return new ReadResult(image, width, height, 16, input.getColorSpace(), imagePath);
    }

    static void validatePixelCount(final int width, final int height) {
        if (width <= 0 || height <= 0) {
            throw new FilmProcessingException("线性输入尺寸非法",
                    HttpStatus.BAD_REQUEST, CODE_INPUT_INVALID);
        }
        if ((long) width * height > MAX_PIXELS) {
            throw new FilmProcessingException("线性输入像素数超过上限",
                    HttpStatus.BAD_REQUEST, CODE_TOO_LARGE);
        }
    }

    private static void validateInput(final ImageProcessingConfig.LinearInput input) {
        if (input == null) {
            throw new FilmProcessingException("linearInput 配置缺失",
                    HttpStatus.BAD_REQUEST, CODE_INPUT_INVALID);
        }
        if (!"linear".equals(input.getTransferFunction()) || input.getBitDepth() != 16) {
            throw new FilmProcessingException("线性输入必须声明 linear + 16-bit",
                    HttpStatus.BAD_REQUEST, CODE_INPUT_INVALID);
        }
        if (!"linear-srgb".equals(input.getColorSpace())
                && !"linear-rec2020".equals(input.getColorSpace())
                && !"linear-camera-rgb".equals(input.getColorSpace())) {
            throw new FilmProcessingException("线性输入 colorSpace 非法",
                    HttpStatus.BAD_REQUEST, CODE_INPUT_INVALID);
        }
    }

    private static Path requirePath(final String imagePath) {
        if (imagePath == null || imagePath.isBlank()) {
            throw new FilmProcessingException("线性输入路径为空",
                    HttpStatus.BAD_REQUEST, CODE_INPUT_INVALID);
        }
        final Path path;
        try {
            path = Path.of(imagePath);
        } catch (RuntimeException exception) {
            throw new FilmProcessingException("线性输入路径非法",
                    HttpStatus.BAD_REQUEST, CODE_INPUT_INVALID);
        }
        if (!Files.isRegularFile(path) || !Files.isReadable(path)) {
            throw new FilmProcessingException("线性输入文件不存在或不可读",
                    HttpStatus.BAD_REQUEST, CODE_INPUT_INVALID);
        }
        return path;
    }

    private static String sha256(final byte[] data) {
        try {
            final byte[] digest = MessageDigest.getInstance("SHA-256").digest(data);
            final StringBuilder result = new StringBuilder(64);
            for (byte value : digest) {
                result.append(String.format(java.util.Locale.ROOT, "%02x", value));
            }
            return result.toString();
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 unavailable", exception);
        }
    }
}
