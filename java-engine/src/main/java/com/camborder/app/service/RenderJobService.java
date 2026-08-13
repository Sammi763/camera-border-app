package com.camborder.app.service;

import com.camborder.app.dto.RenderJobRequest;
import com.camborder.app.dto.RenderJobStatusResponse;

/**
 * 渲染导出任务服务接口：提交导出任务、查询任务状态。
 *
 * 当前实现为「同步渲染」：submitJob 完成渲染并写盘后直接返回最终状态（completed/failed），
 * 前端无需轮询即可拿到导出结果；getJobStatus 保留用于兼容查询最近一次任务。
 */
public interface RenderJobService {

    RenderJobStatusResponse submitJob(RenderJobRequest request);

    RenderJobStatusResponse getJobStatus(String jobId);
}
