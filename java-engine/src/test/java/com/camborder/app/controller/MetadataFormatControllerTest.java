package com.camborder.app.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 文本变量格式化接口 POST /api/metadata/format 的测试。
 */
@SpringBootTest
@AutoConfigureMockMvc
final class MetadataFormatControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void shouldReplaceAllVariables() throws Exception {
        String body = "{\"template\":\"{Camera} · {Lens} · {Film} · {Scanner} · {Lab}\","
                + "\"metadata\":{\"camera\":\"Leica M6\",\"lens\":\"Voigtlander 35mm F1.4\","
                + "\"film\":\"Kodak Portra 400\",\"scanner\":\"Noritsu HS-1800\",\"lab\":\"Local Lab\"}}";
        mockMvc.perform(post("/api/metadata/format")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.text").value("Leica M6 · Voigtlander 35mm F1.4 · Kodak Portra 400 · Noritsu HS-1800 · Local Lab"));
    }

    @Test
    void shouldCleanRedundantSeparatorsWhenValueMissing() throws Exception {
        // lens 缺失，不应出现 " ·  · "
        String body = "{\"template\":\"{Camera} · {Lens} · {Film}\","
                + "\"metadata\":{\"camera\":\"Leica M6\",\"film\":\"Kodak Portra 400\"}}";
        mockMvc.perform(post("/api/metadata/format")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.text").value("Leica M6 · Kodak Portra 400"));
    }

    @Test
    void shouldPreserveUnrecognizedVariables() throws Exception {
        String body = "{\"template\":\"{Camera} · {UnknownVar}\","
                + "\"metadata\":{\"camera\":\"Leica M6\"}}";
        mockMvc.perform(post("/api/metadata/format")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.text").value("Leica M6 · {UnknownVar}"));
    }

    @Test
    void shouldReturnEmptyStringForBlankTemplate() throws Exception {
        String body = "{\"template\":\"   \",\"metadata\":{\"camera\":\"Leica M6\"}}";
        mockMvc.perform(post("/api/metadata/format")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.text").value(""));
    }

    @Test
    void shouldReturnEmptyStringForNullTemplate() throws Exception {
        String body = "{\"template\":null,\"metadata\":{\"camera\":\"Leica M6\"}}";
        mockMvc.perform(post("/api/metadata/format")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.text").value(""));
    }

    @Test
    void shouldNotReturn500ForInvalidBody() throws Exception {
        mockMvc.perform(post("/api/metadata/format")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("invalid json"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void shouldHandleEmptyMetadata() throws Exception {
        String body = "{\"template\":\"{Camera} · {Lens}\",\"metadata\":{}}";
        mockMvc.perform(post("/api/metadata/format")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.text").value(""));
    }

    @Test
    void shouldHandleMetadataWithAllFields() throws Exception {
        String body = "{\"template\":\"{Camera} · {Lens} · {Film} · {Developer} · {Scanner} · {Lab} · {Location} · {RollName} · {FrameNumber}\","
                + "\"metadata\":{\"camera\":\"Leica M6\",\"lens\":\"Voigtlander 35mm F1.4\","
                + "\"film\":\"Kodak Portra 400\",\"developer\":\"C-41\",\"scanner\":\"Noritsu HS-1800\","
                + "\"lab\":\"Local Lab\",\"location\":\"Kyoto\",\"rollName\":\"2025-03 Kyoto\",\"frameNumber\":\"12\"}}";
        mockMvc.perform(post("/api/metadata/format")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.text").value(
                        "Leica M6 · Voigtlander 35mm F1.4 · Kodak Portra 400 · C-41 · Noritsu HS-1800 · Local Lab · Kyoto · 2025-03 Kyoto · 12"));
    }

    @Test
    void shouldPreserveNewlinesInTemplate() throws Exception {
        // 换行模板：每行一个变量，不应被压成一行
        String body = "{\"template\":\"{Camera}\\n{Lens}\\n{Film}\","
                + "\"metadata\":{\"camera\":\"Leica M6\",\"lens\":\"Voigtlander 35mm F1.4\","
                + "\"film\":\"Kodak Portra 400\"}}";
        mockMvc.perform(post("/api/metadata/format")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.text").value("Leica M6\nVoigtlander 35mm F1.4\nKodak Portra 400"));
    }

    @Test
    void shouldCleanSeparatorsPerLineInMultilineTemplate() throws Exception {
        // 多行模板中，缺失变量的分隔符清理不应跨行
        String body = "{\"template\":\"{Camera}\\n{Lens}\\n{Film}\","
                + "\"metadata\":{\"camera\":\"Leica M6\",\"film\":\"Kodak Portra 400\"}}";
        mockMvc.perform(post("/api/metadata/format")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.text").value("Leica M6\nKodak Portra 400"));
    }
}
