package com.camborder.app.util;

import com.camborder.app.exception.FilmProcessingException;
import org.springframework.http.HttpStatus;

import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * 同一编辑视图的新代次撤销旧计算；不向复用的 Servlet 线程发送中断。
 *
 * 同一 clientId + generation 允许预览与分析协作并发登记；只有更高代次才会取消旧代次。
 * 等待与串行执行统一由 FilmTaskScheduler 负责，本类只维护取消事实和线程局部检查。
 */
public final class FilmRequestGuard {
    private static final int MAX_CLIENTS = 128;
    private static final Map<String, ClientState> CLIENTS = new LinkedHashMap<>();
    private static final ThreadLocal<Token> CURRENT = new ThreadLocal<>();

    private FilmRequestGuard() { }

    private static final class ClientState {
        private long highestGeneration;
        private final Set<Token> active = new LinkedHashSet<>();
    }

    private static final class Token {
        private final long generation;
        private volatile boolean cancelled;
        private volatile boolean finished;

        private Token(final long generation) {
            this.generation = generation;
        }

        private boolean isCancelled() {
            return cancelled || finished;
        }
    }

    /**
     * 登记一个请求代次。generation 小于该视图已登记的最高代次时立即取消；
     * generation 更高时取消所有更旧代次的 token（等待与执行中的任务在检查点退出）。
     */
    public static Scope open(final String clientId, final long generation) {
        final Token token = new Token(generation);
        if (clientId != null) {
            if (!clientId.matches("[A-Za-z0-9_-]{1,80}") || generation < 0) {
                throw new FilmProcessingException("预览请求代次非法", HttpStatus.BAD_REQUEST,
                        "FILM_REQUEST_INVALID");
            }
            synchronized (CLIENTS) {
                ClientState state = CLIENTS.get(clientId);
                if (state == null) {
                    if (CLIENTS.size() >= MAX_CLIENTS) {
                        final Iterator<Map.Entry<String, ClientState>> iterator = CLIENTS.entrySet().iterator();
                        if (iterator.hasNext()) {
                            final ClientState eldest = iterator.next().getValue();
                            iterator.remove();
                            for (Token active : eldest.active) {
                                active.cancelled = true;
                            }
                        }
                    }
                    state = new ClientState();
                    CLIENTS.put(clientId, state);
                }
                if (generation < state.highestGeneration) {
                    token.cancelled = true;
                } else {
                    if (generation > state.highestGeneration) {
                        state.highestGeneration = generation;
                        for (Token active : state.active) {
                            if (active.generation < generation) {
                                active.cancelled = true;
                            }
                        }
                    }
                    state.active.add(token);
                }
            }
        }
        if (token.cancelled) {
            throw cancelled();
        }
        final Token parent = CURRENT.get();
        CURRENT.set(token);
        return new Scope(parent, token);
    }

    /** 在像素循环、文件读取、helper 等待等检查点调用；被替代或取消时抛出受控错误。 */
    public static void check() {
        final Token token = CURRENT.get();
        if (Thread.currentThread().isInterrupted() || (token != null && token.isCancelled())) {
            throw cancelled();
        }
    }

    /**
     * 取消指定视图不高于给定代次的交互任务。幂等，不会取消导出（导出不登记 clientId）。
     */
    public static void cancelUpTo(final String clientId, final long generation) {
        if (clientId == null || generation < 0) {
            return;
        }
        synchronized (CLIENTS) {
            final ClientState state = CLIENTS.get(clientId);
            if (state == null) {
                return;
            }
            for (Token token : state.active) {
                if (token.generation <= generation) {
                    token.cancelled = true;
                }
            }
        }
    }

    /** 测试/诊断：当前未 finished 的 token 数量。 */
    static int activeTokenCount() {
        synchronized (CLIENTS) {
            int count = 0;
            for (ClientState state : CLIENTS.values()) {
                for (Token token : state.active) {
                    if (!token.finished) {
                        count++;
                    }
                }
            }
            return count;
        }
    }

    private static FilmProcessingException cancelled() {
        return new FilmProcessingException("底片计算已由新请求替代或取消",
                HttpStatus.REQUEST_TIMEOUT, "FILM_REQUEST_CANCELLED");
    }

    public static final class Scope implements AutoCloseable {
        private final Token parent;
        private final Token token;

        private Scope(final Token parent, final Token token) {
            this.parent = parent;
            this.token = token;
        }

        @Override
        public void close() {
            token.finished = true;
            synchronized (CLIENTS) {
                for (ClientState state : CLIENTS.values()) {
                    state.active.remove(token);
                }
            }
            if (parent == null) {
                CURRENT.remove();
            } else {
                CURRENT.set(parent);
            }
        }
    }
}
