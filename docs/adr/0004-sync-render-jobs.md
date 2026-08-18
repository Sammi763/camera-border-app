# ADR-0004：导出用同步链路（POST 直接返回最终状态），不用轮询

- 状态：已接受（整理自 `docs/prd.md` §4「同步导出链路」与 `RenderJobController`，2025-08 文档重构）
- 权威代码：`java-engine/.../controller/RenderJobController.java`（`POST /api/render-jobs`）、`service/impl/DefaultRenderJobService.java`

## 背景

早期导出任务若采用「提交任务 → 轮询状态」模型，会出现轮询超时误判、状态与结果不一致等问题。

## 决策

- `POST /api/render-jobs` 为**同步渲染**：请求阻塞到渲染完成，直接返回最终状态（`completed` + `outputPath`）。
- `GET /api/render-jobs/{jobId}` 保留为兼容接口，查询最近一次任务。
- 批量导出在前端多图并行发起，限制并发数，实时展示进度（当前/总数/成功/失败）。

## 替代方案

- 异步任务 + 轮询：状态机更复杂、超时语义难处理，当前单机渲染耗时可控，没必要，否决。

## 后果

- 单个请求阻塞时间 = 渲染时间，大图/批量时需依赖前端并发控制与进度展示。
- 任务状态存于内存（`RenderJobStore`，`ConcurrentHashMap`），引擎重启即丢失——当前阶段可接受（见 [ADR-0006](0006-three-process-memory-stores.md)）。
