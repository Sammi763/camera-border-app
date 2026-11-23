package com.camborder.app.repository;

import com.camborder.app.dto.SourceDecode;
import com.camborder.app.util.FloatRgbImage;
import com.camborder.app.util.SourceImageInfo;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 有界浮点阶段缓存（T11）。
 *
 * 与预览 PNG、前端 URL 缓存分开；只保存只读的 float32 照片阶段结果和源事实。
 * 全局按字节计量，优先保留 raw-linear / base-positive，先淘汰 current-positive，
 * 同优先级 LRU；正在使用的条目通过租约固定，空闲 120 秒后可回收，进程退出即清空。
 * 不写磁盘，不调用 System.gc()，缓存不足只影响命中率。
 */
@Component
public final class FilmStageCache {

    public static final String STAGE_RAW = "raw-linear";
    public static final String STAGE_BASE = "base-positive";
    public static final String STAGE_CURRENT = "current-positive";

    public static final String STAGE_INTERACTIVE_BASE = "interactive-base";

    private static final long DEFAULT_MAX_BYTES = 1536L * 1024L * 1024L;
    private static final long DEFAULT_IDLE_MILLIS = 120_000L;

    private final boolean enabled;
    private final long idleMillis;
    private final java.util.function.LongSupplier clock;
    private final Map<String, Entry> entries = new LinkedHashMap<>();
    private final Map<float[], Integer> buffers = new java.util.IdentityHashMap<>();
    private long maxBytes;
    private long bytes;
    private long accessSequence;
    private long hits;
    private long misses;
    private long puts;
    private long evictions;
    private long skipped;

    @Autowired
    public FilmStageCache(
            @Value("${app.film.stage-cache.enabled:true}") final boolean enabled,
            @Value("${app.film.stage-cache.max-bytes:0}") final long configuredMaxBytes,
            @Value("${app.film.stage-cache.idle-seconds:120}") final long idleSeconds) {
        this(enabled, validatedMaxBytes(configuredMaxBytes),
                validatedIdleMillis(idleSeconds), System::currentTimeMillis);
    }

    private static long validatedMaxBytes(final long bytes) {
        if (bytes < 0) {
            throw new IllegalArgumentException("app.film.stage-cache.max-bytes 必须为非负数");
        }
        return bytes > 0 ? bytes : DEFAULT_MAX_BYTES;
    }

    /** 测试/嵌入调用：可注入时钟与预算。 */
    public FilmStageCache(final boolean enabled, final long maxBytes, final long idleMillis,
                          final java.util.function.LongSupplier clock) {
        if (maxBytes < 0) {
            throw new IllegalArgumentException("阶段缓存上限必须为非负数");
        }
        if (idleMillis <= 0) {
            throw new IllegalArgumentException("阶段缓存空闲时间必须为正数");
        }
        this.enabled = enabled;
        this.maxBytes = maxBytes > 0 ? maxBytes : DEFAULT_MAX_BYTES;
        this.idleMillis = idleMillis;
        this.clock = clock;
    }

    private static long validatedIdleMillis(final long seconds) {
        if (seconds <= 0 || seconds > 86_400L) {
            throw new IllegalArgumentException("app.film.stage-cache.idle-seconds 必须在 1–86400 之间");
        }
        return seconds * 1000L;
    }

    /** 内存预算服务在启动时把 C 写入缓存上限；配置显式覆盖时保持调用方值。 */
    public synchronized void configureMaxBytes(final long value) {
        if (value < 0) {
            throw new IllegalArgumentException("阶段缓存上限必须为非负数");
        }
        this.maxBytes = value;
        evictToFit(0, java.util.Collections.emptySet());
    }

    public synchronized long maxBytes() {
        return maxBytes;
    }

    public synchronized boolean isEnabled() {
        return enabled;
    }

    public synchronized long bytes() {
        evictExpiredLocked(clock.getAsLong());
        return bytes;
    }

    public synchronized long bytesForKeys(final Set<String> keys) {
        if (keys == null || keys.isEmpty()) return 0;
        long total = 0;
        final Set<float[]> seen = java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<>());
        for (String key : keys) {
            final Entry entry = entries.get(key);
            if (entry != null && seen.add(entry.image.getRgb())) total += entry.bytes;
        }
        return total;
    }

    /** 命中时固定条目；调用方必须在完整生命周期内 close。 */
    public synchronized Lease acquire(final String key) {
        if (!enabled || key == null) return null;
        evictExpiredLocked(clock.getAsLong());
        final Entry entry = entries.get(key);
        if (entry == null) {
            misses++;
            return null;
        }
        hits++;
        entry.leaseCount++;
        entry.lastAccess = ++accessSequence;
        entry.lastAccessMillis = clock.getAsLong();
        return new Lease(this, entry);
    }

    /**
     * 写入阶段结果；超过缓存上限或无法在不触犯租约的情况下腾出空间时跳过。
     * 返回是否真正入缓存。
     */
    public synchronized boolean put(final Entry entry) {
        return put(entry, java.util.Collections.emptySet());
    }

    public synchronized boolean put(final Entry entry, final Set<String> keep) {
        if (!enabled || entry == null || entry.bytes <= 0 || entry.bytes > maxBytes) {
            skipped++;
            return false;
        }
        evictExpiredLocked(clock.getAsLong());
        final Entry existing = entries.get(entry.key);
        if (existing != null && existing.leaseCount > 0) {
            skipped++;
            return false;
        }
        if (existing != null) {
            removeLocked(existing);
        }
        while (bytes + (buffers.containsKey(entry.image.getRgb()) ? 0 : entry.bytes) > maxBytes) {
            final Entry victim = nextVictim(keep);
            if (victim == null) {
                skipped++;
                return false;
            }
            removeLocked(victim);
        }
        entry.lastAccess = ++accessSequence;
        entry.lastAccessMillis = clock.getAsLong();
        entries.put(entry.key, entry);
        if (buffers.merge(entry.image.getRgb(), 1, Integer::sum) == 1) bytes += entry.bytes;
        puts++;
        return true;
    }

    /** 每次执行前回收所有未被租约固定的缓存，返回释放的字节数。 */
    public synchronized long evictUnused() {
        long freed = 0;
        final Iterator<Map.Entry<String, Entry>> iterator = entries.entrySet().iterator();
        while (iterator.hasNext()) {
            final Entry entry = iterator.next().getValue();
            if (entry.leaseCount == 0) {
                iterator.remove();
                freed += releaseBuffer(entry);
                evictions++;
            }
        }
        return freed;
    }

    /**
     * 预算不足时回收除当前任务将复用键之外的未使用条目，尽量保留命中率。
     */
    public synchronized long evictUnusedExcept(final Set<String> keep) {
        long freed = 0;
        final Iterator<Map.Entry<String, Entry>> iterator = entries.entrySet().iterator();
        while (iterator.hasNext()) {
            final Entry entry = iterator.next().getValue();
            if (entry.leaseCount == 0 && (keep == null || !keep.contains(entry.key))) {
                iterator.remove();
                freed += releaseBuffer(entry);
                evictions++;
            }
        }
        return freed;
    }

    /** 空闲过期回收；同一进程内按固定时钟推进，测试可注入。 */
    public synchronized long evictExpired() {
        return evictExpiredLocked(clock.getAsLong());
    }

    public synchronized void clear() {
        entries.clear();
        buffers.clear();
        bytes = 0;
    }

    /** 诊断快照：阶段执行次数、命中率、字节与上限，供性能脚本和回归记录。 */
    public synchronized Stats stats() {
        evictExpiredLocked(clock.getAsLong());
        final long total = hits + misses;
        return new Stats(enabled, bytes, maxBytes, entries.size(), hits, misses,
                total == 0 ? 0 : (double) hits / total, puts, evictions, skipped, idleMillis);
    }

    /** 诊断/测试：返回指定阶段的第一个缓存键。 */
    public synchronized String keyForStage(final String stage) {
        for (Entry entry : entries.values()) {
            if (entry.stage.equals(stage)) return entry.key;
        }
        return null;
    }

    /** 诊断/测试：只读条目快照，不改变租约和顺序。 */
    public synchronized List<String> stages() {
        final List<String> result = new ArrayList<>();
        for (Entry entry : entries.values()) result.add(entry.stage);
        return result;
    }

    private long evictExpiredLocked(final long now) {
        long freed = 0;
        final Iterator<Map.Entry<String, Entry>> iterator = entries.entrySet().iterator();
        while (iterator.hasNext()) {
            final Entry entry = iterator.next().getValue();
            if (entry.leaseCount == 0 && now - entry.lastAccessMillis >= idleMillis) {
                iterator.remove();
                freed += releaseBuffer(entry);
                evictions++;
            }
        }
        return freed;
    }

    private boolean evictToFit(final long requiredBytes, final Set<String> keep) {
        while (bytes + requiredBytes > maxBytes) {
            final Entry victim = nextVictim(keep);
            if (victim == null) return false;
            removeLocked(victim);
        }
        return true;
    }

    /** 先淘汰 current-positive，再 base-positive，最后 raw-linear；同级 LRU。 */
    private Entry nextVictim(final Set<String> keep) {
        Entry victim = null;
        int victimPriority = Integer.MAX_VALUE;
        for (Entry candidate : entries.values()) {
            if (candidate.leaseCount > 0 || (keep != null && keep.contains(candidate.key))) {
                continue;
            }
            final int priority = priority(candidate.stage);
            if (victim == null || priority < victimPriority
                    || (priority == victimPriority && candidate.lastAccess < victim.lastAccess)) {
                victim = candidate;
                victimPriority = priority;
            }
        }
        return victim;
    }

    private static int priority(final String stage) {
        if (STAGE_CURRENT.equals(stage)) return 0;
        if (STAGE_BASE.equals(stage)) return 1;
        return STAGE_INTERACTIVE_BASE.equals(stage) ? 3 : 2;
    }

    private void removeLocked(final Entry entry) {
        entries.remove(entry.key);
        releaseBuffer(entry);
        evictions++;
    }

    private long releaseBuffer(final Entry entry) {
        final float[] pixels = entry.image.getRgb();
        final int count = buffers.get(pixels);
        if (count > 1) {
            buffers.put(pixels, count - 1);
            return 0;
        }
        buffers.remove(pixels);
        bytes -= entry.bytes;
        return entry.bytes;
    }

    private void release(final Entry entry) {
        entry.leaseCount = Math.max(0, entry.leaseCount - 1);
        entry.lastAccessMillis = clock.getAsLong();
    }

    public static final class Stats {
        private final boolean enabled;
        private final long bytes;
        private final long maxBytes;
        private final int entries;
        private final long hits;
        private final long misses;
        private final double hitRate;
        private final long puts;
        private final long evictions;
        private final long skipped;
        private final long idleMillis;

        private Stats(final boolean enabled, final long bytes, final long maxBytes,
                      final int entries, final long hits, final long misses, final double hitRate,
                      final long puts, final long evictions, final long skipped,
                      final long idleMillis) {
            this.enabled = enabled;
            this.bytes = bytes;
            this.maxBytes = maxBytes;
            this.entries = entries;
            this.hits = hits;
            this.misses = misses;
            this.hitRate = hitRate;
            this.puts = puts;
            this.evictions = evictions;
            this.skipped = skipped;
            this.idleMillis = idleMillis;
        }

        public boolean isEnabled() { return enabled; }
        public long getBytes() { return bytes; }
        public long getMaxBytes() { return maxBytes; }
        public int getEntries() { return entries; }
        public long getHits() { return hits; }
        public long getMisses() { return misses; }
        public double getHitRate() { return hitRate; }
        public long getPuts() { return puts; }
        public long getEvictions() { return evictions; }
        public long getSkipped() { return skipped; }
        public long getIdleMillis() { return idleMillis; }
    }

    /** 缓存条目；image 只读共享，禁止处理器原地修改。 */
    public static final class Entry {
        private final String key;
        private final String stage;
        private final FloatRgbImage image;
        private final String sourceVersion;
        private final SourceDecode sourceDecode;
        private final SourceImageInfo sourceInfo;
        private final boolean sensorClippingAvailable;
        private final long[] sensorLow;
        private final long[] sensorHigh;
        private final String sensorNote;
        private final long[] workingLow;
        private final long[] workingHigh;
        private final double[] resolvedFilmBase;
        private final double[] resolvedLightGain;
        private final long bytes;
        private long leaseCount;
        private long lastAccess;
        private long lastAccessMillis;

        public Entry(final String key, final String stage, final FloatRgbImage image,
                     final String sourceVersion, final SourceDecode sourceDecode,
                     final SourceImageInfo sourceInfo, final boolean sensorClippingAvailable,
                     final long[] sensorLow, final long[] sensorHigh, final String sensorNote,
                     final long[] workingLow, final long[] workingHigh,
                     final double[] resolvedFilmBase, final double[] resolvedLightGain) {
            this.key = key;
            this.stage = stage;
            this.image = image;
            this.sourceVersion = sourceVersion;
            this.sourceDecode = copy(sourceDecode);
            this.sourceInfo = sourceInfo;
            this.sensorClippingAvailable = sensorClippingAvailable;
            this.sensorLow = sensorLow == null ? new long[3] : sensorLow.clone();
            this.sensorHigh = sensorHigh == null ? new long[3] : sensorHigh.clone();
            this.sensorNote = sensorNote;
            this.workingLow = workingLow == null ? new long[3] : workingLow.clone();
            this.workingHigh = workingHigh == null ? new long[3] : workingHigh.clone();
            this.resolvedFilmBase = resolvedFilmBase == null ? null : resolvedFilmBase.clone();
            this.resolvedLightGain = resolvedLightGain == null ? null : resolvedLightGain.clone();
            this.bytes = FloatRgbImage.bytesFor(image.getWidth(), image.getHeight());
        }

        public String getKey() { return key; }
        public String getStage() { return stage; }
        public FloatRgbImage getImage() { return image; }
        public String getSourceVersion() { return sourceVersion; }
        public SourceDecode getSourceDecode() { return copy(sourceDecode); }
        public SourceImageInfo getSourceInfo() { return sourceInfo; }
        public boolean isSensorClippingAvailable() { return sensorClippingAvailable; }
        public long[] getSensorLow() { return sensorLow.clone(); }
        public long[] getSensorHigh() { return sensorHigh.clone(); }
        public String getSensorNote() { return sensorNote; }
        public long[] getWorkingLow() { return workingLow.clone(); }
        public long[] getWorkingHigh() { return workingHigh.clone(); }
        public double[] getResolvedFilmBase() { return resolvedFilmBase == null ? null : resolvedFilmBase.clone(); }
        public double[] getResolvedLightGain() { return resolvedLightGain == null ? null : resolvedLightGain.clone(); }
        public long getBytes() { return bytes; }

        private static SourceDecode copy(final SourceDecode source) {
            if (source == null) return null;
            final SourceDecode copy = new SourceDecode(source.getMode(), source.getFormat(), source.getWarning());
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

    /** 租约：close 幂等，不会提前回收仍在使用的图像。 */
    public static final class Lease implements AutoCloseable {
        private final FilmStageCache cache;
        private final Entry entry;
        private boolean closed;

        private Lease(final FilmStageCache cache, final Entry entry) {
            this.cache = cache;
            this.entry = entry;
        }

        public Entry entry() {
            return entry;
        }

        @Override
        public void close() {
            if (closed) return;
            closed = true;
            synchronized (cache) {
                cache.release(entry);
            }
        }
    }
}
