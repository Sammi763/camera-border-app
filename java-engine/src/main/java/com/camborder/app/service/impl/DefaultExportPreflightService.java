package com.camborder.app.service.impl;

import com.camborder.app.dto.CapabilitiesResponse;
import com.camborder.app.dto.ExportPreflightResponse;
import com.camborder.app.dto.ExportSettings;
import com.camborder.app.dto.FidelityReport;
import com.camborder.app.dto.RenderJobRequest;
import com.camborder.app.dto.RenderJobSnapshot;
import com.camborder.app.exception.ApiException;
import com.camborder.app.service.CapabilitiesService;
import com.camborder.app.service.ExportPreflightService;
import com.camborder.app.util.ImageReader;
import com.camborder.app.util.OutputPathValidator;
import com.camborder.app.util.RenderRecipeValidator;
import com.camborder.app.util.SourceImageInfo;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** 预检和异步执行共用的固定档位策略检查。 */
@Service
public final class DefaultExportPreflightService implements ExportPreflightService {

    private static final Set<String> FORMATS = Set.of("png", "jpeg", "tiff");
    private static final Set<String> TIERS = Set.of(
            "quick-share", "standard-delivery", "high-fidelity-archive", "custom");

    private final ImageReader imageReader;
    private final CapabilitiesService capabilitiesService;

    public DefaultExportPreflightService(final ImageReader imageReader,
                                         final CapabilitiesService capabilitiesService) {
        this.imageReader = imageReader;
        this.capabilitiesService = capabilitiesService;
    }

    @Override
    public ExportPreflightResponse preflight(final RenderJobRequest request) {
        if (request == null || request.getItems() == null || request.getItems().isEmpty()) {
            throw new ApiException("items must contain at least one snapshot", HttpStatus.BAD_REQUEST);
        }
        final Set<Path> outputs = new HashSet<>();
        final List<ExportPreflightResponse.Item> result = new ArrayList<>();
        for (int index = 0; index < request.getItems().size(); index++) {
            final RenderJobSnapshot snapshot = request.getItems().get(index);
            result.add(check(index, snapshot, outputs));
        }
        final ExportPreflightResponse response = new ExportPreflightResponse();
        response.setItems(result);
        response.setStatus(result.stream().allMatch(item -> "ready".equals(item.getStatus()))
                ? "ready" : "blocked");
        return response;
    }

    private ExportPreflightResponse.Item check(final int index, final RenderJobSnapshot snapshot,
                                               final Set<Path> outputs) {
        if (snapshot == null || snapshot.getRecipe() == null || snapshot.getExport() == null) {
            throw new ApiException("items[" + index + "] recipe and export are required", HttpStatus.BAD_REQUEST);
        }
        final ExportSettings export = snapshot.getExport();
        validateSettings(export, index);
        final String imagePathValue = snapshot.getRecipe().getImagePath();
        if (imagePathValue == null || imagePathValue.isBlank()) {
            throw new ApiException("items[" + index + "] imagePath is required", HttpStatus.BAD_REQUEST);
        }
        RenderRecipeValidator.validateImagePlacement(snapshot.getRecipe(), "items[" + index + "] ");
        final Path imagePath = path(imagePathValue, "imagePath", index);
        if (!Files.isRegularFile(imagePath) || !Files.isReadable(imagePath)) {
            throw new ApiException("items[" + index + "] imagePath must point to a readable file", HttpStatus.BAD_REQUEST);
        }
        final Path outputPath = path(export.getOutputPath(), "outputPath", index);
        final ExportPreflightResponse.Item item = new ExportPreflightResponse.Item();
        item.setIndex(index);
        item.setImagePath(imagePath.toString());
        item.setOutputPath(outputPath.toString());
        final FidelityReport report = FidelityReport.preflight(
                effectiveTier(export), effectiveFormat(export));
        item.setReport(report);
        final List<String> reasons = new ArrayList<>();

        try {
            final ImageReader.ReadResult read = imageReader.readWithSource(imagePath.toString());
            final SourceImageInfo source = read.getSourceInfo();
            report.setPixelSource(source.getPixelSource());
            report.setMetadataSource(source.getMetadataSource());
            report.setSource(source.toFacts());
            validateTier(export, source, reasons);
        } catch (RuntimeException exception) {
            reasons.add("源图读取失败");
        }

        final CapabilitiesResponse capabilities = capabilitiesService.snapshot();
        final String tier = effectiveTier(export);
        final CapabilitiesResponse.TierCapability tierCapability = capabilities.getTiers().get(tier);
        if (export.hasProfessionalPolicy()
                && (tierCapability == null || !tierCapability.isAvailable())) {
            reasons.add(tierCapability == null || tierCapability.getReason() == null
                    ? "当前运行时不具备该导出档位能力" : tierCapability.getReason());
        }
        final String format = effectiveFormat(export);
        final CapabilitiesResponse.FormatCapability formatCapability = capabilities.getOutput().get(format);
        if (formatCapability == null || !formatCapability.isAvailable()) {
            reasons.add("当前运行时不具备 " + format + " 输出能力");
        } else if (report.getSource() != null
                && !supportsBitDepth(formatCapability, requestedBitDepth(export, report.getSource().getBitDepth()))) {
            reasons.add("当前运行时不具备请求的 "
                    + requestedBitDepth(export, report.getSource().getBitDepth()) + "-bit " + format + " 输出能力");
        }
        if (!outputs.add(outputPath)) reasons.add("输出路径与批次内其他项冲突");
        if (imagePath.equals(outputPath)) reasons.add("输出路径不能覆盖源图");
        if (Files.exists(outputPath)) reasons.add("输出路径已存在");
        if (!isWritableParent(outputPath)) reasons.add("输出目录不可写");
        try {
            report.getBlockingReasons().addAll(reasons);
        } catch (RuntimeException ignored) { }
        item.setBlockingReasons(reasons);
        item.setStatus(reasons.isEmpty() ? "ready" : "blocked");
        return item;
    }

    private void validateSettings(final ExportSettings export, final int index) {
        final String prefix = "items[" + index + "] ";
        if (export.getOutputPath() == null || export.getOutputPath().isBlank()) {
            throw new ApiException(prefix + "outputPath is required", HttpStatus.BAD_REQUEST);
        }
        if (export.getFormat() == null || export.getFormat().isBlank()) {
            throw new ApiException(prefix + "format is required", HttpStatus.BAD_REQUEST);
        }
        if (!FORMATS.contains(export.getFormat())) {
            throw new ApiException(prefix + "format must be png, jpeg or tiff", HttpStatus.BAD_REQUEST);
        }
        if (export.getTier() == null || export.getTier().isBlank()) {
            throw new ApiException(prefix + "tier is required", HttpStatus.BAD_REQUEST);
        }
        if (!TIERS.contains(export.getTier())) {
            throw new ApiException(prefix + "tier is invalid", HttpStatus.BAD_REQUEST);
        }
        if (export.getJpegQuality() < 0 || export.getJpegQuality() > 100) {
            throw new ApiException(prefix + "jpegQuality must be between 0 and 100", HttpStatus.BAD_REQUEST);
        }
        if (export.getMaxWidth() < 0 || export.getMaxHeight() < 0) {
            throw new ApiException(prefix + "maxWidth and maxHeight must be non-negative", HttpStatus.BAD_REQUEST);
        }
        if (export.getColorProfilePolicy() != null
                && !Set.of("source", "srgb", "none").contains(export.getColorProfilePolicy())) {
            throw new ApiException(prefix + "colorProfilePolicy is invalid", HttpStatus.BAD_REQUEST);
        }
        if (export.getMetadataPolicy() != null
                && !Set.of("preserve", "remove-location", "strip").contains(export.getMetadataPolicy())) {
            throw new ApiException(prefix + "metadataPolicy is invalid", HttpStatus.BAD_REQUEST);
        }
        if (export.getBitDepthPolicy() != null
                && !Set.of("source", "8").contains(export.getBitDepthPolicy())) {
            throw new ApiException(prefix + "bitDepthPolicy is invalid", HttpStatus.BAD_REQUEST);
        }
    }

    private void validateTier(final ExportSettings export, final SourceImageInfo source,
                              final List<String> reasons) {
        if (!export.hasProfessionalPolicy() || "custom".equals(export.getTier())) return;
        final String tier = export.getTier();
        final String format = effectiveFormat(export);
        final String color = export.effectiveColorProfilePolicy();
        final String metadata = export.effectiveMetadataPolicy();
        final String bitDepth = export.effectiveBitDepthPolicy();
        if ("quick-share".equals(tier)) {
            if (!("jpeg".equals(format) || "png".equals(format))) reasons.add("快速分享只允许 JPEG/PNG");
            if ("jpeg".equals(format) && export.getJpegQuality() != 92) reasons.add("快速分享 JPEG 质量必须为 92");
            if (export.getMaxWidth() != 2048 || export.getMaxHeight() != 2048) reasons.add("快速分享尺寸必须为 2048 且不放大");
            if (!"srgb".equals(color) || !"remove-location".equals(metadata) || !"8".equals(bitDepth)) {
                reasons.add("快速分享策略参数不符合固定档位");
            }
        } else if ("standard-delivery".equals(tier)) {
            if (!("jpeg".equals(format) || "png".equals(format))) reasons.add("标准交付只允许 JPEG/PNG");
            if ("jpeg".equals(format) && export.getJpegQuality() != 95) reasons.add("标准交付 JPEG 质量必须为 95");
            if (export.getMaxWidth() != 0 || export.getMaxHeight() != 0) reasons.add("标准交付必须保持原尺寸");
            if (!"source".equals(color) || !"preserve".equals(metadata) || !"8".equals(bitDepth)) {
                reasons.add("标准交付策略参数不符合固定档位");
            }
        } else if ("high-fidelity-archive".equals(tier)) {
            if (!("tiff".equals(format) || "png".equals(format))) reasons.add("高保真归档只允许 TIFF/PNG");
            if (export.getMaxWidth() != 0 || export.getMaxHeight() != 0) reasons.add("高保真归档必须保持原尺寸");
            if (!"source".equals(color) || !"preserve".equals(metadata) || !"source".equals(bitDepth)) {
                reasons.add("高保真归档策略参数不符合固定档位");
            }
            if (source.getBitDepth() != 8 && source.getBitDepth() != 16) {
                reasons.add("源图位深不是可归档的 8/16-bit");
            }
        }
    }

    private Path path(final String raw, final String field, final int index) {
        try {
            return OutputPathValidator.normalizeForComparison(raw, "items[" + index + "] " + field);
        } catch (InvalidPathException exception) {
            throw new ApiException("items[" + index + "] " + field + " is invalid", HttpStatus.BAD_REQUEST);
        }
    }

    private boolean isWritableParent(final Path output) {
        Path parent = output.getParent();
        while (parent != null && !Files.exists(parent)) parent = parent.getParent();
        return parent != null && Files.isDirectory(parent) && Files.isWritable(parent);
    }

    private String effectiveTier(final ExportSettings export) {
        return export.getTier() == null || export.getTier().isBlank() ? "custom" : export.getTier();
    }

    private String effectiveFormat(final ExportSettings export) {
        return export.getFormat() == null || export.getFormat().isBlank() ? "png" : export.getFormat();
    }

    private int requestedBitDepth(final ExportSettings export, final int sourceBitDepth) {
        if (!"source".equals(export.effectiveBitDepthPolicy())) return 8;
        return sourceBitDepth;
    }

    private boolean supportsBitDepth(final CapabilitiesResponse.FormatCapability capability,
                                     final int bitDepth) {
        for (int supported : capability.getBitDepths()) {
            if (supported == bitDepth) return true;
        }
        return false;
    }
}
