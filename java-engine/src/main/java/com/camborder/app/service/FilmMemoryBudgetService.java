package com.camborder.app.service;

import com.camborder.app.util.FilmMemoryEstimator;

import java.util.Set;

/**
 * 底片任务内存准入控制（T10）。
 *
 * B = min(4GiB, 物理内存的 25%)；H = min(B, JVM 最大堆的 70%)；
 * C = min(1.5GiB, H 的 50%)，包含在预算内。物理内存不可识别时 B 回退 2GiB。
 * 预算只是准入控制，不是整个应用 RSS 的硬上限。
 */
public interface FilmMemoryBudgetService {

    FilmMemoryEstimator.Estimate estimate(FilmMemoryEstimator.Workload workload);

    /**
     * 申请任务预算；缓存中正在使用或本任务将复用的条目通过 reusableKeys 固定。
     * 回收可回收缓存后仍超预算时抛出 422 FILM_MEMORY_BUDGET_EXCEEDED。
     * 返回的租约覆盖解码到编码/写出的完整生命周期，必须 close。
     */
    Lease acquire(FilmMemoryEstimator.Estimate estimate, Set<String> reusableCacheKeys);

    Snapshot snapshot();

    interface Lease extends AutoCloseable {
        @Override
        void close();
    }

    final class Snapshot {
        private final long totalBudgetBytes;
        private final long javaBudgetBytes;
        private final long cacheMaxBytes;
        private final long cacheBytes;
        private final long physicalBytes;
        private final long jvmMaxHeapBytes;
        private final long reservedJavaBytes;

        public Snapshot(final long totalBudgetBytes, final long javaBudgetBytes,
                        final long cacheMaxBytes, final long cacheBytes,
                        final long physicalBytes, final long jvmMaxHeapBytes,
                        final long reservedJavaBytes) {
            this.totalBudgetBytes = totalBudgetBytes;
            this.javaBudgetBytes = javaBudgetBytes;
            this.cacheMaxBytes = cacheMaxBytes;
            this.cacheBytes = cacheBytes;
            this.physicalBytes = physicalBytes;
            this.jvmMaxHeapBytes = jvmMaxHeapBytes;
            this.reservedJavaBytes = reservedJavaBytes;
        }

        public long getTotalBudgetBytes() { return totalBudgetBytes; }
        public long getJavaBudgetBytes() { return javaBudgetBytes; }
        public long getCacheMaxBytes() { return cacheMaxBytes; }
        public long getCacheBytes() { return cacheBytes; }
        public long getPhysicalBytes() { return physicalBytes; }
        public long getJvmMaxHeapBytes() { return jvmMaxHeapBytes; }
        public long getReservedJavaBytes() { return reservedJavaBytes; }
    }
}
