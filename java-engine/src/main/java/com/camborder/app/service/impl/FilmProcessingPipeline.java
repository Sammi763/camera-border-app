package com.camborder.app.service.impl;

import com.camborder.app.dto.SourceDecode;
import com.camborder.app.exception.FilmProcessingException;
import com.camborder.app.model.ImageProcessingConfig;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.repository.FilmStageCache;
import com.camborder.app.service.FilmMemoryBudgetService;
import com.camborder.app.util.FilmInputProbe;
import com.camborder.app.util.FilmLinearTiffReader;
import com.camborder.app.util.FilmMemoryEstimator;
import com.camborder.app.util.FilmNegativeProcessor;
import com.camborder.app.util.FilmPositiveProcessor;
import com.camborder.app.util.FilmRawDecoder;
import com.camborder.app.util.FilmStageKeys;
import com.camborder.app.util.FloatImageOps;
import com.camborder.app.util.FloatRgbImage;
import com.camborder.app.util.SourceImageInfo;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 底片模式的分析/预览/导出共用阶段流水线（T07/T10/T11）。
 *
 * 只处理照片像素，不绘制边框、文字、Logo；分析阶段始终基于完整源图坐标，
 * sourceGeometry（裁切/校平）属于编辑几何，留给预览/导出阶段，不在此处应用。
 *
 * 每次执行前先探测输入尺寸、按阶段估算内存并申请预算；阶段结果进入有界浮点缓存。
 * 预算租约随 {@link Processed} 返回，覆盖解码、分析、编码和写出，调用方必须 close。
 */
@Service
public final class FilmProcessingPipeline {

    public static final String CODE_NO_PROCESSING = "IMAGE_ANALYSIS_NO_PROCESSING";
    public static final String CODE_INVALID_STAGE = "IMAGE_ANALYSIS_INVALID_STAGE";
    public static final String CODE_NEGATIVE_REQUIRED = "IMAGE_ANALYSIS_NEGATIVE_REQUIRED";

    private final FilmRawDecoder rawDecoder;
    private final ObjectMapper objectMapper;
    private final FilmInputProbe inputProbe;
    private final FilmStageCache stageCache;
    private final FilmMemoryBudgetService memoryBudget;
    private long rawDecodeCount;
    private long baseComputeCount;
    private long positiveComputeCount;

    @Autowired
    public FilmProcessingPipeline(final FilmRawDecoder rawDecoder, final ObjectMapper objectMapper,
                                  final FilmInputProbe inputProbe, final FilmStageCache stageCache,
                                  final FilmMemoryBudgetService memoryBudget) {
        this.rawDecoder = rawDecoder;
        this.objectMapper = objectMapper;
        this.inputProbe = inputProbe;
        this.stageCache = stageCache;
        this.memoryBudget = memoryBudget;
    }

    /** 诊断/回归：实际执行的阶段次数，缓存命中不增加计数。 */
    public synchronized long getRawDecodeCount() { return rawDecodeCount; }
    public synchronized long getBaseComputeCount() { return baseComputeCount; }
    public synchronized long getPositiveComputeCount() { return positiveComputeCount; }

    /** 兼容直接构造的测试/嵌入调用：无缓存、宽松预算，仍执行尺寸探测。 */
    public FilmProcessingPipeline(final FilmRawDecoder rawDecoder, final ObjectMapper objectMapper) {
        this.rawDecoder = rawDecoder;
        this.objectMapper = objectMapper;
        this.inputProbe = new FilmInputProbe(rawDecoder);
        this.stageCache = new FilmStageCache(false, 0, 120_000L, System::currentTimeMillis);
        this.memoryBudget = new DefaultFilmMemoryBudgetService(stageCache,
                16L * 1024L * 1024L * 1024L, 4L * 1024L * 1024L * 1024L,
                0, 0, 0, FilmMemoryEstimator.DEFAULT_SAFETY_MARGIN);
    }

    // 仅缓存源事实；不持有全幅像素，避免预检重复解码已预览的 RAW。
    private final Map<String, SourceDescription> descriptions = Collections.synchronizedMap(
            new java.util.LinkedHashMap<String, SourceDescription>(64, .75f, true) {
                @Override protected boolean removeEldestEntry(final Map.Entry<String, SourceDescription> entry) {
                    return size() > 64;
                }
            });

    public static final class SourceDescription {
        public final SourceDecode decode;
        public final SourceImageInfo info;
        public final String sourceVersion;

        private SourceDescription(final Processed processed) {
            decode = processed.getSourceDecode();
            info = processed.getSourceInfo();
            sourceVersion = processed.getSourceVersion();
        }
    }

    private String descriptionKey(final RenderRecipe recipe, final String version) {
        try {
            return Path.of(recipe.getImagePath()).toAbsolutePath().normalize() + "|" + version + "|"
                    + recipe.getImageProcessing().getInputMode() + "|"
                    + objectMapper.writeValueAsString(recipe.getImageProcessing().getRaw()) + "|"
                    + objectMapper.writeValueAsString(recipe.getImageProcessing().getLinearInput());
        } catch (IOException e) {
            throw new IllegalArgumentException("解码配置不能序列化", e);
        }
    }

    public SourceDescription describeSource(final RenderRecipe recipe) {
        try (Processed processed = processInternal(recipe, "raw-linear", 0, 0, true, false)) {
            SourceDescription description = descriptions.get(descriptionKey(recipe,
                    processed.getSourceVersion()));
            if (description == null) {
                description = new SourceDescription(processed);
                descriptions.put(descriptionKey(recipe, processed.getSourceVersion()), description);
            }
            return description;
        }
    }

    /** 分析阶段结果；调用方必须 close 以释放预算和缓存租约。 */
    public static final class Processed implements AutoCloseable {
        private final FloatRgbImage image;
        private final String stage;
        private final String recipeSignature;
        private final String sourceVersion;
        private final ClipCounts sensorClipping;
        private final ClipCounts workingClipping;
        private final SourceDecode sourceDecode;
        private final SourceImageInfo sourceInfo;
        private double[] resolvedFilmBase;
        private double[] resolvedLightGain;
        private final FilmMemoryBudgetService.Lease budgetLease;
        private final java.util.List<FilmStageCache.Lease> cacheLeases;
        private boolean closed;

        private Processed(final FloatRgbImage image, final String stage, final String recipeSignature,
                          final String sourceVersion, final ClipCounts sensorClipping,
                          final ClipCounts workingClipping, final SourceDecode sourceDecode,
                          final SourceImageInfo sourceInfo,
                          final FilmMemoryBudgetService.Lease budgetLease,
                          final java.util.List<FilmStageCache.Lease> cacheLeases) {
            this.image = image;
            this.stage = stage;
            this.recipeSignature = recipeSignature;
            this.sourceVersion = sourceVersion;
            this.sensorClipping = sensorClipping;
            this.workingClipping = workingClipping;
            this.sourceDecode = sourceDecode;
            this.sourceInfo = sourceInfo;
            this.budgetLease = budgetLease;
            this.cacheLeases = cacheLeases;
        }

        public FloatRgbImage getImage() { return image; }
        public String getStage() { return stage; }
        public String getRecipeSignature() { return recipeSignature; }
        public String getSourceVersion() { return sourceVersion; }
        public ClipCounts getSensorClipping() { return sensorClipping; }
        public ClipCounts getWorkingClipping() { return workingClipping; }
        public SourceDecode getSourceDecode() { return copy(sourceDecode); }
        public SourceImageInfo getSourceInfo() { return sourceInfo; }
        public double[] getResolvedFilmBase() { return resolvedFilmBase == null ? null : resolvedFilmBase.clone(); }
        public double[] getResolvedLightGain() { return resolvedLightGain == null ? null : resolvedLightGain.clone(); }

        private Processed calibrated(final FilmNegativeProcessor.Result result) {
            return calibrated(result.getBase(), result.getLightGain());
        }

        private Processed calibrated(final double[] base, final double[] gain) {
            resolvedFilmBase = base == null ? null : base.clone();
            resolvedLightGain = gain == null ? null : gain.clone();
            return this;
        }

        @Override
        public void close() {
            if (closed) return;
            closed = true;
            for (FilmStageCache.Lease lease : cacheLeases) {
                if (lease != null) lease.close();
            }
            if (budgetLease != null) budgetLease.close();
        }

        private static SourceDecode copy(final SourceDecode source) {
            if (source == null) return null;
            final SourceDecode copy = new SourceDecode(source.getMode(), source.getFormat(),
                    source.getWarning());
            copy.setCalibrationSpaceKey(source.getCalibrationSpaceKey());
            copy.setOrientation(source.getOrientation());
            copy.setDecodedWidth(source.getDecodedWidth());
            copy.setDecodedHeight(source.getDecodedHeight());
            copy.setOrientedWidth(source.getOrientedWidth());
            copy.setOrientedHeight(source.getOrientedHeight());
            copy.setFullWidth(source.getFullWidth());
            copy.setFullHeight(source.getFullHeight());
            copy.setOrientationApplied(source.isOrientationApplied());
            copy.setSensorBitDepth(source.getSensorBitDepth());
            return copy;
        }
    }

    /** 每通道低/高剪裁计数；sensor 阶段不可用时 available=false。 */
    public static final class ClipCounts {
        private final boolean available;
        private final long[] low;
        private final long[] high;
        private final String note;

        private ClipCounts(final boolean available, final long[] low, final long[] high,
                           final String note) {
            this.available = available;
            this.low = low == null ? new long[3] : low.clone();
            this.high = high == null ? new long[3] : high.clone();
            this.note = note;
        }

        public boolean isAvailable() { return available; }
        public long[] getLow() { return low.clone(); }
        public long[] getHigh() { return high.clone(); }
        public String getNote() { return note; }

        static ClipCounts unavailable(final String note) {
            return new ClipCounts(false, new long[3], new long[3], note);
        }
    }

    /** 分析/对比：完整源图坐标，不做输出合成。 */
    public Processed process(final RenderRecipe recipe, final String stage) {
        return processInternal(recipe, stage, 0, 0, true, false);
    }

    /** 预览/导出：按输出上限估算合成、装饰和编码缓冲。 */
    public Processed processForOutput(final RenderRecipe recipe, final String stage,
                                      final int maxWidth, final int maxHeight,
                                      final boolean borderless) {
        return processInternal(recipe, stage, maxWidth, maxHeight, borderless, true);
    }

    private Processed processInternal(final RenderRecipe recipe, final String stage,
                                      final int maxWidth, final int maxHeight,
                                      final boolean borderless, final boolean compose) {
        if (recipe == null || recipe.getImageProcessing() == null) {
            throw new FilmProcessingException("底片处理配置缺失",
                    HttpStatus.BAD_REQUEST, CODE_NO_PROCESSING);
        }
        if (!"raw-linear".equals(stage) && !"base-positive".equals(stage)
                && !"current-positive".equals(stage)) {
            throw new FilmProcessingException("分析阶段非法",
                    HttpStatus.BAD_REQUEST, CODE_INVALID_STAGE);
        }
        final ImageProcessingConfig config = recipe.getImageProcessing();
        final FilmInputProbe.Probed probed = inputProbe.probe(recipe.getImagePath(), config);
        final String sourceVersion = probed.getSourceVersion();

        final Map<String, FilmInputProbe.Probed> references = probeReferences(config);
        final Map<String, String> referenceVersions = new HashMap<>();
        for (Map.Entry<String, FilmInputProbe.Probed> entry : references.entrySet()) {
            referenceVersions.put(entry.getKey(), entry.getValue().getSourceVersion());
        }
        final String rawKey = FilmStageKeys.rawKey(config, probed.getWidth(), probed.getHeight(),
                sourceVersion, probed.getDecoderVersion());
        final String baseKey = FilmStageKeys.baseKey(rawKey, config, referenceVersions);
        final String currentKey = FilmStageKeys.currentKey(baseKey, config);

        final java.util.List<FilmStageCache.Lease> leases = new java.util.ArrayList<>();
        try {
            final FilmStageCache.Lease rawLease = stageCache.acquire(rawKey);
            if (rawLease != null) leases.add(rawLease);
            FilmStageCache.Lease baseLease = null;
            if ("base-positive".equals(stage) || "current-positive".equals(stage)) {
                baseLease = stageCache.acquire(baseKey);
                if (baseLease != null) leases.add(baseLease);
            }
            FilmStageCache.Lease currentLease = null;
            if ("current-positive".equals(stage)) {
                currentLease = stageCache.acquire(currentKey);
                if (currentLease != null) leases.add(currentLease);
            }

            final Set<String> reusable = new HashSet<>();
            if (rawLease != null) reusable.add(rawKey);
            if (baseLease != null) reusable.add(baseKey);
            if (currentLease != null) reusable.add(currentKey);

            final FilmMemoryEstimator.Workload workload = workload(recipe, probed.getWidth(),
                    probed.getHeight(), maxWidth, maxHeight, borderless, compose, references);
            final FilmMemoryEstimator.Estimate estimate = memoryBudget.estimate(workload);
            final FilmMemoryBudgetService.Lease budgetLease = memoryBudget.acquire(estimate, reusable);

            try {
                if ("raw-linear".equals(stage) && rawLease != null) {
                    return fromEntry(rawLease.entry(), stage, config, budgetLease, leases);
                }
                if ("base-positive".equals(stage) && baseLease != null) {
                    return fromEntry(baseLease.entry(), stage, config, budgetLease, leases);
                }
                if ("current-positive".equals(stage) && currentLease != null) {
                    return fromEntry(currentLease.entry(), stage, config, budgetLease, leases);
                }

                final Loaded loaded;
                if (rawLease != null) {
                    loaded = loadedFromEntry(rawLease.entry());
                } else {
                    loaded = load(recipe, config, sourceVersion);
                    descriptions.put(descriptionKey(recipe, sourceVersion),
                            new SourceDescription(new Processed(loaded.image, "raw-linear",
                                    signature(config, "raw-linear"), loaded.sourceVersion,
                                    loaded.sensorClipping, loaded.workingClipping,
                                    loaded.sourceDecode, loaded.sourceInfo, null,
                                    Collections.emptyList())));
                    store(rawKey, "raw-linear", loaded.image, loaded.sourceVersion,
                            loaded.sourceDecode, loaded.sourceInfo, loaded.sensorClipping,
                            loaded.workingClipping, null, null);
                }
                if ("raw-linear".equals(stage)) {
                    final Processed result = new Processed(loaded.image, stage,
                            signature(config, stage), loaded.sourceVersion,
                            loaded.sensorClipping, loaded.workingClipping, loaded.sourceDecode,
                            loaded.sourceInfo, budgetLease, leases);
                    return result;
                }
                if (config.getNegative() == null || !config.getNegative().isEnabled()) {
                    throw new FilmProcessingException("底片转正阶段需要启用的 negative 配置",
                            HttpStatus.BAD_REQUEST, CODE_NEGATIVE_REQUIRED);
                }
                final FloatRgbImage baseImage;
                final ClipCounts baseSensor;
                final ClipCounts baseWorking;
                final SourceDecode baseDecode;
                final SourceImageInfo baseInfo;
                final String baseSourceVersion;
                final double[] resolvedBase;
                final double[] resolvedGain;
                if (baseLease != null) {
                    final FilmStageCache.Entry entry = baseLease.entry();
                    baseImage = entry.getImage();
                    baseSourceVersion = entry.getSourceVersion();
                    baseDecode = entry.getSourceDecode();
                    baseInfo = entry.getSourceInfo();
                    baseSensor = clipCounts(entry.isSensorClippingAvailable(), entry.getSensorLow(),
                            entry.getSensorHigh(), entry.getSensorNote());
                    baseWorking = clipCounts(true, entry.getWorkingLow(), entry.getWorkingHigh(),
                            "工作图线性值 <=0 或 >=1 的计数");
                    resolvedBase = entry.getResolvedFilmBase();
                    resolvedGain = entry.getResolvedLightGain();
                    final Processed base = new Processed(baseImage, "base-positive",
                            signature(config, "base-positive"), baseSourceVersion, baseSensor,
                            baseWorking, baseDecode, baseInfo, budgetLease, leases);
                    base.resolvedFilmBase = resolvedBase;
                    base.resolvedLightGain = resolvedGain;
                    if ("base-positive".equals(stage)) {
                        return base;
                    }
                    synchronized (this) { positiveComputeCount++; }
                    final FloatRgbImage positive = new FilmPositiveProcessor()
                            .process(baseImage, config.getPositive());
                    final ClipCounts positiveWorking = workingClipping(positive);
                    store(currentKey, "current-positive", positive, baseSourceVersion, baseDecode,
                            baseInfo, baseSensor, positiveWorking, resolvedBase, resolvedGain);
                    return new Processed(positive, stage, signature(config, stage), baseSourceVersion,
                            baseSensor, positiveWorking, baseDecode, baseInfo, budgetLease, leases)
                            .calibrated(resolvedBase, resolvedGain);
                }

                synchronized (this) { baseComputeCount++; }
                final FilmNegativeProcessor.Result negative = new FilmNegativeProcessor().process(
                        loaded.image, resolveReferences(config, loaded, references));
                baseImage = negative.getImage();
                baseSourceVersion = loaded.sourceVersion;
                baseDecode = loaded.sourceDecode;
                baseInfo = loaded.sourceInfo;
                baseSensor = loaded.sensorClipping;
                baseWorking = workingClipping(baseImage);
                resolvedBase = negative.getBase();
                resolvedGain = negative.getLightGain();
                store(baseKey, "base-positive", baseImage, baseSourceVersion, baseDecode, baseInfo,
                        baseSensor, baseWorking, resolvedBase, resolvedGain);
                if ("base-positive".equals(stage)) {
                    return new Processed(baseImage, stage, signature(config, stage),
                            baseSourceVersion, baseSensor, baseWorking, baseDecode, baseInfo,
                            budgetLease, leases).calibrated(resolvedBase, resolvedGain);
                }
                synchronized (this) { positiveComputeCount++; }
                final FloatRgbImage positive = new FilmPositiveProcessor()
                        .process(baseImage, config.getPositive());
                final ClipCounts positiveWorking = workingClipping(positive);
                store(currentKey, "current-positive", positive, baseSourceVersion, baseDecode,
                        baseInfo, baseSensor, positiveWorking, resolvedBase, resolvedGain);
                return new Processed(positive, stage, signature(config, stage), baseSourceVersion,
                        baseSensor, positiveWorking, baseDecode, baseInfo, budgetLease, leases)
                        .calibrated(resolvedBase, resolvedGain);
            } catch (RuntimeException | Error exception) {
                budgetLease.close();
                throw exception;
            }
        } catch (RuntimeException | Error exception) {
            for (FilmStageCache.Lease lease : leases) lease.close();
            throw exception;
        }
    }

    private static long totalReferencePixels(final Map<String, FilmInputProbe.Probed> references) {
        long total = 0;
        try {
            for (FilmInputProbe.Probed reference : references.values()) {
                total = Math.addExact(total, (long) reference.getWidth() * reference.getHeight());
            }
        } catch (ArithmeticException exception) {
            throw new FilmProcessingException("参考帧像素尺寸溢出",
                    HttpStatus.UNPROCESSABLE_ENTITY, FilmMemoryEstimator.CODE_BUDGET_EXCEEDED);
        }
        return total;
    }

    private FilmMemoryEstimator.Workload workload(final RenderRecipe recipe, final int sourceWidth,
                                                  final int sourceHeight, final int maxWidth,
                                                  final int maxHeight, final boolean borderless,
                                                  final boolean compose,
                                                  final Map<String, FilmInputProbe.Probed> references) {
        int outputWidth = sourceWidth;
        int outputHeight = sourceHeight;
        if (maxWidth > 0 || maxHeight > 0) {
            double scale = 1;
            if (maxWidth > 0) scale = Math.min(scale, (double) maxWidth / sourceWidth);
            if (maxHeight > 0) scale = Math.min(scale, (double) maxHeight / sourceHeight);
            outputWidth = Math.max(1, (int) Math.round(sourceWidth * scale));
            outputHeight = Math.max(1, (int) Math.round(sourceHeight * scale));
        }
        final com.camborder.app.model.BorderConfig border = recipe.getBorder();
        final boolean hasBorder = !borderless && border != null
                && (border.getTop() > 0 || border.getBottom() > 0
                || border.getLeft() > 0 || border.getRight() > 0);
        if (hasBorder && maxWidth <= 0 && maxHeight <= 0) {
            outputWidth = Math.max(1, outputWidth + Math.max(0, border.getLeft())
                    + Math.max(0, border.getRight()));
            outputHeight = Math.max(1, outputHeight + Math.max(0, border.getTop())
                    + Math.max(0, border.getBottom()));
        }
        final com.camborder.app.model.ImagePlacement placement = recipe.getImagePlacement();
        final boolean placementTransform = placement != null && ("fill".equals(placement.getMode())
                || Math.abs(placement.getRotation()) > 1e-9
                || placement.getTargetAspectRatio() != null);
        final boolean decorations = !borderless && (recipe.getBorderStyle() != null
                || (recipe.getTexts() != null && !recipe.getTexts().isEmpty())
                || (recipe.getLogo() != null && recipe.getLogo().isEnabled()));
        final ImageProcessingConfig.SourceGeometry geometry = recipe.getImageProcessing()
                .getSourceGeometry();
        final boolean hasGeometry = geometry != null && geometry.getCrop() != null
                && (geometry.getCrop().getX() > 0 || geometry.getCrop().getY() > 0
                || geometry.getCrop().getWidth() < 1 || geometry.getCrop().getHeight() < 1
                || geometry.getRotationDegrees() != 0);
        return new FilmMemoryEstimator.Workload()
                .source(sourceWidth, sourceHeight)
                .output(compose ? outputWidth : sourceWidth,
                        compose ? outputHeight : sourceHeight)
                .sensorRaw("sensor-raw".equals(recipe.getImageProcessing().getInputMode()))
                .referencePixels(totalReferencePixels(references))
                .sourceGeometry(compose && hasGeometry)
                .placementTransform(compose && placementTransform)
                .border(compose && hasBorder)
                .decorations(compose && decorations)
                .gradient(compose && !borderless && recipe.getGradient() != null
                        && recipe.getGradient().isEnabled())
                .borderless(borderless || !compose)
                .analysis(true)
                .outputBitDepth(16);
    }

    private Processed fromEntry(final FilmStageCache.Entry entry, final String stage,
                                final ImageProcessingConfig config,
                                final FilmMemoryBudgetService.Lease budgetLease,
                                final java.util.List<FilmStageCache.Lease> leases) {
        final Processed result = new Processed(entry.getImage(), stage, signature(config, stage),
                entry.getSourceVersion(), clipCounts(entry.isSensorClippingAvailable(),
                entry.getSensorLow(), entry.getSensorHigh(), entry.getSensorNote()),
                clipCounts(true, entry.getWorkingLow(), entry.getWorkingHigh(),
                        "工作图线性值 <=0 或 >=1 的计数"),
                entry.getSourceDecode(), entry.getSourceInfo(), budgetLease, leases);
        result.resolvedFilmBase = entry.getResolvedFilmBase();
        result.resolvedLightGain = entry.getResolvedLightGain();
        return result;
    }

    private void store(final String key, final String stage, final FloatRgbImage image,
                       final String sourceVersion, final SourceDecode decode,
                       final SourceImageInfo info, final ClipCounts sensor,
                       final ClipCounts working, final double[] base, final double[] gain) {
        if (stageCache == null || !stageCache.isEnabled()) return;
        stageCache.put(new FilmStageCache.Entry(key, stage, image, sourceVersion, decode, info,
                sensor.isAvailable(), sensor.getLow(), sensor.getHigh(), sensor.getNote(),
                working.getLow(), working.getHigh(), base, gain));
    }

    private static ClipCounts clipCounts(final boolean available, final long[] low,
                                         final long[] high, final String note) {
        return new ClipCounts(available, low, high, note);
    }

    private Loaded loadedFromEntry(final FilmStageCache.Entry entry) {
        return new Loaded(entry.getImage(), entry.getSourceVersion(),
                clipCounts(entry.isSensorClippingAvailable(), entry.getSensorLow(),
                        entry.getSensorHigh(), entry.getSensorNote()),
                clipCounts(true, entry.getWorkingLow(), entry.getWorkingHigh(),
                        "工作图线性值 <=0 或 >=1 的计数"),
                entry.getSourceDecode(), entry.getSourceInfo());
    }

    private Map<String, FilmInputProbe.Probed> probeReferences(final ImageProcessingConfig config) {
        final Map<String, FilmInputProbe.Probed> result = new HashMap<>();
        final ImageProcessingConfig.NegativeConfig negative = config.getNegative();
        if (negative == null) return result;
        final ImageProcessingConfig.LightSourceConfig light = negative.getLightSource();
        if (light != null && light.getReferenceImagePath() != null
                && !light.getReferenceImagePath().isBlank()) {
            putReference(result, light.getReferenceImagePath(), config);
        }
        final ImageProcessingConfig.FilmBaseConfig base = negative.getFilmBase();
        if (base != null && "reference-frame".equals(base.getKind())
                && base.getReferenceImagePath() != null && !base.getReferenceImagePath().isBlank()) {
            putReference(result, base.getReferenceImagePath(), config);
        }
        return result;
    }

    private void putReference(final Map<String, FilmInputProbe.Probed> result,
                              final String path, final ImageProcessingConfig config) {
        try {
            result.put(path, inputProbe.probe(path, config));
        } catch (RuntimeException exception) {
            throw new FilmProcessingException("参考帧无法读取或尺寸未知，请重新选择",
                    HttpStatus.CONFLICT, "FILM_REFERENCE_CHANGED");
        }
    }

    private Loaded load(final RenderRecipe recipe, final ImageProcessingConfig config,
                        final String expectedSourceVersion) {
        final String path = recipe.getImagePath();
        if ("sensor-raw".equals(config.getInputMode())) {
            final FilmRawDecoder.DecodeOptions options = new FilmRawDecoder.DecodeOptions();
            if (config.getRaw() != null) {
                options.setCrop(config.getRaw().getCrop());
                options.setWhiteBalance(config.getRaw().getWhiteBalance());
                options.setHighlight(config.getRaw().getHighlight());
            }
            synchronized (this) { rawDecodeCount++; }
            final FilmRawDecoder.DecodedRaw raw = rawDecoder.decode(path, options);
            if (expectedSourceVersion != null
                    && !expectedSourceVersion.equals(raw.getFacts().getSourceVersion())) {
                throw new FilmProcessingException("RAW 源文件在探测与解码之间发生变化",
                        HttpStatus.CONFLICT, "FILM_SOURCE_CHANGED");
            }
            final FloatRgbImage image = FloatImageOps.orient(FloatImageOps.fromCameraRgb(
                    raw.getRgb(), raw.getWidth(), raw.getHeight(), raw.getFacts().getRgbCam()),
                    raw.getFacts().getExifOrientation());
            final String format = extensionOf(path);
            final SourceDecode decode = SourceDecode.sensorRaw(format);
            final int exifOrientation = raw.getFacts().getExifOrientation();
            final boolean swaps = exifOrientation >= 5;
            final int orientedWidth = swaps ? raw.getHeight() : raw.getWidth();
            final int orientedHeight = swaps ? raw.getWidth() : raw.getHeight();
            decode.setCalibrationSpaceKey(raw.getFacts().getMake() + "|" + raw.getFacts().getModel() + "|"
                    + options.getWhiteBalance() + "|" + java.util.Arrays.toString("camera".equals(options.getWhiteBalance())
                    ? raw.getFacts().getCamMul() : raw.getFacts().getPreMul()) + "|"
                    + java.util.Arrays.deepToString(raw.getFacts().getRgbCam()));
            decode.setOrientation(exifOrientation);
            decode.setDecodedWidth(raw.getWidth());
            decode.setDecodedHeight(raw.getHeight());
            decode.setOrientedWidth(orientedWidth);
            decode.setOrientedHeight(orientedHeight);
            decode.setFullWidth(orientedWidth);
            decode.setFullHeight(orientedHeight);
            decode.setOrientationApplied(true);
            decode.setSensorBitDepth(raw.getFacts().getSensorBitDepth());
            final SourceImageInfo sourceInfo = new SourceImageInfo(
                    "sensor-raw", path, raw.getWidth(), raw.getHeight(),
                    raw.getWidth(), raw.getHeight(), orientedWidth, orientedHeight,
                    raw.getFacts().getSensorBitDepth(), "linear-camera-rgb", exifOrientation,
                    null, new com.camborder.app.dto.FidelityReport.MetadataFacts());
            return new Loaded(image, raw.getFacts().getSourceVersion(),
                    sensorClipping(raw), workingClipping(image), decode, sourceInfo);
        }
        if ("linear-tiff".equals(config.getInputMode())) {
            synchronized (this) { rawDecodeCount++; }
            final FilmLinearTiffReader.ReadResult read = new FilmLinearTiffReader()
                    .read(path, config.getLinearInput());
            if (expectedSourceVersion != null) {
                com.camborder.app.util.FilmSourceVersion.require(Path.of(path),
                        expectedSourceVersion);
            }
            final int orientation = com.camborder.app.util.ImageOrientation.read(Path.of(path));
            final FloatRgbImage image = FloatImageOps.orient(read.getImage(), orientation);
            final String format = extensionOf(path);
            final SourceDecode decode = SourceDecode.linearTiff(format);
            decode.setCalibrationSpaceKey("linear-tiff|" + config.getLinearInput().getColorSpace());
            decode.setOrientation(orientation);
            decode.setDecodedWidth(read.getSourceWidth());
            decode.setDecodedHeight(read.getSourceHeight());
            decode.setOrientedWidth(image.getWidth());
            decode.setOrientedHeight(image.getHeight());
            decode.setFullWidth(image.getWidth());
            decode.setFullHeight(image.getHeight());
            decode.setOrientationApplied(true);
            final SourceImageInfo sourceInfo = new SourceImageInfo(
                    "linear-tiff", path, read.getSourceWidth(), read.getSourceHeight(),
                    read.getSourceWidth(), read.getSourceHeight(),
                    image.getWidth(), image.getHeight(), 16,
                    read.getSourceColorSpace(), orientation, null,
                    new com.camborder.app.dto.FidelityReport.MetadataFacts());
            return new Loaded(image, expectedSourceVersion, ClipCounts.unavailable(
                    "线性测试输入没有传感器剪裁事实"), workingClipping(image), decode, sourceInfo);
        }
        throw new FilmProcessingException("输入模式不支持",
                HttpStatus.BAD_REQUEST, "IMAGE_ANALYSIS_INVALID_INPUT_MODE");
    }

    private ImageProcessingConfig.NegativeConfig resolveReferences(
            final ImageProcessingConfig config, final Loaded source,
            final Map<String, FilmInputProbe.Probed> references) {
        final ImageProcessingConfig.NegativeConfig negative = objectMapper.convertValue(
                config.getNegative(), ImageProcessingConfig.NegativeConfig.class);
        if (negative.getCalibrationSpaceKey() != null
                && !negative.getCalibrationSpaceKey().equals(source.sourceDecode.getCalibrationSpaceKey())) {
            throw new FilmProcessingException("校准与当前相机、白平衡或工作空间不匹配",
                    HttpStatus.BAD_REQUEST, "FILM_CALIBRATION_SPACE_MISMATCH");
        }
        final ImageProcessingConfig.LightSourceConfig light = negative.getLightSource();
        if (light != null && light.getReferenceImagePath() != null
                && !light.getReferenceImagePath().isBlank()) {
            final Loaded reference = reference(config, source, light.getReferenceImagePath(),
                    light.getReferenceFingerprint(), references);
            final double[] mean = FilmNegativeProcessor.medianOfRoi(reference.image,
                    new ImageProcessingConfig.NormalizedCrop());
            final double[] gain = new double[3];
            for (int c = 0; c < 3; c++) {
                if (mean[c] <= 1e-6 || !Double.isFinite(mean[c])) {
                    throw new FilmProcessingException("光源参考不可用",
                            HttpStatus.BAD_REQUEST, "FILM_REFERENCE_INVALID");
                }
                gain[c] = mean[1] / mean[c];
            }
            light.setKind("calibration");
            light.setRgbGain(gain);
        }
        final ImageProcessingConfig.FilmBaseConfig base = negative.getFilmBase();
        if (base != null && "reference-frame".equals(base.getKind())) {
            final Loaded reference = reference(config, source, base.getReferenceImagePath(),
                    base.getReferenceFingerprint(), references);
            final double[] rgb = FilmNegativeProcessor.medianOfRoi(reference.image,
                    base.getRoi() == null ? new ImageProcessingConfig.NormalizedCrop() : base.getRoi());
            final double[] gain = light == null || light.getRgbGain() == null
                    ? new double[]{1, 1, 1} : light.getRgbGain();
            for (int c = 0; c < 3; c++) rgb[c] *= gain[c];
            base.setKind("manual");
            base.setStage("linear-working");
            base.setRgb(rgb);
        }
        return negative;
    }

    private Loaded reference(final ImageProcessingConfig config, final Loaded source,
                             final String path, final String fingerprint,
                             final Map<String, FilmInputProbe.Probed> references) {
        final FilmInputProbe.Probed probed = references.get(path);
        if (probed == null) {
            throw new FilmProcessingException("参考帧缺少尺寸探测",
                    HttpStatus.CONFLICT, "FILM_REFERENCE_CHANGED");
        }
        if (fingerprint == null
                || !probed.getSourceVersion().startsWith("sha256:" + fingerprint + ";")) {
            throw new FilmProcessingException("参考帧缺少内容指纹或文件已变化，请重新选择",
                    HttpStatus.CONFLICT, "FILM_REFERENCE_CHANGED");
        }
        final RenderRecipe recipe = new RenderRecipe();
        recipe.setImagePath(path);
        final Loaded loaded = load(recipe, config, probed.getSourceVersion());
        if (!probed.getSourceVersion().equals(loaded.sourceVersion)) {
            throw new FilmProcessingException("参考帧读取期间变化",
                    HttpStatus.CONFLICT, "FILM_REFERENCE_CHANGED");
        }
        if (!source.sourceDecode.getCalibrationSpaceKey().equals(
                loaded.sourceDecode.getCalibrationSpaceKey())) {
            throw new FilmProcessingException("参考帧的相机、白平衡或工作空间不同",
                    HttpStatus.BAD_REQUEST, "FILM_CALIBRATION_SPACE_MISMATCH");
        }
        return loaded;
    }

    private static String extensionOf(final String path) {
        final int dot = path.lastIndexOf('.');
        return dot < 0 ? "" : path.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    private String signature(final ImageProcessingConfig config, final String stage) {
        try {
            final String json = objectMapper.writeValueAsString(config);
            final MessageDigest digest = MessageDigest.getInstance("SHA-256");
            final byte[] bytes = (json + "|" + config.getAlgorithmVersion() + "|" + stage)
                    .getBytes(java.nio.charset.StandardCharsets.UTF_8);
            final byte[] hash = digest.digest(bytes);
            final StringBuilder result = new StringBuilder(64);
            for (byte value : hash) result.append(String.format(Locale.ROOT, "%02x", value));
            return result.toString();
        } catch (Exception exception) {
            throw new FilmProcessingException("配方签名失败",
                    HttpStatus.INTERNAL_SERVER_ERROR, "IMAGE_ANALYSIS_SIGNATURE_FAILED");
        }
    }

    private static ClipCounts sensorClipping(final FilmRawDecoder.DecodedRaw raw) {
        // helper 返回的是已经去马赛克和白平衡的 RGB。传感器 maximum/linearMax 与该数值域
        // 不同，无法据此反推原始感光单元剪裁；必须等待 helper 提供传感器域原始统计。
        return ClipCounts.unavailable("helper 尚未提供传感器域原始剪裁统计；解码 RGB 不能反推该事实");
    }

    private static ClipCounts workingClipping(final FloatRgbImage image) {
        final long[] low = new long[3];
        final long[] high = new long[3];
        for (int y = 0; y < image.getHeight(); y++) {
            com.camborder.app.util.FilmRequestGuard.check();
            for (int x = 0; x < image.getWidth(); x++) {
                for (int channel = 0; channel < 3; channel++) {
                    final float value = image.get(x, y, channel);
                    if (value <= 0) low[channel]++;
                    if (value >= 1) high[channel]++;
                }
            }
        }
        return new ClipCounts(true, low, high, "工作图线性值 <=0 或 >=1 的计数");
    }

    public static String sourceVersion(final Path path) {
        return com.camborder.app.util.FilmSourceVersion.read(path);
    }

    private static final class Loaded {
        private final FloatRgbImage image;
        private final String sourceVersion;
        private final ClipCounts sensorClipping;
        private final ClipCounts workingClipping;
        private final SourceDecode sourceDecode;
        private final SourceImageInfo sourceInfo;

        private Loaded(final FloatRgbImage image, final String sourceVersion,
                       final ClipCounts sensorClipping, final ClipCounts workingClipping,
                       final SourceDecode sourceDecode, final SourceImageInfo sourceInfo) {
            this.image = image;
            this.sourceVersion = sourceVersion;
            this.sensorClipping = sensorClipping;
            this.workingClipping = workingClipping;
            this.sourceDecode = sourceDecode;
            this.sourceInfo = sourceInfo;
        }
    }
}
