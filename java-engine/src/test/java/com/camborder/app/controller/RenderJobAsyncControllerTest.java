package com.camborder.app.controller;

import com.camborder.app.testsupport.AbstractControllerTest;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.nio.file.Files;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 异步导出任务契约测试。
 *
 * 这里固定 Stage 2 的 HTTP 行为：提交只接受不可变快照并立即返回 202；
 * 随后的 GET 才给出聚合进度、当前项和逐项结果。测试不依赖任务瞬时状态，
 * 因此在快机器与慢机器上都能稳定验证队列语义。
 */
final class RenderJobAsyncControllerTest extends AbstractControllerTest {

    @Test
    void shouldAcceptMultipleSnapshotsAndExposePerItemResults() throws Exception {
        String firstOutput = tempDir.resolve("async-first.png").toString();
        String secondOutput = tempDir.resolve("async-second.png").toString();
        String imagePath = writeTempImage();

        String body = objectMapper.writeValueAsString(Map.of(
                "items", List.of(
                        snapshot(imagePath, firstOutput),
                        snapshot(imagePath, secondOutput)
                )
        ));

        String acceptedBody = mockMvc.perform(post("/api/render-jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.jobId").isNotEmpty())
                .andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.items").isArray())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andReturn().getResponse().getContentAsString();

        String jobId = objectMapper.readTree(acceptedBody).path("jobId").asText();
        JsonNode completed = waitForTerminal(jobId);

        assertThat(completed.path("status").asText()).isEqualTo("completed");
        assertThat(completed.path("total").asInt()).isEqualTo(2);
        assertThat(completed.path("completed").asInt()).isEqualTo(2);
        assertThat(completed.path("failed").asInt()).isZero();
        assertThat(completed.path("items")).hasSize(2);
        assertThat(completed.path("items").get(0).path("status").asText()).isEqualTo("completed");
        assertThat(completed.path("items").get(1).path("status").asText()).isEqualTo("completed");
        assertThat(Files.exists(java.nio.file.Path.of(firstOutput))).isTrue();
        assertThat(Files.exists(java.nio.file.Path.of(secondOutput))).isTrue();
    }

    @Test
    void shouldRejectAnEmptySnapshotList() throws Exception {
        mockMvc.perform(post("/api/render-jobs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("items must contain at least one snapshot"));
    }

    @Test
    void shouldReturnNotFoundWhenCancellingAnUnknownJob() throws Exception {
        mockMvc.perform(delete("/api/render-jobs/no-such-job"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("job not found"));
    }

    private JsonNode waitForTerminal(final String jobId) throws Exception {
        for (int attempt = 0; attempt < 100; attempt++) {
            String response = mockMvc.perform(get("/api/render-jobs/" + jobId))
                    .andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString();
            JsonNode node = objectMapper.readTree(response);
            String currentStatus = node.path("status").asText();
            if ("completed".equals(currentStatus)
                    || "failed".equals(currentStatus)
                    || "cancelled".equals(currentStatus)) {
                return node;
            }
            Thread.sleep(10L);
        }
        throw new AssertionError("render job did not reach a terminal state");
    }

    private static Map<String, Object> snapshot(final String imagePath, final String outputPath) {
        return Map.of(
                "recipe", Map.of(
                        "imagePath", imagePath,
                        "texts", List.of(),
                        "autoCrop", false
                ),
                "export", Map.of(
                        "outputPath", outputPath,
                        "format", "png",
                        "jpegQuality", 95
                )
        );
    }
}
