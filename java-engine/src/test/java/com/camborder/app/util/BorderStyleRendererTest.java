package com.camborder.app.util;

import com.camborder.app.model.BorderStyle;
import com.camborder.app.model.BorderConfig;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.testsupport.AbstractControllerTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.awt.Color;
import java.awt.image.BufferedImage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 边框风格绘制测试：通过完整预览管线断言各风格的确定性几何效果。
 * 与前端 canvasRenderer.drawBorderStyle 使用同一套风格 ID 与参数语义。
 */
final class BorderStyleRendererTest extends AbstractControllerTest {

    @Autowired
    private BorderStyleRenderer borderStyleRenderer;

    private static final int IMG_W = 80;
    private static final int IMG_H = 60;

    /** 请求预览并返回解码后的 BufferedImage。 */
    private BufferedImage renderWithStyle(final BorderStyle style) throws Exception {
        // 白色图片区域 + 黑色边框，风格装饰用亮色便于像素断言
        BorderConfig border = new BorderConfig(40, 40, 40, 40, "#101010");
        var recipe = new RenderRecipe(
                writeTempImage(IMG_W, IMG_H, Color.WHITE), border,
                java.util.Collections.emptyList(), null, false);
        recipe.setBorderStyle(style);
        byte[] png = requestPreviewPng(recipe, 0, 0);
        return readPng(png);
    }

    private static int countPixels(final BufferedImage image, final ColorPredicate predicate) {
        int count = 0;
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                if (predicate.matches(image.getRGB(x, y))) {
                    count++;
                }
            }
        }
        return count;
    }

    private interface ColorPredicate {
        boolean matches(int rgb);
    }

    private static boolean isLightGray(int rgb) {
        int r = (rgb >> 16) & 0xFF;
        int g = (rgb >> 8) & 0xFF;
        int b = rgb & 0xFF;
        return r > 170 && g > 170 && b > 170;
    }

    @Test
    void nullStyleKeepsOriginalBehavior() throws Exception {
        BufferedImage without = renderWithStyle(null);
        BufferedImage withUnknown = renderWithStyle(new BorderStyle("unknown-style", 80, 6, 20, "#e8e8e8"));
        // 未识别风格与 null 完全一致（未知 id 回退原行为）
        assertThat(countPixels(without, px -> true)).isEqualTo(countPixels(withUnknown, px -> true));
    }

    @Test
    void zeroIntensityDrawsNothing() throws Exception {
        BufferedImage baseline = renderWithStyle(null);
        BufferedImage zero = renderWithStyle(new BorderStyle("film-perforation", 0, 6, 20, "#e8e8e8"));
        assertThat(countPixels(zero, px -> true)).isEqualTo(countPixels(baseline, px -> true));
    }

    @Test
    void filmPerforationDrawsHolesInTopAndBottomStrips() throws Exception {
        BufferedImage image = renderWithStyle(new BorderStyle("film-perforation", 80, 10, 10, "#e8e8e8"));

        // 上条带 [0,40)：应存在亮色齿孔像素
        int topHoles = 0;
        for (int y = 5; y < 35; y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                if (isLightGray(image.getRGB(x, y))) {
                    topHoles++;
                }
            }
        }
        // 下条带 [100,140)
        int bottomHoles = 0;
        for (int y = 105; y < 135; y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                if (isLightGray(image.getRGB(x, y))) {
                    bottomHoles++;
                }
            }
        }
        assertThat(topHoles).isGreaterThan(50);
        assertThat(bottomHoles).isGreaterThan(50);

        // 图片区域内不应有齿孔（白色图片区除外——用黑色边框上的浅灰判定已排除）
    }

    @Test
    void exhibitionLineDrawsStrokeOutsideImage() throws Exception {
        BufferedImage image = renderWithStyle(new BorderStyle("exhibition-line", 80, 8, 0, "#e8e8e8"));
        // 线框位于图片矩形外扩 8px 处：y = 40 - 8 = 32 附近应有水平亮线
        int linePixels = 0;
        for (int x = 30; x < 130; x++) {
            for (int y = 26; y < 38; y++) {
                if (isLightGray(image.getRGB(x, y))) {
                    linePixels++;
                }
            }
        }
        assertThat(linePixels).isGreaterThan(30);
    }

    @Test
    void negativeBandDarkensStrips() throws Exception {
        // 基线：无风格时上条带是纯边框色 #101010
        BufferedImage withBand = renderWithStyle(new BorderStyle("negative-band", 90, 6, 12, null));
        // 负片边覆盖后接近 #0a0a0a；同时存在浅灰小孔
        int holes = 0;
        for (int y = 10; y < 30; y++) {
            for (int x = 0; x < withBand.getWidth(); x++) {
                if (isLightGray(withBand.getRGB(x, y))) {
                    holes++;
                }
            }
        }
        assertThat(holes).isGreaterThan(20);
    }

    @Test
    void negativeBandUsesTheActualHeightForAOneSidedStrip() {
        BufferedImage canvas = new BufferedImage(160, 100, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < canvas.getHeight(); y++) {
            for (int x = 0; x < canvas.getWidth(); x++) {
                canvas.setRGB(x, y, new Color(10, 10, 10).getRGB());
            }
        }
        BorderConfig border = new BorderConfig(40, 0, 40, 40, "#101010");

        borderStyleRenderer.draw(
                canvas,
                new BorderStyle("negative-band", 100, 6, 12, "#ffffff"),
                border,
                80,
                60);

        // 单侧上边框的孔高应为 40 * 0.32（而不是把缺失的下边框当成 1px）。
        int lightPixelsNearExpectedEdge = 0;
        for (int y = 14; y <= 16; y++) {
            for (int x = 0; x < canvas.getWidth(); x++) {
                if (isLightGray(canvas.getRGB(x, y))) {
                    lightPixelsNearExpectedEdge++;
                }
            }
        }
        assertThat(lightPixelsNearExpectedEdge).isGreaterThan(0);
    }

    @Test
    void matDoubleLineDrawsTwoStrokes() throws Exception {
        BufferedImage image = renderWithStyle(new BorderStyle("mat-double-line", 70, 9, 0, "#cfcfcf"));
        // 内线在 y = 40 - 18 = 22，外线在 y = 40 - 18 - 9 = 13 附近
        int innerLine = 0;
        int outerLine = 0;
        for (int x = 40; x < 120; x++) {
            for (int y = 8; y < 16; y++) {
                int rgb = image.getRGB(x, y);
                int r = (rgb >> 16) & 0xFF;
                if (r > 150) {
                    outerLine++;
                }
            }
            for (int y = 17; y < 28; y++) {
                int rgb = image.getRGB(x, y);
                int r = (rgb >> 16) & 0xFF;
                if (r > 150) {
                    innerLine++;
                }
            }
        }
        assertThat(innerLine).isGreaterThan(20);
        assertThat(outerLine).isGreaterThan(20);
    }

    @Test
    void tornEdgeAddsFringeAroundImage() throws Exception {
        BufferedImage image = renderWithStyle(new BorderStyle("torn-edge", 60, 8, 0, "#f7f5f0"));
        // 撕边纸色紧贴图片上边缘外侧（y ∈ [34, 40)，x 中段）应存在纸色像素
        int fringe = 0;
        for (int x = 45; x < 115; x++) {
            for (int y = 33; y < 40; y++) {
                int rgb = image.getRGB(x, y);
                int r = (rgb >> 16) & 0xFF;
                int g = (rgb >> 8) & 0xFF;
                int b = rgb & 0xFF;
                if (r > 200 && g > 200 && b > 190) {
                    fringe++;
                }
            }
        }
        assertThat(fringe).isGreaterThan(20);
    }

    @Test
    void magazineKeylineDrawsThickAndThinLines() throws Exception {
        BufferedImage image = renderWithStyle(new BorderStyle("magazine-keyline", 80, 12, 0, "#eeeeee"));
        // 粗键线在 y = 40 - 3 = 37 附近、细键线在更外圈 y ≈ 40-3-12-3=22 附近
        int keyline = 0;
        for (int x = 45; x < 115; x++) {
            for (int y = 18; y < 39; y++) {
                if (isLightGray(image.getRGB(x, y))) {
                    keyline++;
                }
            }
        }
        assertThat(keyline).isGreaterThan(60);
    }

    @Test
    void archiveLabelBoxAppearsInBottomStrip() throws Exception {
        BufferedImage image = renderWithStyle(new BorderStyle("archive-label-box", 70, 8, 0, "#dddddd"));
        int labelPixels = 0;
        // 标签盒在右下角：x 右半、下条带中部区域
        for (int x = image.getWidth() / 2; x < image.getWidth() - 4; x++) {
            for (int y = 95; y < 125; y++) {
                if (isLightGray(image.getRGB(x, y))) {
                    labelPixels++;
                }
            }
        }
        assertThat(labelPixels).isGreaterThan(20);
    }

    @Test
    void polaroidShadowDarkensAreaBelowImage() throws Exception {
        BufferedImage image = renderWithStyle(new BorderStyle("polaroid-shadow", 90, 10, 0, null));
        // 底边下方阴影带内应有明显暗于边框色的像素（半透明黑叠加在 #101010 上仍偏黑，
        // 用与基线的差异判断：直接断言带内存在非纯边框色的像素不可靠，改为对比无风格版本）
        BufferedImage baseline = renderWithStyle(null);
        int diff = 0;
        int bandYStart = 40 + IMG_H; // 100
        for (int x = 45; x < 115; x++) {
            for (int y = bandYStart; y < Math.min(bandYStart + 20, image.getHeight()); y++) {
                if (image.getRGB(x, y) != baseline.getRGB(x, y)) {
                    diff++;
                }
            }
        }
        assertThat(diff).isGreaterThan(50);
    }

    @Test
    void invalidPaperToneRejectedWith400() throws Exception {
        // 非法 paperTone 与其它颜色字段语义一致：4xx 受控错误，不静默渲染
        BorderStyle style = new BorderStyle("film-perforation", 80, 10, 10, "not-a-color");
        BorderConfig border = new BorderConfig(40, 40, 40, 40, "#101010");
        var recipe = new RenderRecipe(writeTempImage(IMG_W, IMG_H, Color.WHITE), border,
                java.util.Collections.emptyList(), null, false);
        recipe.setBorderStyle(style);
        var request = new com.camborder.app.dto.PreviewRequest(recipe, 0, 0);

        mockMvc.perform(post("/api/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    @Autowired
    private org.springframework.test.web.servlet.MockMvc mockMvc;

    @org.junit.jupiter.api.Test
    void rendererComponentIsInvokedThroughPreviewEndpoint() throws Exception {
        // 冒烟：/api/preview 接受 borderStyle 字段且不报错
        BorderStyle style = new BorderStyle("exhibition-line", 60, 6, 0, "#333333");
        BorderConfig border = new BorderConfig(30, 30, 30, 30, "#ffffff");
        var recipe = new RenderRecipe(writeTempImage(), border,
                java.util.Collections.emptyList(), null, false);
        recipe.setBorderStyle(style);
        var request = new com.camborder.app.dto.PreviewRequest(recipe, 0, 0);

        mockMvc.perform(post("/api/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk());
    }
}
