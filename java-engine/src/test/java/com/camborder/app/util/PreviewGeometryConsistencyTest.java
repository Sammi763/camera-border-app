package com.camborder.app.util;

import com.camborder.app.model.BorderConfig;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.model.TextItem;
import com.camborder.app.testsupport.AbstractControllerTest;
import org.junit.jupiter.api.Test;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/**
 * 预览与导出几何一致性测试（真实渲染管线，非 DTO 校验）。
 *
 * 配方像素语义（边框、字号）以全分辨率有向源图为基准；预览与档位导出把照片
 * 等比缩小时，所有装饰参数必须按同一比例缩放。本测试通过 /api/preview 全管线
 * 断言不同请求尺寸下「边框:照片」「文字:照片」比例不变，且与原图尺寸导出一致。
 */
final class PreviewGeometryConsistencyTest extends AbstractControllerTest {

    /** 找出照片区域（蓝色像素）的包围盒；边框背景为白色。 */
    private static Bounds blueBounds(final BufferedImage image) {
        int minX = Integer.MAX_VALUE;
        int maxX = Integer.MIN_VALUE;
        int minY = Integer.MAX_VALUE;
        int maxY = Integer.MIN_VALUE;
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                if (isBlue(image.getRGB(x, y))) {
                    minX = Math.min(minX, x);
                    maxX = Math.max(maxX, x);
                    minY = Math.min(minY, y);
                    maxY = Math.max(maxY, y);
                }
            }
        }
        return new Bounds(minX, minY, maxX, maxY);
    }

    /** 红色文字像素的包围盒宽度（排除浅色抗锯齿边缘，与现有测试同一阈值）。 */
    private static int redTextWidth(final BufferedImage image) {
        int minX = Integer.MAX_VALUE;
        int maxX = Integer.MIN_VALUE;
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                int pixel = image.getRGB(x, y);
                int red = (pixel >> 16) & 0xFF;
                int green = (pixel >> 8) & 0xFF;
                int blue = pixel & 0xFF;
                if (red > 150 && green < 100 && blue < 100) {
                    minX = Math.min(minX, x);
                    maxX = Math.max(maxX, x);
                }
            }
        }
        return maxX < minX ? 0 : maxX - minX + 1;
    }

    private static boolean isBlue(final int pixel) {
        final int red = (pixel >> 16) & 0xFF;
        final int green = (pixel >> 8) & 0xFF;
        final int blue = pixel & 0xFF;
        return blue > 150 && red < 100 && green < 100;
    }

    private static final class Bounds {
        final int minX;
        final int minY;
        final int maxX;
        final int maxY;

        Bounds(final int minX, final int minY, final int maxX, final int maxY) {
            this.minX = minX;
            this.minY = minY;
            this.maxX = maxX;
            this.maxY = maxY;
        }

        int width() { return maxX - minX + 1; }
    }

    /**
     * 同一配方在 330 / 165 预览与原图导出下，左边框占合成宽度比例一致。
     * 比例基准：left=30 / (600+30+30) = 0.0455。
     */
    @Test
    void previewKeepsBorderToCompositionRatioAcrossSizes() throws Exception {
        RenderRecipe recipe = new RenderRecipe(
                writeTempImage(600, 400, Color.BLUE),
                new BorderConfig(60, 60, 30, 30, "#FFFFFF"),
                Collections.emptyList(), null, false);

        BufferedImage export = readPng(requestPreviewPng(recipe, 0, 0));
        assertThat(export.getWidth()).isEqualTo(660);
        assertThat(export.getHeight()).isEqualTo(520);
        double exportRatio = 30.0 / export.getWidth();

        for (int maxWidth : new int[]{330, 165}) {
            BufferedImage preview = readPng(requestPreviewPng(recipe, maxWidth, maxWidth));
            Bounds photo = blueBounds(preview);
            assertThat(photo.width()).isGreaterThan(0);
            // 左边框宽度 = 照片左边缘（白色边框背景夹住蓝色照片）
            double previewLeftBorder = photo.minX;
            assertThat(previewLeftBorder / preview.getWidth())
                    .as("maxWidth=%s 左边框比例应与原图导出一致", maxWidth)
                    .isCloseTo(exportRatio, within(0.01));
            // 照片占合成宽度的比例同样必须与导出一致
            assertThat((double) photo.width() / preview.getWidth())
                    .as("maxWidth=%s 照片比例应与原图导出一致", maxWidth)
                    .isCloseTo(600.0 / 660.0, within(0.01));
        }
    }

    /** 竖图同样保持比例：400×600 源、下边框 90，预览与导出的下边框比例一致。 */
    @Test
    void previewKeepsBorderRatioForPortraitSource() throws Exception {
        RenderRecipe recipe = new RenderRecipe(
                writeTempImage(400, 600, Color.BLUE),
                new BorderConfig(30, 90, 20, 20, "#FFFFFF"),
                Collections.emptyList(), null, false);

        BufferedImage export = readPng(requestPreviewPng(recipe, 0, 0));
        assertThat(export.getHeight()).isEqualTo(600 + 30 + 90);
        double exportBottomRatio = 90.0 / export.getHeight();

        BufferedImage preview = readPng(requestPreviewPng(recipe, 300, 300));
        Bounds photo = blueBounds(preview);
        double previewBottomBorder = preview.getHeight() - 1 - photo.maxY;
        assertThat(previewBottomBorder / preview.getHeight())
                .isCloseTo(exportBottomRatio, within(0.01));
    }

    /**
     * 文字随预览比例缩放：fontSize=60 在 maxWidth 减半时文字宽度约为一半。
     * 字体度量与抗锯齿存在合理差异，使用 15% 容差。
     */
    @Test
    void textWidthScalesProportionallyWithPreviewSize() throws Exception {
        RenderRecipe recipe = new RenderRecipe(
                writeTempImage(600, 400, Color.BLUE),
                new BorderConfig(0, 90, 0, 0, "#FFFFFF"),
                Collections.singletonList(
                        new TextItem("MMMM", null, 60, "#FF0000", "border-bottom-center", 0, 0)),
                null, false);

        BufferedImage export = readPng(requestPreviewPng(recipe, 0, 0));
        int exportTextWidth = redTextWidth(export);
        assertThat(exportTextWidth).isGreaterThan(0);

        BufferedImage preview = readPng(requestPreviewPng(recipe, 300, 300));
        int previewTextWidth = redTextWidth(preview);
        assertThat(previewTextWidth).isGreaterThan(0);
        assertThat((double) previewTextWidth)
                .as("预览文字宽度应约为原图导出的一半")
                .isCloseTo(exportTextWidth / 2.0, within(exportTextWidth * 0.15));
    }

    /** 边框 insets 缩放的失败路径：非法比例（0/负数/NaN）回退为 1，不放大边框。 */
    @Test
    void insetsWithInvalidRenderScaleFallsBackToIdentity() {
        BorderConfig border = new BorderConfig(60, 60, 30, 30, "#FFFFFF");
        int[] identity = BorderComposer.insets(border);
        assertThat(BorderComposer.insets(border, Double.NaN)).isEqualTo(identity);
        assertThat(BorderComposer.insets(border, 0)).isEqualTo(identity);
        assertThat(BorderComposer.insets(border, -2)).isEqualTo(identity);
        assertThat(BorderComposer.insets(border, 0.5))
                .isEqualTo(new int[]{30, 30, 15, 15});
        // 比例放大（如未来支持放大预览）也不应被静默钳制到 1
        assertThat(BorderComposer.insets(border, 2.0))
                .isEqualTo(new int[]{120, 120, 60, 60});
        assertThat(BorderComposer.insets(null, 0.5)).isEqualTo(new int[]{0, 0, 0, 0});
    }
}
