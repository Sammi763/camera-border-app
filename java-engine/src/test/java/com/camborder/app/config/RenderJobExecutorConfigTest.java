package com.camborder.app.config;

import org.junit.jupiter.api.Test;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.ThreadPoolExecutor;

import static org.assertj.core.api.Assertions.assertThat;

/** 导出执行器必须保持有界，并默认只并发一个任务。 */
final class RenderJobExecutorConfigTest {

    @Test
    void shouldUseOneWorkerAndABoundedQueue() {
        ExecutorService executor = new RenderJobExecutorConfig().renderJobExecutor(7);
        try {
            ThreadPoolExecutor pool = (ThreadPoolExecutor) executor;
            assertThat(pool.getCorePoolSize()).isEqualTo(1);
            assertThat(pool.getMaximumPoolSize()).isEqualTo(1);
            assertThat(pool.getQueue().remainingCapacity()).isEqualTo(7);
        } finally {
            executor.shutdownNow();
        }
    }
}
