package com.camborder.app.repository;

import com.camborder.app.dto.ExportSettings;
import com.camborder.app.dto.RenderJobSnapshot;
import com.camborder.app.dto.SourceDecode;
import com.camborder.app.model.RenderRecipe;
import com.camborder.app.util.ImageEncoder;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/** RenderJobStore 的容量、过期和并发淘汰测试。 */
final class RenderJobStoreTest {

    @Test
    void terminalJobsRemainBoundedWhenSubmissionsContinue() {
        RenderJobStore store = new RenderJobStore(3, Duration.ofHours(1), new MutableClock());

        for (int index = 0; index < 20; index++) {
            store.put("job-" + index, cancelledRecord("job-" + index));
            assertThat(store.size()).as("终态任务数量必须受上限约束").isLessThanOrEqualTo(3);
        }

        assertThat(store.terminalSize()).isEqualTo(3);
    }

    @Test
    void queuedAndRunningJobsAreNeverEvictedByTerminalCleanup() {
        RenderJobStore store = new RenderJobStore(1, Duration.ofHours(1), new MutableClock());
        RenderJobRecord queued = new RenderJobRecord("queued", snapshots("queued", 1));
        RenderJobRecord running = new RenderJobRecord("running", snapshots("running", 1));
        assertThat(running.startItem(0)).isTrue();
        store.put("queued", queued);
        store.put("running", running);

        store.put("terminal-1", cancelledRecord("terminal-1"));
        store.put("terminal-2", cancelledRecord("terminal-2"));
        store.put("terminal-3", cancelledRecord("terminal-3"));

        assertThat(store.get("queued")).isSameAs(queued);
        assertThat(store.get("running")).isSameAs(running);
        assertThat(store.get("terminal-3")).isNotNull();
    }

    @Test
    void mostRecentlyObservedTerminalJobCanBeQueriedAfterCapacityEviction() {
        RenderJobStore store = new RenderJobStore(1, Duration.ofHours(1), new MutableClock());
        RenderJobRecord old = cancelledRecord("old");
        store.put("old", old);
        assertThat(store.get("old")).isSameAs(old);

        RenderJobRecord justCompleted = new RenderJobRecord("just-completed", snapshots("new", 1));
        store.put("just-completed", justCompleted);
        justCompleted.completeItem(0, exportResult("/exports/new.png"), SourceDecode.standard("png"));

        assertThat(store.get("just-completed")).as("刚完成的任务应优先保留供查询").isSameAs(justCompleted);
        assertThat(store.get("old")).as("容量淘汰后的旧终态任务按契约返回 null").isNull();
    }

    @Test
    void expiredTerminalJobIsRemovedAndUnknownLookupMapsToNotFound() {
        MutableClock clock = new MutableClock();
        RenderJobStore store = new RenderJobStore(10, Duration.ofSeconds(5), clock);
        RenderJobRecord record = cancelledRecord("expired");
        store.put("expired", record);
        assertThat(store.get("expired")).isSameAs(record);

        clock.advance(Duration.ofSeconds(6));

        assertThat(store.get("expired")).as("过期后 store 查询返回 null，控制器据此返回 HTTP 404").isNull();
        assertThat(store.size()).isZero();
    }

    @Test
    void cancelledFailedAndRetryingJobsAreRetainedUntilTheirPolicyAllowsEviction() {
        RenderJobStore store = new RenderJobStore(10, Duration.ofHours(1), new MutableClock());
        RenderJobRecord cancelled = cancelledRecord("cancelled");
        RenderJobRecord failed = failedRecord("failed");
        RenderJobRecord retrying = new RenderJobRecord("retrying", snapshots("retry", 2));
        assertThat(retrying.startItem(0)).isTrue();

        store.put("cancelled", cancelled);
        store.put("failed", failed);
        store.put("retrying", retrying);
        store.put("another-terminal", cancelledRecord("another-terminal"));

        assertThat(store.get("cancelled")).isSameAs(cancelled);
        assertThat(store.get("failed")).isSameAs(failed);
        assertThat(store.get("retrying")).isSameAs(retrying);
        assertThat(retrying.snapshot().getStatus()).isEqualTo("running");
    }

    @Test
    void concurrentTerminalCleanupDoesNotRemoveActiveJobsOrCorruptState() throws InterruptedException {
        RenderJobStore store = new RenderJobStore(2, Duration.ofHours(1), new MutableClock());
        RenderJobRecord active = new RenderJobRecord("active", snapshots("active", 1));
        assertThat(active.startItem(0)).isTrue();
        store.put("active", active);

        int workerCount = 8;
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(workerCount);
        ExecutorService executor = Executors.newFixedThreadPool(workerCount);
        AtomicReference<Throwable> failure = new AtomicReference<>();
        try {
            for (int worker = 0; worker < workerCount; worker++) {
                final int workerIndex = worker;
                executor.submit(() -> {
                    try {
                        assertThat(start.await(2, TimeUnit.SECONDS)).isTrue();
                        for (int index = 0; index < 20; index++) {
                            String jobId = "concurrent-" + workerIndex + "-" + index;
                            store.put(jobId, cancelledRecord(jobId));
                            assertThat(store.get("active")).isSameAs(active);
                        }
                    } catch (Throwable throwable) {
                        failure.compareAndSet(null, throwable);
                    } finally {
                        done.countDown();
                    }
                });
            }
            start.countDown();
            assertThat(done.await(30, TimeUnit.SECONDS)).isTrue();
        } finally {
            executor.shutdownNow();
        }

        assertThat(failure.get()).isNull();
        assertThat(store.get("active")).isSameAs(active);
        assertThat(store.terminalSize()).isLessThanOrEqualTo(2);
    }

    private static RenderJobRecord cancelledRecord(final String jobId) {
        RenderJobRecord record = new RenderJobRecord(jobId, snapshots(jobId, 1));
        record.cancel();
        return record;
    }

    private static RenderJobRecord failedRecord(final String jobId) {
        RenderJobRecord record = new RenderJobRecord(jobId, snapshots(jobId, 1));
        record.failItem(0, "测试失败");
        return record;
    }

    private static List<RenderJobSnapshot> snapshots(final String name, final int count) {
        List<RenderJobSnapshot> snapshots = new ArrayList<>();
        for (int index = 0; index < count; index++) {
            String suffix = name + "-" + index;
            snapshots.add(new RenderJobSnapshot(
                    new RenderRecipe("/photos/" + suffix + ".jpg", null, null, null, false),
                    new ExportSettings("/exports/" + suffix + ".png", "png", 95)
            ));
        }
        return snapshots;
    }

    private static ImageEncoder.ExportResult exportResult(final String outputPath) {
        ImageEncoder.FeatureResult notRequested = new ImageEncoder.FeatureResult(
                ImageEncoder.FeatureStatus.NOT_REQUESTED, null);
        return new ImageEncoder.ExportResult(outputPath, "png", notRequested, notRequested, notRequested);
    }

    private static final class MutableClock extends Clock {
        private Instant current = Instant.parse("2026-09-01T00:00:00Z");

        @Override
        public ZoneId getZone() {
            return ZoneId.of("UTC");
        }

        @Override
        public Clock withZone(final ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return current;
        }

        private void advance(final Duration duration) {
            current = current.plus(duration);
        }
    }
}
