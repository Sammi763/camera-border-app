package com.camborder.app.controller;

import com.camborder.app.exception.ResourceNotFoundException;
import com.camborder.app.repository.PreviewStore;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.Optional;

/**
 * 预览资源接口：GET /previews/{id}。
 * 按 previewId 返回预览存储中登记的真实预览图，找不到时抛受控异常由全局处理器返回 404。
 */
@RestController
public final class PreviewResourceController {

    private final PreviewStore previewStore;

    public PreviewResourceController(final PreviewStore previewStore) {
        this.previewStore = previewStore;
    }

    @GetMapping("/previews/{id}")
    public ResponseEntity<?> servePreview(@PathVariable final String id) {
        Optional<byte[]> preview = previewStore.load(id);
        if (preview.isEmpty()) {
            throw new ResourceNotFoundException("preview not found");
        }
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_PNG)
                .body(preview.get());
    }
}
