package com.camborder.app.testsupport;

import com.camborder.app.dto.PreviewRequest;
import com.camborder.app.model.RenderRecipe;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 控制器测试共享基类。
 * 提供加载完整 Spring 上下文、MockMvc、临时目录，以及预览/图片相关的公共辅助方法，
 * 供按业务域拆分后的各控制器测试复用，避免重复样板代码。
 */
@SpringBootTest
@AutoConfigureMockMvc
public abstract class AbstractControllerTest {

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected ObjectMapper objectMapper;

    @TempDir
    protected Path tempDir;

    /**
     * 一个最小但可解析的配方，用于只关心校验逻辑、不关心真实渲染的用例。
     */
    protected RenderRecipe minimalRecipe() {
        return new RenderRecipe("/images/photo.jpg", null, null, null, false);
    }

    /**
     * 生成一张真实的本地 PNG 图片用于预览/导出测试，返回其绝对路径。
     */
    protected String writeTempImage() throws IOException {
        return writeTempImage(40, 30, Color.BLUE);
    }

    /**
     * 生成指定尺寸和背景色的本地 PNG 图片用于预览/导出测试，返回其绝对路径。
     */
    protected String writeTempImage(final int width, final int height, final Color background)
            throws IOException {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = image.createGraphics();
        try {
            graphics.setColor(background);
            graphics.fillRect(0, 0, width, height);
        } finally {
            graphics.dispose();
        }
        Path file = tempDir.resolve("photo-" + width + "x" + height + ".png");
        ImageIO.write(image, "png", file.toFile());
        return file.toAbsolutePath().toString();
    }

    /**
     * 调用 /api/preview 并返回生成的预览图 PNG 字节。
     */
    protected byte[] requestPreviewPng(final RenderRecipe recipe, final int maxWidth, final int maxHeight)
            throws Exception {
        PreviewRequest request = new PreviewRequest(recipe, maxWidth, maxHeight);
        String responseBody = mockMvc.perform(post("/api/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        String previewUrl = objectMapper.readTree(responseBody).get("previewUrl").asText();
        return mockMvc.perform(get(previewUrl))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_PNG))
                .andReturn().getResponse().getContentAsByteArray();
    }

    /**
     * 判断图片中是否存在偏红色的像素，用于断言文字确实被绘制。
     */
    protected boolean containsRedPixel(final BufferedImage image) {
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                int pixel = image.getRGB(x, y);
                int red = (pixel >> 16) & 0xFF;
                int green = (pixel >> 8) & 0xFF;
                int blue = pixel & 0xFF;
                if (red > 150 && green < 100 && blue < 100) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * 收集图片中所有「核心红色」像素（排除浅色抗锯齿边缘）的 y 坐标，
     * 用于断言文字落在哪个区域（图片区域 / 边框区域）。
     */
    protected List<Integer> redPixelYs(final BufferedImage image) {
        List<Integer> ys = new ArrayList<>();
        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                int pixel = image.getRGB(x, y);
                int red = (pixel >> 16) & 0xFF;
                int green = (pixel >> 8) & 0xFF;
                int blue = pixel & 0xFF;
                if (red > 150 && green < 100 && blue < 100) {
                    ys.add(y);
                }
            }
        }
        return ys;
    }

    /**
     * 从 PNG 字节解码为 BufferedImage，便于断言像素与尺寸。
     */
    protected BufferedImage readPng(final byte[] png) throws IOException {
        return ImageIO.read(new ByteArrayInputStream(png));
    }

    /**
     * 提交一个导出任务，返回状态响应里的 outputPath（指向真实文件）。
     * 复用 POST /api/render-jobs + GET /api/render-jobs/{jobId} 的标准链路。
     */
    protected String submitExport(final com.camborder.app.dto.RenderJobRequest request)
            throws Exception {
        String responseBody = mockMvc.perform(post("/api/render-jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isAccepted())
                .andReturn().getResponse().getContentAsString();

        String jobId = objectMapper.readTree(responseBody).get("jobId").asText();

        String statusBody = mockMvc.perform(get("/api/render-jobs/" + jobId))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        return objectMapper.readTree(statusBody).get("outputPath").asText();
    }
}
