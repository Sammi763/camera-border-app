package com.camborder.app.service;

import com.camborder.app.dto.ExportPreflightResponse;
import com.camborder.app.dto.RenderJobRequest;

public interface ExportPreflightService {
    ExportPreflightResponse preflight(RenderJobRequest request);
}
