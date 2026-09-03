package com.camborder.app.util;

import com.camborder.app.model.ImagePlacement;
import org.junit.jupiter.api.Test;

import java.awt.Color;
import java.awt.image.BufferedImage;

import static org.assertj.core.api.Assertions.assertThat;

final class ImagePlacementRendererTest {

    private final ImagePlacementRenderer renderer = new ImagePlacementRenderer();

    @Test
    void fitUsesTargetAspectRatioWithoutCroppingTheSource() {
        BufferedImage source = solid(400, 200, Color.RED);
        ImagePlacement placement = new ImagePlacement("fit", 0.5, 0.5, 0, 1.0);

        BufferedImage result = renderer.render(source, placement, Color.WHITE);

        assertThat(result.getWidth()).isEqualTo(200);
        assertThat(result.getHeight()).isEqualTo(200);
        assertThat(result.getRGB(100, 10)).isEqualTo(Color.WHITE.getRGB());
        assertThat(result.getRGB(100, 100)).isEqualTo(Color.RED.getRGB());
    }

    @Test
    void fillUsesFocalPointForCropping() {
        BufferedImage source = solid(400, 200, Color.RED);
        ImagePlacement left = new ImagePlacement("fill", 0, 0.5, 0, 1.0);
        ImagePlacement right = new ImagePlacement("fill", 1, 0.5, 0, 1.0);

        ImagePlacementRenderer.Geometry leftGeometry = renderer.calculate(400, 200, left);
        ImagePlacementRenderer.Geometry rightGeometry = renderer.calculate(400, 200, right);

        assertThat(leftGeometry.targetWidth()).isEqualTo(200);
        assertThat(leftGeometry.offsetX()).isEqualTo(0);
        assertThat(rightGeometry.offsetX()).isEqualTo(-200);
        assertThat(renderer.render(source, right, Color.WHITE).getWidth()).isEqualTo(200);
    }

    @Test
    void rotationUsesRotatedBoundingBox() {
        ImagePlacement placement = new ImagePlacement("fit", 0.5, 0.5, 90, null);

        ImagePlacementRenderer.Geometry geometry = renderer.calculate(400, 200, placement);

        assertThat(geometry.rotatedWidth()).isEqualTo(200);
        assertThat(geometry.rotatedHeight()).isEqualTo(400);
        assertThat(geometry.targetWidth()).isEqualTo(200);
        assertThat(geometry.targetHeight()).isEqualTo(400);
    }

    private static BufferedImage solid(int width, int height, Color color) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                image.setRGB(x, y, color.getRGB());
            }
        }
        return image;
    }
}
