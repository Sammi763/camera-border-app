# AGENTS.md — 工程规则速览

> 面向 Coding Agent 与人类开发者的**每次任务必读**入口。这里只放必须遵守的简短规则；
> 详细约束（为什么、完整条文）在链接指向的文档里，不在此复制。

## 项目是什么

本地桌面图片边框工具（Electron 壳 + React 工作台 + Java 图像引擎），面向摄影工作流：
加边框、摄影信息文字、胶片画幅与模板，批量导出并尽量保留原图质量。详见 [README.md](README.md)。

三个子系统，边界硬性约束（[ARCHITECTURE.md §1](ARCHITECTURE.md)）：

- `electron/`：桌面壳。窗口生命周期、系统能力（文件选择/保存）、启动与管理本地 Java 引擎。**不实现业务渲染逻辑。**
- `frontend/`：工作台 UI。交互、状态、Canvas 即时预览、任务状态展示。**不直接操作本地文件系统和 Java 进程**（只能经 preload 暴露的 `window.desktop` 或 Java HTTP API）。
- `java-engine/`：本地图像引擎（Spring Boot，端口 8080）。读取、渲染、导出、EXIF。**不关心 UI。**

跨子系统通信只能走明确接口（preload/IPC 或 HTTP API），禁止隐式耦合。

## 每次任务必做

1. **先判断归属**：改动属于 `electron`、`frontend` 还是 `java-engine`；不得跨子系统顺手重构。
2. **改 API/DTO 前读 [ARCHITECTURE.md §4](ARCHITECTURE.md)**：预览与导出必须共用 `RenderRecipe`（单一配方）；本地语义用 `imagePath` 不用 `imageUrl`；错误语义 4xx=请求不合法、5xx=服务异常；禁止为预览和导出维护两套字段不一致的配置。
3. **新增目录/分层必须说明为什么**；不满足 [ARCHITECTURE.md §7](ARCHITECTURE.md)（已有第二个实现/已有重复逻辑/不抽象会乱）就不抽象。
4. **测试必须同时覆盖 happy path 与失败路径**：空 body、缺必填字段、非法枚举、非法尺寸。只测"能通"不算完成（[ARCHITECTURE.md §6](ARCHITECTURE.md)）。
5. **注释与面向开发者的说明用简体中文**；变量名/类型名/接口名/路径名用英文（[ARCHITECTURE.md §8](ARCHITECTURE.md)）。
6. **不破坏运行时不变量**（[ARCHITECTURE.md](ARCHITECTURE.md) 与 [docs/adr/](docs/adr/)）：
   - 预览与导出同源一致（Canvas 即时预览 / 引擎预览 / 单图导出 / 批量导出四条链路）；
   - 本地优先：图片不出本机，不引入远程 URL 语义，不依赖外网（字体随包分发）；
   - 默认保真：不默认改原图色彩、不静默缩小，默认原图尺寸导出，任何影响画质/尺寸/色彩/元数据的选项必须显式展示；
   - 安全边界：渲染进程无文件系统权限，preload 只暴露白名单 API。
7. **验证**：改哪跑哪（完整命令见 [CONTRIBUTING.md](CONTRIBUTING.md)）——
   - `java-engine`：`cd java-engine && mvn test`
   - `frontend`：`pnpm --filter frontend typecheck && pnpm --filter frontend test`
   - `electron`：`pnpm --filter electron typecheck`
   - 提交前确认 CI（`.github/workflows/ci.yml`）能过。
8. **文档同步**：新增能力或修改行为时，同步更新对应模块 README 或 [docs/cookbook.md](docs/cookbook.md)；会漂移的信息（测试数量、API 清单）**不要手写数字**，链接到 CI 或源码。

## Definition of Done（[ARCHITECTURE.md §9](ARCHITECTURE.md)）

- 代码位置符合 [ARCHITECTURE.md §3](ARCHITECTURE.md) 结构约束；
- 接口与字段命名符合 ARCHITECTURE.md §4 规则；
- 有基础成功路径 + 失败路径测试；
- 占位实现与未来真实实现边界清晰；
- 没有把 UI 草稿直接硬编码成后端长期契约。

## 文档入口（从哪读起）

| 文档 | 用途 |
|---|---|
| [README.md](README.md) | 项目价值、当前功能、最短运行路径 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 架构边界、API 规则、结构规范、不变量 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 环境搭建、日常命令、验证路径、排障 |
| [docs/prd.md](docs/prd.md) | PRD 与路线图（做什么、为什么、分阶段） |
| [docs/adr/](docs/adr/) | 关键决策的原因与替代方案 |
| [docs/cookbook.md](docs/cookbook.md) | 具体任务的操作步骤（加端点/变量/模板/字体等） |
| [electron/README.md](electron/README.md)、[frontend/README.md](frontend/README.md)、[java-engine/README.md](java-engine/README.md) | 各模块职责、接口、验证、限制 |
