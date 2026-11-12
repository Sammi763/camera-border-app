package com.camborder.app.util;

import com.camborder.app.model.BorderConfig;
import com.camborder.app.model.ImageProcessingConfig;
import com.camborder.app.model.RenderRecipe;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

final class FilmCompositorTest {
    private final FilmCompositor compositor = new FilmCompositor(new BorderStyleRenderer(), new TextRenderer(), new LogoRenderer(), new GradientPainter());
    @Test void textOverlayChangesGlyphsWithoutQuantizingTheRestOfThePhoto() {
        final FloatRgbImage photo = new FloatRgbImage(192,128);
        photo.fill(32001/65535f,32002/65535f,32003/65535f);
        final RenderRecipe recipe = new RenderRecipe("/unused", null,
                java.util.List.of(new com.camborder.app.model.TextItem("Film", "SansSerif",18,"#000000","image-top-left",4,4)),null,false);
        recipe.setImageProcessing(new ImageProcessingConfig());
        final java.awt.image.BufferedImage image=FilmOutputProfile.toLinearRec2020(compositor.compose(photo,recipe,0,0,false));
        int unchanged=0; int changed=0;
        for(int y=0;y<128;y++)for(int x=0;x<192;x++) {
            if(image.getRaster().getSample(x,y,0)==32001)unchanged++;else changed++;
        }
        assertThat(changed).isGreaterThan(0);
        assertThat(unchanged).isGreaterThan(192*128*8/10);
    }

    @Test void photosKeepSubEightBitPrecisionUnderBorderAndPlacement() {
        final FloatRgbImage photo = new FloatRgbImage(32, 2);
        for (int y=0;y<2;y++) for(int x=0;x<32;x++) for(int c=0;c<3;c++) photo.set(x,y,c,(32000+x)/65535f);
        final RenderRecipe recipe = new RenderRecipe("/unused", new BorderConfig(2,2,2,2,"#ffffff"), null, null, false);
        recipe.setImageProcessing(new ImageProcessingConfig());
        final FloatRgbImage rendered = compositor.compose(photo, recipe, 0, 0, false);
        final java.awt.image.BufferedImage encoded = FilmOutputProfile.toLinearRec2020(rendered);
        for (int x=0;x<32;x++) assertThat(encoded.getRaster().getSample(x+2,2,0)).isEqualTo(32000+x);
        assertThat(encoded.getRaster().getSample(0,0,0)).isEqualTo(65535);
        recipe.getImagePlacement().setRotation(90);
        final FloatRgbImage rotated = compositor.compose(photo, recipe,0,0,false);
        assertThat(rotated.getWidth()).isEqualTo(6);
        assertThat(rotated.getHeight()).isEqualTo(36);
        final FloatRgbImage borderless = compositor.compose(photo,recipe,0,0,true);
        assertThat(borderless.getWidth()).isEqualTo(2);
        assertThat(borderless.getHeight()).isEqualTo(32);
    }
    @Test void dimensionsMatchActualCompositionForCropStraightenPlacementScaleAndBorder() {
        final FloatRgbImage photo = new FloatRgbImage(113, 79);
        final RenderRecipe recipe = new RenderRecipe("/unused", new BorderConfig(3,7,11,5,"#ffffff"), null,null,false);
        final ImageProcessingConfig processing = new ImageProcessingConfig(); recipe.setImageProcessing(processing);
        final ImageProcessingConfig.SourceGeometry geometry = new ImageProcessingConfig.SourceGeometry();
        final ImageProcessingConfig.NormalizedCrop crop = new ImageProcessingConfig.NormalizedCrop();
        crop.setX(.1); crop.setY(.1); crop.setWidth(.7); crop.setHeight(.8); geometry.setCrop(crop); processing.setSourceGeometry(geometry);
        for (double angle : new double[]{0, 7.3, -12}) for (boolean borderless : new boolean[]{true,false}) {
            geometry.setRotationDegrees(angle); recipe.getImagePlacement().setRotation(90);
            recipe.getImagePlacement().setTargetAspectRatio(1.25);
            final int[] expected = compositor.dimensions(113,79,recipe,35,40,borderless);
            final FloatRgbImage actual = compositor.compose(photo,recipe,35,40,borderless);
            assertThat(expected).containsExactly(actual.getWidth(),actual.getHeight());
        }
    }

    @Test void profileHasLinearTrcD50WhiteAndWideGamutColorants() {
        final java.awt.color.ICC_ProfileRGB profile = (java.awt.color.ICC_ProfileRGB) java.awt.color.ICC_Profile.getInstance(FilmOutputProfile.linearRec2020());
        assertThat(profile.getGamma(0)).isEqualTo(1);
        final float[][] matrix = profile.getMatrix();
        // 独立参考：Rec.2020 经 Bradford 适配后的 D50 XYZ 列向量。
        assertThat(matrix[0][0]).isCloseTo(0.6735f, within(0.0003f));
        assertThat(matrix[1][1]).isCloseTo(0.6753f, within(0.0003f));
        assertThat(matrix[2][2]).isCloseTo(0.796844f, within(0.00003f));
        assertThat(matrix[0][0] + matrix[0][1] + matrix[0][2]).isCloseTo(0.9642f, within(0.00004f));
        assertThat(matrix[2][0] + matrix[2][1] + matrix[2][2]).isCloseTo(0.8249f, within(0.00004f));
        final float[] gray = new java.awt.color.ICC_ColorSpace(profile).toCIEXYZ(new float[]{0.5f,0.5f,0.5f});
        assertThat(gray[1]).isCloseTo(0.5f, within(0.001f));
    }
}
