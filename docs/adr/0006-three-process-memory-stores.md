# ADR-0006：三进程架构 + 内存态存储（现阶段不引入数据库）

- 状态：已接受（整理自 `ARCHITECTURE.md` §1 与 `RenderJobStore`/`PreviewStore` 源码，2025-08 文档重构）
- 权威代码：`java-engine/.../repository/RenderJobStore.java`、`PreviewStore.java`；`electron/src/ipc/templateStorage.ts`、`assetStorage.ts`

## 背景

项目是本地桌面工具，数据量小（图片队列、模板、相机/镜头/胶片资产、摄影预设、渲染任务状态）。为「未来假想场景」引入 DB/Redis/消息队列不符合本阶段抽象规则。

## 决策

- **三进程架构**：Electron 主进程（壳） + React 渲染进程（UI） + Java 引擎（渲染），跨进程只走 preload/IPC 或 HTTP API（见 `ARCHITECTURE.md` §1）。
- **存储分层**：
  - 引擎侧任务/预览状态：**内存**；任务由 `RenderJobStore` 按终态数量与 TTL 有界保留，
    queued/running 任务不会被淘汰，进程重启仍会丢失；
  - 用户数据（模板/资产/摄影预设）：Electron 主进程写 `userData` 下的 JSON 文件；浏览器模式降级 localStorage。旧版本的 `rolls.json` 只用于迁移，不再作为新产品对象；
  - 原图与导出文件：用户磁盘，引擎读写本地路径。
- 现阶段不引入数据库/队列；占位实现与真实实现边界清晰（`ARCHITECTURE.md` §3）。

## 替代方案

- 引入 SQLite/H2 存任务状态：本地单机场景收益低、复杂度高，否决。
- 前端直接读写文件：违反安全边界（渲染进程无文件系统权限），否决。

## 后果

- 引擎重启后历史任务查询返回 404（预期行为，前端重跑即可）。
- 桌面模式与浏览器模式数据不互通（不同存储介质），文档需明确说明。
- 未来若需要跨会话任务/更大的数据量，再引入持久化，不改变进程边界。
