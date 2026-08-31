package com.camborder.app.service;

import com.camborder.app.dto.RenderJobRequest;
import com.camborder.app.dto.RenderJobStatusResponse;

/**
 * 渲染导出任务服务接口：异步提交、查询聚合进度与取消未执行项。
 */
public interface RenderJobService {

    RenderJobStatusResponse submitJob(RenderJobRequest request);

    RenderJobStatusResponse getJobStatus(String jobId);

    /** 取消尚未开始的图片；正在写盘的一项会自然结束。 */
    RenderJobStatusResponse cancelJob(String jobId);
}
