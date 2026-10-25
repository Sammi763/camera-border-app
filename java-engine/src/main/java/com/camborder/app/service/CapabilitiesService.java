package com.camborder.app.service;

import com.camborder.app.dto.CapabilitiesResponse;

/** 返回当前本地引擎的真实能力，不做静态乐观声明。 */
public interface CapabilitiesService {
    CapabilitiesResponse snapshot();
}
