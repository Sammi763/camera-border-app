package com.camborder.app.controller;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 开发期样片接口与本地开发 CORS 的测试（默认配置，使用仓库真实 photos/ 目录）。
 */
@SpringBootTest
@AutoConfigureMockMvc
final class DevPhotoControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Nested
    class DevPhotosEndpoint {

        @Test
        void shouldListPhotosWhenDirectoryHasImages() throws Exception {
            // 真实仓库根目录存在 photos/ 样片时能列出图片，结构为 photos[fileName/imagePath]
            mockMvc.perform(get("/api/dev/photos"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.photos").isArray())
                    .andExpect(jsonPath("$.photos[*].fileName").isNotEmpty())
                    .andExpect(jsonPath("$.photos[*].imagePath").isNotEmpty());
        }

        @Test
        void shouldReturnAbsolutePathForEachPhoto() throws Exception {
            // imagePath 应指向 .../photos/ 下的图片
            mockMvc.perform(get("/api/dev/photos"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.photos[*].imagePath",
                            everyItem(containsString("photos/"))));
        }
    }

    @Nested
    class DevCorsPolicy {

        @Test
        void shouldAllowLocalhost5173Origin() throws Exception {
            // 预检请求来自允许的 origin，应返回对应 CORS 头
            mockMvc.perform(options("/api/dev/photos")
                            .header("Origin", "http://localhost:5173")
                            .header("Access-Control-Request-Method", "GET"))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Access-Control-Allow-Origin",
                            "http://localhost:5173"));
        }

        @Test
        void shouldAllowLoopback1275173Origin() throws Exception {
            mockMvc.perform(options("/api/dev/photos")
                            .header("Origin", "http://127.0.0.1:5173")
                            .header("Access-Control-Request-Method", "GET"))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Access-Control-Allow-Origin",
                            "http://127.0.0.1:5173"));
        }

        @Test
        void shouldEchoAllowedMethodsForPreflight() throws Exception {
            mockMvc.perform(options("/api/dev/photos")
                            .header("Origin", "http://localhost:5173")
                            .header("Access-Control-Request-Method", "POST"))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Access-Control-Allow-Methods",
                            containsString("POST")));
        }

        @Test
        void shouldAttachCorsHeaderOnActualGet() throws Exception {
            // 真实 GET 请求带允许的 Origin 时也应回带 CORS 头
            mockMvc.perform(get("/api/dev/photos")
                            .header("Origin", "http://localhost:5173"))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Access-Control-Allow-Origin",
                            "http://localhost:5173"));
        }

        @Test
        void shouldRejectDisallowedOrigin() throws Exception {
            // 非允许的 origin 不应回带允许头
            mockMvc.perform(options("/api/dev/photos")
                            .header("Origin", "http://evil.example.com")
                            .header("Access-Control-Request-Method", "GET"))
                    .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
        }
    }
}
