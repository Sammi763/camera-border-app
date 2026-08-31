package com.camborder.app.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 导出任务执行器。
 *
 * 预览请求不进入该执行器；导出保留单一工作线程和有限等待队列，
 * 因此全分辨率与高位深任务默认并发为 1，不会因批量点击耗尽内存。
 */
@Configuration
public class RenderJobExecutorConfig {

    @Bean(destroyMethod = "shutdown")
    public ExecutorService renderJobExecutor(
            @Value("${app.render-jobs.queue-capacity:16}") final int queueCapacity) {
        int safeCapacity = Math.max(1, queueCapacity);
        AtomicInteger sequence = new AtomicInteger();
        ThreadFactory threadFactory = runnable -> {
            Thread thread = new Thread(runnable, "render-job-" + sequence.incrementAndGet());
            thread.setDaemon(true);
            return thread;
        };
        return new ThreadPoolExecutor(
                1,
                1,
                0L,
                TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(safeCapacity),
                threadFactory,
                new ThreadPoolExecutor.AbortPolicy()
        );
    }
}
