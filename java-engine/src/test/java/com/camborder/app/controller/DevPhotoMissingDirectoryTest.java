package com.camborder.app.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.empty;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 当 photos 目录不存在时，接口应返回空数组而非 500。
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "app.dev.photos-dir=/no/such/camborder/photos-dir-9f3a")
final class DevPhotoMissingDirectoryTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void shouldReturnEmptyArrayWhenPhotosDirectoryMissing() throws Exception {
        mockMvc.perform(get("/api/dev/photos"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.photos").isArray())
                .andExpect(jsonPath("$.photos", empty()));
    }
}
