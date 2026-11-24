package com.camborder.app.util;

import com.camborder.app.model.ImagePlacement;
import com.camborder.app.model.RenderRecipe;
import org.springframework.stereotype.Component;

import java.awt.Color;
import java.awt.Dimension;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;

/**
 * RenderRecipe v2 图片几何实现。
 *
 * 计算公式必须与 frontend/src/features/preview/canvas/imagePlacementGeometry.ts 保持一致：
 * 先求旋转包围盒，再求目标比例框，最后按 fit/fill 和焦点求偏移。
 */
@Component
public final class ImagePlacementRenderer {

    public static final class Geometry {
        private final double sourceWidth;
        private final double sourceHeight;
        private final double rotatedWidth;
        private final double rotatedHeight;
        private final double targetWidth;
        private final double targetHeight;
        private final double drawWidth;
        private final double drawHeight;
        private final double offsetX;
        private final double offsetY;
        private final double scale;
        private final double rotation;
        private final double focalX;
        private final double focalY;
        private final String mode;

        private Geometry(final double sourceWidth, final double sourceHeight,
                         final double rotatedWidth, final double rotatedHeight,
                         final double targetWidth, final double targetHeight,
                         final double drawWidth, final double drawHeight,
                         final double offsetX, final double offsetY, final double scale,
                         final double rotation, final double focalX, final double focalY,
                         final String mode) {
            this.sourceWidth = sourceWidth;
            this.sourceHeight = sourceHeight;
            this.rotatedWidth = rotatedWidth;
            this.rotatedHeight = rotatedHeight;
            this.targetWidth = targetWidth;
            this.targetHeight = targetHeight;
            this.drawWidth = drawWidth;
            this.drawHeight = drawHeight;
            this.offsetX = offsetX;
            this.offsetY = offsetY;
            this.scale = scale;
            this.rotation = rotation;
            this.focalX = focalX;
            this.focalY = focalY;
            this.mode = mode;
        }

        public double sourceWidth() { return sourceWidth; }
        public double sourceHeight() { return sourceHeight; }
        public double rotatedWidth() { return rotatedWidth; }
        public double rotatedHeight() { return rotatedHeight; }
        public double targetWidth() { return targetWidth; }
        public double targetHeight() { return targetHeight; }
        public double drawWidth() { return drawWidth; }
        public double drawHeight() { return drawHeight; }
        public double offsetX() { return offsetX; }
        public double offsetY() { return offsetY; }
        public double scale() { return scale; }
        public double rotation() { return rotation; }
        public double focalX() { return focalX; }
        public double focalY() { return focalY; }
        public String mode() { return mode; }
    }

    public static final class OutputLayout {
        private final Geometry geometry;
        private final int photoWidth;
        private final int photoHeight;
        private final double decorationScale;
        private final int canvasWidth;
        private final int canvasHeight;

        private OutputLayout(final Geometry geometry, final Dimension photo, final double decorationScale,
                             final int[] insets) {
            this.geometry = geometry;
            this.photoWidth = photo.width;
            this.photoHeight = photo.height;
            this.decorationScale = decorationScale;
            this.canvasWidth = Math.addExact(photoWidth, Math.addExact(insets[2], insets[3]));
            this.canvasHeight = Math.addExact(photoHeight, Math.addExact(insets[0], insets[1]));
        }

        public int photoWidth() { return photoWidth; }
        public int photoHeight() { return photoHeight; }
        public double decorationScale() { return decorationScale; }
        public int canvasWidth() { return canvasWidth; }
        public int canvasHeight() { return canvasHeight; }
    }

    /** 计算几何，供渲染器和测试复用。 */
    public Geometry calculate(final int sourceWidth, final int sourceHeight,
                              final ImagePlacement input) {
        if (sourceWidth <= 0 || sourceHeight <= 0) {
            throw new IllegalArgumentException("source dimensions must be positive");
        }
        final ImagePlacement placement = input == null ? new ImagePlacement() : input;
        final String mode = "fill".equals(placement.getMode()) ? "fill" : "fit";
        final double focalX = clamp(finiteOr(placement.getFocalX(), 0.5), 0, 1);
        final double focalY = clamp(finiteOr(placement.getFocalY(), 0.5), 0, 1);
        final double rotation = normalizeAngle(placement.getRotation());
        final double radians = Math.toRadians(rotation);
        final double cos = Math.abs(Math.cos(radians)) < 1e-12 ? 0 : Math.abs(Math.cos(radians));
        final double sin = Math.abs(Math.sin(radians)) < 1e-12 ? 0 : Math.abs(Math.sin(radians));
        final double rotatedWidth = sourceWidth * cos + sourceHeight * sin;
        final double rotatedHeight = sourceWidth * sin + sourceHeight * cos;

        double targetWidth = rotatedWidth;
        double targetHeight = rotatedHeight;
        final Double ratio = placement.getTargetAspectRatio();
        if (ratio != null && Double.isFinite(ratio) && ratio > 0) {
            if (rotatedWidth / rotatedHeight > ratio) {
                targetWidth = rotatedHeight * ratio;
            } else {
                targetHeight = rotatedWidth / ratio;
            }
        }

        final double scale = "fill".equals(mode)
                ? Math.max(targetWidth / rotatedWidth, targetHeight / rotatedHeight)
                : Math.min(targetWidth / rotatedWidth, targetHeight / rotatedHeight);
        final double drawRotatedWidth = rotatedWidth * scale;
        final double drawRotatedHeight = rotatedHeight * scale;
        final double freeX = targetWidth - drawRotatedWidth;
        final double freeY = targetHeight - drawRotatedHeight;
        final double offsetX = zeroIfClose("fill".equals(mode) ? freeX * focalX : freeX / 2);
        final double offsetY = zeroIfClose("fill".equals(mode) ? freeY * focalY : freeY / 2);

        return new Geometry(
                sourceWidth, sourceHeight, rotatedWidth, rotatedHeight,
                targetWidth, targetHeight, sourceWidth * scale, sourceHeight * scale,
                offsetX, offsetY, scale, rotation, focalX, focalY, mode);
    }

    /** 按完整有向源图计算照片与成品尺寸。尺寸上限应用于放置后的照片区域。 */
    public OutputLayout calculateOutputLayout(final int sourceWidth, final int sourceHeight,
                                              final RenderRecipe recipe, final int maxWidth, final int maxHeight) {
        final Geometry geometry = calculate(sourceWidth, sourceHeight, recipe.getImagePlacement());
        final Dimension photo = ImageScaler.fitDimensions(
                targetPixels(geometry.targetWidth()), targetPixels(geometry.targetHeight()), maxWidth, maxHeight);
        final double pixelScale = maxWidth <= 0 && maxHeight <= 0 ? 1 : photo.width / geometry.targetWidth();
        final double decorationScale = BorderComposer.decorationScale(recipe, photo.width, photo.height, pixelScale);
        return new OutputLayout(geometry, photo, decorationScale, BorderComposer.insets(recipe.getBorder(), decorationScale));
    }

    /** 按计算结果绘制到目标图片区域；fit 留白使用传入边框色填充。 */
    public BufferedImage render(final BufferedImage source, final ImagePlacement placement,
                                final Color background) {
        if (source == null) {
            throw new IllegalArgumentException("source must not be null");
        }
        final Geometry geometry = calculate(source.getWidth(), source.getHeight(), placement);
        return render(source, geometry, targetPixels(geometry.targetWidth()), targetPixels(geometry.targetHeight()), background);
    }

    /** 一次完成放置与缩放，避免为限尺寸导出分配全尺寸的中间照片区域。 */
    public BufferedImage renderOutput(final BufferedImage source, final OutputLayout layout,
                                      final Color background) {
        final Geometry geometry = layout.geometry;
        final int baseWidth = targetPixels(geometry.targetWidth());
        final int baseHeight = targetPixels(geometry.targetHeight());
        final int width = layout.photoWidth();
        final int height = layout.photoHeight();
        final double drawnWidth = geometry.rotatedWidth() * geometry.scale() * width / baseWidth;
        final double drawnHeight = geometry.rotatedHeight() * geometry.scale() * height / baseHeight;
        // fit 缩到不足一像素时，直接绘制可能完全漏掉照片。保留原有的边缘混合，
        // 同时限制中间画布面积，避免旋转全景图时分配远大于源图的缓冲区。
        if ("fit".equals(geometry.mode()) && (width < baseWidth || height < baseHeight)
                && Math.min(drawnWidth, drawnHeight) < 1
                && (long) baseWidth * baseHeight <= (long) source.getWidth() * source.getHeight()) {
            return ImageScaler.scaleTo(render(source, geometry, baseWidth, baseHeight, background), width, height);
        }
        return render(source, geometry, width, height, background);
    }

    private BufferedImage render(final BufferedImage source, final Geometry geometry,
                                 final int width, final int height, final Color background) {
        final BufferedImage output = PixelBufferFactory.createLikeInSrgb(source, width, height);

        final Graphics2D graphics = output.createGraphics();
        try {
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION,
                    RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            graphics.setRenderingHint(RenderingHints.KEY_RENDERING,
                    RenderingHints.VALUE_RENDER_QUALITY);
            graphics.setColor(background == null ? Color.WHITE : background);
            graphics.fillRect(0, 0, width, height);
            graphics.clipRect(0, 0, width, height);

            final double scale = geometry.scale();
            final double drawRotatedWidth = geometry.rotatedWidth() * scale;
            final double drawRotatedHeight = geometry.rotatedHeight() * scale;
            final double centerX = geometry.offsetX() + (drawRotatedWidth / 2.0);
            final double centerY = geometry.offsetY() + (drawRotatedHeight / 2.0);
            final AffineTransform transform = new AffineTransform();
            transform.scale((double) width / targetPixels(geometry.targetWidth()),
                    (double) height / targetPixels(geometry.targetHeight()));
            transform.translate(centerX, centerY);
            transform.rotate(Math.toRadians(geometry.rotation()));
            transform.scale(scale, scale);
            transform.translate(-source.getWidth() / 2.0, -source.getHeight() / 2.0);
            graphics.drawImage(source, transform, null);
        } finally {
            graphics.dispose();
        }
        return output;
    }

    private static int targetPixels(final double size) {
        return Math.max(1, Math.toIntExact(Math.round(size)));
    }

    private static double normalizeAngle(final double value) {
        if (!Double.isFinite(value)) {
            return 0;
        }
        final double normalized = value % 360;
        return normalized < 0 ? normalized + 360 : normalized;
    }

    private static double finiteOr(final double value, final double fallback) {
        return Double.isFinite(value) ? value : fallback;
    }

    private static double clamp(final double value, final double min, final double max) {
        return Math.max(min, Math.min(max, value));
    }

    private static double zeroIfClose(final double value) {
        return Math.abs(value) < 1e-12 ? 0 : value;
    }
}
