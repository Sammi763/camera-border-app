package com.camborder.app.controller;

import com.camborder.app.dto.FormatMetadataTextRequest;
import com.camborder.app.dto.FormatMetadataTextResponse;
import com.camborder.app.exception.ApiException;
import com.camborder.app.service.MetadataFormatService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 文本变量格式化接口：POST /api/metadata/format。
 * 将模板中的 {Camera}、{Lens} 等变量替换为实际值。
 *
 * 缺失变量替换为空字符串，替换后清理多余分隔符。
 * 未识别变量保留原样。template 为空或空白时返回空字符串。
 */
@RestController
@RequestMapping("/api")
public final class MetadataFormatController {

    private final MetadataFormatService metadataFormatService;

    public MetadataFormatController(final MetadataFormatService metadataFormatService) {
        this.metadataFormatService = metadataFormatService;
    }

    @PostMapping("/metadata/format")
    public ResponseEntity<FormatMetadataTextResponse> formatText(
            @RequestBody final FormatMetadataTextRequest request) {
        if (request == null) {
            throw new ApiException("request body is required", HttpStatus.BAD_REQUEST);
        }

        final String result = metadataFormatService.format(
                request.getTemplate(), request.getMetadata());
        return ResponseEntity.ok(new FormatMetadataTextResponse(result));
    }
}
