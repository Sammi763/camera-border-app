package com.camborder.app.controller;

import com.camborder.app.dto.HealthResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 健康检查接口：GET /api/health。
 */
@RestController
@RequestMapping("/api/health")
public final class HealthController {

    @GetMapping
    public HealthResponse getHealth() {
        return new HealthResponse(
                "ok",
                "camera-border-engine",
                "0.1.0"
        );
    }
}
