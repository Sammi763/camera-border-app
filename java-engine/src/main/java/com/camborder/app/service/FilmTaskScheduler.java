package com.camborder.app.service;

import java.util.concurrent.Callable;

/**
 * 底片交互任务与导出项的统一调度入口。
 *
 * 设计约束（见 docs/adr/0008-tuning-coalescing-memory-and-stage-cache.md）：
 * - 全引擎同一时刻只执行一个重型任务；
 * - 每个工作台视图的每类交互操作（主预览、阶段对比、分析）只保留最新待处理快照；
 * - 等待任务总数上限 16；
 * - 交互任务优先，但导出等待时连续执行最多两个交互任务后必须执行一个导出项；
 * - 新代次取消该视图旧代次的等待任务与正在执行的计算；
 * - 导出项使用冻结快照，不因调参取消。
 */
public interface FilmTaskScheduler {

    /** 等待任务上限；超过后返回 429 FILM_BUSY。 */
    int MAX_PENDING = 16;

    /**
     * 以指定调度语义执行一个重型任务。
     *
     * @param kind        任务类型
     * @param clientId    工作台视图标识；交互任务必填，导出项为 null
     * @param generation  视图请求代次；导出项为 0
     * @param dedupeKey   同类请求的内容键；相同键的待处理/执行中请求共享结果
     * @param work        实际计算
     */
    <T> T run(FilmTaskKind kind, String clientId, long generation, String dedupeKey,
              Callable<T> work);

    /**
     * 取消指定视图不高于给定代次的交互任务（含等待与正在执行）。
     * 幂等；不会取消导出项。
     */
    void cancel(String clientId, long generation);

    /** 当前等待任务数量，供诊断和测试。 */
    int pendingCount();
}
