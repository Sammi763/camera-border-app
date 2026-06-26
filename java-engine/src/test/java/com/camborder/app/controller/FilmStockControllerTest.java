package com.camborder.app.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 内置胶片库接口 GET /api/assets/film-stocks 的测试。
 */
@SpringBootTest
@AutoConfigureMockMvc
final class FilmStockControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void shouldReturnAtLeast15FilmStocks() throws Exception {
        mockMvc.perform(get("/api/assets/film-stocks"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(greaterThanOrEqualTo(15))));
    }

    @Test
    void shouldContainKodakPortra400() throws Exception {
        mockMvc.perform(get("/api/assets/film-stocks"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == 'kodak-portra-400')].name").value("Portra 400"))
                .andExpect(jsonPath("$[?(@.id == 'kodak-portra-400')].brand").value("Kodak"))
                .andExpect(jsonPath("$[?(@.id == 'kodak-portra-400')].iso").value(400));
    }

    @Test
    void shouldReturnSortedByBrandAndIso() throws Exception {
        mockMvc.perform(get("/api/assets/film-stocks"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].brand").value("CineStill"))
                .andExpect(jsonPath("$[0].iso").value(400))
                .andExpect(jsonPath("$[1].brand").value("CineStill"))
                .andExpect(jsonPath("$[1].iso").value(800));
    }

    @Test
    void shouldIncludeRequiredFields() throws Exception {
        mockMvc.perform(get("/api/assets/film-stocks"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").isNotEmpty())
                .andExpect(jsonPath("$[0].brand").isNotEmpty())
                .andExpect(jsonPath("$[0].name").isNotEmpty())
                .andExpect(jsonPath("$[0].iso").isNumber())
                .andExpect(jsonPath("$[0].type").isNotEmpty())
                .andExpect(jsonPath("$[0].colorProfile").isNotEmpty())
                .andExpect(jsonPath("$[0].discontinued").isBoolean());
    }
}
