# ADR-0004：导出同步链路（历史记录，已被异步任务契约取代）

- 状态：已废止（阶段 2 改为异步任务；保留本文记录旧决策与迁移原因）
- 权威代码：`java-engine/.../controller/RenderJobController.java`（`POST /api/render-jobs`）、`service/impl/DefaultRenderJobService.java`

## 背景

早期导出任务曾采用「提交请求并同步等待」模型。全分辨率、高位深和批量任务会让 HTTP 请求
长期占用线程，也无法让 UI 稳定展示逐项进度或取消未执行项。

## 历史决策（不再作为当前契约）

- `POST /api/render-jobs` 曾阻塞到渲染完成并直接返回最终状态。
- 批量导出曾由前端多图并行发起。

## 当前契约

- `POST /api/render-jobs` 接受一个或多个冻结快照，返回 `202` 与 `jobId`；不等待渲染完成。
- `GET /api/render-jobs/{jobId}` 返回任务总进度、当前项、逐项状态、输出路径和失败原因。
- `DELETE /api/render-jobs/{jobId}` 只取消尚未执行的项，当前项自然收尾。
- 引擎使用有界单线程导出执行器；完整分辨率和高位深任务默认并发为 1。
- 前端由根级 `useExportController` 持有状态并轮询任务，面板切换不卸载任务状态。
- `RenderJobStore` 默认最多保留 256 条终态任务；终态首次被观察到后保留 30 分钟。
  清理只发生在存取/登记操作中，queued/running 任务不会被淘汰；容量淘汰或 TTL 过期后，
  `GET /api/render-jobs/{jobId}` 按未知任务返回 HTTP 404。配置项为
  `app.render-jobs.max-terminal-jobs` 与 `app.render-jobs.terminal-ttl-seconds`。

## 迁移后果

- 客户端必须保存 `jobId` 并轮询终态，不能把 POST 响应当作最终导出结果。
- 任务状态存于有界内存存储（`RenderJobStore`），引擎重启即丢失；容量与 TTL 淘汰保证长会话
  不会只依赖重启释放终态记录（见 [ADR-0006](0006-three-process-memory-stores.md)）。
