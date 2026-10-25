package com.camborder.app.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.awt.GraphicsEnvironment;
import java.util.Arrays;
import java.util.List;
import com.camborder.app.service.impl.BundledFontRegistry;

/**
 * 字体查询接口：GET /api/fonts 返回引擎实际可用的字体族名称列表。
 *
 * 前端据此区分"候选字体"（系统枚举）和"引擎可用字体"（Java GraphicsEnvironment 注册的字体）。
 */
@RestController
@RequestMapping("/api")
public final class FontController {

    private final BundledFontRegistry bundledFontRegistry;

    public FontController(final BundledFontRegistry bundledFontRegistry) {
        this.bundledFontRegistry = bundledFontRegistry;
    }

    @GetMapping("/fonts")
    public FontListResponse listFonts() {
        GraphicsEnvironment ge = GraphicsEnvironment.getLocalGraphicsEnvironment();
        List<String> families = Arrays.asList(ge.getAvailableFontFamilyNames());
        return new FontListResponse(families);
    }

    /** 字体列表响应 DTO。 */
    public static final class FontListResponse {
        private final List<String> fonts;

        public FontListResponse(final List<String> fonts) {
            this.fonts = fonts;
        }

        public List<String> getFonts() {
            return fonts;
        }
    }
}
