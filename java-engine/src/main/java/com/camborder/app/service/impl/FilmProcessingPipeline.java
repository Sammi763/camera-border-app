package com.camborder.app.service.impl;

import com.camborder.app.dto.SourceDecode;
import com.camborder.app.exception.FilmProcessingException;
import com.camborder.app.model.ImageProcessingConfig;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.repository.FilmStageCache;
import com.camborder.app.service.FilmMemoryBudgetService;
import com.camborder.app.util.FilmEncodedRasterReader;
import com.camborder.app.util.FilmFlextightReader;
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

        private SourceDescription(final SourceDescription cached) {
            decode = Processed.copy(cached.decode);
            info = cached.info;
            sourceVersion = cached.sourceVersion;
        }
    }

    private String descriptionKey(final RenderRecipe recipe, final String version) {
        try {
            return Path.of(recipe.getImagePath()).toAbsolutePath().normalize() + "|" + version + "|"
                    + recipe.getImageProcessing().getSchemaVersion() + "|"
                    + recipe.getImageProcessing().getInputMode() + "|"
                    + recipe.getImageProcessing().getInputSource() + "|"
                    + objectMapper.writeValueAsString(recipe.getImageProcessing().getRaw()) + "|"
                    + objectMapper.writeValueAsString(recipe.getImageProcessing().getLinearInput()) + "|"
                    + objectMapper.writeValueAsString(recipe.getImageProcessing().getEncodedInput()) + "|"
                    + objectMapper.writeValueAsString(recipe.getImageProcessing().getFlextightInput());
        } catch (IOException e) {
            throw new IllegalArgumentException("解码配置不能序列化", e);
        }
    }

    public SourceDescription describeSource(final RenderRecipe recipe) {
        final ImageProcessingConfig config = recipe.getImageProcessing();
        final FilmInputProbe.Probed probed = inputProbe.probe(recipe.getImagePath(), config);
        final String key = descriptionKey(recipe, probed.getSourceVersion());
        final SourceDescription cached = descriptions.get(key);
        if (cached != null) {
            probeReferences(config);
            return new SourceDescription(cached);
        }
        try (Processed processed = processInternal(recipe, "raw-linear", 0, 0,
                true, false, false, probed)) {
            final SourceDescription description = new SourceDescription(processed);
            descriptions.put(key, description);
            return new SourceDescription(description);
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
        return processInternal(recipe, stage, 0, 0, true, false, false, null);
    }

    /** 预览/导出：按输出上限估算合成、装饰和编码缓冲。 */
    public Processed processForOutput(final RenderRecipe recipe, final String stage,
                                      final int maxWidth, final int maxHeight,
                                      final boolean borderless) {
        return processInternal(recipe, stage, maxWidth, maxHeight, borderless, true, false, null);
    }

    public Processed processInteractivePreview(final RenderRecipe recipe, final int maxWidth,
                                               final int maxHeight) {
        return processInternal(recipe, "current-positive", maxWidth, maxHeight,
                Boolean.TRUE.equals(recipe.getBorderlessMaster()), true, true, null);
    }

    private Processed processInternal(final RenderRecipe recipe, final String stage,
                                      final int maxWidth, final int maxHeight,
                                      final boolean borderless, final boolean compose, final boolean interactive,
                                      final FilmInputProbe.Probed priorProbe) {
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
        final FilmInputProbe.Probed probed = priorProbe == null
                ? inputProbe.probe(recipe.getImagePath(), config) : priorProbe;
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

        final boolean rawStage = "raw-linear".equals(stage);
        final boolean currentStage = "current-positive".equals(stage);
        final String proxyKey = "interactive-base|1024|" + baseKey;
        final java.util.List<FilmStageCache.Lease> leases = new java.util.ArrayList<>();
        try {
            final FilmStageCache.Lease current = currentStage && !interactive ? stageCache.acquire(currentKey) : null;
            final FilmStageCache.Lease proxy = interactive ? stageCache.acquire(proxyKey) : null;
            final FilmStageCache.Lease base = !rawStage && current == null && proxy == null
                    ? stageCache.acquire(baseKey) : null;
            final FilmStageCache.Lease raw = current == null && proxy == null && base == null
                    ? stageCache.acquire(rawKey) : null;
            final FilmStageCache.Lease selected = current != null ? current : proxy != null ? proxy
                    : base != null ? base : raw;
            final Set<String> reusable;
            if (selected == null) {
                reusable = Collections.emptySet();
            } else {
                leases.add(selected);
                reusable = Collections.singleton(selected.entry().getKey());
            }

            final FilmMemoryEstimator.Workload workload = workload(recipe, probed.getWidth(),
                    probed.getHeight(), maxWidth, maxHeight, borderless, compose, references);
            if (interactive) {
                workload.interactive(true);
            }
            if (selected != null) {
                workload.cachedStage(selected.entry().getStage());
            }
            final FilmMemoryBudgetService.Lease budgetLease =
                    memoryBudget.acquire(memoryBudget.estimate(workload), reusable);

            try {
                if (current != null) return fromEntry(current.entry(), stage, config, budgetLease, leases);
                if (proxy != null) {
                    final Processed thumbnail = fromEntry(proxy.entry(), "base-positive", config, budgetLease, leases);
                    return adjust(thumbnail, config, null, Collections.emptySet());
                }
                if (base != null) {
                    final Processed basis = fromEntry(base.entry(), "base-positive", config, budgetLease, leases);
                    return finish(basis, config, currentStage, interactive, proxyKey, baseKey, currentKey);
                }

                final Loaded loaded;
                if (raw != null) {
                    loaded = loadedFromEntry(raw.entry());
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
                if (rawStage) {
                    return new Processed(loaded.image, stage, signature(config, stage),
                            loaded.sourceVersion, loaded.sensorClipping, loaded.workingClipping,
                            loaded.sourceDecode, loaded.sourceInfo, budgetLease, leases);
                }

                final FloatRgbImage baseImage;
                final ClipCounts baseWorking;
                final double[] resolvedBase;
                final double[] resolvedGain;
                if (negativeEnabled(config)) {
                    synchronized (this) { baseComputeCount++; }
                    final FilmNegativeProcessor.Result negative = new FilmNegativeProcessor().process(
                            loaded.image, resolveReferences(config, loaded, references));
                    baseImage = negative.getImage();
                    baseWorking = workingClipping(baseImage);
                    resolvedBase = negative.getBase();
                    resolvedGain = negative.getLightGain();
                } else {
                    if (!(config.getSchemaVersion() == ImageProcessingConfig.SCHEMA_VERSION_V2
                            && "positive".equals(config.getFilmPolarity()))) {
                        throw new FilmProcessingException("底片转正阶段需要启用的 negative 配置",
                                HttpStatus.BAD_REQUEST, CODE_NEGATIVE_REQUIRED);
                    }
                    baseImage = loaded.image;
                    baseWorking = loaded.workingClipping;
                    resolvedBase = null;
                    resolvedGain = null;
                }
                // 上游仍在本请求预算内，完成后释放其缓存固定，允许大图将唯一缓存位置交给基础正片。
                if (raw != null) {
                    raw.close();
                    leases.remove(raw);
                }
                store(baseKey, "base-positive", baseImage, loaded.sourceVersion,
                        loaded.sourceDecode, loaded.sourceInfo, loaded.sensorClipping,
                        baseWorking, resolvedBase, resolvedGain);
                final Processed basis = new Processed(baseImage, "base-positive",
                        signature(config, "base-positive"), loaded.sourceVersion, loaded.sensorClipping,
                        baseWorking, loaded.sourceDecode, loaded.sourceInfo, budgetLease, leases)
                        .calibrated(resolvedBase, resolvedGain);
                return finish(basis, config, currentStage, interactive, proxyKey, baseKey, currentKey);
            } catch (RuntimeException | Error exception) {
                budgetLease.close();
                throw exception;
            }
        } catch (RuntimeException | Error exception) {
            for (FilmStageCache.Lease lease : leases) lease.close();
            throw exception;
        }
    }

    private Processed finish(final Processed basis, final ImageProcessingConfig config,
                             final boolean current, final boolean interactive, final String proxyKey,
                             final String baseKey, final String currentKey) {
        if (!current) return basis;
        if (!interactive) return adjust(basis, config, currentKey, Set.of(baseKey, proxyKey));

        final FloatRgbImage proxy = FloatImageOps.fitWithin(basis.image, 1024, 1024);
        store(proxyKey, FilmStageCache.STAGE_INTERACTIVE_BASE, proxy, basis.sourceVersion,
                basis.sourceDecode, basis.sourceInfo, basis.sensorClipping, basis.workingClipping,
                basis.resolvedFilmBase, basis.resolvedLightGain, Collections.singleton(baseKey));
        final Processed thumbnail = new Processed(proxy, basis.stage, basis.recipeSignature,
                basis.sourceVersion, basis.sensorClipping, basis.workingClipping, basis.sourceDecode,
                basis.sourceInfo, basis.budgetLease, basis.cacheLeases)
                .calibrated(basis.resolvedFilmBase, basis.resolvedLightGain);
        return adjust(thumbnail, config, null, Collections.emptySet());
    }

    private Processed adjust(final Processed basis, final ImageProcessingConfig config,
                             final String currentKey, final Set<String> keep) {
        synchronized (this) { positiveComputeCount++; }
        final FloatRgbImage positive = new FilmPositiveProcessor().process(basis.image, config.getPositive());
        final ClipCounts clipping = positive == basis.image ? basis.workingClipping : workingClipping(positive);
        if (currentKey != null) {
            store(currentKey, "current-positive", positive, basis.sourceVersion,
                    basis.sourceDecode, basis.sourceInfo, basis.sensorClipping, clipping,
                    basis.resolvedFilmBase, basis.resolvedLightGain, keep);
        }
        return new Processed(positive, "current-positive", signature(config, "current-positive"),
                basis.sourceVersion, basis.sensorClipping, clipping, basis.sourceDecode,
                basis.sourceInfo, basis.budgetLease, basis.cacheLeases)
                .calibrated(basis.resolvedFilmBase, basis.resolvedLightGain);
    }

    /** v1 由 negative.enabled 决定；v2 由 filmPolarity 决定，正片不进入反相阶段。 */
    static boolean negativeEnabled(final ImageProcessingConfig config) {
        if (config == null) return false;
        if (config.getSchemaVersion() == ImageProcessingConfig.SCHEMA_VERSION_V2) {
            return "color-negative".equals(config.getFilmPolarity())
                    && config.getNegative() != null && config.getNegative().isEnabled();
        }
        return config.getNegative() != null && config.getNegative().isEnabled();
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
        if (compose && "photo-short-edge".equals(recipe.getLayoutScale())) {
            final int[] size = com.camborder.app.util.FilmCompositor.dimensions(sourceWidth, sourceHeight, recipe, maxWidth, maxHeight, borderless);
            outputWidth = size[0];
            outputHeight = size[1];
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
                .encodedRaster("encoded-raster".equals(recipe.getImageProcessing().getInputSource()))
                .source(sourceWidth, sourceHeight)
                .output(compose ? outputWidth : sourceWidth,
                        compose ? outputHeight : sourceHeight)
                .sensorRaw("sensor-raw".equals(recipe.getImageProcessing().getInputMode())
                        || "camera-raw".equals(recipe.getImageProcessing().getInputSource()))
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
        store(key, stage, image, sourceVersion, decode, info, sensor, working, base, gain,
                Collections.emptySet());
    }

    private void store(final String key, final String stage, final FloatRgbImage image,
                       final String sourceVersion, final SourceDecode decode,
                       final SourceImageInfo info, final ClipCounts sensor,
                       final ClipCounts working, final double[] base, final double[] gain,
                       final Set<String> keep) {
        if (stageCache == null || !stageCache.isEnabled()) return;
        stageCache.put(new FilmStageCache.Entry(key, stage, image, sourceVersion, decode, info,
                sensor.isAvailable(), sensor.getLow(), sensor.getHigh(), sensor.getNote(),
                working.getLow(), working.getHigh(), base, gain), keep);
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
        if (config.getSchemaVersion() == ImageProcessingConfig.SCHEMA_VERSION_V2) {
            return loadV2(recipe, config, expectedSourceVersion);
        }
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

    /** v2 输入来源分支：相机 RAW / 已编码栅格 / 线性 TIFF / Flextight FFF。 */
    private Loaded loadV2(final RenderRecipe recipe, final ImageProcessingConfig config,
                          final String expectedSourceVersion) {
        final String path = recipe.getImagePath();
        final String source = config.getInputSource();
        if ("camera-raw".equals(source)) {
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
            final int exifOrientation = raw.getFacts().getExifOrientation();
            final boolean swaps = exifOrientation >= 5;
            final int orientedWidth = swaps ? raw.getHeight() : raw.getWidth();
            final int orientedHeight = swaps ? raw.getWidth() : raw.getHeight();
            final SourceDecode decode = SourceDecode.sensorRaw(extensionOf(path));
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
        if ("encoded-raster".equals(source)) {
            synchronized (this) { rawDecodeCount++; }
            final FilmEncodedRasterReader.ReadResult read = new FilmEncodedRasterReader()
                    .read(path, config.getEncodedInput());
            final String actualVersion = com.camborder.app.util.FilmSourceVersion.read(Path.of(path));
            if (expectedSourceVersion != null && !expectedSourceVersion.equals(actualVersion)) {
                throw new FilmProcessingException("源文件在探测与读取之间发生变化",
                        HttpStatus.CONFLICT, "FILM_SOURCE_CHANGED");
            }
            final FloatRgbImage image = read.getImage();
            final SourceDecode decode = SourceDecode.encodedRaster(extensionOf(path), read.getWarning());
            decode.setCalibrationSpaceKey("encoded-raster|" + read.getSourceColorSpace()
                    + "|" + String.valueOf(read.getProbe().getIccSha256()));
            decode.setOrientation(read.getProbe().getOrientation());
            decode.setDecodedWidth(read.getProbe().getWidth());
            decode.setDecodedHeight(read.getProbe().getHeight());
            decode.setOrientedWidth(image.getWidth());
            decode.setOrientedHeight(image.getHeight());
            decode.setFullWidth(image.getWidth());
            decode.setFullHeight(image.getHeight());
            decode.setOrientationApplied(true);
            final SourceImageInfo sourceInfo = new SourceImageInfo(
                    "encoded-raster", path, read.getProbe().getWidth(), read.getProbe().getHeight(),
                    read.getProbe().getWidth(), read.getProbe().getHeight(),
                    image.getWidth(), image.getHeight(), read.getProbe().getBitDepth(),
                    read.getSourceColorSpace(), read.getProbe().getOrientation(), null,
                    new com.camborder.app.dto.FidelityReport.MetadataFacts());
            return new Loaded(image, actualVersion, ClipCounts.unavailable(
                    "已编码栅格没有传感器剪裁事实"), workingClipping(image), decode, sourceInfo);
        }
        if ("flextight-fff".equals(source)) {
            synchronized (this) { rawDecodeCount++; }
            final FilmFlextightReader.ReadResult read = new FilmFlextightReader()
                    .read(path, config.getFlextightInput());
            final String actualVersion = com.camborder.app.util.FilmSourceVersion.read(Path.of(path));
            if (expectedSourceVersion != null && !expectedSourceVersion.equals(actualVersion)) {
                throw new FilmProcessingException("FFF 文件在探测与读取之间发生变化",
                        HttpStatus.CONFLICT, "FILM_SOURCE_CHANGED");
            }
            final FloatRgbImage image = read.getImage();
            final SourceDecode decode = SourceDecode.flextightFff(extensionOf(path), read.getWarning());
            decode.setCalibrationSpaceKey("flextight-fff|" + config.getFlextightInput().getColorSpace()
                    + "|main:rgb16|" + String.valueOf(config.getFlextightInput().getIccSha256()));
            decode.setOrientation(read.getProbe().getOrientation());
            decode.setDecodedWidth(read.getProbe().getWidth());
            decode.setDecodedHeight(read.getProbe().getHeight());
            decode.setOrientedWidth(image.getWidth());
            decode.setOrientedHeight(image.getHeight());
            decode.setFullWidth(image.getWidth());
            decode.setFullHeight(image.getHeight());
            decode.setOrientationApplied(true);
            final SourceImageInfo sourceInfo = new SourceImageInfo(
                    "flextight-fff", path, read.getProbe().getWidth(), read.getProbe().getHeight(),
                    read.getProbe().getWidth(), read.getProbe().getHeight(),
                    image.getWidth(), image.getHeight(), 16,
                    config.getFlextightInput().getColorSpace(), read.getProbe().getOrientation(),
                    null, new com.camborder.app.dto.FidelityReport.MetadataFacts());
            return new Loaded(image, actualVersion, ClipCounts.unavailable(
                    "FFF 主图没有独立传感器剪裁统计"), workingClipping(image), decode, sourceInfo);
        }
        if ("linear-tiff".equals(source)) {
            synchronized (this) { rawDecodeCount++; }
            final FilmLinearTiffReader.ReadResult read = new FilmLinearTiffReader()
                    .read(path, config.getLinearInput());
            if (expectedSourceVersion != null) {
                com.camborder.app.util.FilmSourceVersion.require(Path.of(path), expectedSourceVersion);
            }
            final int orientation = com.camborder.app.util.ImageOrientation.read(Path.of(path));
            final FloatRgbImage image = FloatImageOps.orient(read.getImage(), orientation);
            final SourceDecode decode = SourceDecode.linearTiff(extensionOf(path));
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
        throw new FilmProcessingException("v2 输入来源不支持",
                HttpStatus.BAD_REQUEST, "IMAGE_PROCESSING_INVALID_INPUT_SOURCE");
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
