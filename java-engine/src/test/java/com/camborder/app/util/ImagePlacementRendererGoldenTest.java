package com.camborder.app.util;

import com.camborder.app.model.ImagePlacement;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/**
 * Java 端使用与 Canvas 相同的 Stage 4 golden 输入，逐字段核对图片放置几何。
 * 测试从仓库根目录 fixtures/stage4 读取，不复制第二份期望值。
 */
final class ImagePlacementRendererGoldenTest {

    private static final String[] NUMERIC_FIELDS = {
            "sourceWidth", "sourceHeight", "rotatedWidth", "rotatedHeight",
            "targetWidth", "targetHeight", "drawWidth", "drawHeight",
            "offsetX", "offsetY", "scale"
    };

    private final ImagePlacementRenderer renderer = new ImagePlacementRenderer();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void matchesSharedGoldenMatrixFieldByField() throws Exception {
        JsonNode root = objectMapper.readTree(Files.readString(goldenPath()));
        assertThat(root.path("schema").asText()).isEqualTo("camera-border.stage4.geometry-golden.v1");
        JsonNode cases = root.path("cases");
        assertThat(cases.size()).isEqualTo(32);

        Set<String> modes = new HashSet<>();
        Set<Integer> rotations = new HashSet<>();
        Set<String> focalPoints = new HashSet<>();
        Set<String> targetRatios = new HashSet<>();
        for (JsonNode item : cases) {
            JsonNode placementNode = item.path("placement");
            String mode = placementNode.path("mode").asText();
            double focalX = placementNode.path("focalX").asDouble();
            double focalY = placementNode.path("focalY").asDouble();
            double rotation = placementNode.path("rotation").asDouble();
            modes.add(mode);
            rotations.add((int) rotation);
            focalPoints.add(focalX + "," + focalY);
            targetRatios.add(placementNode.get("targetAspectRatio").isNull()
                    ? "null" : Double.toString(placementNode.path("targetAspectRatio").asDouble()));

            ImagePlacement placement = objectMapper.treeToValue(placementNode, ImagePlacement.class);
            int sourceWidth = item.path("source").path("width").asInt();
            int sourceHeight = item.path("source").path("height").asInt();
            ImagePlacementRenderer.Geometry actual = renderer.calculate(sourceWidth, sourceHeight, placement);
            JsonNode expected = item.path("expected");
            for (String field : NUMERIC_FIELDS) {
                assertThat(value(actual, field))
                        .as(item.path("id").asText() + "." + field)
                        .isCloseTo(expected.path(field).asDouble(), within(1e-9));
            }
        }

        assertThat(modes).containsExactlyInAnyOrder("fit", "fill");
        assertThat(rotations).containsExactlyInAnyOrder(0, 90, 180, 270);
        assertThat(focalPoints).containsExactlyInAnyOrder("0.0,0.0", "0.5,0.5", "1.0,1.0");
        assertThat(targetRatios).containsExactlyInAnyOrder(
                "null", "1.0", Double.toString(4.0 / 3.0), Double.toString(16.0 / 9.0));
    }

    @Test
    void asymmetricFixtureKeepsQuadrantsOrientedForAllRightAngleRotations() throws Exception {
        Path fixture = Path.of("..", "fixtures", "stage4", "asymmetric-color.png").toAbsolutePath().normalize();
        BufferedImage source = ImageIO.read(fixture.toFile());
        assertThat(source).isNotNull();
        assertThat(source.getWidth()).isEqualTo(64);
        assertThat(source.getHeight()).isEqualTo(48);

        for (int rotation : new int[]{0, 90, 180, 270}) {
            BufferedImage result = renderer.render(
                    source,
                    new ImagePlacement("fit", 0.5, 0.5, rotation, null),
                    Color.WHITE);
            assertThat(result.getWidth()).as("rotation " + rotation).isEqualTo(rotation % 180 == 0 ? 64 : 48);
            assertThat(result.getHeight()).as("rotation " + rotation).isEqualTo(rotation % 180 == 0 ? 48 : 64);
            Color[] expected = expectedCorners(rotation);
            assertThat(new Color(result.getRGB(5, 5))).as("rotation " + rotation + " top-left").isEqualTo(expected[0]);
            assertThat(new Color(result.getRGB(result.getWidth() - 6, 5))).as("rotation " + rotation + " top-right").isEqualTo(expected[1]);
            assertThat(new Color(result.getRGB(5, result.getHeight() - 6))).as("rotation " + rotation + " bottom-left").isEqualTo(expected[2]);
            assertThat(new Color(result.getRGB(result.getWidth() - 6, result.getHeight() - 6))).as("rotation " + rotation + " bottom-right").isEqualTo(expected[3]);
        }
    }

    private static Path goldenPath() {
        return Path.of("..", "fixtures", "stage4", "geometry-golden.json").toAbsolutePath().normalize();
    }

    private static double value(ImagePlacementRenderer.Geometry geometry, String field) {
        switch (field) {
            case "sourceWidth": return geometry.sourceWidth();
            case "sourceHeight": return geometry.sourceHeight();
            case "rotatedWidth": return geometry.rotatedWidth();
            case "rotatedHeight": return geometry.rotatedHeight();
            case "targetWidth": return geometry.targetWidth();
            case "targetHeight": return geometry.targetHeight();
            case "drawWidth": return geometry.drawWidth();
            case "drawHeight": return geometry.drawHeight();
            case "offsetX": return geometry.offsetX();
            case "offsetY": return geometry.offsetY();
            case "scale": return geometry.scale();
            default: throw new IllegalArgumentException("unknown geometry field: " + field);
        }
    }

    private static Color[] expectedCorners(int rotation) {
        Color red = new Color(220, 35, 35);
        Color green = new Color(35, 180, 75);
        Color blue = new Color(35, 80, 220);
        Color yellow = new Color(245, 205, 40);
        switch (rotation) {
            case 0: return new Color[]{red, green, blue, yellow};
            case 90: return new Color[]{blue, red, yellow, green};
            case 180: return new Color[]{yellow, blue, green, red};
            case 270: return new Color[]{green, yellow, red, blue};
            default: throw new IllegalArgumentException("rotation must be a right angle");
        }
    }
}
