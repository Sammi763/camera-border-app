package com.camborder.app.controller;

import com.camborder.app.dto.ImageProbeRequest;
import com.camborder.app.dto.ImageProbeResponse;
import com.camborder.app.service.ImageProbeService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 图像探针接口：POST /api/image-probe。
 *
 * 导入、会话恢复、重新定位、预检和来源报告都复用这一只读入口；
 * 探测不分配整幅像素，也不把“能读缩略图”当成真实 RAW 解码成功。
 */
@RestController
@RequestMapping("/api")
public final class ImageProbeController {

    private final ImageProbeService probeService;

    public ImageProbeController(final ImageProbeService probeService) {
        this.probeService = probeService;
    }

    @PostMapping("/image-probe")
    public ResponseEntity<ImageProbeResponse> probe(
            @RequestBody final ImageProbeRequest request) {
        return ResponseEntity.ok(probeService.probe(request));
    }
}
