package com.camborder.app.controller;

import org.junit.jupiter.api.BeforeAll;
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

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 用一个临时 photos 目录覆盖默认解析，稳定验证「目录存在且有图片」与「过滤非图片」的行为。
 */
@SpringBootTest
@AutoConfigureMockMvc
final class DevPhotoDirectoryResolutionTest {

    @TempDir
    static Path tempDir;

    @DynamicPropertySource
    static void registerPhotosDir(final DynamicPropertyRegistry registry) {
        registry.add("app.dev.photos-dir", () -> tempDir.toAbsolutePath().toString());
    }

    @Autowired
    private MockMvc mockMvc;

    @BeforeAll
    static void populateSamples() throws IOException {
        // 支持的扩展名：jpg、tif
        Files.writeString(tempDir.resolve("sample.jpg"), "stub");
        Files.writeString(tempDir.resolve("sample.tif"), "stub");
        // 大小写不区分
        Files.writeString(tempDir.resolve("UPPER.JPEG"), "stub");
        // 非图片应被过滤
        Files.writeString(tempDir.resolve("readme.txt"), "stub");
        Files.writeString(tempDir.resolve("notes.md"), "stub");
    }

    @Test
    void shouldListOnlySupportedImages() throws Exception {
        mockMvc.perform(get("/api/dev/photos"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.photos", hasSize(3)))
                .andExpect(jsonPath("$.photos[*].fileName",
                        containsInAnyOrder("sample.jpg", "sample.tif", "UPPER.JPEG")));
    }

    @Test
    void shouldExposeAbsolutePathInImagePath() throws Exception {
        mockMvc.perform(get("/api/dev/photos"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.photos[*].imagePath",
                        org.hamcrest.Matchers.everyItem(
                                org.hamcrest.Matchers.containsString(tempDir.getFileName().toString()))));
    }
}
