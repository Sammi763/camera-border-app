# frontend — 工作台前端模块

React 18 + TypeScript 5 + Vite 6 的工作台 UI。负责交互、状态编排、Canvas 即时预览、任务/引擎状态展示。
**不直接操作本地文件系统和 Java 进程**：桌面能力经 preload 暴露的 `window.desktop`，引擎能力经 Java HTTP API（`services/engine/`）。

## 目录结构（实际布局）

```text
frontend/src/
  app/         入口（main.tsx、App.tsx，页面骨架组合，不承载业务逻辑）
  pages/       工作台页面（WorkspacePage：统一渐进式工作台的状态装配）
  features/    按业务分组的界面与状态逻辑：
    queue/       图片队列（useQueue：activeItemId 当前预览 + checkedItemIds 批量选中两组独立状态；useThumbnails、QueuePanel 复选框多选）
    preview/     预览（Canvas 渲染 canvasRenderer、引擎同步 usePreview、视口 usePreviewViewport；批量导出作用域/失败重试/打开目录）
    settings/    渲染设置（buildRecipe 装配 RenderRecipe、输出尺寸预设、品牌识别、文字层）
    template/    模板系统（统一工作台样式页签中的版式画廊、内置风格模板、模板 JSON 编解码、CSS 示意缩略图 TemplateThumbnail、当前照片实时缩略图 LiveTemplateThumbnail）
    metadata/    摄影信息（EXIF 索引、相机/镜头/胶片资产库、摄影预设 ShootingPreset、画幅目录、变量解析 resolveTextVariables、来源标识 resolveIdentityFieldSources、变量面板与信息摘要）
    quick/       无界面兼容工具（确定性模板推荐 recommendTemplate、文本预设构建 buildPresetFromText；不包含工作台入口）
    engineHealth/ 引擎异常横幅与诊断抽屉（EngineStatusBar + useEngineDiagnostics，托管模式专用）
  components/  可复用基础 UI（Panel、InspectorPanel、TopBar、NumberInput…）
  services/    engine/（Java HTTP 客户端）+ desktop/（window.desktop 桥接、HEIC 转换）
  types/       共享类型（preview、health、runtime）
  utils/       工具（fileName 等）
  styles/      设计 token 与全局样式（styles.css，token 与 DESIGN.md 一致）
```

## 关键数据流

- **统一工作台**：空队列显示欢迎页；有照片后固定显示顶部栏、左队列、中预览、右侧「样式 / 摄影信息 / 输出」三页签和底部导出 Dock。导入后自动应用「摄影信息卡」默认模板，用户手动选过模板则不覆盖。版式管理、拍摄信息预设和资料库通过抽屉打开，所有入口共享同一份 RenderRecipe、身份合并链与导出逻辑。
- **工作台主题与预览背景**：默认深色影棚主题，可切换暖灰浅色或跟随系统；预览背景可选中性黑、灰、白，均为界面状态，不进入导出配方。
- **工作台快捷键**：上下方向键切换队列，空格勾选，Delete 删除，`F` 适应，`1` 显示 100%，`Ctrl/Cmd+Z` 与 `Ctrl/Cmd+Shift+Z` 撤销/重做，`E` 或 `Ctrl/Cmd+Enter` 导出。输入控件和管理抽屉内不拦截这些快捷键；抽屉支持焦点锁定、Escape 关闭并恢复打开按钮焦点。
- **队列与工作会话**：`activeItemId`（当前预览图，点击切换）与 `checkedItemIds`（复选框批量选中）相互独立；根级唯一 `operationScope` 为 `active / checked / all`，供预设和批量导出共同使用。队列支持单图删除、删除已选、清空及撤销/重做；每图文字/身份/预设覆盖同样进入历史。会话只持久化结构化路径与覆盖，恢复时经受限 IPC 检查丢失文件，不持久化预览二进制数据。
- **模板推荐**：兼容工具 `quick/utils/recommendTemplate.ts` 按确定性规则给出「建议模板」标记，只提示不修改用户设置；推荐标记在样式页签的统一版式画廊内展示。
- **实时缩略图**：模板卡片优先用 `LiveTemplateThumbnail` 以当前照片经同一 `drawPreviewToCanvas` 渲染（缩略图=预览=导出同一配置）；点击模板后中间预览立即更新。
- **边框风格**：`RenderSettings.borderStyle` → recipe.borderStyle；Canvas `drawBorderStyle` 与引擎 `BorderStyleRenderer` 同一几何规格（8 种风格，未知 id 回退）。
- **RAW 来源状态**：预览元信息栏只允许显示「内嵌 JPEG 预览」或「无可读取预览，导入失败」；导出摘要只能说明内嵌 JPEG 来源或明确失败，不显示其他 RAW 解码状态。
- **渲染配方**：UI 设置 → `features/settings/utils/buildRecipe.ts` 装配 `RenderRecipe`（单一配方，[ADR-0002](../docs/adr/0002-preview-export-share-recipe.md)）。
- **预览**：Canvas 即时预览（`canvasRenderer.ts`，设置改动立即重绘）+ 后台引擎预览同步（`POST /api/preview` → `GET /previews/{id}`，`usePreview`）。选图或配方更新会物理取消旧请求，只保留最新预览；预览/缩略图在解码阶段按目标尺寸 subsampling。缓存键为路径、请求尺寸、mtime、源字节数和 `RenderRecipe` 哈希，缓存按字节上限淘汰并释放 `blob:` URL，绝不缓存原图像素数据。引擎失败降级 Canvas；RAW 只能显示内嵌 JPEG 预览，无可读取预览时显示导入失败。
- **导出**：根级 `useExportController` 统一持有导出状态，因此工作台页签切换不会中断任务展示。它在提交前冻结图片范围、`RenderRecipe` 与 `ExportSettings`，经 `POST /api/render-jobs` 接受 `202 + jobId`，再轮询 `GET /api/render-jobs/{id}` 展示总进度、当前项、逐项结果与失败原因；`DELETE` 只取消未执行项。引擎使用有界单线程队列，完整分辨率与高位深导出默认并发为 1。单图与批量入口互斥，批量失败项可在原目录重试并打开输出目录。
- **引擎状态与双层兜底**：引擎健康轮询（`useEngineHealth`）区分 loading(启动中)/ready/error 三态。托管模式下健康时隐藏状态；异常时只显示一条顶部非阻塞状态条（`features/engineHealth/EngineStatusBar.tsx`），诊断细节通过焦点受限抽屉查看，并保留「重试」「查看日志」入口；ready 时自动消失。引擎不可用时工作台完全可访问：
  - **本地预览兜底**：当前预览与队列缩略图在引擎请求失败时经 `loadLocalImagePreview` IPC 用主进程 nativeImage 生成本地预览（`services/desktop/localImagePreview.ts`）；RAW 不走系统显影，只有读取到内嵌 JPEG 才能显示，否则显示「无可读取预览，导入失败」；HEIC/HEIF 等系统无法解码的格式显式提示等待引擎恢复，不静默伪装。
  - **导出禁用**：引擎不可用时单图/批量导出按钮保留但禁用（title 说明原因）；高保真导出始终要求 Java 引擎，不提供 Canvas 替代导出。引擎恢复后自动恢复可用。
  - **具体失败原因**：引擎 error 态状态条展示**诊断 IPC 返回的具体原因**（runtime-blocked 白名单指引 / start-failed / port-conflict 等，`EngineStatusBar` 经 `useEngineDiagnostics` 读取），而非只显示健康检查的「引擎不可达」。
- **摄影信息**：EXIF 经 `POST /api/photo-metadata` 读取 → 与摄影预设合并（`metadata/utils/resolveIdentity.ts`）→ 变量解析 `resolveTextVariables`（优先级：每图覆盖 > 摄影预设 > EXIF > 空，[tasks.md §0.2](../docs/tasks.md)）。摄影预设（`ShootingPreset`，[P0-05](../docs/tasks.md)）替代旧 Roll 成为主流程：预设面板（`metadata/components/ShootingPresetPanel.tsx`）支持创建/编辑/复制/删除、分类筛选、画幅与资产引用，并可应用到当前/选中/全部图片；Electron 模式持久化到 `userData/presets.json`，浏览器模式降级 localStorage。旧 `readRolls/writeRolls` IPC 仅保留兼容读取，不再被 UI 使用。
- **动效偏好**：工作台样式遵循 `prefers-reduced-motion: reduce`，会关闭过渡、动画和滚动平滑效果。
- **画幅**：统一画幅目录在 `metadata/constants/captureFormats.ts`（数码 M43/APS-C/135 全画幅/4433；胶片半格/135/645/6x6/6x7/6x8/6x9/**6x10**/**6x12**，6x10 为新增、6x12 保留），胶片 id 与引擎 `/api/film-formats` 一致；摄影预设与设置面板（含引擎不可用时的 `FALLBACK_FORMATS`）均含 6x10 与 6x12。画幅只提供信息与边框建议，不改变裁剪/尺寸设置。
- **引擎请求地址**：所有引擎 API client、预览图和缩略图都只生成同源相对 `/api/**`、`/previews/**` 请求。开发时由 Vite 代理转发到受控的 `127.0.0.1` 开发端口；生产时由 Electron `app://app` 安全代理转发到 JavaBridge 当前实际端口。`window.desktopRuntime` 只提供 `engine.managed`，Renderer 不读取、保存或拼接 Java 引擎绝对地址。
- **桌面能力**：`window.desktop`（见 [electron/README.md](../electron/README.md) 的桥接 API 表）；`window.desktopRuntime` 只提供 `appName`、`platform` 和 `engine.managed`。生产代理在 JavaBridge 启动中返回结构化 `503`（`ENGINE_STARTING`），`useEngineHealth` 保持「启动中」；其它不可用响应进入「真正失败」状态。

## 模式差异（桌面 vs 浏览器）

| 能力 | 桌面模式（Electron） | 浏览器模式（纯 Vite） |
|---|---|---|
| 持久化 | `userData/*.json`（经 IPC） | localStorage |
| 文件选择/保存 | 系统对话框 | 无（用 `/api/dev/photos` 样片） |
| HEIC 转换 | 当前开发实现（macOS `sips`；不代表最终平台支持） | 当前开发模式不支持 |
| 引擎请求 | dev：相对 `/api`、`/previews`，经 Vite 代理；managed：相对请求经 `app://app` 安全代理 | 相对请求经 Vite 代理（`vite.config.ts` → 127.0.0.1:8099） |

## 验证

- `pnpm test`（Vitest：变量解析、模板编解码、资产库编解码、输出预设、一致性等）
- `pnpm typecheck`（tsc --noEmit）
- `pnpm build`（`tsc --noEmit && vite build`）
- 打包应用 E2E：当前 macOS 架构在根目录执行 `pnpm package && pnpm e2e:packaged`；该脚本启动实际打包应用，使用随包 JRE，驱动 `app://` 页面完成固定样片导入、默认自动应用「摄影信息卡」、Canvas 照片像素可见性、版式应用和导出文件校验，不启动 Vite，也不使用系统 Java。它会保存同步后的预览截图，并在最小窗口下要求照片可见或显示「预览区域不足」。该结果不宣称 macOS x64 或 Windows x64 已实测。
- 测试数量以 CI 实际输出为准，不在文档维护数字

## 已知限制

- 引擎未启动/失败时仅 Canvas 即时预览，无引擎级保真预览。
- HEIC/HEIF 当前开发实现依赖桌面 macOS `sips`；这不是最终平台限制。Windows x64 的最终 HEIC/HEIF 支持状态为 `NOT_RUN`，须完成 [最终契约](../docs/prd.md) §0 和 [样片矩阵](../docs/test-samples.md) 后才能宣称支持。
- 内置模板为「settingsPatch 合并」模型（不覆盖用户已调参数），复杂版式（图层/自由拖拽）不属于本阶段验收范围（见 [docs/prd.md](../docs/prd.md) §3.9 与 [docs/tasks.md](../docs/tasks.md) P1）。
