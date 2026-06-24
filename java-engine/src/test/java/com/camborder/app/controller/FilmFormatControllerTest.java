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
        mockMvc.perform(get("/api/film-formats"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(8)))
                .andExpect(jsonPath("$[*].id", containsInAnyOrder(
                        "half-frame", "135", "645", "6x6", "6x7", "6x8", "6x9", "6x12")))
                .andExpect(jsonPath("$[*].label").isNotEmpty())
                .andExpect(jsonPath("$[*].aspectRatio").isNotEmpty());
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
