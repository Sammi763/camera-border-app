package com.camborder.app.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.awt.Font;
import java.awt.GraphicsEnvironment;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 注册安装包内字体。
 *
 * 字体目录由 Electron 以固定资源路径注入。目录缺失、清单损坏或单个字体损坏时，
 * 只跳过该字体并由能力探测报告不可用；不会回退到网络字体或把候选字体伪装成可用。
 */
@Component
public final class BundledFontRegistry {

    private final String fontsDirectory;
    private final ObjectMapper objectMapper;
    private final List<String> registeredFamilies = new ArrayList<>();

    @Autowired
    public BundledFontRegistry(
            @Value("${CAMBORDER_BUNDLED_FONTS_DIR:}") final String fontsDirectory,
            final ObjectMapper objectMapper) {
        this.fontsDirectory = fontsDirectory == null ? "" : fontsDirectory.trim();
        this.objectMapper = objectMapper;
    }

    /** 兼容不使用 Spring 的单元测试。 */
    public BundledFontRegistry(final String fontsDirectory) {
        this(fontsDirectory, new ObjectMapper());
    }

    @PostConstruct
    public void registerFonts() {
        registeredFamilies.clear();
        if (fontsDirectory.isBlank()) return;
        Path manifest = Path.of(fontsDirectory, "fonts.json");
        if (!Files.isRegularFile(manifest) || !Files.isReadable(manifest)) return;
        try {
            JsonNode root = objectMapper.readTree(manifest.toFile());
            JsonNode fonts = root == null ? null : root.get("fonts");
            if (fonts == null || !fonts.isArray()) return;
            GraphicsEnvironment environment = GraphicsEnvironment.getLocalGraphicsEnvironment();
            for (JsonNode entry : fonts) {
                String file = text(entry, "file");
                if (file == null || file.isBlank() || file.contains("..") || Path.of(file).isAbsolute()) continue;
                Path fontPath = Path.of(fontsDirectory, file).normalize();
                if (!fontPath.startsWith(Path.of(fontsDirectory).normalize())) continue;
                if (!Files.isRegularFile(fontPath) || !Files.isReadable(fontPath)) continue;
                try (InputStream input = Files.newInputStream(fontPath)) {
                    Font font = Font.createFont(Font.TRUETYPE_FONT, input);
                    if (environment.registerFont(font)) {
                        registeredFamilies.add(font.getFamily());
                    }
                } catch (Exception ignored) {
                    // 单个字体损坏不应阻断其它字体和应用启动。
                }
            }
        } catch (IOException | RuntimeException ignored) {
            // 能力探测会把缺失/损坏清单报告为不可用。
        }
    }

    public List<String> registeredFamilies() {
        return Collections.unmodifiableList(new ArrayList<>(registeredFamilies));
    }

    public boolean hasRegisteredFonts() {
        return !registeredFamilies.isEmpty();
    }

    private static String text(final JsonNode parent, final String field) {
        if (parent == null) return null;
        JsonNode node = parent.get(field);
        return node == null || !node.isTextual() ? null : node.asText();
    }
}
