package com.camborder.app.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 画幅默认值接口 GET /api/film-formats 的测试。
 */
@SpringBootTest
@AutoConfigureMockMvc
final class FilmFormatControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void shouldReturnAllFilmFormats() throws Exception {
        // 契约：半格、135、645、6x6、6x7、6x8、6x9、6x10、6x12（6x10 新增，6x12 保留）
        mockMvc.perform(get("/api/film-formats"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(9)))
                .andExpect(jsonPath("$[*].id", containsInAnyOrder(
                        "half-frame", "135", "645", "6x6", "6x7", "6x8", "6x9", "6x10", "6x12")))
                .andExpect(jsonPath("$[*].label").isNotEmpty())
                .andExpect(jsonPath("$[*].aspectRatio").isNotEmpty());
    }

    @Test
    void shouldKeep6x10And6x12() throws Exception {
        // 6x10 是新增画幅，6x12 必须保留且不被替换/改名
        mockMvc.perform(get("/api/film-formats"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='6x10')].label").value("6×10"))
                .andExpect(jsonPath("$[?(@.id=='6x10')].aspectRatio").value("100:56"))
                .andExpect(jsonPath("$[?(@.id=='6x12')].label").value("6×12"))
                .andExpect(jsonPath("$[?(@.id=='6x12')].aspectRatio").value("120:56"));
    }

    @Test
    void shouldReturnRecommendedBorderForEachFormat() throws Exception {
        // 每个画幅都应附带 recommendedBorder，且字段齐全
        mockMvc.perform(get("/api/film-formats"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].recommendedBorder.top").isNotEmpty())
                .andExpect(jsonPath("$[*].recommendedBorder.bottom").isNotEmpty())
                .andExpect(jsonPath("$[*].recommendedBorder.left").isNotEmpty())
                .andExpect(jsonPath("$[*].recommendedBorder.right").isNotEmpty());
    }
}
