package com.camborder.app.service.impl;

import com.camborder.app.exception.FilmProcessingException;
import com.camborder.app.service.FilmTaskKind;
import com.camborder.app.service.FilmTaskScheduler;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 调参合并、取消、优先级与等待上限。 */
final class FilmTaskSchedulerImplTest {

    @Test
    void lateOlderRequestCannotRemoveQueuedLatestGeneration() throws Exception {
        final FilmTaskSchedulerImpl scheduler = new FilmTaskSchedulerImpl();
        final CountDownLatch started = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        final ExecutorService pool = Executors.newFixedThreadPool(3);
        try {
            final Future<?> blocker = pool.submit(() -> scheduler.run(FilmTaskKind.EXPORT, null, 0, null, () -> {
                started.countDown();
                release.await(5, TimeUnit.SECONDS);
                return null;
            }));
            assertThat(started.await(2, TimeUnit.SECONDS)).isTrue();
            final Future<String> latest = pool.submit(() -> scheduler.run(
                    FilmTaskKind.PREVIEW, "ordered-view", 3, "latest", () -> "latest"));
            final long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
            while (scheduler.pendingCount() != 1 && System.nanoTime() < deadline) Thread.sleep(5);
            assertThat(scheduler.pendingCount()).isEqualTo(1);
            assertThatThrownBy(() -> scheduler.run(FilmTaskKind.PREVIEW, "ordered-view", 2,
                    "late-old", () -> "old")).isInstanceOf(FilmProcessingException.class);
            assertThat(scheduler.pendingCount()).isEqualTo(1);
            release.countDown();
            blocker.get(2, TimeUnit.SECONDS);
            assertThat(latest.get(2, TimeUnit.SECONDS)).isEqualTo("latest");
        } finally {
            release.countDown();
            pool.shutdownNow();
        }
    }

    @Test
    void runsAtMostOneHeavyTaskAtATime() throws Exception {
        final FilmTaskSchedulerImpl scheduler = new FilmTaskSchedulerImpl();
        final AtomicInteger concurrent = new AtomicInteger();
        final AtomicInteger maxConcurrent = new AtomicInteger();
        final ExecutorService pool = Executors.newFixedThreadPool(4);
        try {
            final List<Future<?>> futures = new ArrayList<>();
            for (int index = 0; index < 4; index++) {
                final int item = index;
                futures.add(pool.submit(() -> scheduler.run(FilmTaskKind.EXPORT, null, 0, null, () -> {
                    final int now = concurrent.incrementAndGet();
                    maxConcurrent.accumulateAndGet(now, Math::max);
                    Thread.sleep(30);
                    concurrent.decrementAndGet();
                    return item;
                })));
            }
            for (Future<?> future : futures) future.get(5, TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }
        assertThat(maxConcurrent.get()).isEqualTo(1);
    }

    @Test
    void replacesPendingInteractionOfSameViewAndKindAndCancelsItsWaiter() throws Exception {
        final FilmTaskSchedulerImpl scheduler = new FilmTaskSchedulerImpl();
        final CountDownLatch release = new CountDownLatch(1);
        final CountDownLatch started = new CountDownLatch(1);
        final ExecutorService pool = Executors.newFixedThreadPool(3);
        try {
            final Future<String> running = pool.submit(() -> scheduler.run(
                    FilmTaskKind.PREVIEW, "view", 1, "a", () -> {
                        started.countDown();
                        release.await(3, TimeUnit.SECONDS);
                        return "first";
                    }));
            assertThat(started.await(2, TimeUnit.SECONDS)).isTrue();

            final List<String> executed = Collections.synchronizedList(new ArrayList<>());
            final Future<String> stale = pool.submit(() -> scheduler.run(
                    FilmTaskKind.PREVIEW, "view", 2, "b", () -> {
                        executed.add("stale");
                        return "stale";
                    }));
            final Future<String> latest = pool.submit(() -> scheduler.run(
                    FilmTaskKind.PREVIEW, "view", 3, "c", () -> {
                        executed.add("latest");
                        return "latest";
                    }));

            assertThatThrownBy(() -> stale.get(2, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(FilmProcessingException.class);
            release.countDown();
            assertThat(running.get(2, TimeUnit.SECONDS)).isEqualTo("first");
            assertThat(latest.get(2, TimeUnit.SECONDS)).isEqualTo("latest");
            assertThat(executed).containsExactly("latest");
        } finally {
            release.countDown();
            pool.shutdownNow();
        }
    }

    @Test
    void mainPreviewAndStagePreviewSameGenerationBothExecute() throws Exception {
        final FilmTaskSchedulerImpl scheduler = new FilmTaskSchedulerImpl();
        final CountDownLatch release = new CountDownLatch(1);
        final CountDownLatch started = new CountDownLatch(1);
        final List<String> executed = Collections.synchronizedList(new ArrayList<>());
        final ExecutorService pool = Executors.newFixedThreadPool(4);
        try {
            final Future<?> blocker = pool.submit(() -> scheduler.run(
                    FilmTaskKind.EXPORT, null, 0, null, () -> {
                        started.countDown();
                        release.await(3, TimeUnit.SECONDS);
                        return null;
                    }));
            assertThat(started.await(2, TimeUnit.SECONDS)).isTrue();
            final Future<?> main = pool.submit(() -> scheduler.run(
                    FilmTaskKind.PREVIEW, "view", 7, "main", () -> {
                        executed.add("main");
                        return null;
                    }));
            final Future<?> stage = pool.submit(() -> scheduler.run(
                    FilmTaskKind.STAGE_PREVIEW, "view", 7, "stage", () -> {
                        executed.add("stage");
                        return null;
                    }));
            Thread.sleep(100);
            release.countDown();
            blocker.get(2, TimeUnit.SECONDS);
            main.get(2, TimeUnit.SECONDS);
            stage.get(2, TimeUnit.SECONDS);
            assertThat(executed).containsExactlyInAnyOrder("main", "stage");
        } finally {
            release.countDown();
            pool.shutdownNow();
        }
    }

    @Test
    void duplicateSameViewGenerationAndKeySharesResult() throws Exception {
        final FilmTaskSchedulerImpl scheduler = new FilmTaskSchedulerImpl();
        final AtomicInteger calls = new AtomicInteger();
        final CountDownLatch release = new CountDownLatch(1);
        final CountDownLatch started = new CountDownLatch(1);
        final ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            final Future<String> owner = pool.submit(() -> scheduler.run(
                    FilmTaskKind.PREVIEW, "view", 5, "same", () -> {
                        calls.incrementAndGet();
                        started.countDown();
                        release.await(3, TimeUnit.SECONDS);
                        return "shared";
                    }));
            assertThat(started.await(2, TimeUnit.SECONDS)).isTrue();
            final Future<String> joiner = pool.submit(() -> scheduler.run(
                    FilmTaskKind.PREVIEW, "view", 5, "same", () -> {
                        calls.incrementAndGet();
                        return "other";
                    }));
            Thread.sleep(100);
            release.countDown();
            assertThat(owner.get(2, TimeUnit.SECONDS)).isEqualTo("shared");
            assertThat(joiner.get(2, TimeUnit.SECONDS)).isEqualTo("shared");
            assertThat(calls.get()).isEqualTo(1);
        } finally {
            release.countDown();
            pool.shutdownNow();
        }
    }

    @Test
    void executesAtMostTwoInteractionsBeforeWaitingExport() throws Exception {
        final FilmTaskSchedulerImpl scheduler = new FilmTaskSchedulerImpl();
        final CountDownLatch blockerRelease = new CountDownLatch(1);
        final CountDownLatch blockerStarted = new CountDownLatch(1);
        final List<String> order = Collections.synchronizedList(new ArrayList<>());
        final ExecutorService pool = Executors.newFixedThreadPool(6);
        try {
            final Future<?> blocker = pool.submit(() -> scheduler.run(
                    FilmTaskKind.EXPORT, null, 0, null, () -> {
                        blockerStarted.countDown();
                        blockerRelease.await(3, TimeUnit.SECONDS);
                        return null;
                    }));
            assertThat(blockerStarted.await(2, TimeUnit.SECONDS)).isTrue();

            final List<Future<?>> tasks = new ArrayList<>();
            for (int index = 1; index <= 3; index++) {
                final int item = index;
                tasks.add(pool.submit(() -> scheduler.run(
                        FilmTaskKind.PREVIEW, "view_" + item, 1, "p" + item, () -> {
                            order.add("p" + item);
                            return null;
                        })));
            }
            tasks.add(pool.submit(() -> scheduler.run(
                    FilmTaskKind.EXPORT, null, 0, null, () -> {
                        order.add("export");
                        return null;
                    })));
            Thread.sleep(100);
            blockerRelease.countDown();
            blocker.get(2, TimeUnit.SECONDS);
            for (Future<?> task : tasks) task.get(2, TimeUnit.SECONDS);
            assertThat(order).hasSize(4);
            assertThat(order.subList(0, 2)).allMatch(value -> value.startsWith("p"));
            assertThat(order.get(2)).isEqualTo("export");
            assertThat(order.get(3)).startsWith("p");
        } finally {
            blockerRelease.countDown();
            pool.shutdownNow();
        }
    }

    @Test
    void rejectsSeventeenthWaitingTaskWithBusy() throws Exception {
        final FilmTaskSchedulerImpl scheduler = new FilmTaskSchedulerImpl();
        final CountDownLatch release = new CountDownLatch(1);
        final CountDownLatch started = new CountDownLatch(1);
        final ExecutorService pool = Executors.newFixedThreadPool(20);
        try {
            final Future<?> blocker = pool.submit(() -> scheduler.run(
                    FilmTaskKind.PREVIEW, "blocker", 1, "block", () -> {
                        started.countDown();
                        release.await(3, TimeUnit.SECONDS);
                        return null;
                    }));
            assertThat(started.await(2, TimeUnit.SECONDS)).isTrue();
            final List<Future<?>> waiting = new ArrayList<>();
            for (int index = 0; index < FilmTaskScheduler.MAX_PENDING; index++) {
                final int item = index;
                waiting.add(pool.submit(() -> scheduler.run(
                        FilmTaskKind.PREVIEW, "view_" + item, 1, "k" + item, () -> null)));
            }
            Thread.sleep(100);
            assertThatThrownBy(() -> scheduler.run(FilmTaskKind.PREVIEW,
                    "view_extra", 1, "extra", () -> null))
                    .isInstanceOfSatisfying(FilmProcessingException.class, exception -> {
                        assertThat(exception.getStatus()).isEqualTo(org.springframework.http.HttpStatus.TOO_MANY_REQUESTS);
                        assertThat(exception.getCode()).isEqualTo("FILM_BUSY");
                    });
            release.countDown();
            blocker.get(2, TimeUnit.SECONDS);
            for (Future<?> future : waiting) future.get(2, TimeUnit.SECONDS);
        } finally {
            release.countDown();
            pool.shutdownNow();
        }
    }

    @Test
    void cancelDoesNotCancelFrozenExport() throws Exception {
        final FilmTaskSchedulerImpl scheduler = new FilmTaskSchedulerImpl();
        final CountDownLatch release = new CountDownLatch(1);
        final CountDownLatch started = new CountDownLatch(1);
        final ExecutorService pool = Executors.newFixedThreadPool(3);
        try {
            final Future<?> blocker = pool.submit(() -> scheduler.run(
                    FilmTaskKind.PREVIEW, "view", 1, "a", () -> {
                        started.countDown();
                        release.await(3, TimeUnit.SECONDS);
                        return null;
                    }));
            assertThat(started.await(2, TimeUnit.SECONDS)).isTrue();
            final Future<String> export = pool.submit(() -> scheduler.run(
                    FilmTaskKind.EXPORT, null, 0, null, () -> "exported"));
            scheduler.cancel("view", 99);
            release.countDown();
            blocker.get(2, TimeUnit.SECONDS);
            assertThat(export.get(2, TimeUnit.SECONDS)).isEqualTo("exported");
        } finally {
            release.countDown();
            pool.shutdownNow();
        }
    }
}
