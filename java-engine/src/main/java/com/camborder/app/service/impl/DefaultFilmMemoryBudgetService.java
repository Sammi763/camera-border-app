package com.camborder.app.service.impl;

import com.camborder.app.exception.FilmProcessingException;
import com.camborder.app.repository.FilmStageCache;
import com.camborder.app.service.FilmMemoryBudgetService;
import com.camborder.app.util.FilmMemoryEstimator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.lang.management.ManagementFactory;
import java.util.Set;

/**
 * 默认内存准入实现。
 *
 * 只负责准入和租约记账；不调用 System.gc()，也不把估算宣称为应用 RSS 硬上限。
 * 缓存上限 C 包含在 H 内：准入时先计入当前缓存字节，再计入本任务新增峰值。
 */
@Component
public final class DefaultFilmMemoryBudgetService implements FilmMemoryBudgetService {

    private static final long GIB = 1024L * 1024L * 1024L;
    private static final long DEFAULT_TOTAL = 2L * GIB;
    private static final long MAX_TOTAL = 4L * GIB;
    private static final long MAX_CACHE = 1536L * 1024L * 1024L;

    private final FilmStageCache cache;
    private final long physicalBytes;
    private final long jvmMaxHeapBytes;
    private final long totalBudgetBytes;
    private final long javaBudgetBytes;
    private final long cacheMaxBytes;
    private final double safetyMargin;
    private long reservedJavaBytes;
    private long reservedNativeBytes;

    @Autowired
    public DefaultFilmMemoryBudgetService(
            final FilmStageCache cache,
            @Value("${app.film.memory.total-budget-bytes:0}") final long totalOverride,
            @Value("${app.film.memory.java-budget-bytes:0}") final long javaOverride,
            @Value("${app.film.stage-cache.max-bytes:0}") final long cacheOverride,
            @Value("${app.film.memory.safety-margin:0.25}") final double safetyMargin) {
        this(cache, physicalMemoryBytes(), Runtime.getRuntime().maxMemory(),
                totalOverride, javaOverride, cacheOverride, safetyMargin);
    }

    /** 可注入机器数据的构造器；测试用不同物理内存/堆预算验证行为。 */
    public DefaultFilmMemoryBudgetService(final FilmStageCache cache, final long physicalBytes,
                                          final long jvmMaxHeapBytes, final long totalOverride,
                                          final long javaOverride, final long cacheOverride,
                                          final double safetyMargin) {
        if (totalOverride < 0 || javaOverride < 0 || cacheOverride < 0) {
            throw new IllegalArgumentException("内存预算覆盖值必须为非负数");
        }
        if (!Double.isFinite(safetyMargin) || safetyMargin < 0 || safetyMargin > 1) {
            throw new IllegalArgumentException("安全余量必须在 0–1 之间");
        }
        this.cache = cache;
        this.physicalBytes = physicalBytes;
        this.jvmMaxHeapBytes = jvmMaxHeapBytes;
        this.safetyMargin = safetyMargin;
        final long total = totalOverride > 0 ? totalOverride
                : physicalBytes > 0 ? Math.min(MAX_TOTAL, physicalBytes / 4) : DEFAULT_TOTAL;
        final long heap = jvmMaxHeapBytes > 0 ? jvmMaxHeapBytes : total;
        final long java = javaOverride > 0 ? javaOverride : Math.min(total, seventyPercent(heap));
        if (java > total) {
            throw new IllegalArgumentException("Java 图像预算不能大于总预算");
        }
        final long cacheLimit = cacheOverride > 0 ? cacheOverride
                : Math.min(MAX_CACHE, java / 2L);
        if (cacheLimit > java) {
            throw new IllegalArgumentException("阶段缓存上限不能大于 Java 图像预算");
        }
        this.totalBudgetBytes = total;
        this.javaBudgetBytes = java;
        this.cacheMaxBytes = cacheLimit;
        cache.configureMaxBytes(cacheLimit);
    }

    @Override
    public FilmMemoryEstimator.Estimate estimate(final FilmMemoryEstimator.Workload workload) {
        return FilmMemoryEstimator.estimate(workload, safetyMargin);
    }

    @Override
    public synchronized Lease acquire(final FilmMemoryEstimator.Estimate estimate,
                                      final Set<String> reusableCacheKeys) {
        if (estimate == null) {
            throw new IllegalArgumentException("estimate is required");
        }
        cache.evictExpired();
        final Set<String> keep = reusableCacheKeys == null
                ? java.util.Collections.emptySet() : reusableCacheKeys;
        for (int attempt = 0; attempt < 2; attempt++) {
            final long reusable = cache.bytesForKeys(keep);
            final long cacheBytes = cache.bytes();
            final long javaNeeded = Math.max(0, estimate.getJavaPeakBytes() - reusable);
            final long javaLive = reservedJavaBytes + cacheBytes + javaNeeded;
            final long totalLive = javaLive + reservedNativeBytes + estimate.getNativeHelperBytes();
            if (javaLive <= javaBudgetBytes && totalLive <= totalBudgetBytes) {
                reservedJavaBytes += javaNeeded;
                reservedNativeBytes += estimate.getNativeHelperBytes();
                return new BudgetLease(javaNeeded, estimate.getNativeHelperBytes());
            }
            if (attempt == 0) {
                cache.evictUnusedExcept(keep);
            }
        }
        throw new FilmProcessingException(
                "当前任务所需内存超过底片处理预算；请关闭其他大图任务或降低并行导出数量",
                HttpStatus.UNPROCESSABLE_ENTITY, FilmMemoryEstimator.CODE_BUDGET_EXCEEDED);
    }

    @Override
    public synchronized Snapshot snapshot() {
        return new Snapshot(totalBudgetBytes, javaBudgetBytes, cacheMaxBytes, cache.bytes(),
                physicalBytes, jvmMaxHeapBytes, reservedJavaBytes);
    }

    private static long seventyPercent(final long value) {
        if (value <= Long.MAX_VALUE / 70L) {
            return value * 70L / 100L;
        }
        return value / 100L * 70L;
    }

    private static long physicalMemoryBytes() {
        try {
            final Object bean = ManagementFactory.getOperatingSystemMXBean();
            // JRE 11 只有 getTotalPhysicalMemorySize；较新 JDK 提供 getTotalMemorySize。
            // 必须从公开接口读取，不能从内部 OperatingSystemImpl 反射（jdk.management 不导出）。
            final Class<?> iface;
            try {
                iface = Class.forName("com.sun.management.OperatingSystemMXBean");
            } catch (ClassNotFoundException exception) {
                return -1L;
            }
            if (!iface.isInstance(bean)) {
                return -1L;
            }
            for (String name : new String[]{"getTotalMemorySize", "getTotalPhysicalMemorySize"}) {
                try {
                    final java.lang.reflect.Method method = iface.getMethod(name);
                    final Object value = method.invoke(bean);
                    if (value instanceof Number && ((Number) value).longValue() > 0) {
                        return ((Number) value).longValue();
                    }
                } catch (NoSuchMethodException | IllegalAccessException
                         | java.lang.reflect.InvocationTargetException ignored) {
                    // 尝试下一个兼容方法。
                }
            }
        } catch (RuntimeException | LinkageError ignored) {
            // 保守回退；不把系统探测失败升级为启动失败。
        }
        return -1L;
    }

    private final class BudgetLease implements Lease {
        private final long javaBytes;
        private final long nativeBytes;
        private boolean closed;

        private BudgetLease(final long javaBytes, final long nativeBytes) {
            this.javaBytes = javaBytes;
            this.nativeBytes = nativeBytes;
        }

        @Override
        public void close() {
            synchronized (DefaultFilmMemoryBudgetService.this) {
                if (closed) return;
                closed = true;
                reservedJavaBytes = Math.max(0, reservedJavaBytes - javaBytes);
                reservedNativeBytes = Math.max(0, reservedNativeBytes - nativeBytes);
            }
        }
    }
}
