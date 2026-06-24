package com.camborder.app.service;

import com.camborder.app.dto.RenderJobAcceptedResponse;
import com.camborder.app.dto.RenderJobRequest;
import com.camborder.app.dto.RenderJobStatusResponse;

/**
 * 渲染导出任务服务接口：提交导出任务、查询任务状态。
 */
public interface RenderJobService {

    RenderJobAcceptedResponse submitJob(RenderJobRequest request);

    RenderJobStatusResponse getJobStatus(String jobId);
}
