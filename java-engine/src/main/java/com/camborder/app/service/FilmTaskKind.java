package com.camborder.app.service;

/**
 * 底片重型任务类型。
 *
 * 预览与分析是同一编辑视图的交互任务，彼此可以协作（同一 clientId/generation），
 * 但同类请求只保留最新待处理项；导出项使用冻结快照，不参与调参合并。
 */
public enum FilmTaskKind {
    /** 主预览（当前正片、适应窗口）。 */
    PREVIEW,
    /** 阶段对比、取样和 100% 像素；与主预览分开排队，避免互相覆盖。 */
    STAGE_PREVIEW,
    /** 直方图/区域统计。 */
    ANALYSIS,
    /** 导出项或导出预检。 */
    EXPORT
}
