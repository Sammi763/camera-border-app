package com.camborder.app.service.impl;

import com.camborder.app.exception.FilmProcessingException;
import com.camborder.app.repository.FilmStageCache;
import com.camborder.app.util.FilmMemoryEstimator;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 内存预算：自动公式、覆盖校验、超大尺寸、准入与释放。 */
final class DefaultFilmMemoryBudgetServiceTest {

    private static final long GIB = 1024L * 1024L * 1024L;

    @Test
    void computesBudgetsFromPhysicalMemoryAndHeap() {
        final FilmStageCache cache = new FilmStageCache(true, 1, 120_000L, System::currentTimeMillis);
        final DefaultFilmMemoryBudgetService service = new DefaultFilmMemoryBudgetService(
                cache, 16L * GIB, 8L * GIB, 0, 0, 0, 0.25);
        final var snapshot = service.snapshot();

        assertThat(snapshot.getTotalBudgetBytes()).isEqualTo(4L * GIB);
        assertThat(snapshot.getJavaBudgetBytes()).isEqualTo(4L * GIB);
        assertThat(snapshot.getCacheMaxBytes()).isEqualTo(1536L * 1024L * 1024L);
        assertThat(cache.maxBytes()).isEqualTo(snapshot.getCacheMaxBytes());
    }

    @Test
    void sixteenGigabyteMachineWithFourGigabyteHeapUsesSeventyPercentHeapCap() {
        final FilmStageCache cache = new FilmStageCache(true, 1, 120_000L, System::currentTimeMillis);
        final DefaultFilmMemoryBudgetService service = new DefaultFilmMemoryBudgetService(
                cache, 16L * GIB, 4L * GIB, 0, 0, 0, 0.25);
        final var snapshot = service.snapshot();
        assertThat(snapshot.getTotalBudgetBytes()).isEqualTo(4L * GIB);
        assertThat(snapshot.getJavaBudgetBytes()).isEqualTo(3_006_477_107L);
        assertThat(snapshot.getCacheMaxBytes()).isEqualTo(1_503_238_553L);
    }

    @Test
    void smallerMachineAndUnknownPhysicalMemoryFallBackConservatively() {
        final FilmStageCache cache = new FilmStageCache(true, 1, 120_000L, System::currentTimeMillis);
        final DefaultFilmMemoryBudgetService eightGb = new DefaultFilmMemoryBudgetService(
                cache, 8L * GIB, 4L * GIB, 0, 0, 0, 0.25);
        assertThat(eightGb.snapshot().getTotalBudgetBytes()).isEqualTo(2L * GIB);
        assertThat(eightGb.snapshot().getJavaBudgetBytes()).isEqualTo(2L * GIB);

        final DefaultFilmMemoryBudgetService unknown = new DefaultFilmMemoryBudgetService(
                cache, -1L, 4L * GIB, 0, 0, 0, 0.25);
        assertThat(unknown.snapshot().getTotalBudgetBytes()).isEqualTo(2L * GIB);
    }

    @Test
    void validatesOverrides() {
        final FilmStageCache cache = new FilmStageCache(true, 1, 120_000L, System::currentTimeMillis);
        assertThatThrownBy(() -> new DefaultFilmMemoryBudgetService(cache, 16L * GIB, 8L * GIB,
                1L * GIB, 2L * GIB, 0, 0.25))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Java 图像预算");
        assertThatThrownBy(() -> new DefaultFilmMemoryBudgetService(cache, 16L * GIB, 8L * GIB,
                4L * GIB, 2L * GIB, 3L * GIB, 0.25))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("阶段缓存");
        assertThatThrownBy(() -> new DefaultFilmMemoryBudgetService(cache, 16L * GIB, 8L * GIB,
                0, 0, 0, 1.5))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("安全余量");
    }

    @Test
    void estimatesFortyFiveMegapixelRawAndIncludesNativeHelper() {
        final FilmStageCache cache = new FilmStageCache(true, 1, 120_000L, System::currentTimeMillis);
        final DefaultFilmMemoryBudgetService service = new DefaultFilmMemoryBudgetService(
                cache, 16L * GIB, 4L * GIB, 0, 0, 0, 0.25);
        final FilmMemoryEstimator.Estimate estimate = service.estimate(
                new FilmMemoryEstimator.Workload()
                        .source(8192, 5464)
                        .output(8192, 5464)
                        .sensorRaw(true)
                        .sourceGeometry(true)
                        .border(true)
                        .decorations(true)
                        .gradient(true)
                        .analysis(true)
                        .outputBitDepth(16));

        assertThat(estimate.getJavaPeakBytes()).isGreaterThan(0);
        assertThat(estimate.getNativeHelperBytes()).isGreaterThan(0);
        assertThat(estimate.getTotalPeakBytes()).isGreaterThan(estimate.getJavaPeakBytes());
        assertThat(estimate.getTotalPeakBytes()).isLessThan(8L * GIB);
    }

    @Test
    void rejectsIntegerOverflowAndOversizedTaskWithControlled422() {
        final FilmStageCache cache = new FilmStageCache(true, 1, 120_000L, System::currentTimeMillis);
        final DefaultFilmMemoryBudgetService service = new DefaultFilmMemoryBudgetService(
                cache, 16L * GIB, 4L * GIB, 0, 0, 0, 0.25);

        assertThatThrownBy(() -> service.estimate(new FilmMemoryEstimator.Workload()
                .source(Integer.MAX_VALUE, Integer.MAX_VALUE)
                .output(Integer.MAX_VALUE, Integer.MAX_VALUE)))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
                    assertThat(exception.getCode()).isEqualTo(FilmMemoryEstimator.CODE_BUDGET_EXCEEDED);
                });

        final DefaultFilmMemoryBudgetService tiny = new DefaultFilmMemoryBudgetService(
                new FilmStageCache(false, 0, 120_000L, System::currentTimeMillis),
                1L * 1024L * 1024L, 512L * 1024L, 0, 0, 0, 0.25);
        final FilmMemoryEstimator.Estimate estimate = tiny.estimate(
                new FilmMemoryEstimator.Workload().source(1000, 1000).output(1000, 1000));
        assertThatThrownBy(() -> tiny.acquire(estimate, Set.of()))
                .isInstanceOfSatisfying(FilmProcessingException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
                    assertThat(exception.getCode()).isEqualTo(FilmMemoryEstimator.CODE_BUDGET_EXCEEDED);
                });
    }

    @Test
    void admissionLeaseReleasesReservedBytes() {
        final FilmStageCache cache = new FilmStageCache(false, 0, 120_000L, System::currentTimeMillis);
        final DefaultFilmMemoryBudgetService service = new DefaultFilmMemoryBudgetService(
                cache, 16L * GIB, 4L * GIB, 0, 0, 0, 0.25);
        final FilmMemoryEstimator.Estimate estimate = service.estimate(
                new FilmMemoryEstimator.Workload().source(100, 100).output(100, 100));
        try (var lease = service.acquire(estimate, Set.of())) {
            assertThat(service.snapshot().getReservedJavaBytes()).isGreaterThan(0);
        }
        assertThat(service.snapshot().getReservedJavaBytes()).isZero();
    }
}
