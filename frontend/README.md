# frontend — 工作台前端模块

React 18 + TypeScript 5 + Vite 6 的工作台 UI。负责交互、状态编排、Canvas 即时预览、任务/引擎状态展示。
**不直接操作本地文件系统和 Java 进程**：桌面能力经 preload 暴露的 `window.desktop`，引擎能力经 Java HTTP API（`services/engine/`）。

## 目录结构（实际布局）

```text
frontend/src/
  app/         入口（main.tsx、App.tsx，页面骨架组合，不承载业务逻辑）
  pages/       工作台页面（WorkspacePage）
  features/    按业务分组的界面与状态逻辑：
    queue/       图片队列（useQueue、useThumbnails、QueuePanel）
    preview/     预览（Canvas 渲染 canvasRenderer、引擎同步 usePreview、视口 usePreviewViewport）
    settings/    渲染设置（buildRecipe 装配 RenderRecipe、输出尺寸预设、品牌识别、文字层）
    template/    模板系统（内置视觉模板、模板 JSON 编解码、缩略图）
    metadata/    摄影信息（EXIF 索引、相机/镜头/胶片资产库、摄影预设 ShootingPreset、画幅目录、变量解析 resolveTextVariables、变量面板）
  components/  可复用基础 UI（Panel、InspectorPanel、TopBar、NumberInput…）
  services/    engine/（Java HTTP 客户端）+ desktop/（window.desktop 桥接、HEIC 转换）
  types/       共享类型（preview、health、runtime）
  utils/       工具（fileName 等）
  styles/      设计 token 与全局样式（styles.css，token 与 DESIGN.md 一致）
```

## 关键数据流

- **渲染配方**：UI 设置 → `features/settings/utils/buildRecipe.ts` 装配 `RenderRecipe`（单一配方，[ADR-0002](../docs/adr/0002-preview-export-share-recipe.md)）。
- **预览**：Canvas 即时预览（`canvasRenderer.ts`，设置改动立即重绘）+ 后台引擎预览同步（`POST /api/preview` → `GET /previews/{id}`，`usePreview`）。引擎失败降级 Canvas。
- **导出**：`services/engine/renderJobsApi.ts` → `POST /api/render-jobs`（同步链路，直接返回 completed + outputPath）；批量导出多图并行、限并发、实时进度。批量导出前会先逐张读取队列全部图片的 EXIF（`useExifIndex.ensureExifForExport`，失败降级为空），再构建每张图的 RenderRecipe，单图导出与批量导出共用同一解析函数（`resolveQueueItem`）。
- **摄影信息**：EXIF 经 `POST /api/photo-metadata` 读取 → 与摄影预设合并（`metadata/utils/resolveIdentity.ts`）→ 变量解析 `resolveTextVariables`（优先级：每图覆盖 > 摄影预设 > EXIF > 空，[tasks.md §0.2](../docs/tasks.md)）。摄影预设（`ShootingPreset`，[P0-05](../docs/tasks.md)）替代旧 Roll 成为主流程：预设面板（`metadata/components/ShootingPresetPanel.tsx`）支持创建/编辑/复制/删除、分类筛选、画幅与资产引用，并可应用到当前/选中/全部图片；Electron 模式持久化到 `userData/presets.json`，浏览器模式降级 localStorage。旧 `readRolls/writeRolls` IPC 仅保留兼容读取，不再被 UI 使用。
- **画幅**：统一画幅目录在 `metadata/constants/captureFormats.ts`（数码 M43/APS-C/135 全画幅/4433；胶片半格/135/645/6x6/6x7/6x8/6x9/**6x10**/**6x12**，6x10 为新增、6x12 保留），胶片 id 与引擎 `/api/film-formats` 一致；摄影预设与设置面板（含引擎不可用时的 `FALLBACK_FORMATS`）均含 6x10 与 6x12。画幅只提供信息与边框建议，不改变裁剪/尺寸设置。
- **桌面能力**：`window.desktop`（见 [electron/README.md](../electron/README.md) 的桥接 API 表）；`window.desktopRuntime` 提供 managed/baseUrl。

## 模式差异（桌面 vs 浏览器）

| 能力 | 桌面模式（Electron） | 浏览器模式（纯 Vite） |
|---|---|---|
| 持久化 | `userData/*.json`（经 IPC） | localStorage |
| 文件选择/保存 | 系统对话框 | 无（用 `/api/dev/photos` 样片） |
| HEIC 转换 | 支持（macOS sips） | 不支持 |
| 引擎地址 | dev：Vite 代理相对路径；managed：`desktopRuntime.engine.baseUrl` | Vite 代理（`vite.config.ts` → 127.0.0.1:8080） |

## 验证

- `pnpm test`（Vitest：变量解析、模板编解码、资产库编解码、输出预设、一致性等）
- `pnpm typecheck`（tsc --noEmit）
- `pnpm build`（`tsc --noEmit && vite build`）
- 测试数量以 CI 实际输出为准，不在文档维护数字

## 已知限制

- 引擎未启动/失败时仅 Canvas 即时预览，无引擎级保真预览。
- HEIC 仅桌面模式且仅 macOS；浏览器模式 HEIC 文件直接报错。
- 内置模板为「settingsPatch 合并」模型（不覆盖用户已调参数），复杂版式（图层/自由拖拽）属后续阶段（见 [docs/prd.md](../docs/prd.md) §3.9 与 [docs/tasks.md](../docs/tasks.md) P1）。
