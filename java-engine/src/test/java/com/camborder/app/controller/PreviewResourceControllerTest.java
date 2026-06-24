package com.camborder.app.controller;

import com.camborder.app.dto.PreviewRequest;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.testsupport.AbstractControllerTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 预览资源接口 GET /previews/{id} 的测试。
 */
final class PreviewResourceControllerTest extends AbstractControllerTest {

    @Test
    void shouldReturn404ForUnknownPreviewId() throws Exception {
        mockMvc.perform(get("/previews/does-not-exist"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("preview not found"));
    }

    @Test
    void shouldServeRealPreviewPngById() throws Exception {
        // 先生成一份预览，再按 previewUrl 取回真实 PNG 内容
        PreviewRequest request = new PreviewRequest(
                new RenderRecipe(writeTempImage(), null, null, null, false), 800, 600);
        String responseBody = mockMvc.perform(post("/api/preview")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        String previewUrl = objectMapper.readTree(responseBody).get("previewUrl").asText();

        mockMvc.perform(get(previewUrl))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_PNG));
    }
}
