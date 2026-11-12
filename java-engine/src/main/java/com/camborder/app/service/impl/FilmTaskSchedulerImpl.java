package com.camborder.app.service.impl;

import com.camborder.app.exception.FilmProcessingException;
import com.camborder.app.service.FilmTaskKind;
import com.camborder.app.service.FilmTaskScheduler;
import com.camborder.app.util.FilmRequestGuard;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;

/**
 * 全引擎唯一的重型任务闸门。
 *
 * 交互任务以调用线程执行（Servlet / 导出工作线程），调度器只负责准入顺序和取消；
 * 这样不会把大图计算搬到额外线程，也不会与现有 Servlet 线程池形成第二套串行保护。
 */
@Component
public final class FilmTaskSchedulerImpl implements FilmTaskScheduler {

    private final ReentrantLock lock = new ReentrantLock(true);
    private final Condition changed = lock.newCondition();
    private final Deque<Task<?>> interactions = new ArrayDeque<>();
    private final Deque<Task<?>> exports = new ArrayDeque<>();
    private final Map<String, Task<?>> dedupe = new HashMap<>();
    private final ThreadLocal<Task<?>> owner = new ThreadLocal<>();

    private Task<?> running;
    private int pending;
    private int consecutiveInteractions;

    @Override
    public <T> T run(final FilmTaskKind kind, final String clientId, final long generation,
                     final String dedupeKey, final Callable<T> work) {
        if (kind == null || work == null) {
            throw new IllegalArgumentException("kind and work are required");
        }
        if (kind != FilmTaskKind.EXPORT) {
            if (clientId == null || !clientId.matches("[A-Za-z0-9_-]{1,80}") || generation < 0) {
                throw new FilmProcessingException("底片调度请求非法", HttpStatus.BAD_REQUEST,
                        "FILM_REQUEST_INVALID");
            }
        }
        // 同一线程内的嵌套调用（例如导出内部再次调用流水线）不再申请第二个槽位。
        if (owner.get() != null) {
            return call(work);
        }

        final String key = dedupeKey == null ? null
                : kind.name() + "|" + clientId + "|" + generation + "|" + dedupeKey;
        Task<T> task = null;

        lock.lock();
        try {
            if (key != null) {
                final Task<?> existing = dedupe.get(key);
                if (existing != null && !existing.cancelled) {
                    lock.unlock();
                    try {
                        return await(existing);
                    } finally {
                        lock.lock();
                    }
                }
            }

            // 同一视图每类交互操作只保留最新待处理请求。
            if (kind != FilmTaskKind.EXPORT) {
                // 网络请求可能乱序到达；旧代次不能先删除已经排队的新代次。
                final boolean newerWaiting = interactions.stream().anyMatch(item ->
                        clientId.equals(item.clientId) && item.generation > generation);
                final boolean newerRunning = running != null && clientId.equals(running.clientId)
                        && running.generation > generation;
                if (newerWaiting || newerRunning) throw cancelled();
                removePending(kind, clientId, generation, null);
            }
            if (pending >= MAX_PENDING) {
                throw busy();
            }

            task = new Task<>(kind, clientId, generation, key);
            if (key != null) {
                dedupe.put(key, task);
            }
            if (kind == FilmTaskKind.EXPORT) {
                exports.addLast(task);
            } else {
                interactions.addLast(task);
            }
            pending++;
            selectNext();
            changed.signalAll();

            while (!task.admitted) {
                if (task.cancelled) {
                    if (task.admitted && running == task) {
                        running = null;
                        selectNext();
                    }
                    changed.signalAll();
                    throw cancelled();
                }
                try {
                    changed.await();
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    cancelLocked(task);
                    throw cancelled();
                }
                if (task.cancelled) {
                    if (task.admitted && running == task) {
                        running = null;
                        selectNext();
                    }
                    changed.signalAll();
                    throw cancelled();
                }
            }
            if (task.cancelled) {
                if (running == task) {
                    running = null;
                    selectNext();
                }
                changed.signalAll();
                throw cancelled();
            }
            owner.set(task);
        } finally {
            lock.unlock();
        }

        try {
            final T result = call(work);
            task.future.complete(result);
            return result;
        } catch (RuntimeException exception) {
            task.future.completeExceptionally(exception);
            throw exception;
        } catch (Exception exception) {
            final FilmProcessingException wrapped = new FilmProcessingException(
                    "底片任务执行失败", HttpStatus.INTERNAL_SERVER_ERROR, "FILM_TASK_FAILED");
            wrapped.initCause(exception);
            task.future.completeExceptionally(wrapped);
            throw wrapped;
        } finally {
            owner.remove();
            lock.lock();
            try {
                if (running == task) {
                    running = null;
                }
                if (task.key != null && dedupe.get(task.key) == task) {
                    dedupe.remove(task.key);
                }
                selectNext();
                changed.signalAll();
            } finally {
                lock.unlock();
            }
        }
    }

    @Override
    public void cancel(final String clientId, final long generation) {
        if (clientId == null || generation < 0) {
            return;
        }
        lock.lock();
        try {
            final Iterator<Task<?>> iterator = interactions.iterator();
            while (iterator.hasNext()) {
                final Task<?> task = iterator.next();
                if (clientId.equals(task.clientId) && task.generation <= generation) {
                    iterator.remove();
                    completeCancelled(task);
                }
            }
            if (running != null && running.kind != FilmTaskKind.EXPORT
                    && clientId.equals(running.clientId) && running.generation <= generation) {
                running.cancelled = true;
                completeCancelled(running);
            }
            FilmRequestGuard.cancelUpTo(clientId, generation);
            selectNext();
            changed.signalAll();
        } finally {
            lock.unlock();
        }
    }

    @Override
    public int pendingCount() {
        lock.lock();
        try {
            return pending;
        } finally {
            lock.unlock();
        }
    }

    /** 与旧请求同视图同类型的待处理项被新参数覆盖时，旧等待者得到正常取消语义。 */
    private void removePending(final FilmTaskKind kind, final String clientId,
                               final long generation, final Task<?> except) {
        final Iterator<Task<?>> iterator = interactions.iterator();
        while (iterator.hasNext()) {
            final Task<?> task = iterator.next();
            if (task == except) {
                continue;
            }
            if (clientId.equals(task.clientId)
                    && ((task.kind == kind && task.generation <= generation) || task.generation < generation)) {
                iterator.remove();
                completeCancelled(task);
            }
        }
        // 更高代次同时取消旧代次正在执行的交互计算；guard 在像素/文件检查点退出。
        if (running != null && running.kind != FilmTaskKind.EXPORT
                && clientId.equals(running.clientId)
                && running.generation < generation) {
            running.cancelled = true;
            completeCancelled(running);
            FilmRequestGuard.cancelUpTo(clientId, generation - 1);
        }
    }

    private void cancelLocked(final Task<?> task) {
        task.cancelled = true;
        if (task.admitted && running == task) {
            running = null;
        } else {
            boolean removed = interactions.remove(task) || exports.remove(task);
            if (!removed && task.admitted) {
                running = null;
            }
        }
        completeCancelled(task);
        selectNext();
        changed.signalAll();
    }

    private void completeCancelled(final Task<?> task) {
        task.cancelled = true;
        if (task.key != null && dedupe.get(task.key) == task) {
            dedupe.remove(task.key);
        }
        task.future.completeExceptionally(cancelled());
        if (!task.admitted) {
            pending = Math.max(0, pending - 1);
        }
    }

    private void selectNext() {
        if (running != null) {
            return;
        }
        final boolean exportWaiting = !exports.isEmpty();
        Task<?> next = null;
        if (exportWaiting && (interactions.isEmpty() || consecutiveInteractions >= 2)) {
            next = exports.pollFirst();
            consecutiveInteractions = 0;
        } else if (!interactions.isEmpty()) {
            next = interactions.pollFirst();
            consecutiveInteractions++;
        } else if (!exports.isEmpty()) {
            next = exports.pollFirst();
            consecutiveInteractions = 0;
        }
        if (next != null) {
            next.admitted = true;
            running = next;
            pending = Math.max(0, pending - 1);
        }
    }

    private <T> T await(final Task<?> task) {
        try {
            @SuppressWarnings("unchecked")
            final T result = (T) task.future.get();
            return result;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw cancelled();
        } catch (ExecutionException exception) {
            final Throwable cause = exception.getCause();
            if (cause instanceof RuntimeException) {
                throw (RuntimeException) cause;
            }
            throw new FilmProcessingException("底片任务执行失败", HttpStatus.INTERNAL_SERVER_ERROR,
                    "FILM_TASK_FAILED");
        }
    }

    private static <T> T call(final Callable<T> work) {
        try {
            return work.call();
        } catch (RuntimeException exception) {
            throw exception;
        } catch (Exception exception) {
            final FilmProcessingException wrapped = new FilmProcessingException(
                    "底片任务执行失败", HttpStatus.INTERNAL_SERVER_ERROR, "FILM_TASK_FAILED");
            wrapped.initCause(exception);
            throw wrapped;
        }
    }

    private static FilmProcessingException busy() {
        return new FilmProcessingException("底片处理繁忙，请稍后重试", HttpStatus.TOO_MANY_REQUESTS,
                "FILM_BUSY");
    }

    private static FilmProcessingException cancelled() {
        return new FilmProcessingException("底片任务已取消或被新参数替代",
                HttpStatus.REQUEST_TIMEOUT, "FILM_REQUEST_CANCELLED");
    }

    private static final class Task<T> {
        private final FilmTaskKind kind;
        private final String clientId;
        private final long generation;
        private final String key;
        private final CompletableFuture<T> future = new CompletableFuture<>();
        private volatile boolean cancelled;
        private boolean admitted;

        private Task(final FilmTaskKind kind, final String clientId, final long generation,
                     final String key) {
            this.kind = kind;
            this.clientId = clientId;
            this.generation = generation;
            this.key = key;
        }
    }
}
