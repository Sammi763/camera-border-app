package com.camborder.app.controller;

import com.camborder.app.testsupport.AbstractControllerTest;
import org.junit.jupiter.api.Test;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 阶段缓存诊断接口只读返回预算和命中计数。 */
final class FilmStageCacheControllerTest extends AbstractControllerTest {

    @Test
    void exposesBudgetAndCacheCounters() throws Exception {
        mockMvc.perform(get("/api/film-stage-cache"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").isBoolean())
                .andExpect(jsonPath("$.cacheBytes").isNumber())
                .andExpect(jsonPath("$.cacheMaxBytes").isNumber())
                .andExpect(jsonPath("$.hits").isNumber())
                .andExpect(jsonPath("$.misses").isNumber())
                .andExpect(jsonPath("$.hitRate").isNumber())
                .andExpect(jsonPath("$.budgetTotalBytes").isNumber())
                .andExpect(jsonPath("$.budgetJavaBytes").isNumber())
                .andExpect(jsonPath("$.idleMillis").isNumber());
    }
}
