package com.camborder.app.repository;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.Objects;

/**
 * 渲染任务状态内存存储（repository 层）。
 * 维护 jobId -> 同步状态机，供任务服务提交、查询与取消。
 * 当前阶段使用内存存储，不引入数据库/Redis，进程重启即丢失；进程内不会无限保留终态任务。
 *
 * 终态策略：最多保留 {@value #DEFAULT_MAX_TERMINAL_JOBS} 个终态任务，且单个终态任务从存储
 * 首次观察到终态起默认保留 {@value #DEFAULT_TERMINAL_TTL_SECONDS} 秒。清理在每次存取和登记时
 * 同步执行；过期任务或容量淘汰后的任务查询返回 null，由控制器映射为 HTTP 404。queued/running
 * 任务永远不是淘汰候选，因此清理不会中断执行中的任务。
 */
@Component
public final class RenderJobStore {

    /** 默认最多保留的终态任务数量，可通过 app.render-jobs.max-terminal-jobs 覆盖。 */
    public static final int DEFAULT_MAX_TERMINAL_JOBS = 256;
    /** 默认终态任务保留时间，可通过 app.render-jobs.terminal-ttl-seconds 覆盖。 */
    public static final long DEFAULT_TERMINAL_TTL_SECONDS = 30L * 60L;

    private static final long UNOBSERVED_TERMINAL = -1L;

    private final int maxTerminalJobs;
    private final long terminalTtlMillis;
    private final Clock clock;
    private long terminalSequence;
    /** 所有操作都在本对象锁内完成，避免状态检查与淘汰之间出现竞态。 */
    private final Map<String, JobEntry> jobs = new HashMap<>();

    @Autowired
    public RenderJobStore(
            @Value("${app.render-jobs.max-terminal-jobs:" + DEFAULT_MAX_TERMINAL_JOBS + "}") final int maxTerminalJobs,
            @Value("${app.render-jobs.terminal-ttl-seconds:" + DEFAULT_TERMINAL_TTL_SECONDS + "}") final long terminalTtlSeconds) {
        this(maxTerminalJobs, Duration.ofSeconds(terminalTtlSeconds), Clock.systemUTC());
    }

    /** 兼容直接构造存储的测试和本地调用；生产配置使用带 @Value 的构造器。 */
    public RenderJobStore() {
        this(DEFAULT_MAX_TERMINAL_JOBS, Duration.ofSeconds(DEFAULT_TERMINAL_TTL_SECONDS), Clock.systemUTC());
    }

    /** 使用可控时钟验证过期策略；不新增生产抽象，仅供同包测试注入时间。 */
    RenderJobStore(final int maxTerminalJobs, final Duration terminalTtl, final Clock clock) {
        this.maxTerminalJobs = maxTerminalJobs > 0 ? maxTerminalJobs : DEFAULT_MAX_TERMINAL_JOBS;
        this.terminalTtlMillis = terminalTtl != null && terminalTtl.toMillis() > 0
                ? terminalTtl.toMillis()
                : Duration.ofSeconds(DEFAULT_TERMINAL_TTL_SECONDS).toMillis();
        this.clock = Objects.requireNonNull(clock, "clock must not be null");
        this.terminalSequence = 0L;
    }

    /** 登记任务状态机。 */
    public synchronized void put(final String jobId, final RenderJobRecord record) {
        Objects.requireNonNull(jobId, "jobId must not be null");
        Objects.requireNonNull(record, "record must not be null");
        cleanup(clock.millis());
        JobEntry entry = new JobEntry(record);
        jobs.put(jobId, entry);
        observeTerminal(entry, clock.millis());
        evictExcessTerminalJobs();
    }

    /**
     * 按 jobId 查询任务状态；不存在或已过期/淘汰时返回 null（由控制器映射为 404）。
     */
    public synchronized RenderJobRecord get(final String jobId) {
        if (jobId == null) {
            return null;
        }
        cleanup(clock.millis());
        JobEntry entry = jobs.get(jobId);
        return entry == null ? null : entry.record;
    }

    /** 队列满而提交失败时移除尚未执行的任务记录。 */
    public synchronized void remove(final String jobId) {
        cleanup(clock.millis());
        jobs.remove(jobId);
    }

    /** 当前存储数量；读取前执行一次过期和容量清理，便于监控和测试验证有界性。 */
    public synchronized int size() {
        cleanup(clock.millis());
        return jobs.size();
    }

    /** 当前终态任务数量；活跃任务不计入终态容量。 */
    synchronized int terminalSize() {
        cleanup(clock.millis());
        int count = 0;
        for (JobEntry entry : jobs.values()) {
            if (entry.terminalObservedAtMillis != UNOBSERVED_TERMINAL) {
                count++;
            }
        }
        return count;
    }

    /** 在同一把锁内观察状态、清理 TTL 并按终态数量淘汰，保证活跃任务永不成为候选。 */
    private void cleanup(final long nowMillis) {
        Iterator<Map.Entry<String, JobEntry>> entries = jobs.entrySet().iterator();
        while (entries.hasNext()) {
            JobEntry entry = entries.next().getValue();
            if (!entry.record.isTerminal()) {
                continue;
            }
            observeTerminal(entry, nowMillis);
            if (isExpired(entry, nowMillis)) {
                entries.remove();
            }
        }
        evictExcessTerminalJobs();
    }

    private void observeTerminal(final JobEntry entry, final long nowMillis) {
        if (entry.terminalObservedAtMillis == UNOBSERVED_TERMINAL && entry.record.isTerminal()) {
            entry.terminalObservedAtMillis = nowMillis;
            entry.terminalSequence = ++terminalSequence;
        }
    }

    private boolean isExpired(final JobEntry entry, final long nowMillis) {
        return entry.terminalObservedAtMillis != UNOBSERVED_TERMINAL
                && nowMillis >= entry.terminalObservedAtMillis
                && nowMillis - entry.terminalObservedAtMillis >= terminalTtlMillis;
    }

    /** 只在终态条目之间按最早观察到终态的顺序淘汰，绝不删除 queued/running 条目。 */
    private void evictExcessTerminalJobs() {
        while (countObservedTerminalJobs() > maxTerminalJobs) {
            String oldestJobId = null;
            long oldestSequence = Long.MAX_VALUE;
            for (Map.Entry<String, JobEntry> entry : jobs.entrySet()) {
                JobEntry candidate = entry.getValue();
                if (candidate.terminalObservedAtMillis != UNOBSERVED_TERMINAL
                        && candidate.terminalSequence < oldestSequence) {
                    oldestJobId = entry.getKey();
                    oldestSequence = candidate.terminalSequence;
                }
            }
            if (oldestJobId == null) {
                return;
            }
            jobs.remove(oldestJobId);
        }
    }

    private int countObservedTerminalJobs() {
        int count = 0;
        for (JobEntry entry : jobs.values()) {
            if (entry.terminalObservedAtMillis != UNOBSERVED_TERMINAL) {
                count++;
            }
        }
        return count;
    }

    private static final class JobEntry {
        private final RenderJobRecord record;
        private long terminalObservedAtMillis = UNOBSERVED_TERMINAL;
        private long terminalSequence = UNOBSERVED_TERMINAL;

        private JobEntry(final RenderJobRecord record) {
            this.record = record;
        }
    }
}
