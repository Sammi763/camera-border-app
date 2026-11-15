package com.camborder.app.controller;

import com.camborder.app.testsupport.AbstractControllerTest;
import org.junit.jupiter.api.Test;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 随包资料索引：只读、断网可用、不是校色配置。 */
final class FilmReferenceIndexControllerTest extends AbstractControllerTest {

    @Test
    void servesPackagedResearchIndex() throws Exception {
        mockMvc.perform(get("/api/film-reference-index"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.schemaVersion").isNumber())
                .andExpect(jsonPath("$.purpose").isNotEmpty())
                .andExpect(jsonPath("$.films").isArray())
                .andExpect(jsonPath("$.characteristicCurveDatasets.length()").value(4))
                .andExpect(jsonPath("$.characteristicCurveDatasets[0].modelReady").value(false))
                .andExpect(jsonPath("$.characteristicCurveDatasets[0].axis.y").value("Status M optical density"));
    }
}
