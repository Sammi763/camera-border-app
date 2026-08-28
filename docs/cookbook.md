# Cookbook — 常见任务操作步骤

> 面向 Coding Agent 与开发者的**操作手册**：每个任务给出起点、步骤、可验证终点。
> 规则与背景不在这里重复，见 [AGENTS.md](../AGENTS.md)、[ARCHITECTURE.md](../ARCHITECTURE.md)、[CONTRIBUTING.md](../CONTRIBUTING.md)。
> 文中文件路径为实际代码位置；若找不到，用 grep 在对应目录确认最新位置。

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

**起点**：模板文字需要展示一个新字段。

**步骤**：

1. 确认变量名：变量占位符为 `{CamelCase}`，已知变量集合在两端各有一份权威定义：
   - Java 侧：`java-engine/.../service/impl/MetadataFormatServiceImpl.java` 的 `KNOWN_VARIABLES`（变量名小写）；
   - 前端侧：`frontend/src/features/metadata/utils/resolveTextVariables.ts` 与 `frontend/src/features/metadata/types.ts`（PhotoIdentity 契约）。
2. 两端同步加入变量名与取值来源；缺失值时语义保持一致（无值替换为空，并清理多余分隔符）。
3. 若变量来自 EXIF，确认 `PhotoMetadataService` 能读到并填充；若来自资产库/摄影预设，走前端解析链（优先级：每图覆盖 > 摄影预设 > EXIF > 空）。
4. 更新文档变量清单：`docs/prd.md` §3.5 与 [README](../README.md) 变量文本章节。

**可验证终点**：

- `pnpm --filter frontend test` 全绿（`resolveTextVariables.test.ts` 覆盖新变量）；
- `cd java-engine && mvn test` 全绿（`MetadataFormatControllerTest` / `TextRendererTest` 覆盖）；
- 冒烟：模板里写 `{新变量}`，Canvas 预览、引擎预览、单图导出、批量导出四处解析一致。

## 3. 新增一个内置视觉模板

**起点**：产品确认要新增一套视觉模板（如新的摄影信息条或极简白边）。

**步骤**：

1. 打开 `frontend/src/features/template/presets/builtInTemplates.ts`：模板 = `id` + `name` + `category`（经典/胶片信息/极简/分享）+ `settingsPatch`（与当前设置合并，不覆盖用户已调参数）。
2. 多段文字模板使用 `textLayers` 而非 `textContent`（见该文件头部注释）。
3. 写测试：`frontend/src/features/template/presets/builtInTemplates.test.ts`（内置模板校验：id 唯一、patch 结构合法）。
4. 如需缩略图：模板卡片为纯 CSS 缩略图（`TemplateThumbnail.tsx`）。

**可验证终点**：`pnpm --filter frontend test` 全绿；冒烟：模板面板可见新卡片，一键应用后预览正常。

## 4. 新增/修改拍摄画幅格式

**起点**：需要新增数字或胶片拍摄画幅，或调整画幅对应的比例/推荐边框。

**步骤**：

1. 先确认画幅属于数字（M43、APS-C、135 全画幅、4433 中画幅）还是胶片（半格、135、645、6x6、6x7、6x8、6x9、6x10、6x12）；6x12 保留，6x10 为新增画幅。
2. Java 侧在 `java-engine/.../service/impl/FilmFormatServiceImpl.java` 中维护 `id`、名称、宽高比和推荐边框。**引擎只提供建议，不强制裁剪**。
3. 前端通过现有 `GET /api/film-formats` 消费，后续迁移到 `GET /api/capture-formats` 时保留兼容策略。
4. 检查画幅只是布局信息，不会覆盖用户边框、尺寸或裁剪设置。
5. 更新 `docs/prd.md` §3.7 与 [docs/tasks.md](tasks.md) 的画幅任务。

**可验证终点**：`cd java-engine && mvn test`（`FilmFormatControllerTest`）全绿；冒烟：切换画幅后边框推荐值变化、手动覆盖仍生效。

## 5. 新增摄影预设与分类

**起点**：需要让用户复用一组相机、镜头、胶片和拍摄画幅信息。

**步骤**：

1. `ShootingPreset` 契约在 `frontend/src/features/metadata/types.ts`：`id`、`name`、`category`、`captureFormat`、`cameraAssetId/lensAssetId/filmAssetId`、`defaultLocation`、`notes`（对齐 [docs/prd.md §6.5](prd.md)）。画幅 id 来自 `frontend/src/features/metadata/constants/captureFormats.ts`（数码：M43/APS-C/135 全画幅/4433；胶片 id 与引擎 `/api/film-formats` 一致）。
2. 摄影资产只保留当前 MVP 需要的相机、镜头、胶片三类；不要把 Roll、冲洗、扫描仪、实验室加入新契约（P0-01/P0-05 迁移边界）。
3. 预设 CRUD 与分类筛选在 `metadata/components/ShootingPresetPanel.tsx`；持久化在 `metadata/hooks/useShootingPresets.ts`（Electron 走 `userData/presets.json`，浏览器降级 localStorage）；JSON 校验在 `metadata/utils/shootingPresetCodec.ts`（损坏 JSON、非法条目、空名称、缺画幅、无效资产 ID 均有中文错误提示）。
4. 合并字段固定优先级：每图覆盖 > 摄影预设 > EXIF > 空（`metadata/utils/resolveIdentity.ts`），Canvas 预览、引擎预览、单图导出、批量导出统一走 `queue.getEffectiveIdentity`，变量解析一致。删除预设时 `WorkspacePage` 调用 `queue.clearPresetBinding` 清理悬空绑定，不产生崩溃；图片、资产、模板不受影响。
5. 新增 IPC 时必须同步：`electron/src/types/desktopApi.ts`（通道+契约）→ `electron/src/ipc/assetStorage.ts`（handler）→ `electron/src/preload/exposeDesktopApi.ts`（白名单）→ `frontend/src/types/runtime.ts`（前端桥接类型副本）→ 两端 README。
6. 测试：`shootingPresetCodec.test.ts`（损坏 JSON/非法条目）、`resolveIdentity.test.ts`（优先级链、悬空资产引用）、`presetPersistence.test.ts`（Electron 与 localStorage 两条持久化路径）、`captureFormats.test.ts`（画幅目录）。

**可验证终点**：

- 数码图片不创建预设也能由 EXIF 展示摄影信息；
- 胶片图片可通过分类预设批量补齐信息（应用到当前/选中/全部图片，队列行显示 P 徽标与使用数）；
- 预览、单图导出和批量导出的变量解析一致；
- 预设和资产重启后仍存在，删除预设不删除资产和图片，被引用预设删除后队列不崩溃。

## 6. 新增输出尺寸预设

**起点**：需要新的导出尺寸（如 小红书/朋友圈专用）。

**步骤**：

1. `frontend/src/features/settings/utils/outputSizePresets.ts`：`OUTPUT_SIZE_PRESETS` 新增 `{ id, label, longEdge }`，并在 reducer/映射处补充 `maxWidth/maxHeight` 换算。
2. 写测试：`outputSizePresets.test.ts`。
3. 注意 README/PRD 边界：社交平台专用尺寸原计划后续补充；加入后同步更新 [README](../README.md) 导出章节与 `docs/prd.md` §3.14。

**可验证终点**：`pnpm --filter frontend test` 全绿；冒烟：批量导出按新预设输出，长边等比缩小、不放大。

## 7. 接入一款新字体

**起点**：产品确认要接入某款字体（边框文字用）。

**步骤**：

1. **先核验授权**：按 `java-engine/docs/FONT_CANDIDATES.md` 的流程核验来源与许可证（OFL 需随包带 `OFL.txt`）；无法核验一律「暂不接入」。
2. 字体文件放入 `java-engine/src/main/resources/fonts/`（含对应 LICENSE/OFL 文件）；中文字体接入前做子集化（subset）。
3. 注册字体：在引擎渲染处用 `Font.createFont(Font.TRUETYPE_FONT, ...)` 加载并 `registerFont`，提供固定 family 别名（如 `lxgw-wenkai`），**前端只引用别名，不暴露物理文件名**。
4. 前端 `frontend/src/services/desktop/fontsApi.ts`（系统字体）与 `/api/fonts`（引擎可用字体）配合；候选字体清单同步 FONT_CANDIDATES.md。
5. 回退链：CJK 回退中文字体、拉丁回退英文字体、找不到回退系统 SansSerif，保证渲染不中断。

**可验证终点**：`cd java-engine && mvn test` 全绿；冒烟：模板文字选新字体后 Canvas 预览与引擎导出都渲染正确；打包产物含 `OFL.txt`。

## 8. 验证「预览与导出一致」

**起点**：改动了渲染、文字、边框相关代码，需要确认四条链路一致。

**步骤**：

1. 跑全量测试（两端）。
2. 启动三模块（[CONTRIBUTING.md](../CONTRIBUTING.md)），导入样片 `photos/` 下的图片。
3. 设一组含文字变量、多段文字、渐变边框的设置，逐一核对：Canvas 即时预览 → 引擎预览（同步状态成功）→ 单图导出 → 批量导出，四处文字/边框/渐变一致。
4. 变量解析一致性：每图覆盖、摄影预设、EXIF 缺失三种场景各验证一次（优先级：每图覆盖 > 摄影预设 > EXIF > 空）。

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

## 新增一种边框风格（Canvas + Java2D 双端）

风格几何规格的唯一权威定义在 `java-engine/src/main/java/com/camborder/app/util/BorderStyleRenderer`
的类注释。新增风格必须双端同步实现：

1. **Java 端**：在 `BorderStyleRenderer.draw` 的 switch 中增加 case 与私有绘制方法，
   遵循公共约定（intensity 因子 fi、edgeWidth=ew、paperTone 经 ColorParser 解析）；
2. **Canvas 端**：在 `frontend/src/features/preview/canvas/canvasRenderer.ts` 的
   `drawBorderStyle` switch 中按同一几何公式实现；
3. **测试**：Java 侧参照 `BorderStyleRendererTest` 做像素断言；前端在
   `renderConsistency.test.ts` 的风格用例中把新 id 加入「不抛异常」列表；
4. **模板**：如需内置模板，在 `builtInTemplates.ts` 的 `STYLE_TEMPLATES` 中追加，
   `settingsPatch.borderStyle` 携带新 id。

注意：未识别的 id 两端都必须静默忽略（回退原行为）；`intensity=0` 不绘制任何内容。

## 新增/调整 RAW 显影链路

- 引擎入口：`service/RawDevelopService` + `impl/LibRawCliDevelopServiceImpl`
  （CLI 契约：`camborder-libraw-sampler <input> <output.tiff>`，超时 `app.raw.timeout-ms`，
  路径注入 `CAMBORDER_LIBRAW_PATH` 或配置 `app.raw.cli-path`）。
- 路由与降级：`util/ImageReader.readWithSource`——显影成功 `raw-developed`；
  失败/未配置显式降级 `embedded-preview-fallback` 并携带中文 warning。
- 原生程序源码：`native/libraw_sampler.cpp`；构建：`bash scripts/build-libraw.sh`。
  默认输出到 `dist-libraw/<platform>-<arch>/`，目录名需与打包目标一致（macOS 使用
  `macos-arm64` / `macos-x64`，Windows 使用 `win-x64`）。
- 测试：`LibRawCliDevelopServiceImplTest`（成功/失败/超时/临时文件清理）、
  `ImageReaderRoutingTest`（9 种 RAW 扩展名路由与降级）。

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
