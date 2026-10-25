package com.camborder.app.controller;

import com.camborder.app.dto.CapabilitiesResponse;
import com.camborder.app.service.CapabilitiesService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 专业能力探测接口。 */
@RestController
@RequestMapping("/api")
public final class CapabilitiesController {

    private final CapabilitiesService capabilitiesService;

    public CapabilitiesController(final CapabilitiesService capabilitiesService) {
        this.capabilitiesService = capabilitiesService;
    }

    @GetMapping("/capabilities")
    public CapabilitiesResponse getCapabilities() {
        return capabilitiesService.snapshot();
    }
}
