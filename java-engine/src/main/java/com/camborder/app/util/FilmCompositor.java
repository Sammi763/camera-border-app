package com.camborder.app.util;

import com.camborder.app.model.RenderRecipe;
import org.springframework.stereotype.Component;
import java.awt.image.BufferedImage;

/** 预览和导出共用浮点合成；Java2D 仅生成装饰层，不接触照片像素。 */
@Component
public final class FilmCompositor {
    private final BorderStyleRenderer styles;
    private final TextRenderer texts;
    private final LogoRenderer logos;
    private final GradientPainter gradients;

    public FilmCompositor(final BorderStyleRenderer styles, final TextRenderer texts,
                          final LogoRenderer logos, final GradientPainter gradients) {
        this.styles = styles; this.texts = texts; this.logos = logos; this.gradients = gradients;
    }

    /** 仅计算尺寸，不分配全幅缓冲；与 compose 共用几何及边距计算。 */
    public int[] dimensions(final int width, final int height, final RenderRecipe recipe,
                            final int maxWidth, final int maxHeight, final boolean borderless) {
        final int[] bounds = FloatImageOps.sourceGeometryBounds(width, height,
                recipe.getImageProcessing().getSourceGeometry());
        final ImagePlacementRenderer.Geometry placed = new ImagePlacementRenderer()
                .calculate(bounds[4], bounds[5], recipe.getImagePlacement());
        final int fullWidth = Math.max(1, (int) Math.round(placed.targetWidth()));
        final int fullHeight = Math.max(1, (int) Math.round(placed.targetHeight()));
        double scale = 1;
        if (maxWidth > 0) scale = Math.min(scale, (double) maxWidth / fullWidth);
        if (maxHeight > 0) scale = Math.min(scale, (double) maxHeight / fullHeight);
        final int fittedWidth = Math.max(1, (int) Math.round(fullWidth * scale));
        final int fittedHeight = Math.max(1, (int) Math.round(fullHeight * scale));
        final int[] margins = borderless ? new int[4] : BorderComposer.insets(recipe.getBorder(), (double) fittedWidth / fullWidth);
        return new int[]{Math.addExact(fittedWidth, Math.addExact(margins[2], margins[3])),
                Math.addExact(fittedHeight, Math.addExact(margins[0], margins[1]))};
    }

    public FloatRgbImage compose(final FloatRgbImage input, final RenderRecipe recipe,
                                 final int maxWidth, final int maxHeight, final boolean borderless) {
        FloatRgbImage photo = FloatImageOps.sourceGeometry(input, recipe.getImageProcessing().getSourceGeometry());
        final java.awt.Color color = ColorParser.parse(recipe.getBorder() == null ? null : recipe.getBorder().getColor(), "#ffffff");
        photo = FloatImageOps.place(photo, recipe.getImagePlacement(), color);
        if (borderless) return FloatImageOps.fitWithin(photo, maxWidth, maxHeight);
        final int fullWidth = photo.getWidth();
        photo = FloatImageOps.fitWithin(photo, maxWidth, maxHeight);
        final double scale = (double) photo.getWidth() / fullWidth;
        final int[] margins = BorderComposer.insets(recipe.getBorder(), scale);
        final int width = Math.addExact(photo.getWidth(), Math.addExact(margins[2], margins[3]));
        final int height = Math.addExact(photo.getHeight(), Math.addExact(margins[0], margins[1]));
        if ((long) width * height > 200_000_000L) throw new IllegalArgumentException("合成画布超过像素上限");
        final FloatRgbImage canvas = new FloatRgbImage(width, height);
        if (recipe.getGradient() != null && recipe.getGradient().isEnabled()) {
            FloatImageOps.compositeOverInPlace(canvas, gradients.paint(recipe.getGradient(), width, height));
        } else {
            final float[] srgb = {(float) FilmColorSpace.encodedSrgbToLinear(color.getRed()/255.0),
                    (float) FilmColorSpace.encodedSrgbToLinear(color.getGreen()/255.0),
                    (float) FilmColorSpace.encodedSrgbToLinear(color.getBlue()/255.0)};
            final float[] rgb = new float[3]; FilmColorSpace.linearSrgbToRec2020(srgb, rgb);
            canvas.fill(rgb[0], rgb[1], rgb[2]);
        }
        for (int y = 0; y < photo.getHeight(); y++) {
            FilmRequestGuard.check();
            System.arraycopy(photo.getRgb(), y * photo.getWidth() * 3, canvas.getRgb(),
                    ((y + margins[0]) * width + margins[2]) * 3, photo.getWidth() * 3);
        }
        if (recipe.getBorderStyle() == null && (recipe.getTexts() == null || recipe.getTexts().isEmpty())
                && (recipe.getLogo() == null || !recipe.getLogo().isEnabled())) return canvas;
        final BufferedImage decorations = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        styles.draw(decorations, recipe.getBorderStyle(), recipe.getBorder(), photo.getWidth(), photo.getHeight(), scale);
        texts.draw(decorations, recipe.getTexts(), recipe.getBorder(), photo.getWidth(), photo.getHeight(), scale);
        logos.draw(decorations, recipe.getLogo(), recipe.getBorder(), scale);
        return FloatImageOps.compositeOverInPlace(canvas, decorations);
    }
}
