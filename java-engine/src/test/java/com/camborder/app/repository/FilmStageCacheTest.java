package com.camborder.app.repository;

import com.camborder.app.dto.SourceDecode;
import com.camborder.app.util.FloatRgbImage;
import org.junit.jupiter.api.Test;

import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

/** 阶段缓存：字节上限、租约固定、优先级淘汰、空闲回收与超预算跳过。 */
final class FilmStageCacheTest {

    private static final int WIDTH = 2;
    private static final int HEIGHT = 1;
    private static final long ENTRY_BYTES = FloatRgbImage.bytesFor(WIDTH, HEIGHT);

    @Test
    void evictsCurrentPositiveBeforeBaseAndRaw() {
        final FilmStageCache cache = new FilmStageCache(true, ENTRY_BYTES * 2, 120_000L, System::currentTimeMillis);
        cache.put(entry("current", "current-positive"));
        cache.put(entry("base", "base-positive"));
        cache.put(entry("raw", "raw-linear"));

        assertThat(cache.stages()).containsExactlyInAnyOrder("base-positive", "raw-linear");
        assertThat(cache.bytes()).isEqualTo(ENTRY_BYTES * 2);
    }

    @Test
    void leasedEntryCannotBeEvicted() {
        final FilmStageCache cache = new FilmStageCache(true, ENTRY_BYTES * 2, 120_000L, System::currentTimeMillis);
        cache.put(entry("raw", "raw-linear"));
        final FilmStageCache.Lease lease = cache.acquire("raw");
        assertThat(lease).isNotNull();
        try {
            cache.put(entry("base", "base-positive"));
            cache.put(entry("current", "current-positive"));
            assertThat(cache.stages()).contains("raw-linear");
        } finally {
            lease.close();
        }
    }

    @Test
    void entryLargerThanBudgetIsSkipped() {
        final FilmStageCache cache = new FilmStageCache(true, ENTRY_BYTES - 1, 120_000L, System::currentTimeMillis);
        assertThat(cache.put(entry("raw", "raw-linear"))).isFalse();
        assertThat(cache.bytes()).isZero();
    }

    @Test
    void idleEntriesExpireAfterConfiguredSeconds() {
        final AtomicLong now = new AtomicLong(1_000L);
        final FilmStageCache cache = new FilmStageCache(true, ENTRY_BYTES * 4, 120_000L, now::get);
        cache.put(entry("raw", "raw-linear"));
        assertThat(cache.bytes()).isEqualTo(ENTRY_BYTES);
        now.addAndGet(119_999L);
        assertThat(cache.bytes()).isEqualTo(ENTRY_BYTES);
        now.addAndGet(1L);
        assertThat(cache.bytes()).isZero();
    }

    @Test
    void evictUnusedExceptKeepsReusableKeys() {
        final FilmStageCache cache = new FilmStageCache(true, ENTRY_BYTES * 4, 120_000L, System::currentTimeMillis);
        cache.put(entry("raw", "raw-linear"));
        cache.put(entry("base", "base-positive"));
        cache.evictUnusedExcept(Set.of("raw"));
        assertThat(cache.stages()).containsExactly("raw-linear");
    }

    @Test
    void statsCountHitsMissesPutsAndSkips() {
        final FilmStageCache cache = new FilmStageCache(true, ENTRY_BYTES * 2, 120_000L, System::currentTimeMillis);
        assertThat(cache.acquire("missing")).isNull();
        cache.put(entry("raw", "raw-linear"));
        final FilmStageCache.Lease lease = cache.acquire("raw");
        assertThat(lease).isNotNull();
        lease.close();
        assertThat(cache.put(entry("too-big", "current-positive"))).isTrue();
        final FilmStageCache.Stats stats = cache.stats();
        assertThat(stats.getMisses()).isEqualTo(1);
        assertThat(stats.getHits()).isEqualTo(1);
        assertThat(stats.getPuts()).isEqualTo(2);
        assertThat(stats.getHitRate()).isEqualTo(0.5);
    }

    @Test
    void returnedSourceDecodeIsDefensiveCopy() {
        final FilmStageCache cache = new FilmStageCache(true, ENTRY_BYTES * 2, 120_000L, System::currentTimeMillis);
        final FilmStageCache.Entry source = entry("raw", "raw-linear");
        cache.put(source);
        final FilmStageCache.Lease lease = cache.acquire("raw");
        assertThat(lease).isNotNull();
        try {
            final SourceDecode first = lease.entry().getSourceDecode();
            first.setCalibrationSpaceKey("mutated");
            assertThat(lease.entry().getSourceDecode().getCalibrationSpaceKey()).isEqualTo("space");
        } finally {
            lease.close();
        }
    }

    private static FilmStageCache.Entry entry(final String key, final String stage) {
        final FloatRgbImage image = new FloatRgbImage(WIDTH, HEIGHT);
        final SourceDecode decode = new SourceDecode("linear-tiff", "tif", null);
        decode.setCalibrationSpaceKey("space");
        return new FilmStageCache.Entry(key, stage, image, "sha256:x;size:1;mtime:1", decode, null,
                false, new long[3], new long[3], "sensor", new long[3], new long[3], null, null);
    }
}
