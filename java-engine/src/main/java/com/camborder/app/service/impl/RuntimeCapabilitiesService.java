package com.camborder.app.service.impl;

import com.camborder.app.dto.CapabilitiesResponse;
import com.camborder.app.service.CapabilitiesService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import javax.imageio.ImageIO;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.HashSet;
import java.util.concurrent.TimeUnit;

/**
 * 运行时能力探测。
 *
 * ExifTool 只从 Electron 注入的固定路径读取，不回退系统 PATH；这样缺少随包组件时
 * capability 会变成 false，而不是在用户机器上静默选择另一个版本。
 */
@Service
public final class RuntimeCapabilitiesService implements CapabilitiesService {

    private static final String TWELVEMONKEYS_VERSION = "3.14.0";
    private static final String EXIFTOOL_VERSION = "13.59";
    private static final String TWELVEMONKEYS_SHA256 =
            "8625f8f5c0cdcbb4489c3b45117af0f2336e278e3de9a6ec1ee073a218acec42";

    private final String exifToolPath;
    private final String componentManifestPath;
    private final String heicDecoderAvailable;
    private final String bundledFontsDirectory;
    private final ObjectMapper objectMapper;
    private final Map<String, String> componentChecksums = new LinkedHashMap<>();
    private boolean tiffPluginAvailable;
    private boolean twelveMonkeysManifestValid;
    private boolean componentManifestValid;
    private ComponentProbe exifToolProbe;

    @Autowired
    public RuntimeCapabilitiesService(
            @Value("${CAMBORDER_EXIFTOOL_PATH:}") final String exifToolPath,
            @Value("${CAMBORDER_COMPONENT_MANIFEST:}") final String componentManifestPath,
            @Value("${CAMBORDER_HEIC_DECODER_AVAILABLE:false}") final String heicDecoderAvailable,
            @Value("${CAMBORDER_BUNDLED_FONTS_DIR:}") final String bundledFontsDirectory,
            final ObjectMapper objectMapper) {
        this.exifToolPath = exifToolPath == null ? "" : exifToolPath.trim();
        this.componentManifestPath = componentManifestPath == null ? "" : componentManifestPath.trim();
        this.heicDecoderAvailable = heicDecoderAvailable == null ? "false" : heicDecoderAvailable.trim();
        this.bundledFontsDirectory = bundledFontsDirectory == null ? "" : bundledFontsDirectory.trim();
        this.objectMapper = objectMapper;
    }

    /** 兼容不使用 Spring 的能力探测测试。 */
    public RuntimeCapabilitiesService(final String exifToolPath) {
        this(exifToolPath, "", "false", "", new ObjectMapper());
    }

    /** 保留阶段五测试和嵌入调用使用的三参数构造器。 */
    public RuntimeCapabilitiesService(final String exifToolPath, final String componentManifestPath,
                                      final ObjectMapper objectMapper) {
        this(exifToolPath, componentManifestPath, "false", "", objectMapper);
    }

    @PostConstruct
    public void registerImageIoPlugins() {
        ImageIO.scanForPlugins();
        // JDK 也可能提供 TIFF writer；不能只凭 ImageIO 注册表把 JDK 插件误报为随包的
        // TwelveMonkeys。先确认锁定依赖的 SPI 类，再确认读写服务已注册。
        tiffPluginAvailable = classPresent("com.twelvemonkeys.imageio.plugins.tiff.TIFFImageReaderSpi")
                && classPresent("com.twelvemonkeys.imageio.plugins.tiff.TIFFImageWriterSpi")
                && ImageIO.getImageReadersByFormatName("tiff").hasNext()
                && ImageIO.getImageWritersByFormatName("tiff").hasNext();
        loadComponentManifest();
        exifToolProbe = probeExifTool();
    }

    @Override
    public CapabilitiesResponse snapshot() {
        if (exifToolProbe == null) {
            exifToolProbe = probeExifTool();
        }
        final boolean metadata = exifToolProbe.available;
        final boolean twelveMonkeysAvailable = tiffPluginAvailable && twelveMonkeysManifestValid;
        final CapabilitiesResponse response = new CapabilitiesResponse();

        final Map<String, CapabilitiesResponse.Component> components = new LinkedHashMap<>();
        components.put("twelvemonkeys-imageio", new CapabilitiesResponse.Component(
                twelveMonkeysAvailable, twelveMonkeysAvailable ? TWELVEMONKEYS_VERSION : null, "BSD-3-Clause",
                twelveMonkeysAvailable ? checksum("twelvemonkeys-imageio", TWELVEMONKEYS_SHA256) : null,
                twelveMonkeysAvailable ? null : "TwelveMonkeys TIFF 插件或随包清单不可用"));
        components.put("exiftool", new CapabilitiesResponse.Component(
                metadata, exifToolProbe.version, "GPL-1.0-or-later OR Artistic-1.0-Perl",
                checksum("exiftool", null), exifToolProbe.reason));
        FontProbe fonts = probeFonts();
        components.put("fonts", new CapabilitiesResponse.Component(
                fonts.available, null, "SIL OFL 1.1", null, fonts.reason));
        response.setComponents(components);

        final Map<String, Boolean> input = new LinkedHashMap<>();
        input.put("jpeg", true);
        input.put("png", true);
        // 即使类和 SPI 仍在 classpath，缺少锁定的 TwelveMonkeys 清单也不能把 TIFF
        // 能力暴露给 UI；否则用户可以选择 TIFF，提交后才在导出阶段失败。
        input.put("tiff", twelveMonkeysAvailable);
        input.put("heic", isTrue(heicDecoderAvailable));
        input.put("heif", isTrue(heicDecoderAvailable));
        input.put("rawEmbeddedJpeg", true);
        response.setInput(input);

        final Map<String, CapabilitiesResponse.FormatCapability> output = new LinkedHashMap<>();
        output.put("jpeg", format(true, new int[]{8}, metadata));
        output.put("png", format(true, new int[]{8, 16}, metadata));
        output.put("tiff", format(twelveMonkeysAvailable, new int[]{8, 16}, metadata));
        response.setOutput(output);

        final String unavailable = !metadata ? "ExifTool 随包组件不可用" : null;
        final Map<String, CapabilitiesResponse.TierCapability> tiers = new LinkedHashMap<>();
        tiers.put("quick-share", new CapabilitiesResponse.TierCapability(
                metadata, "jpeg", unavailable));
        tiers.put("standard-delivery", new CapabilitiesResponse.TierCapability(
                metadata, "jpeg", unavailable));
        tiers.put("high-fidelity-archive", new CapabilitiesResponse.TierCapability(
                metadata && twelveMonkeysAvailable, "tiff",
                !metadata ? unavailable : (twelveMonkeysAvailable ? null : "TwelveMonkeys TIFF 插件或随包清单不可用")));
        tiers.put("custom", new CapabilitiesResponse.TierCapability(
                metadata, "jpeg", unavailable));
        response.setTiers(tiers);
        return response;
    }

    private CapabilitiesResponse.FormatCapability format(final boolean available,
                                                          final int[] bitDepths,
                                                          final boolean metadata) {
        CapabilitiesResponse.FormatCapability result = new CapabilitiesResponse.FormatCapability();
        result.setAvailable(available);
        result.setBitDepths(bitDepths);
        result.setIcc(available && metadata);
        result.setExif(available && metadata);
        result.setXmp(available && metadata);
        result.setIptc(available && metadata);
        result.setGps(available && metadata);
        result.setDpi(available && metadata);
        result.setReason(available && metadata ? null : "输出组件或 ExifTool 不可用");
        return result;
    }

    private ComponentProbe probeExifTool() {
        if (exifToolPath.isBlank()) {
            return new ComponentProbe(false, null, "未配置随包 ExifTool 路径");
        }
        if (!componentManifestValid) {
            return new ComponentProbe(false, null, "随包专业组件清单缺失或无效");
        }
        final Path executable;
        try {
            executable = Path.of(exifToolPath);
        } catch (RuntimeException exception) {
            return new ComponentProbe(false, null, "随包 ExifTool 路径非法");
        }
        if (!Files.isRegularFile(executable) || !Files.isExecutable(executable)) {
            return new ComponentProbe(false, null, "随包 ExifTool 不存在或不可执行");
        }
        try {
            Process process = new ProcessBuilder(executable.toString(), "-ver")
                    .redirectErrorStream(true)
                    .start();
            if (!process.waitFor(2, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                return new ComponentProbe(false, null, "ExifTool 版本探测超时");
            }
            String version;
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                    process.getInputStream(), StandardCharsets.UTF_8))) {
                version = reader.readLine();
            }
            version = version == null ? "" : version.trim();
            if (process.exitValue() != 0 || !EXIFTOOL_VERSION.equals(version)) {
                return new ComponentProbe(false, version, "ExifTool 版本或退出码不符合随包清单");
            }
            return new ComponentProbe(true, version, null);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return new ComponentProbe(false, null, "ExifTool 版本探测被中断");
        } catch (IOException exception) {
            return new ComponentProbe(false, null, "ExifTool 版本探测失败");
        }
    }

    private void loadComponentManifest() {
        componentChecksums.clear();
        twelveMonkeysManifestValid = false;
        componentManifestValid = false;
        if (componentManifestPath.isBlank()) return;
        try {
            Path manifest = Path.of(componentManifestPath);
            if (!Files.isRegularFile(manifest) || !Files.isReadable(manifest)) return;
            JsonNode root = objectMapper.readTree(manifest.toFile());
            JsonNode components = root == null ? null : root.get("components");
            if (components == null || !components.isObject()) return;
            JsonNode exiftool = components.get("exiftool");
            if (exiftool == null || !EXIFTOOL_VERSION.equals(exiftool.path("version").asText(""))) return;
            String manifestChecksum = checksumValue(exiftool.get("sha256"));
            if (manifestChecksum == null || manifestChecksum.isBlank()) return;
            java.util.Iterator<Map.Entry<String, JsonNode>> fields = components.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                String checksum = checksumValue(field.getValue().get("sha256"));
                if (checksum != null) componentChecksums.put(field.getKey(), checksum);
            }
            componentManifestValid = true;
            JsonNode twelveMonkeys = components.get("twelvemonkeys-imageio");
            String twelveMonkeysChecksum = twelveMonkeys == null
                    ? null : checksumValue(twelveMonkeys.get("sha256"));
            twelveMonkeysManifestValid = twelveMonkeys != null
                    && TWELVEMONKEYS_VERSION.equals(twelveMonkeys.path("version").asText(""))
                    && twelveMonkeysChecksum != null
                    && !twelveMonkeysChecksum.isBlank();
        } catch (IOException | RuntimeException ignored) {
            // 清单损坏必须让依赖固定组件的专业能力 fail-closed。
            componentManifestValid = false;
        }
    }

    private String checksum(final String component, final String fallback) {
        String value = componentChecksums.get(component);
        return value == null || value.isBlank() ? fallback : value;
    }

    private String checksumValue(final JsonNode node) {
        if (node == null || node.isNull()) return null;
        if (node.isTextual()) return node.asText();
        if (node.isObject()) {
            String platform = System.getProperty("os.name", "").toLowerCase().contains("win")
                    ? "win-x64" : "macos";
            JsonNode selected = node.get(platform);
            if (selected == null) selected = node.get("default");
            return selected == null || selected.isNull() ? null : selected.asText();
        }
        return null;
    }

    private boolean classPresent(final String className) {
        try {
            Class.forName(className, false, getClass().getClassLoader());
            return true;
        } catch (ClassNotFoundException | LinkageError exception) {
            return false;
        }
    }

    private FontProbe probeFonts() {
        if (bundledFontsDirectory.isBlank()) return new FontProbe(false, "未配置随包字体目录");
        try {
            Path root = Path.of(bundledFontsDirectory).normalize();
            Path manifest = root.resolve("fonts.json").normalize();
            if (!manifest.startsWith(root) || !Files.isRegularFile(manifest)) {
                return new FontProbe(false, "随包字体清单缺失");
            }
            JsonNode fonts = objectMapper.readTree(manifest.toFile()).path("fonts");
            if (!fonts.isArray() || fonts.isEmpty()) return new FontProbe(false, "随包字体清单为空");
            Set<String> required = new HashSet<>();
            for (JsonNode entry : fonts) {
                String file = entry.path("file").asText("");
                if (file.isBlank() || file.contains("..") || Path.of(file).isAbsolute()) {
                    return new FontProbe(false, "随包字体清单路径非法");
                }
                required.add(file);
            }
            for (String file : required) {
                if (!Files.isRegularFile(root.resolve(file).normalize())) {
                    return new FontProbe(false, "随包字体文件缺失");
                }
            }
            return new FontProbe(true, null);
        } catch (IOException | RuntimeException exception) {
            return new FontProbe(false, "随包字体清单不可读取");
        }
    }

    private boolean isTrue(final String value) {
        return "true".equalsIgnoreCase(value);
    }

    private static final class ComponentProbe {
        private final boolean available;
        private final String version;
        private final String reason;

        private ComponentProbe(final boolean available, final String version, final String reason) {
            this.available = available;
            this.version = version;
            this.reason = reason;
        }
    }

    private static final class FontProbe {
        private final boolean available;
        private final String reason;

        private FontProbe(final boolean available, final String reason) {
            this.available = available;
            this.reason = reason;
        }
    }
}
