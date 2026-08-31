package com.camborder.app.repository;

import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * 渲染任务状态内存存储（repository 层）。
 * 维护 jobId -> 同步状态机，供任务服务提交、查询与取消。
 * 当前阶段使用内存存储，不引入数据库/Redis，进程重启即丢失。
 */
@Component
public final class RenderJobStore {

    private final ConcurrentMap<String, RenderJobRecord> jobs = new ConcurrentHashMap<>();

    /** 登记任务状态机。 */
    public void put(final String jobId, final RenderJobRecord record) {
        jobs.put(jobId, record);
    }

    /**
     * 按 jobId 查询任务状态，不存在时返回 null（由控制器映射为 404）。
     */
    public RenderJobRecord get(final String jobId) {
        return jobs.get(jobId);
    }

    /** 队列满而提交失败时移除尚未执行的任务记录。 */
    public void remove(final String jobId) {
        jobs.remove(jobId);
    }
}
