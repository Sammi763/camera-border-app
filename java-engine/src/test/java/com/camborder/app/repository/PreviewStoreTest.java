package com.camborder.app.repository;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * PreviewStore 有界内存策略与并发安全的单元测试。
 */
final class PreviewStoreTest {

    /** 构造一份可区分内容的预览字节，便于断言读取的是哪一份。 */
    private byte[] previewBytes(final int marker) {
        return new byte[]{(byte) marker, (byte) (marker + 1)};
    }

    @Test
    @DisplayName("存入 maxItems+1 个预览后最旧的被清理，新预览仍可读取")
    void storeBeyondMaxEvictsOldest() {
        PreviewStore store = new PreviewStore(3);

        String first = store.store(previewBytes(1));
        store.store(previewBytes(2));
        store.store(previewBytes(3));
        // 存入第 4 个，超过容量 3，最旧的 first 应被淘汰
        String newest = store.store(previewBytes(4));

        assertThat(store.load(first)).as("最旧的预览应被清理").isEmpty();
        assertThat(store.load(newest)).as("最新预览应可读取").isPresent();
        assertThat(store.load(newest).get()).containsExactly(previewBytes(4));
    }

    @Test
    @DisplayName("淘汰最旧后，中间存入的预览在容量内仍可读取")
    void storeBeyondMaxKeepsRecentWithinCapacity() {
        PreviewStore store = new PreviewStore(2);

        String oldest = store.store(previewBytes(1));
        String middle = store.store(previewBytes(2));
        String newest = store.store(previewBytes(3));

        assertThat(store.load(oldest)).isEmpty();
        assertThat(store.load(middle)).isPresent();
        assertThat(store.load(newest)).isPresent();
    }

    @Test
    @DisplayName("maxItems 配置生效：不同容量产生不同的淘汰时机")
    void maxItemsConfigIsEffective() {
        // 容量为 1：每存入新预览立即淘汰上一个
        PreviewStore capacityOne = new PreviewStore(1);
        String first = capacityOne.store(previewBytes(1));
        String second = capacityOne.store(previewBytes(2));
        assertThat(capacityOne.load(first)).as("容量 1 时上一个应被淘汰").isEmpty();
        assertThat(capacityOne.load(second)).isPresent();

        // 容量为 5：前 5 个都应保留
        PreviewStore capacityFive = new PreviewStore(5);
        List<String> ids = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            ids.add(capacityFive.store(previewBytes(i)));
        }
        for (String id : ids) {
            assertThat(capacityFive.load(id)).as("容量 5 内的预览都应可读取").isPresent();
        }
    }

    @Test
    @DisplayName("非法 maxItems 配置回退到默认值")
    void invalidMaxItemsFallsBackToDefault() {
        // <=0 的配置应回退为默认容量，注册表仍能正常保留预览
        PreviewStore store = new PreviewStore(0);
        String id = store.store(previewBytes(1));
        assertThat(store.load(id)).isPresent();
    }

    @Test
    @DisplayName("不存在的 previewId 返回 empty（对应接口 404 行为）")
    void loadUnknownIdReturnsEmpty() {
        PreviewStore store = new PreviewStore(10);
        assertThat(store.load("does-not-exist")).isEmpty();
    }

    @Test
    @DisplayName("null previewId 返回 empty，不抛异常")
    void loadNullIdReturnsEmpty() {
        PreviewStore store = new PreviewStore(10);
        assertThat(store.load(null)).isEmpty();
    }

    @Test
    @DisplayName("store 不接受 null 字节")
    void storeRejectsNullData() {
        PreviewStore store = new PreviewStore(10);
        assertThatThrownBy(() -> store.store(null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("并发写入不会抛 ConcurrentModificationException 且幸存数量不超过容量上限")
    void concurrentStoreIsSafe() throws InterruptedException {
        int maxItems = 50;
        PreviewStore store = new PreviewStore(maxItems);
        int threadCount = 16;
        int perThread = 50;

        ExecutorService pool = Executors.newFixedThreadPool(threadCount);
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(threadCount);
        AtomicReference<Throwable> failure = new AtomicReference<>();
        // 收集所有写入返回的 id，并发写入需用线程安全集合
        Set<String> allIds = Collections.synchronizedSet(new HashSet<>());

        for (int t = 0; t < threadCount; t++) {
            final int base = t * perThread;
            pool.submit(() -> {
                try {
                    start.await();
                    for (int i = 0; i < perThread; i++) {
                        // 并发写入 + 读取，覆盖淘汰路径
                        String id = store.store(previewBytes(base + i));
                        allIds.add(id);
                        store.load(id);
                    }
                } catch (Throwable e) {
                    failure.compareAndSet(null, e);
                } finally {
                    done.countDown();
                }
            });
        }

        start.countDown();
        boolean finished = done.await(30, TimeUnit.SECONDS);
        pool.shutdownNow();

        assertThat(finished).as("并发任务应在超时前完成").isTrue();
        assertThat(failure.get())
                .as("并发写入不应抛出 ConcurrentModificationException 或其它异常")
                .isNull();

        // 统计写入完成后仍可读取的预览数量，应不超过 maxItems 上限
        int survivors = 0;
        for (String id : allIds) {
            if (store.load(id).isPresent()) {
                survivors++;
            }
        }
        assertThat(survivors)
                .as("幸存预览数量不应超过容量上限")
                .isLessThanOrEqualTo(maxItems);
    }
}
