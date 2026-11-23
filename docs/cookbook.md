# Cookbook — 常见任务操作步骤

> 面向 Coding Agent 与开发者的**操作手册**：每个任务给出起点、步骤、可验证终点。
> 规则与背景不在这里重复，见 [AGENTS.md](../AGENTS.md)、[ARCHITECTURE.md](../ARCHITECTURE.md)、[CONTRIBUTING.md](../CONTRIBUTING.md)。
> 文中文件路径为实际代码位置；若找不到，用 grep 在对应目录确认最新位置。

## 0. 先确认阶段 0 产品契约

任何涉及导入、渲染、导出、元数据或界面术语的任务，先读 [docs/prd.md §0](prd.md)。
本手册不得自行增加支持范围。正式发布目标仅为 macOS arm64；macOS x64 和 Windows x64 为候选目标，
其中 Windows 状态固定为 `SIMULATED`；普通模式输入为
JPEG、PNG、TIFF、HEIC/HEIF 和 RAW 内嵌 JPEG 预览；输出为 JPEG 8-bit、PNG 8/16-bit、
TIFF 8/16-bit。

导出只能围绕三个固定档位验收：快速分享（JPEG 92、长边 2048、sRGB、移除 GPS/位置）、
标准交付（JPEG 95、原图尺寸、8-bit、源 ICC 和全部元数据，保留 GPS/位置）和高保真归档
（TIFF、原图尺寸、源位深、源 ICC 和全部元数据，保留 GPS/位置）。统一术语为版式、
拍摄信息预设、拍摄画幅、边框布局建议。普通模式不做修图、云同步、登录、自动更新和真实
RAW 显影；底片数字化模式是显式开启的独立范围，当前实施中，见
[ADR-0007](adr/0007-explicit-film-digitization-mode.md)。

PNG 是必须提供的同档位输出格式变体，不是第四个档位。快速分享和标准交付允许 JPEG 或
PNG 8-bit；高保真归档允许 TIFF 或按源位深输出 PNG 8/16-bit。输出格式选择不得改变所选
档位的尺寸、色彩和 GPS/位置策略。

## 0.3 阶段五专业保真链路

专业导出控件必须以运行时能力为前置条件：

1. 请求 `GET /api/capabilities`。结果来自随包的 TwelveMonkeys ImageIO、ExifTool 和
   `components.json`；缺少组件、版本不匹配或不可执行时，相关 `available` 必须为 `false`，
   不得回退系统 PATH。
2. 用户选择档位和输出格式后请求 `POST /api/export-preflight`。预检要同时检查源图事实、
   输出路径、格式/位深、ICC/元数据策略、目标尺寸和冲突；固定档位无法满足时阻断提交。
3. 提交 `POST /api/render-jobs` 后只接受实际完成并经独立 ExifTool 读取验证的结果。报告中的
   `FidelityReport` 使用实际输出的尺寸、方向、位深、色彩空间、ICC 和 EXIF/XMP/IPTC/GPS
   状态；JPEG 固定 8-bit，PNG/TIFF 按真实 8/16-bit 编码，8-bit 源不得报告为 16-bit。
4. 无 ICC 源按 sRGB 处理并在报告中标记 `sRGB-assumed`；分享档移除 GPS/位置，标准交付和
   高保真归档保留。ExifTool 超时、非零退出、输出无效或临时文件清理失败都必须使导出失败，
   不得返回 `completed + SKIPPED`。
5. RAW 只以可读取的内嵌 JPEG 作为像素来源；归档报告应显示 `fidelityScope=limited`、实际
   像素来源和尺寸，不得启用 LibRaw 或其他生产显影路径。

专业组件的版本、许可证、下载地址和 SHA-256 维护在 `third-party/professional-components.json`，
打包由 `scripts/fetch-professional-tools.sh` 和 `scripts/package-app.sh` 完成。独立验收应使用
随包 ExifTool 读取实际输出，不以应用自身报告代替文件事实。JRE 的 `release`、`NOTICE` 和
Java Engine 的 JAR manifest 也必须随包保留，供校验器确认厂商、版本、架构和许可证；构建
脚本不得为了缩小体积删除这些证明材料。

## 0.1 验证打包应用链路（阶段 1）

**起点**：需要验证发布产物，而不是 Vite 页面或本机手动启动的 Java。

**步骤**：

1. 当前 macOS arm64 开发机按 `pnpm package && pnpm e2e:packaged` 完成正式目标阶段 1 验收；
   macOS x64 和 Windows x64 仍须在对应环境分别执行同一命令并作为候选记录，不能把候选结果
   写成正式发布通过。
2. 确认产物资源目录含随包 JRE（macOS 为 `java-runtime/Contents/Home/bin/java`，Windows
   为 `java-runtime/bin/java.exe`）、引擎 jar、前端构建产物，以及 macOS
   `build/icon.icns` / Windows `build/icon.ico` 对应的正式图标。
3. 上述命令中的 `pnpm e2e:packaged` 启动实际打包应用，通过 CDP 驱动真实页面，使用固定样片
   完成「导入 → 默认自动应用摄影信息卡 → Canvas 照片像素可见性 → 应用零边框版式 → 导出」并校验导出文件；
   随后通过 preload 的文件夹入口导入 100 项约 20MP 路径，记录首屏/滚动可见项目与实际缩略图请求，
   验证缩略图 `blob:` URL 在清空卸载时释放，并完成 100 项全尺寸导出和取消运行。最小窗口下必须仍有照片内容，
   或明确显示「预览区域不足」，不得显示已同步的纯边框画布。E2E 的临时 userData、导出文件和截图
   默认在退出时清理；仅设置 `CAMBORDER_E2E_KEEP_TEMP=1` 才保留调试证据。
4. 检查 E2E 记录的请求全部为 `app://app/api/**` 或 `app://app/previews/**`；不得出现
   Vite URL、JavaBridge 绝对 URL 或系统 Java 进程。
5. 引擎尚未 ready 时，页面应收到结构化 `503 ENGINE_STARTING` 并显示启动中；进程失败时
   才显示不可用及失败原因。

### 0.1.1 采集阶段 1 方向与几何基线

阶段 1 的方向/几何证据必须从当前 checkout 重新打包的 macOS arm64 应用采集，不能使用旧候选包：

```bash
pnpm package
node scripts/capture-stage1-baseline.mjs
```

脚本固定验证六张真实 ARW、横图、Polaroid 和 `actual/100%` 场景，并将证据写入
`.local/stage1/<version>-<timestamp>-<commit>/`：包括四张真实 Renderer PNG、每个场景的窗口/
viewport/CSS Canvas/backing Canvas/图片区域几何、Java 预览同步状态、源文件 SHA-256、六张 ARW
批量导出以及独立 ExifTool 的 Orientation/宽高/位深读取。`.local/` 不提交 Git，也不上传素材。

脚本只在 macOS arm64 运行正式目标证据；macOS x64 与 Windows x64 仍是候选目标，Windows
状态固定为 `SIMULATED`，不会因为候选证据缺失阻塞正式 arm64。

**可验证终点**：E2E 退出码为 0，页面地址为 `app://app/...`，输出文件存在且非空；正式目标
与候选目标各自执行并分别记录结果。脚本默认使用 `fixtures/stage4/real-exif-canon-m03a9518.jpg`；完整来源、许可和 SHA-256 清单见 [fixtures/stage4/README.md](../fixtures/stage4/README.md)。真实样片固定纳入版本库并按清单验收；它们不替代 [`docs/test-samples.md`](test-samples.md) 的完整格式矩阵。

## 0.2 RenderRecipe v2 与本地解码边界（阶段 4）

`RenderRecipe` 的图片几何统一放在 `imagePlacement`：`fit` 保留完整图像，`fill` 按
`focalX/focalY` 裁切，`rotation` 使用度数，`targetAspectRatio` 指定图片区域比例。
Canvas 与 Java 引擎都调用同一套“旋转包围盒 → 目标区域 → fit/fill 缩放 → 焦点裁切”规则；
旧模板读取时将旧画幅/裁剪字段迁移为该对象，保存和导出时不再写回无效字段。

版式只保存布局和文字，不携带输出格式、尺寸或质量；这些设置由独立 `OutputPreset` 管理。
版式 JSON 可通过模板面板导入、导出、复制、重命名、覆盖更新和删除。HEIC/HEIF 由随包
解码助手在隔离 worker 中转换为带 EXIF/ICC 的临时 PNG，单文件、单次数量和输出大小受限，
超时会终止 worker 并清理临时结果；应用退出时清理本实例临时目录。能力探测失败必须明确
报告不支持，不回退到操作系统外部解码工具或系统扩展。

### 0.2.1 阶段 2 图片区域与 Polaroid 验收

阶段 2 的工作台验收应覆盖横图、竖图、方图和 Polaroid，并在 1200×760、1400×863、1920×1080
三个窗口尺寸下检查中央预览仍然居中。页面上的图片区域、预览 CSS 尺寸和输出像素尺寸必须
分别可读；1:1 视图允许溢出滚动，但未溢出的轴仍需居中。

检查图片区域的方向、比例和完整显示/填满裁切语义，确认图片没有被拉伸。Polaroid 编辑态可
显示“图片区”辅助线，但导出 PNG/JPEG/TIFF 不得包含该辅助线。固定输出档位中的 PNG 变体必须
保持原档位，不得因格式选择改成 custom。

重启应用后确认图片区域、版式、输出档位和水印恢复；预览缩放不要求恢复。键盘焦点、按钮文字、
中文路径和面板展开/收起也属于验收范围。

## 1. 新增一个 Java API 端点（端到端）

**起点**：需求明确「前端需要一个新接口」。

**步骤**：

1. 读 [ARCHITECTURE.md §4](../ARCHITECTURE.md)（单一渲染配方、本地语义、错误语义），确认新端点属于哪个域。
2. 定义 DTO：`java-engine/src/main/java/com/camborder/app/dto/` 下新增 Request/Response 类（字段命名对齐现有契约，禁造「临时 DTO」）。
3. 写 Service 接口 + 实现：
   - 接口放 `service/`，实现放 `service/impl/`（如 `Java2DImageRenderService` 这类纯工具放 `util/`）。
   - 若与图像渲染相关，优先复用现有 `ImageRenderService`，不要复制渲染逻辑。
4. 写 Controller：`controller/` 下 `@RestController`，路径遵循现有风格（`/api/...`）。
5. 异常语义：受控异常走 `exception/` 包（`ApiException` 等），由 `GlobalExceptionHandler` 统一映射 4xx/5xx；禁止 500 堆栈直出。
6. 写测试（**必须**）：
   - happy path + 失败路径（空 body、缺必填字段、非法枚举、非法尺寸）；
   - 参考 `src/test/java/com/camborder/app/controller/` 下既有 ControllerTest 与 `testsupport/AbstractControllerTest`。
7. 前端接线：`frontend/src/services/engine/` 下新增 API client（参考 `engineClient.ts` 的请求封装方式），并在对应 feature 使用。
8. 更新文档：`docs/prd.md` §7 API 清单（产品视角索引）；模块职责变化同步 `java-engine/README.md`。

**可验证终点**：

- `cd java-engine && mvn test` 全绿（新增测试在列）；
- `cd java-engine && mvn spring-boot:run` 后 `curl` 新端点，happy path 返回预期 JSON、非法输入返回 4xx；
- `pnpm --filter frontend typecheck && pnpm --filter frontend test` 通过。

## 2. 新增一个文本变量（如 `{FilmIso}`）

**起点**：版式文字需要展示一个新字段。

**步骤**：

1. 确认变量名：变量占位符为 `{CamelCase}`，已知变量集合在两端各有一份权威定义：
   - Java 侧：`java-engine/.../service/impl/MetadataFormatServiceImpl.java` 的 `KNOWN_VARIABLES`（变量名小写）；
   - 前端侧：`frontend/src/features/metadata/utils/resolveTextVariables.ts` 与 `frontend/src/features/metadata/types.ts`（PhotoIdentity 契约）。
2. 两端同步加入变量名与取值来源；缺失值时语义保持一致（无值替换为空，并清理多余分隔符）。
3. 若变量来自 EXIF，确认 `PhotoMetadataService` 能读到并填充；若来自资产库/拍摄信息预设，走前端解析链（优先级：每图覆盖 > 拍摄信息预设 > EXIF > 空）。
4. 更新文档变量清单：`docs/prd.md` §3.5 与 [README](../README.md) 变量文本章节。

**可验证终点**：

- `pnpm --filter frontend test` 全绿（`resolveTextVariables.test.ts` 覆盖新变量）；
- `cd java-engine && mvn test` 全绿（`MetadataFormatControllerTest` / `TextRendererTest` 覆盖）；
- 冒烟：版式里写 `{新变量}`，Canvas 预览、引擎预览、单图导出、批量导出四处解析一致。

## 3. 新增一个内置版式

**起点**：产品确认要新增一套版式（如新的拍摄信息条或极简白边）。

**步骤**：

1. 打开 `frontend/src/features/template/presets/builtInTemplates.ts`：版式 = `id` + `name` + `category`（经典/胶片信息/极简/分享）+ `settingsPatch`（与当前设置合并，不覆盖用户已调参数）。
2. 多段文字版式使用 `textLayers` 而非 `textContent`（见该文件头部注释）。
3. 写测试：`frontend/src/features/template/presets/builtInTemplates.test.ts`（内置版式校验：id 唯一、patch 结构合法）。
4. 如需缩略图：版式卡片为纯 CSS 缩略图（`TemplateThumbnail.tsx`）。

**可验证终点**：`pnpm --filter frontend test` 全绿；冒烟：版式面板可见新卡片，一键应用后预览正常。

## 4. 新增/修改拍摄画幅格式

**起点**：需要新增数码或胶片拍摄画幅，或调整画幅对应的比例/边框布局建议。

**步骤**：

1. 先确认画幅属于数码（M43、APS-C、135 全画幅、4433 中画幅）还是胶片（半格、135、645、6×6、6×7、6×8、6×9、6×10、6×12）；6×12 保留，6×10 为新增画幅。
2. Java 侧在 `java-engine/.../service/impl/FilmFormatServiceImpl.java` 中维护 `id`、名称、宽高比和边框布局建议。**引擎只提供建议，不强制裁剪**。
3. 前端通过现有 `GET /api/film-formats` 消费，后续迁移到 `GET /api/capture-formats` 时保留兼容策略。
4. 检查拍摄画幅只是布局信息，不会覆盖用户边框、尺寸或裁剪设置。
5. 更新 `docs/prd.md` §3.7 与 [docs/tasks.md](tasks.md) 的画幅任务。

**可验证终点**：`cd java-engine && mvn test`（`FilmFormatControllerTest`）全绿；冒烟：切换拍摄画幅后边框布局建议变化、手动覆盖仍生效。

## 5. 新增拍摄信息预设与分类

**起点**：需要让用户复用一组相机、镜头、胶片和拍摄画幅信息。

**步骤**：

1. `ShootingPreset` 契约在 `frontend/src/features/metadata/types.ts`：`id`、`name`、`category`、`captureFormat`、`cameraAssetId/lensAssetId/filmAssetId`、`defaultLocation`、`notes`（对齐 [docs/prd.md §6.5](prd.md)）。画幅 id 来自 `frontend/src/features/metadata/constants/captureFormats.ts`（数码：M43/APS-C/135 全画幅/4433；胶片 id 与引擎 `/api/film-formats` 一致）。
2. 摄影资产只保留当前 MVP 需要的相机、镜头、胶片三类；不要把 Roll、冲洗、扫描仪、实验室加入新契约（P0-01/P0-05 迁移边界）。
3. 拍摄信息预设 CRUD 与分类筛选在 `metadata/components/ShootingPresetPanel.tsx`；持久化在 `metadata/hooks/useShootingPresets.ts`（Electron 走 `userData/presets.json`，浏览器降级 localStorage）；JSON 校验在 `metadata/utils/shootingPresetCodec.ts`（损坏 JSON、非法条目、空名称、缺画幅、无效资产 ID 均有中文错误提示）。
4. 合并字段固定优先级：每图覆盖 > 拍摄信息预设 > EXIF > 空（`metadata/utils/resolveIdentity.ts`），Canvas 预览、引擎预览、单图导出、批量导出统一走 `queue.getEffectiveIdentity`，变量解析一致。删除预设时 `WorkspacePage` 调用 `queue.clearPresetBinding` 清理悬空绑定，不产生崩溃；图片、资产、版式不受影响。
5. 新增 IPC 时必须同步：`electron/src/types/desktopApi.ts`（通道+契约）→ `electron/src/ipc/assetStorage.ts`（handler）→ `electron/src/preload/exposeDesktopApi.ts`（白名单）→ `frontend/src/types/runtime.ts`（前端桥接类型副本）→ 两端 README。
6. 测试：`shootingPresetCodec.test.ts`（损坏 JSON/非法条目）、`resolveIdentity.test.ts`（优先级链、悬空资产引用）、`presetPersistence.test.ts`（Electron 与 localStorage 两条持久化路径）、`captureFormats.test.ts`（画幅目录）。

**可验证终点**：

- 数码图片不创建拍摄信息预设也能由 EXIF 展示拍摄信息；
- 胶片图片可通过分类拍摄信息预设批量补齐信息（应用到当前/选中/全部图片，队列行显示 P 徽标与使用数）；
- 预览、单图导出和批量导出的变量解析一致；
- 预设和资产重启后仍存在，删除预设不删除资产和图片，被引用预设删除后队列不崩溃。

## 6. 修改导出档位（必须先修改产品契约）

**起点**：产品明确要修改快速分享、标准交付或高保真归档的参数。

**步骤**：

1. 先在 [docs/prd.md §0.3](prd.md) 记录变更原因和新的验收预期；不得直接新增第四个档位或任意社交平台尺寸。
2. 让前端设置、`ExportSettings`、Java 引擎和导出结果使用同一份档位语义；预览和导出继续共享 `RenderRecipe`。
3. 固定输出格式组合：快速分享（JPEG 质量 92 或 PNG 8-bit）、标准交付（JPEG 质量 95 或 PNG 8-bit）、高保真归档（TIFF 源位深或 PNG 源位深）；补充尺寸、色彩、ICC、EXIF/XMP/IPTC/GPS 断言，并覆盖源图无 ICC/无元数据的情况。
4. 写成功路径和失败路径测试：非法档位、非法尺寸、无法满足源位深/元数据要求时必须明确失败或降级。

**可验证终点**：三端测试通过；冒烟按 [`docs/test-samples.md`](test-samples.md) 完成三个固定导出档位，不覆盖原图。

## 7. 接入一款新字体

**起点**：产品确认要接入某款字体（边框文字用）。

**步骤**：

1. **先核验授权**：按 `java-engine/docs/FONT_CANDIDATES.md` 的流程核验来源与许可证（OFL 需随包带 `OFL.txt`）；无法核验一律「暂不接入」。
2. 字体文件放入 `java-engine/src/main/resources/fonts/`（含对应 LICENSE/OFL 文件）；中文字体接入前做子集化（subset）。
3. 注册字体：在引擎渲染处用 `Font.createFont(Font.TRUETYPE_FONT, ...)` 加载并 `registerFont`，提供固定 family 别名（如 `lxgw-wenkai`），**前端只引用别名，不暴露物理文件名**。
4. 前端 `frontend/src/services/desktop/fontsApi.ts`（系统字体）与 `/api/fonts`（引擎可用字体）配合；候选字体清单同步 FONT_CANDIDATES.md。
5. 回退链：CJK 回退中文字体、拉丁回退英文字体、找不到回退系统 SansSerif，保证渲染不中断。

**可验证终点**：`cd java-engine && mvn test` 全绿；冒烟：版式文字选新字体后 Canvas 预览与引擎导出都渲染正确；打包产物含 `OFL.txt`。

## 8. 验证「预览与导出一致」

**起点**：改动了渲染、文字、边框相关代码，需要确认四条链路一致。

**步骤**：

1. 跑全量测试（两端）。
2. 启动三模块（[CONTRIBUTING.md](../CONTRIBUTING.md)），导入样片 `photos/` 下的图片。
3. 设一组含文字变量、多段文字、渐变边框的设置，逐一核对：Canvas 即时预览 → 引擎预览（同步状态成功）→ 单图导出 → 批量导出，四处文字/边框/渐变一致。
4. 变量解析一致性：每图覆盖、拍摄信息预设、EXIF 缺失三种场景各验证一次（优先级：每图覆盖 > 拍摄信息预设 > EXIF > 空）。
5. 依照 [`docs/test-samples.md`](test-samples.md) 对每种格式、位深、ICC、元数据组合分别验证三个固定导出档位；快速分享移除 GPS/位置，其他两档保留 GPS/位置。

**可验证终点**：四处输出肉眼一致；测试中 `renderConsistency.test.ts` 等一致性用例通过。

## 9. 全量回归与提交检查

**提交前**（等价于 CI，见 `.github/workflows/ci.yml`）：

```bash
pnpm --filter frontend typecheck
pnpm --filter frontend test
pnpm --filter electron typecheck
cd java-engine && mvn test
```

**文档链接检查**：改动或移动文档后，

```bash
# 列出所有相对链接，人工确认目标存在
grep -rn '](\.' README.md AGENTS.md CONTRIBUTING.md ARCHITECTURE.md DESIGN.md docs/ electron/README.md frontend/README.md java-engine/README.md java-engine/docs/
```

**可验证终点**：以上命令全部通过；无指向不存在文件的相对链接。

## 10. 实现异步导出、工作区状态与性能控制（阶段 2）

**起点**：需要扩展批量导出、队列操作或预览吞吐；先确认不要把任务状态重新放回局部面板，
也不要为预览和导出复制一套渲染字段。

**步骤**：

1. 导出请求使用 `RenderJobRequest.items`，每项同时携带冻结的 `RenderRecipe` 与
   `ExportSettings`。`POST /api/render-jobs` 先检查源图可读性和输出路径冲突：缺失/不可读
   源图返回 400，覆盖源图、已有目标或同批重复目标返回 409；只有通过前置检查的请求才
   返回 `202 + jobId`。使用 `GET /api/render-jobs/{jobId}` 轮询总进度、当前项、逐项结果
   和失败原因；取消使用 `DELETE`，只取消尚未执行的项。编码器还会在执行时拒绝已出现的
   目标文件，防止并发竞态导致覆盖。
2. 前端在 `WorkspacePage` 挂载根级 `useExportController`，提交前复制图片范围、设置和配方；
   `PreviewPanel` 只负责显示状态和触发命令。单图、已选和全部图片由唯一
   `operationScope`（`active / checked / all`）解析，`active` 与 `checked` 不互相改写。
3. 队列删除、清空、撤销/重做和会话恢复都通过 `useQueue` 的快照完成。会话只保存结构化路径
   与覆盖；恢复后用受限桌面 IPC 检查文件，丢失项标记为缺失，不恢复预览二进制或 object URL。
   设置历史由 `useSettings` 管理；检查器分组用隐藏而非卸载保留表单草稿。
4. 缩略图只为滚动容器中可见的队列行发起请求，且固定最多 2 个并发请求；预览请求切换时取消旧请求。
   解码请求带目标尺寸；缓存键必须
   包含路径、目标尺寸、mtime、源字节数和配方哈希，并由字节上限控制，淘汰时释放 `blob:` URL。
   不缓存完整分辨率 `BufferedImage`。
5. 引擎已启动时执行 `pnpm perf:smoke`；脚本必须从监听 8099 端口反查并校验 Java 引擎 PID，
   禁止用 Node RSS 替代。默认连续执行两轮、每轮 100 项约 20MP 图片队列，先用双并发预览，
   再提交批量 `render-jobs` 并轮询至终态，记录 `engineRssBaseline`、`engineRssPeak`、
   `engineRssIdle`、`engineIdleGrowth` 及两轮空闲值；默认按启动基线 +600MB 判定。PID
   不存在、进程无法确认或采集失败必须非零退出。性能 smoke 只使用专属临时目录，完成后自动清理。

**可验证终点**：两端测试覆盖成功和失败路径；导出任务在面板切换后仍能显示进度，删除/撤销/恢复
选择具有确定性；100 项 smoke 不超过声明的预览并发，导出逐项完成且无完整分辨率缓存残留。

## 新增一种边框风格（Canvas + Java2D 双端）

风格几何规格的唯一权威定义在 `java-engine/src/main/java/com/camborder/app/util/BorderStyleRenderer`
的类注释。新增风格必须双端同步实现：

1. **Java 端**：在 `BorderStyleRenderer.draw` 的 switch 中增加 case 与私有绘制方法，
   遵循公共约定（intensity 因子 fi、edgeWidth=ew、paperTone 经 ColorParser 解析）；
2. **Canvas 端**：在 `frontend/src/features/preview/canvas/canvasRenderer.ts` 的
   `drawBorderStyle` switch 中按同一几何公式实现；
3. **测试**：Java 侧参照 `BorderStyleRendererTest` 做像素断言；前端在
   `renderConsistency.test.ts` 的风格用例中把新 id 加入「不抛异常」列表；
4. **版式**：如需内置版式，在 `builtInTemplates.ts` 的 `STYLE_TEMPLATES` 中追加，
   `settingsPatch.borderStyle` 携带新 id。

注意：未识别的 id 两端都必须静默忽略（回退原行为）；`intensity=0` 不绘制任何内容。

## 验证 RAW 输入契约

普通模式只读取文件内可读取的内嵌 JPEG 预览，不做真实显影。因此普通模式不能新增、启用或
验收外部 RAW 显影子进程。底片数字化模式是显式开启的独立范围，使用受控随包 helper 读取
真实传感器 RAW，实施与验收按 [执行方案](opencode-film-digitization-plan.md) 和
[ADR-0007](adr/0007-explicit-film-digitization-mode.md) 推进；在对应任务完成前不得把该模式
写进支持矩阵。

RAW 验收扩展名冻结为 NEF、CR2、CR3、ARW、RAF、DNG、ORF、RW2、PEF。每个扩展名都要按
[`docs/test-samples.md`](test-samples.md) 的固定文件名准备一正一负两份真实相机样片。

1. 准备带内嵌 JPEG 的 RAW 样片和没有内嵌 JPEG 的 RAW 失败样片，覆盖上述九种扩展名。
2. 验证带预览样片的导入、预览、单图导出和批量导出；结果必须明确标识“内嵌 JPEG 预览”。
3. 验证无预览样片返回明确失败，不得静默使用传感器数据显影、其他缩略图或伪装成完整 RAW。
4. 在 macOS arm64 正式目标执行；macOS x64 / Windows x64 作为候选分别执行，开发机上的单平台或交叉构建结果不能替代对应目标验收。
5. 底片数字化模式另需真实彩负片边/片基、光源参考、Gold 200/Portra 160 样片和参考成片；
   缺少时对应项保持 `NOT_RUN`，不能用普通 RAW 样片替代。

## 底片调参合并、内存预算与阶段缓存

权威决策见 [ADR-0008](adr/0008-tuning-coalescing-memory-and-stage-cache.md)。

1. **前端调度**：底片模式下所有引擎请求经 `services/engine/tuningScheduler.ts`。新增控件时只更新设置状态，
   不要另起 `setTimeout` 防抖；需要立即提交的手势在 `pointerup`/`focusout`/`change`/Enter 后调用 `flush()`。
2. **共享快照**：主预览、阶段对比和直方图读取 `PreviewState.engineRecipe` / `engineClientId` /
   `engineGeneration`；不要在组件内重新构造一份配方或自增代次。
3. **取消**：切换图片、关闭底片模式或卸载时由调度器 `dispose()` 返回最后代次，前端调用
   `DELETE /api/film-requests/{clientId}?generation=n`；取消结果不得展示为引擎故障。
4. **内存预算**：新增阶段分配前先用 `FilmInputProbe` 探测尺寸；`FilmProcessingPipeline.Processed`
   必须 try-with-resources 关闭，预算租约才会覆盖到编码/写出结束。
5. **阶段键**：修改算法参数时同步 `FilmStageKeys`；几何、边框、文字、Logo、输出格式不得进入照片
   阶段键。参考帧必须记录真实内容版本，不得只比较路径/mtime/大小。
6. **缓存回归**：用 `app.film.stage-cache.enabled=false` 与默认开启两条路径比较阶段浮点结果，
   要求逐位一致；缓存关闭只影响命中率。
7. **性能证据**：
   ```bash
   # 引擎已启动且随包 ExifTool/字体/RAW helper 可用（否则底片导出预检 409），
   # 本机有真实 ARW 样片。
   pnpm perf:smoke --count 2 --film-sample photos/DSC04875.ARW \
     --film-tuning-count 8 --film-export-count 5
   ```
   输出包含冷/热预览与导出耗时、`/api/film-stage-cache` 命中率、Java 引擎 RSS。
   没有 16GB 实机或所需样片时把对应项标记 `NOT_RUN`，不能用 32GB 机器结果替代。

## 构建与验证真实 RAW helper（T03）

只在 macOS arm64 正式目标构建；版本/源码 SHA-256 固定在
`scripts/build-libraw-helper.sh`，产物不提交到仓库，运行时不下载、不搜索 PATH。

```bash
bash scripts/build-libraw-helper.sh
cd java-engine && mvn test -Dtest='FilmRawDecoderTest,FilmRawDecoderNativeTest'
```

- 产物：`professional-tools/libraw/macos-arm64/film-raw-helper` + `helper.json`（二进制 SHA-256、
  LibRaw 版本、架构、许可证）。
- 能力探测：Electron 只注入 `CAMBORDER_LIBRAW_HELPER_PATH`；Java 读取同目录 `helper.json`，
  校验和/版本/架构不符时 `components.libraw.available=false`。
- 失败路径：缺 helper、不可执行、超时、非零退出、非法输出、源文件变化都必须明确失败；
  不允许回退内嵌 JPEG 或把传感器 RAW 标成已显影。真实 ARW 集成测试在无样片/非 macOS arm64
  时跳过，不能把替身测试当作真实解码证据。

## 打包与冒烟

```bash
pnpm fetch:runtime                       # 下载对应平台 JRE（可 TARGETS=... 多平台）
ARCH=arm64 pnpm run package              # 每次一个架构（JRE 必须匹配）
TARGET_OS=win ARCH=x64 pnpm run package  # 仅作本地资源/配置检查；正式包由 Windows x64 runner 构建
CAMBORDER_SMOKE_PORT=8091 bash scripts/smoke-test.sh <app 可执行文件>
```

签名要点（macOS）：electron-builder 的 afterPack 钩子对嵌套 framework/helper 与外层
做 ad-hoc 签名，**绝不重签 Resources/java-runtime**（覆盖 Temurin 原始 hardened-runtime
签名会导致 java 进程被内核 SIGKILL）。正式分发替换为开发者证书 + 公证。

## 对话框目录记忆、导入去重与预览辅助（用户体验项）

这些能力均为体验优化：不改变 `RenderRecipe` 冻结契约，预览辅助不进入四链路一致性约束。

### 对话框目录记忆（electron）

- 存储：`userData/dialog-memory.json`（`lastImportDir` / `lastExportDir`）。解析与拼装是纯函数（`electron/src/ipc/dialogMemory.ts`），fileDialog 只负责调用时机。
- 行为：所有导入对话框从上次导入目录打开；单图导出保存框 `defaultPath = join(lastExportDir, 默认文件名)`；批量导出目录框打开上次导出目录。选择成功才写回；取消不写。读写失败静默回退，绝不阻塞对话框。
- 约束：打包 E2E 替身路径（`CAMBORDER_E2E_*`）不读写记忆。要给新的对话框加记忆：复用 `readDialogMemory/recordDialogDir/writeDialogMemory`，不要自己写 JSON。

### 导入去重（frontend queue）

- 规则：按 `sourcePath` 反斜杠归一后比较（`useQueue.normalizeSourcePath`），同一批内重复也只保留一次；HEIC 转换只对新增路径执行。
- 反馈：`ImportResult.skippedDuplicateCount` 计入 QueuePanel 导入提示「N 张已在队列中，已跳过」。

### 队列批量操作与排序（frontend queue）

- `useQueue` 新增 `removeOthers / removeLeftOf / removeRightOf / reorder / sortByName`，全部走现有撤销历史；`reorder` 拖回原位与无效 id/NaN 不产生历史条目，`sortByName` 为稳定排序（同名文件保持原相对顺序）且已有序时不产生历史。
- QueuePanel 行右键为自绘受控菜单（删除此图/其他/左侧/右侧、清空），坐标按视口边缘钳制避免溢出屏幕；行 HTML5 拖拽排序的 dataTransfer 类型为 `application/x-camborder-queue-item`，与根级文件拖放路由（按 `dataTransfer.files` 判别）天然隔离，拖动行降透明度、悬停落点行虚线高亮（drop/dragEnd/dragleave 后清除）。

### 预览几何同源与 100% 像素查看（frontend preview / java-engine render）

- Canvas 预览几何入口是 `canvasRenderer.calculateCompositionLayout`：以方向归一后的原图尺寸建立逻辑合成空间
  （照片目标区域＋配方边框），fit 模式把整个合成等比缩放并居中放进画布（合成外是工作台背景，不再把边框撑满视口），
  actual（100%）模式 viewScale=1、按视口偏移平移只绘制可视区域。返回的 `CompositionLayout` 同时驱动绘制、
  构图辅助线、焦点拖动换算与诊断 dataset，保证四处共用同一份几何。
- `drawPreviewToCanvas(canvas, image, settings, logo, renderDimensions, sourceDimensions, viewport)`：
  `sourceDimensions` 是原图事实（引擎 sourceDecode.fullWidth/Height 或预检 oriented 尺寸）；代理图只替代像素来源。
  全部绘制在合成局部空间完成；文字缩放 = viewScale（替代旧的 cw/800 独立路径），边距/字距/描边同比例缩放。
- Java 侧等价实现：`Java2DImageRenderService.resolveRenderScale` 按「当前照片宽度 / 全分辨率目标宽度」缩放
  边框、文字、Logo 与边框风格参数；原图尺寸导出（0/0）固定 1。两端用 `PreviewGeometryConsistencyTest`（真实渲染像素）
  与前端 `calculateCompositionLayout` 测试交叉验收。
- 100% 原图像素：`useActualSizePreview` 在进入 actual 模式时请求引擎「裸图」预览（上限 8192px，缓存/取消/失败降级），
  加载期间 Canvas 继续显示代理像素并给出「100% · 代理像素」徽标；就绪后切换为「100% · 原图像素」。
  合成最长边超过上限时保持代理态并如实说明（超大图不做一次性全分辨率展开）。
- 输出尺寸估算 `calculateOutputPixelDimensions`：档位缩小时边框按同一比例缩放（与引擎 insets(border, renderScale) 一致）。

### 全局撤销协调（frontend workspace/queue/settings）

- 队列与设置撤销栈的条目统一携带 `{ seq, description }`（`utils/historySequence.ts` 提供进程内单调序号）；
  工作台 `coordinatedUndo/Redo` 比较两栈顶 seq 选择最近一次操作，不引入全局状态框架。
- 手势合并语义不变：`options.historyTag` 相邻同标签提交只保留一条快照；描述可经 `update(patch, { description })` 覆盖，
  缺省按 patch 键归纳（修改边框/文字/图片区域…）。队列各操作压栈时带中文描述（删除图片、拖动排序…），
  QueuePanel/SettingsPanel 撤销按钮以 title 显示栈顶动作。

### 导出取消与状态待确认（frontend export）

- 准备阶段（尚未取得 jobId）：`cancelActiveExport` 置本地令牌，EXIF/选择器/预检返回后不得再提交；
  提交竞速期间已请求取消的，jobId 产生后立即转引擎 DELETE。
- 提交/轮询链路断线或超时：进入 `unconfirmed` 状态（保留 jobId 与冻结批次）；有 jobId 可「重新查询任务状态」
  （404 = 引擎重启内存记录失效，如实解释并指向输出目录核对）；无 jobId = 提交响应丢失，明确「不会自动重复提交」。
- 引擎给出确定性拒绝响应（EngineHttpError）仍按普通失败处理；取消请求失败只置 notice，不覆盖运行中的任务状态。

### 能力反馈与档位守门（frontend output）

- `useEngineCapabilities` 返回 `{ state, recheck }`；输出页区分检查中/已就绪/缺组件/请求失败，
  缺组件列出组件 id 与原因并提供「重新检查」。
- 当前档位在能力快照中不可用时，Dock 主按钮在选择保存位置之前禁用并给出原因
  （`tierUnavailableReason`）；后端预检仍是最终防线。

### 丢失文件重定位（frontend queue / electron ipc）

- Electron 白名单新增 `pickReplacementFile(missingFilePath)`：单选对话框默认定位到原文件目录，仅返回路径。
- `useQueue.relocateItem(id, newPath)`：保留条目 id、每图覆盖、预设绑定、排序与选中，仅更新路径并按 HEIC 规则重建工作文件，进入撤销历史。
- `relocateMissingFromFolder(candidatePaths)`：按文件名匹配；同名唯一自动绑定，同名多个候选**不静默绑定**，
  在 `ambiguous` 中返回候选清单由用户逐个确认（QueuePanel 内联确认区）。
- 队列缺失横幅显示恢复/缺失数量，提供「从文件夹重新定位」与「仅看缺失」筛选。

### 批量命名与结果展示（frontend export/queue）

- `RenderSettings.exportNaming`：`original-suffix`（原文件名＋-border 后缀，默认）或 `prefix-index`（自定义前缀＋三位序号）；
  输出页提供实际文件名样例预览（`buildNamingPreview`）。同名冲突仍由预检默认阻断，不静默覆盖。
- ExportDock 逐文件失败/摘要折叠为 `<details>` 列表；Dock 保留紧凑摘要。
- 队列新增按文件名筛选（子串、大小写不敏感）。

### 预览编辑态辅助（frontend preview）

- 网格辅助线：`canvasRenderer.drawImageGridOverlay(ctx, rect)`（三分线 + 中心十字，零尺寸 rect 安全跳过），由 CanvasPreview 在 `drawPreviewToCanvas` 之后按图片区域叠加；开关只在预览元信息栏。
- 按住查看原图：`\` 键或工具栏「原图」按钮按住时叠加无边框原图 `<img>`，松开恢复；未按住时切换图片自动退出，按住期间切图继续显示新图原图；窗口失焦自动退出；模态对话框打开期间不触发。
- 裁切构图拖动：`canvasRenderer.calculateFocalFromPointer` 把图片区域内指针换算为 `focalX/focalY`（区域外忽略、clamp 0–1），经 `onUpdateImagePlacement` 走 `settingsController.update` 标记 userModified；非裁切模式保持画布平移。
- 撤销语义：连续手势类设置更新必须携带 `options.historyTag`（如 `image-placement-drag-{手势序号}`）。`useSettings.commitSettings` 对相邻同标签提交只保留手势开始前的一条撤销快照——一次拖动一次 ⌘Z 即可回到拖动前；每次按下手势递增序号，两次拖动不合并；undo/redo 后标签重置，手势不会跨撤销边界合并。普通设置更新不传标签，行为不变。
- 共同约束：辅助内容只画在 Canvas 即时预览上，引擎渲染与导出结果不含网格/原图叠加；新增辅助线时同样遵守「编辑态叠加、不进 RenderRecipe」。

### 调整玻璃主题与视觉 token（frontend styles）

- 视觉 token 只在 `frontend/src/styles/styles.css` 顶部定义；组件引用 `--surface-*`、`--text-*`、`--glass-*`、
  `--radius-*` 等语义别名，不在组件里写死新颜色。
- 浅色主题内部值仍是 `data-theme="warm"`（兼容已保存偏好），界面文案为「浅色玻璃」；新用户默认 `system`。
  新增主题时必须同时补齐 `[data-theme]` 与 `prefers-color-scheme: light` 下的 token 映射。
- 玻璃模糊只用于主要外壳（顶栏、左右侧栏、Dock、抽屉、弹窗、预览工具条）。队列条目、模板卡片和照片画布
  不叠加 `backdrop-filter`；表单与文字密集区使用 `--glass-bg-strong` 或更高不透明度。
- 动效只使用 `transform / opacity`；新增按压或抽屉动画时同步补 `prefers-reduced-motion` 覆盖。
- 不支持 `backdrop-filter` 的运行时由文件末尾 `@supports not (...)` 回退为高不透明度面板，不要移除该兜底。

### 工作台页签键盘导航（frontend layout）

页签组件 `frontend/src/components/layout/WorkspaceTabs.tsx` 同时承担视觉选中底座与 WAI-ARIA 页签语义：

1. **数据来源**：页签 id、标签和内容由 `WorkspacePage` 的 `workspaceTabs` 传入；组件只负责选中态、ARIA 关联和键盘交互，不复制业务配置。
2. **roving tabindex**：只有 `activeTab` 对应的按钮 `tabIndex=0`，其余为 `-1`；Tab 键进出页签组只停留一次。
3. **键盘映射**：页签按钮收到 `ArrowLeft / ArrowRight` 时循环切换，`Home / End` 跳到首尾；采用自动激活模式（立即调用 `onChange`）并把焦点移到目标页签。按键处理只挂在页签按钮上，面板内输入控件不受影响。
4. **ARIA 关联**：`role="tablist"`（`aria-orientation="horizontal"`）→ `role="tab"`（`aria-selected`）→ `role="tabpanel"`（`aria-labelledby`）；只有当前选中页签设置 `aria-controls`，并与当前 panel 的 `aria-labelledby` 成对。非活动面板未挂载，非活动页签不设置 `aria-controls`，避免悬空引用。
5. **安全回退**：`tabs` 为空时只渲染空 `.workspaceTabs` 容器；`activeTab` 不在列表中时回退首个页签并保持 ARIA 一致。
6. **验证**：`pnpm --filter frontend test -- src/components/layout/WorkspaceTabs.test.tsx` 覆盖选中索引、左右循环、Home/End、点击切换、空列表、无效 `activeTab` 和面板内输入控件；样式改动同时跑 `pnpm --filter frontend typecheck`。
7. **样式约束**：选中底座仍由 `--tab-index` / `--tab-count` 驱动的 `transform` 动画，不要改成左侧定位；动效覆盖在 `frontend/src/styles/styles.css` 的 `prefers-reduced-motion` 中维护。

### 第二轮 UI 收口：模板、队列与中性背景（frontend）

- **模板卡片**：常驻缩略图、名称、推荐/已应用、应用按钮；说明与字段进入 `templateGalleryDetails`，默认 `hidden`，展开只改本地状态。摄影信息卡变体设置在网格下方 `templateGalleryLayoutSettings`，仅 `activePresetId` 属于四个信息卡变体时渲染；布局/边框切换必须保留另一维。
- **当前模板可见性**：收起精选时，若 `activePresetId` 是非信息卡变体的内置模板，必须并入可见集合；否则应用非精选模板后收起会丢失“已应用”状态。
- **队列导入入口**：`QueuePanel` 的唯一参数 `showImportActions?: boolean` 默认 `true`；工作台传 `false`，由顶栏/欢迎页承担导入。独立挂载仍保留导入、空文件夹提示和失败反馈。
- **队列底部**：有图片时数量/全选/撤销/重做常驻；排序、删除已选、清空进入 `.queueMoreMenu` 普通按钮浮层。浮层 Portal 到 `body`，支持 Escape、外部点击、焦点恢复；不要改成不完整 `role=menu`。
- **队列行**：文件名用 `.queueFileName` 单行省略，主体按钮用原生可访问名称保留完整文件名、无预览状态与徽标，`title` 提供完整路径；不要用仅含文件名的 `aria-label` 覆盖可见状态。RAW/HEIC/缺失/T-P-I 徽标在 `.queueName` flex 容器中换行，不裁切；右键菜单也 Portal 到 body，避免玻璃侧栏裁剪。
- **菜单与筛选回归**：右键菜单支持 Shift+F10／菜单键、上下/Home/End、Escape 恢复焦点；Portal 浮层须实测宽高并钳制，检查 Tab／Shift+Tab 默认续行与窗口失焦。筛选变更后重新观察实际挂载行，保留仍可见的缩略图缓存，不在每次输入时清空全部可见 ID。
- **预览背景**：`--studio-preview-black/gray/white` 为 `#111111 / #4F4F4F / #F7F7F7`，浅深主题共用；只改 UI token，不进入 `RenderRecipe`。
- **字号和快捷键**：正文/控件/页签/字段标签不低于 14px，12px 仅元数据/徽标；全局单键快捷键在按钮、链接、页签、菜单项、分栏手柄等交互目标上让行。
- **验证入口**：[docs/ui-glass-verification-20261110.md](ui-glass-verification-20261110.md) §5–6；第二轮截图/动效在 `docs/ui-glass-20261110/second-round/`，后续复核证据在 `docs/ui-glass-20261110/review-fixes/`。


### 数码翻拍彩负：底片工作流

1. 导入真实 RAW，在「底片」主动启用处理；TIFF 只在确定是 16-bit 线性数据时勾选确认，并选择真实输入空间，普通调色后 TIFF 不能假设为线性。
2. 选择翻拍白平衡；需要时选择独立光源参考。点击「框选片基」在完整负片片边拖动未曝光区域，或通过桌面文件选择器选择同卷片基参考帧。
3. 切换原始负片/基础转正/当前结果，查看真实 RGB 直方图；调整密度、曝光、RGB、黑白点、曲线与饱和度。曲线可双击加点、选择内点后删除、方向键调整。片基取样不受之后裁切/校平影响。
4. 为同卷校准命名并保存；保存的是引擎解析后的片基与光源数值。应用或选择性同步到兼容图片，保留不勾选的逐图调整；空间不匹配明确拒绝。点击「100% 像素」检查实际分辨率，超预算时明确提示。
5. 输出页选择 sRGB JPEG、16-bit sRGB TIFF 或 16-bit **线性** Rec.2020 TIFF，再设置带框/无框、尺寸、命名及元数据。目标 ICC 随实际编码嵌入；预检失败先修正原因，完成后查看回读报告。

当前为通用彩负转换；Gold 200/Portra 160 的真实还原需片基、光源及参考样片验收。源码验证与未验收边界见 [底片复核记录](film-digitization-review.md)。本轮按用户要求不打包。

扫描成片用作校色视觉参考时，先按 ICC、胶卷、场景与光源分组，不能作为片基/光源参考帧，
也不能默认作为线性 TIFF。现有本机图库的抽样观察与使用步骤见
[扫描成片校色参考](film-color-reference-20261112.md)。

按胶片型号查厂家特性曲线、光谱资料、历史技术表与论坛经验时，使用
[胶片校色资料目录](film-color-catalog.md)。该目录保留来源与版本，不是应用已验证的
校色预设；具体扫描仪建议、显影条件与一般产品说明分别标记。

将厂家文献、Film Archive和本机扫描图转成可实施功能时，按
[胶片校色实施方案](film-color-capability-plan.md)推进：先对齐资料与参考集，再冻结显式正片输入
契约；普通扫描TIFF/JPEG不能冒充线性底片输入。

## 胶片校色 v2（扫描正片、FFF 与中性取样）

1. 输入探测：`POST /api/image-probe`，只读返回 `inputSources`、`container.bitDepth`、
   `icc.sha256`、`orientation`、内嵌预览和 RAW/FFF 事实。导入、恢复、重新定位、
   预检和来源报告共用；不要用缩略图成功代替真实解码成功。
2. 新建 v2 正片配方：`schemaVersion=2`、`algorithmVersion=film-color-v2`、
   `inputSource=encoded-raster`（或 `flextight-fff`/`camera-raw`）、
   `filmPolarity=positive`，并显式提供 `encodedInput`（无 ICC 时选 `srgb` 等并保存）。
   v2 正片会跳过 `negative`；不要为它伪造片基/密度字段。
3. 彩负：同一来源把 `filmPolarity` 改为 `color-negative`，并补全 `negative`（光源/片基/密度）。
   切换只改变处理分支，不自动套用 Gold/Portra 专属模型。
4. 中性建议：`POST /api/image-analysis`，`purpose=neutral-balance` 且可带 ROI；响应
   `neutralBalance.binding` 绑定源指纹与基础正片签名。前端只在人工确认后把
   `suggestedRgbBalanceEv` 写入 `positive.rgbBalanceEv`。
5. 资料库：Electron 选择 FilmArchive 目录后，`POST /api/film-reference-libraries` 注册；
   `GET /api/film-references` 检索。文献 `id` 不是胶片 ID；资料卡不会修改图片配方。
6. FFF：只读取 TIFF 容器 image 0 的 RGB16 主图，`colorSpace` 必须显式选择
   `linear-srgb`/`linear-rec2020`；文件内输出 Adobe RGB/历史 gamma 不会被自动采用。
   合成 TIFF 改名 `.fff` 只能验证容器路径，不能写成真实 Flextight 验收。

验证：`cd java-engine && mvn test`；`pnpm --filter frontend typecheck && pnpm --filter frontend test`；
`pnpm --filter electron typecheck && pnpm --filter electron test`；提交前跑 `pnpm test:scripts`。

## 构建随包 LittleCMS 2

```bash
# macOS arm64 / x64；Windows x64 需在装有 mingw-w64 的环境执行
bash scripts/build-lcms2.sh
TARGET_OS=win ARCH=x64 bash scripts/build-lcms2.sh
```

产物写入 `professional-tools/lcms/<platform-arch>/`，`lcms2.json` 记录版本、CMM 版本、源码/二进制 SHA-256。
Electron 只在文件存在时注入 `CAMBORDER_LCMS2_PATH`；缺失时 `components.lcms2.available=false`，
Java 使用受控回退，不得写成随包 LittleCMS 已验证。

拖动正片调整滑杆或曲线时，工作台从线性基础正片生成快显。松手、确认输入或停止调整后，
工作台用同一配方重新计算精确预览，再更新直方图。取样、100% 像素检查和导出使用完整源图。
精确预览也适用于宽或高小于原图四分之一的裁切。

如果彩负转正整体偏暗，先使用「框选片基」，在原始负片上选未曝光的均匀橙色区域，避开
扫描边框、号码和画面。随后用「框选画面建议密度」选一格完整画面，再确认应用密度上限。
建议根据基础正片的高光分布计算；大片黑位或高光已经剪裁时，界面会提示重新取样或扩大范围。

胶片校色 v2 复核与真实 FFF 本机探针入口见[实施复核](film-color-review-20261112.md)，包含执行命令与验收边界。

## 复核胶片校色补充能力

- 个人观感在底片页签保存、应用和删除，桌面端重启后读取固定 userData 文件；只迁移正片调整数值。
- `python3 scripts/extract-film-characteristic-curves.py --source-dir <本机厂家PDF缓存目录>` 更新研究点集和内置索引；当前源文件名及版本在脚本中固定。运行需 PyMuPDF、NumPy，最终应用不需要 Python。原文不随包分发。
- `python3 scripts/validate-fff-pairs.py --root <本机样片根目录> --output <私有证据.json>` 读取真实 RGB16 FFF/TIFF 配准候选，按扫描源拆分留出并记录文件 SHA；失败实验不能注册为已标定模型。
- `node scripts/film-color-packaged-smoke.mjs --app <绝对.app路径> --sample <绝对FFF路径> --output <绝对输出目录>` 在独立应用数据目录通过工作台验证大图预览、分析、预设及原尺寸批量 TIFF 导出；显式假设输入域，只验收处理链路。阻断 renderer HTTP(S) 不等同于操作系统断网。
- `node scripts/film-presets-restart-smoke.mjs <绝对.app路径> <绝对证据.json路径>` 验证两次独立主进程读取同一预设文件。
- Java 回归除开发 JDK 外，涉及 ICC 时须用实际随包 Java 执行测试（Surefire `-Djvm=<随包java绝对路径>`）；仅按 target=11 编译不能发现所有运行时 CMM 差异。
