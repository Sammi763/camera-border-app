package com.camborder.app.controller;

import com.camborder.app.testsupport.AbstractControllerTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** FilmArchive 只读接口：注册、查询、空 body 与缺失目录。 */
final class FilmReferenceControllerTest extends AbstractControllerTest {

    @Test
    void registersAndQueriesLocalCatalog() throws Exception {
        final Path docs = Files.createDirectories(tempDir.resolve("Docs"));
        Files.writeString(docs.resolve("gold.pdf"), "gold");
        Files.writeString(tempDir.resolve("catalog.json"),
                "{\"schemaVersion\":1,\"generatedAt\":\"2026-10-27T17:18:49Z\","
                        + "\"documents\":[{\"manufacturer\":\"Kodak\",\"category\":\"Color Negative\","
                        + "\"product\":\"Gold 200\",\"title\":\"Gold data\",\"type\":\"Technical Data\","
                        + "\"path\":\"gold.pdf\","
                        + "\"sourceUrl\":\"https://www.kodakprofessional.com/gold\"}]}");

        mockMvc.perform(post("/api/film-reference-libraries")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"libraryPath\":" + objectMapper.writeValueAsString(tempDir.toString()) + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.upstream.commit").value("3001b382"))
                .andExpect(jsonPath("$.index.references").value(1));
        mockMvc.perform(get("/api/film-references").param("query", "Gold"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.references[0].title").value("Gold data"));
    }

    @Test
    void emptyAndMissingLibraryFailExplicitly() throws Exception {
        mockMvc.perform(post("/api/film-reference-libraries")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("FILM_REFERENCE_LIBRARY_INVALID"));
        mockMvc.perform(post("/api/film-reference-libraries")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"libraryPath\":\"/tmp/no-such-filmarchive\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("FILM_REFERENCE_LIBRARY_INVALID"));
    }
}
