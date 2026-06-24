package com.camborder.app.repository;

import com.camborder.app.dto.RenderJobStatusResponse;
import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * 渲染任务状态内存存储（repository 层）。
 * 维护 jobId -> 任务状态的映射，供渲染任务服务写入、状态接口读取。
 * 单一职责：只存取任务状态，不做业务渲染。
 * 当前阶段使用内存存储，不引入数据库/Redis/队列，进程重启即丢失。
 */
@Component
public final class RenderJobStore {

    private final ConcurrentMap<String, RenderJobStatusResponse> jobs = new ConcurrentHashMap<>();

    /** 登记任务状态。 */
    public void put(final String jobId, final RenderJobStatusResponse status) {
        jobs.put(jobId, status);
    }

    /**
     * 按 jobId 查询任务状态，不存在时返回 null（由控制器映射为 404）。
     */
    public RenderJobStatusResponse get(final String jobId) {
        return jobs.get(jobId);
    }
}
