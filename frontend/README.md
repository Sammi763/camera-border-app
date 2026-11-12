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
  components/  可复用基础 UI（Panel、InspectorPanel、TopBar、NumberInput、快捷键速查 ShortcutOverlay、应用内帮助 HelpPanel…）
  services/    engine/（Java HTTP 客户端）+ desktop/（window.desktop 桥接、HEIC 转换）
  types/       共享类型（preview、health、runtime）
  utils/       工具（fileName 等）
  styles/      设计 token 与全局样式（styles.css，token 与 DESIGN.md 一致）
```

## 关键数据流

- **统一工作台**：空队列显示欢迎页；有照片后固定显示顶部栏、左队列、中预览、右侧「样式 / 摄影信息 / 输出」三页签和底部导出 Dock。仅当无已保存设置且用户未手动修改过设置时，导入后自动应用「摄影信息卡」默认模板；用户手动选过模板或修改过设置则不覆盖。版式管理、拍摄信息预设和资料库通过抽屉打开，所有入口共享同一份 RenderRecipe、身份合并链与导出逻辑。
- **工作台主题与预览背景**：默认跟随系统；可切换深色玻璃、浅色玻璃或跟随系统，已保存偏好（`dark / warm / system`）保持有效。预览背景可选中性黑、灰、白，均为界面状态，不进入导出配方。
- **工作台快捷键**：上下方向键切换队列，空格勾选，Delete 删除，`F` 适应，`1` 显示 100%，`Ctrl/Cmd+Z` 与 `Ctrl/Cmd+Shift+Z` 撤销/重做，`E` 或 `Ctrl/Cmd+Enter` 导出，`?` 打开快捷键速查面板（数据单一来源 `components/layout/shortcutList.ts`），`\` 按住查看无边框原图（松开恢复）。输入控件内不拦截这些快捷键；模态对话框（管理抽屉、速查面板、帮助）打开期间工作台快捷键整体暂停，且 `?` 不会在抽屉之上叠加第二个面板；抽屉与速查面板均支持焦点圈定、Escape 关闭。TopBar「帮助」按钮打开应用内帮助抽屉（`HelpPanel`，静态用户向内容，不读文件系统）。
- **队列与工作会话**：`activeItemId`（当前预览图，点击切换）与 `checkedItemIds`（复选框批量选中）相互独立；根级唯一 `operationScope` 为 `active / checked / all`，供预设和批量导出共同使用。导入按 `sourcePath`（反斜杠归一）去重，重复项跳过并在导入提示中计数。队列支持单图删除、删除已选、右键菜单批量关闭（删除其他/左侧/右侧、清空；菜单坐标按视口边缘钳制）、HTML5 拖拽排序（拖动行降透明、悬停行虚线高亮落点，drop/dragEnd 后清除）、按文件名升降序稳定排序，全部操作走同一撤销历史（拖回原位与无效操作不产生历史条目）。每图文字/身份/预设覆盖同样进入历史。会话只持久化结构化路径与覆盖，恢复时经受限 IPC 检查丢失文件，不持久化预览二进制数据。
- **预览编辑态辅助**：预览元信息栏提供「网格」开关（三分线 + 中心十字，`drawImageGridOverlay` 只在 Canvas 预览绘制）与「原图」按住按钮（与 `\` 键等价；窗口失焦自动退出，按住期间切换图片继续显示新图原图）。裁切模式下在图片区域内按住拖动直接更新 `imagePlacement.focalX/focalY`（经 `calculateFocalFromPointer` 换算并走 `settingsController.update` 标记 userModified，拖动时光标切换为 grabbing）；非裁切模式保持画布平移。连续手势类更新携带 `options.historyTag`，整段拖动合并为一条设置撤销历史（一次 ⌘Z 回到拖动前）。三类辅助均为编辑态叠加，不进入 `RenderRecipe`，引擎渲染与导出结果不含辅助内容。
- **模板推荐**：兼容工具 `quick/utils/recommendTemplate.ts` 按确定性规则给出「建议模板」标记，只提示不修改用户设置；推荐标记在样式页签的统一版式画廊内展示。
- **实时缩略图**：模板卡片优先用 `LiveTemplateThumbnail` 以当前照片经同一 `drawPreviewToCanvas` 渲染（缩略图=预览=导出同一配置）；点击模板后中间预览立即更新。
- **边框风格**：`RenderSettings.borderStyle` → recipe.borderStyle；Canvas `drawBorderStyle` 与引擎 `BorderStyleRenderer` 同一几何规格（8 种风格，未知 id 回退）。
- **RAW 来源状态（普通模式）**：预览元信息栏只允许显示「内嵌 JPEG 预览」或「无可读取预览，导入失败」；导出摘要只能说明内嵌 JPEG 来源或明确失败，不显示其他 RAW 解码状态。底片数字化模式是独立显式入口，实施中，见 [ADR-0007](../docs/adr/0007-explicit-film-digitization-mode.md)，完成前不得展示为可用。
- **底片编辑与输出**：右侧「底片」页签（`features/editing/`）写入每图 `imageProcessing`；预览在底片模式只展示引擎校色结果，不用普通 Canvas 源图冒充；导出输出组合为 sRGB JPEG、16-bit sRGB TIFF、16-bit Rec.2020 TIFF，可勾选不带框母版；同卷同步只复制勾选的字段组并合并为一次撤销。真实 RAW 需要随包 LibRaw helper，真实负片样片与安装包证据未验收。
- **底片调参合并（T10）**：控件值/历史立即更新，引擎请求经 `services/engine/tuningScheduler.ts` 合并——每个视图一份在途请求、一份最新待提交快照，拖动最多每 250ms 提交一次，松手/失焦/确认输入立即提交；相同快照不重复。主预览、阶段对比和直方图共享 `PreviewState.engineRecipe` / `engineClientId` / `engineGeneration`，先预览后分析，等待时保留上一张正确画面。切图/关闭底片模式/卸载会中止请求并发送 `DELETE /api/film-requests/{clientId}?generation=n`；取消与被替代不展示「引擎不可达」。见 [ADR-0008](../docs/adr/0008-tuning-coalescing-memory-and-stage-cache.md)。
- **方向与视口**：EXIF Orientation 1–8 由 Java 解码边界只处理一次，前端不重复旋转；Canvas 使用引擎返回的有向尺寸。预览仅有「适应画布」和「100%」两态，前者等比显示完整图片，后者以自然合成像素渲染并在溢出时允许滚动/拖拽、未溢出轴居中。
- **图片区域与 Polaroid**：图片区域设置独立管理方向（自动/横屏/竖屏/方形）、比例（原图、1:1、4:5、3:4、2:3、3:2、9:16）和显示模式（完整显示/填满裁切）；页面分别展示图片区域、预览 CSS 尺寸和导出像素尺寸。Polaroid 的图片区辅助线只属于编辑态，不进入 RenderRecipe 或导出像素。
- **渲染配方**：UI 设置 → `features/settings/utils/buildRecipe.ts` 装配 `RenderRecipe`（单一配方，[ADR-0002](../docs/adr/0002-preview-export-share-recipe.md)）。
- **预览**：Canvas 即时预览（`canvasRenderer.ts`，设置改动立即重绘）+ 后台引擎预览同步（`POST /api/preview` → `GET /previews/{id}`，`usePreview`）。引擎请求由 `TuningScheduler` 合并为每视图一份在途 + 一份最新待提交，拖动最多每 250ms 提交一次；选图/关闭底片模式会中止请求并取消旧代次，只保留最新预览；预览/缩略图在解码阶段按目标尺寸 subsampling。缓存键为路径、请求尺寸、mtime、源字节数和 `RenderRecipe` 哈希，缓存按字节上限淘汰并释放 `blob:` URL，绝不缓存原图像素数据。引擎失败降级 Canvas；RAW 只能显示内嵌 JPEG 预览，无可读取预览时显示导入失败。
- **导出**：根级 `useExportController` 统一持有导出状态，因此工作台页签切换不会中断任务展示。它在提交前冻结图片范围、`RenderRecipe` 与 `ExportSettings`，经 `POST /api/render-jobs` 接受 `202 + jobId`，再轮询 `GET /api/render-jobs/{id}` 展示总进度、当前项、逐项结果与失败原因；`DELETE` 只取消未执行项。引擎使用有界单线程队列，完整分辨率与高位深导出默认并发为 1。单图与批量入口互斥，批量失败项可在原目录重试并打开输出目录。
- **专业导出**：工作台先读取 `GET /api/capabilities`，只展示真实可用的导出档位，再用 `POST /api/export-preflight` 展示实际预检摘要；导出完成后显示引擎返回的 `FidelityReport`。固定档位不能满足能力时失败，不以“已完成但跳过”伪装成功；用户改动固定参数后进入自定义档位并显式显示不支持或降级。
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
| HEIC 转换 | 随包解码助手转临时 PNG；当前仅 macOS arm64 验证 | 浏览器模式不提供本地 HEIC 转换 |
| 引擎请求 | dev：相对 `/api`、`/previews`，经 Vite 代理；managed：相对请求经 `app://app` 安全代理 | 相对请求经 Vite 代理（`vite.config.ts` → 127.0.0.1:8099） |

## 本轮体验优化（2026-10）

- **预览帧清理**：每次绘制先在物理像素空间清空整个 Canvas，再按 DPR 绘制；切换版式、缩小构图或遇到无效尺寸时不残留上一帧。
- **预览几何同源**：Canvas 预览以「方向归一后的原图尺寸」建立逻辑合成空间（`calculateCompositionLayout`），
  边框/字号/Logo/装饰随同一 `viewScale` 缩放，fit 模式整个合成居中留白；引擎预览与档位导出按同一
  `renderScale` 语义缩放（见 java-engine/README）。代理图只替代像素，不改变布局语义。
- **100% 像素查看**：actual 模式 = 1 原图像素 : 1 CSS px，只栅格化可视区域（backing store 受容器×DPR 约束）；
  进入 100% 时按需请求引擎「裸图」全尺寸预览（上限 8192，`useActualSizePreview`），加载期间显示
  「100% · 代理像素」徽标，不得把插值放大称为原图细节。
- **统一导出命令**：每个范围只有一个主按钮（导出当前图片 / 导出已选 N 张 / 导出全部 N 张），
  与 `E`、⌘/Ctrl+Enter 同一条命令；输出摘要由实际档位/格式/尺寸/元数据策略生成；
  档位不可用时在选择保存位置之前禁用并解释。
- **全局撤销协调**：队列与设置两套历史条目携带全局序号与动作描述（`utils/historySequence.ts`），
  ⌘Z 优先撤销序号较大的动作，⌘⇧Z 优先重做序号较小的待恢复动作，保持跨栈时间顺序；队列/设置面板按钮提示具体动作。
- **导出取消与状态待确认**：准备阶段本地取消令牌；提交响应丢失或查询断线进入
  `unconfirmed`（保留 jobId 与冻结批次），提供「重新查询任务状态」与「打开输出目录核对」；
  引擎重启后如实解释任务记录失效，绝不自动重复提交。
- **能力反馈**：输出页区分检查中/已就绪/缺组件/请求失败，缺组件列出具体名称与原因，支持重新检查。
- **版式缩略图**：画廊使用与主预览同源的有效摄影信息/变量解析/品牌结果与当前变体配置；
  仅可视卡片绘制（IntersectionObserver 预载），同一照片的缩小位图全卡片共享。
- **EXIF 读取**：批量读取固定并发上限 4、整批一次状态发布、支持 signal 取消；
  读取失败进 `exifFailures`（可重试），与「确无 EXIF」明确区分；文件版本（mtime+size）失效。
- **丢失文件重定位**：缺失条目保留编辑/预设/排序，支持单文件选择器（`pickReplacementFile`）
  与文件夹级按名匹配；同名候选不静默绑定，逐个人工确认。
- **批量命名与结果**：命名方式支持「原文件名＋后缀」与「自定义前缀＋序号」（含实际文件名样例预览）；
  逐文件结果折叠为可展开列表；队列支持按文件名筛选与「仅看缺失」。
- **可访问性**：分栏手柄支持键盘调节（方向键/Shift 加速/Home 复位）并暴露 aria-valuenow；
  队列行主体改为真实 button（消除嵌套交互控件）；正文字号统一为 14px（`--font-size-body`）。

## 本轮 UI 改版（2026-11：通透液态玻璃）

- **视觉变量**：`styles.css` 顶部 token 统一为冷白 `#F4F6FA`、iOS 蓝 `#007AFF`、系统无衬线字体、
  12/20/24px 圆角与玻璃材质（68%–84% 不透明度、20px 背景模糊、高光边缘、柔和阴影）。
  深色玻璃与跟随系统使用同一组语义 token；`warm` 作为既有持久化值继续映射浅色玻璃。
- **工作台外壳**：顶栏、左右侧栏、预览悬浮工具条与底部导出 Dock 采用玻璃层次；照片画布保持中性纯色，
  不叠加 `backdrop-filter`。页签改为圆润分段控件，选中底座用 `transform` 平滑移动。
- **页签键盘操作**：右侧「样式 / 摄影信息 / 输出」使用 roving tabindex，仅选中页签 `tabIndex=0`；
  页签按钮收到左右方向键时循环切换并自动激活，Home/End 跳到首尾，焦点跟随目标页签。
  按键处理只挂在页签按钮上，面板内输入控件不被拦截；空 `tabs` 渲染空容器，无效 `activeTab` 安全回退首项。
  `role=tablist/tab/tabpanel`、`aria-selected` 保持；只有当前选中页签设置 `aria-controls`，并与当前 panel 的 `aria-labelledby` 成对，非活动页签不产生悬空引用。
- **模板区减负**：版式卡片只常驻缩略图、名称、推荐/已应用与应用按钮；说明和字段标签进入「详情」展开区，默认收起且不触发应用。固定双列；摄影信息卡的布局/边框移入画廊下方「当前版式设置」，仅信息卡已应用时出现；收起精选时仍保留已应用的非精选模板。
- **队列空间与操作**：工作台队列不再重复导入入口（`QueuePanel.showImportActions={false}`），独立挂载仍保留导入与失败反馈。底部常驻数量、全选/取消全选、撤销、重做、更多；排序、删除已选、清空进入普通按钮浮层，支持 Escape、外部关闭与焦点恢复。文件名单行省略，完整名称与路径在主体按钮 `title`，状态徽标换行显示。右键菜单与「更多」均 Portal 到 body，避免玻璃侧栏 `backdrop-filter` 裁剪。
- **队列键盘与缩略图**：Shift+F10／菜单键打开行菜单，上下方向键与 Home/End 导航，Escape 恢复触发行；两类浮层按实测尺寸钳制，Tab 边界按触发点顺序退出，窗口失焦时关闭。队列筛选重新挂载的行会注册缩略图观察器，仍可见项保留缓存。主体按钮采用原生文本名称，包含完整文件名、无预览状态和徽标，不用文件名单独覆盖可访问名称。
- **中性预览背景**：黑/灰/白统一为 `#111111 / #4F4F4F / #F7F7F7`，浅深主题共用；只改界面 token，不进入 RenderRecipe 或导出。
- **键盘与字号**：全局单键快捷键在焦点位于按钮、链接、页签、菜单项、分栏手柄等原生可交互元素时让行；正文/控件/页签/字段标签不低于 14px，12px 仅用于次要元数据与徽标。
- **交互动效**：按钮按下缩至 0.97、松开回弹；抽屉侧滑、弹窗缩放淡入、页签内容淡入、更多浮层轻量入场。
  只使用 `transform / opacity`，快速连续操作不等待动画；`prefers-reduced-motion` 下取消位移、缩放和回弹。
- **降级与可读性**：`@supports not (backdrop-filter)` 回退到高不透明度面板；表单、输出摘要和抽屉内容区
  使用更高不透明度。队列条目、模板卡片和照片区域不使用背景模糊。
- **验收边界**：保留栏宽调整、窄窗口堆叠、快捷键、撤销历史、表单草稿、任务状态和既有主题偏好；
  不修改 API、DTO、`RenderRecipe` 或预览/导出语义。

## 验证

- `pnpm test`（Vitest：变量解析、模板编解码、资产库编解码、输出预设、一致性等）
- `pnpm typecheck`（tsc --noEmit）
- `pnpm build`（`tsc --noEmit && vite build`）
- 打包应用 E2E：当前 macOS 架构在根目录执行 `pnpm package && pnpm e2e:packaged`；该脚本启动实际打包应用，使用随包 JRE，驱动 `app://` 页面完成固定样片导入、默认自动应用「摄影信息卡」、Canvas 照片像素可见性、版式应用和导出文件校验，不启动 Vite，也不使用系统 Java。它会保存同步后的预览截图，并在最小窗口下要求照片可见或显示「预览区域不足」。该结果不宣称 macOS x64 或 Windows x64 已实测。
- 测试数量以 CI 实际输出为准，不在文档维护数字

## 已知限制

- 引擎未启动/失败时仅 Canvas 即时预览，无引擎级保真预览。
- HEIC/HEIF 使用随安装包携带的解码助手并在临时 PNG 中保留可读取方向、ICC 与元数据；能力探测失败时不显示可选控件。macOS arm64 是正式发布目标；macOS x64/Windows x64 以各自安装后 E2E 登记为候选，不能用 macOS arm64 结果代替，Windows 状态固定为 `SIMULATED`。
- 内置模板为「settingsPatch 合并」模型（不覆盖用户已调参数），复杂版式（图层/自由拖拽）不属于本阶段验收范围（见 [docs/prd.md](../docs/prd.md) §3.9 与 [docs/tasks.md](../docs/tasks.md) P1）。
- 图片区域、版式、输出档位和水印设置写入工作台 localStorage；预览缩放是临时视口状态，重启后不恢复。


## 底片数字化当前实现

底片模式通过同一逐图配方提供三阶段切换、片基框选、RGB 直方图、实际像素检查、单调曲线与校准参考复用；照片及几何使用 float32 线性 Rec.2020，装饰独立合成。支持带框/无框 sRGB JPEG、16-bit sRGB TIFF 与 16-bit 线性 Rec.2020 TIFF，嵌入匹配 ICC，按元数据策略写回并独立回读核验。输入 TIFF 必须由用户确认是真实线性数据，带 ICC 时核验 TRC 与基色。来源指纹、相机/白平衡/空间绑定和单槽调度详见 [底片实施复核](../docs/film-digitization-review.md)。

本轮不打包。真实 Gold 200/Portra 160 校色、无内嵌 JPEG 机型、其他平台及干净机器离线安装保持未验收。当前仅提供通用彩负转换，不宣称胶卷专属还原或正式发布支持。
