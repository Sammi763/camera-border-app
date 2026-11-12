package com.camborder.app.controller;

import com.camborder.app.testsupport.AbstractControllerTest;
import org.junit.jupiter.api.Test;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** DELETE /api/film-requests/{clientId}：幂等取消与参数校验。 */
final class FilmRequestControllerTest extends AbstractControllerTest {

    @Test
    void cancelIsIdempotentAndReturnsNoContent() throws Exception {
        mockMvc.perform(delete("/api/film-requests/view_1").param("generation", "3"))
                .andExpect(status().isNoContent());
        mockMvc.perform(delete("/api/film-requests/view_1").param("generation", "3"))
                .andExpect(status().isNoContent());
        mockMvc.perform(delete("/api/film-requests/unknown_view"))
                .andExpect(status().isNoContent());
    }

    @Test
    void rejectsInvalidClientOrGeneration() throws Exception {
        mockMvc.perform(delete("/api/film-requests/bad client"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(delete("/api/film-requests/view_1").param("generation", "-1"))
                .andExpect(status().isBadRequest());
    }
}
