package com.camborder.app.controller;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 开发期样片接口与本地开发 CORS 的测试。
 * 样片目录用临时目录注入（仓库 photos/ 目录被 .gitignore 忽略、CI 上不存在，
 * 测试不得依赖未入库资源）。
 */
@SpringBootTest
@AutoConfigureMockMvc
final class DevPhotoControllerTest {

    @TempDir
    static Path tempDir;

    @DynamicPropertySource
    static void registerPhotosDir(final DynamicPropertyRegistry registry) {
        registry.add("app.dev.photos-dir", () -> tempDir.toAbsolutePath().toString());
    }

    @BeforeAll
    static void populateSamples() throws IOException {
        // 生成一张最小的样片（服务仅按扩展名与文件类型过滤，不读内容）
        Files.writeString(tempDir.resolve("sample.jpg"), "stub");
    }

    @Autowired
    private MockMvc mockMvc;

    @Nested
    class DevPhotosEndpoint {

        @Test
        void shouldListPhotosWhenDirectoryHasImages() throws Exception {
            // 临时样片目录存在图片时能列出，结构为 photos[fileName/imagePath]
            mockMvc.perform(get("/api/dev/photos"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.photos").isArray())
                    .andExpect(jsonPath("$.photos[*].fileName").isNotEmpty())
                    .andExpect(jsonPath("$.photos[*].imagePath").isNotEmpty());
        }

        @Test
        void shouldReturnAbsolutePathForEachPhoto() throws Exception {
            // imagePath 应指向样片目录下的图片绝对路径
            mockMvc.perform(get("/api/dev/photos"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.photos[*].imagePath",
                            everyItem(containsString(tempDir.toAbsolutePath().toString()))));
        }
    }

    @Nested
    class DevCorsPolicy {

        @Test
        void shouldAllowLocalhost5174Origin() throws Exception {
            // 预检请求来自允许的 origin，应返回对应 CORS 头
            mockMvc.perform(options("/api/dev/photos")
                            .header("Origin", "http://localhost:5174")
                            .header("Access-Control-Request-Method", "GET"))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Access-Control-Allow-Origin",
                            "http://localhost:5174"));
        }

        @Test
        void shouldAllowLoopback1275174Origin() throws Exception {
            mockMvc.perform(options("/api/dev/photos")
                            .header("Origin", "http://127.0.0.1:5174")
                            .header("Access-Control-Request-Method", "GET"))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Access-Control-Allow-Origin",
                            "http://127.0.0.1:5174"));
        }

        @Test
        void shouldEchoAllowedMethodsForPreflight() throws Exception {
            mockMvc.perform(options("/api/dev/photos")
                            .header("Origin", "http://localhost:5174")
                            .header("Access-Control-Request-Method", "POST"))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Access-Control-Allow-Methods",
                            containsString("POST")));
        }

        @Test
        void shouldAttachCorsHeaderOnActualGet() throws Exception {
            // 真实 GET 请求带允许的 Origin 时也应回带 CORS 头
            mockMvc.perform(get("/api/dev/photos")
                            .header("Origin", "http://localhost:5174"))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Access-Control-Allow-Origin",
                            "http://localhost:5174"));
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
