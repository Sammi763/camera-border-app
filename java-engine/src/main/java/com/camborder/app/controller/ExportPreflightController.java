package com.camborder.app.controller;

import com.camborder.app.dto.ExportPreflightResponse;
import com.camborder.app.dto.RenderJobRequest;
import com.camborder.app.service.ExportPreflightService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 导出前只读预检接口。 */
@RestController
@RequestMapping("/api")
public final class ExportPreflightController {

    private final ExportPreflightService preflightService;

    public ExportPreflightController(final ExportPreflightService preflightService) {
        this.preflightService = preflightService;
    }

    @PostMapping("/export-preflight")
    public ResponseEntity<ExportPreflightResponse> preflight(@RequestBody final RenderJobRequest request) {
        return ResponseEntity.ok(preflightService.preflight(request));
    }
}
