# Cookbook — 常见任务操作步骤

> 面向 Coding Agent 与开发者的**操作手册**：每个任务给出起点、步骤、可验证终点。
> 规则与背景不在这里重复，见 [AGENTS.md](../AGENTS.md)、[ARCHITECTURE.md](../ARCHITECTURE.md)、[CONTRIBUTING.md](../CONTRIBUTING.md)。
> 文中文件路径为实际代码位置；若找不到，用 grep 在对应目录确认最新位置。

## 0. 先确认阶段 0 产品契约

任何涉及导入、渲染、导出、元数据或界面术语的任务，先读 [docs/prd.md §0](prd.md)。
本手册不得自行增加支持范围。最终平台仅为 macOS arm64、macOS x64、Windows x64；输入为
JPEG、PNG、TIFF、HEIC/HEIF 和 RAW 内嵌 JPEG 预览；输出为 JPEG 8-bit、PNG 8/16-bit、
TIFF 8/16-bit。

导出只能围绕三个固定档位验收：快速分享（JPEG 92、长边 2048、sRGB、移除 GPS/位置）、
标准交付（JPEG 95、原图尺寸、8-bit、源 ICC 和全部元数据，保留 GPS/位置）和高保真归档
（TIFF、原图尺寸、源位深、源 ICC 和全部元数据，保留 GPS/位置）。统一术语为版式、
拍摄信息预设、拍摄画幅、边框布局建议。修图、云同步、登录、自动更新和真实 RAW 显影
不在产品范围内。

PNG 是必须提供的同档位输出格式变体，不是第四个档位。快速分享和标准交付允许 JPEG 或
PNG 8-bit；高保真归档允许 TIFF 或按源位深输出 PNG 8/16-bit。输出格式选择不得改变所选
档位的尺寸、色彩和 GPS/位置策略。

## 0.1 验证打包应用链路（阶段 1）

**起点**：需要验证发布产物，而不是 Vite 页面或本机手动启动的 Java。

**步骤**：

1. 当前 macOS 开发机按 `pnpm package && pnpm e2e:packaged` 完成阶段 1 验收；该结果只覆盖
   当前 CPU 架构。macOS x64 和 Windows x64 仍须在对应原生构建环境分别执行同一命令，不能
   把当前结果写为已实测。
2. 确认产物资源目录含随包 JRE（macOS 为 `java-runtime/Contents/Home/bin/java`，Windows
   为 `java-runtime/bin/java.exe`）、引擎 jar、前端构建产物，以及 macOS
   `build/icon.icns` / Windows `build/icon.ico` 对应的正式图标。
3. 上述命令中的 `pnpm e2e:packaged` 启动实际打包应用，通过 CDP 驱动真实页面，使用固定样片
   完成「导入 → 默认自动应用摄影信息卡 → Canvas 照片像素可见性 → 应用零边框版式 → 导出」并校验导出文件；
   最小窗口下必须仍有照片内容，或明确显示「预览区域不足」，不得显示已同步的纯边框画布。
4. 检查 E2E 记录的请求全部为 `app://app/api/**` 或 `app://app/previews/**`；不得出现
   Vite URL、JavaBridge 绝对 URL 或系统 Java 进程。
5. 引擎尚未 ready 时，页面应收到结构化 `503 ENGINE_STARTING` 并显示启动中；进程失败时
   才显示不可用及失败原因。

**可验证终点**：E2E 退出码为 0，页面地址为 `app://app/...`，输出文件存在且非空；三种
最终平台各自执行并分别记录结果。脚本默认使用 `photos/78330006.jpg`，不添加真实二进制
样片，也不替代 [`docs/test-samples.md`](test-samples.md) 的格式验收。

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

RAW 是最终支持的输入格式，但产品只读取文件内可读取的内嵌 JPEG 预览，不做真实显影。
因此不能新增、启用或验收 LibRaw/其他 RAW 显影子进程作为产品能力。

RAW 验收扩展名冻结为 NEF、CR2、CR3、ARW、RAF、DNG、ORF、RW2、PEF。每个扩展名都要按
[`docs/test-samples.md`](test-samples.md) 的固定文件名准备一正一负两份真实相机样片。

1. 准备带内嵌 JPEG 的 RAW 样片和没有内嵌 JPEG 的 RAW 失败样片，覆盖上述九种扩展名。
2. 验证带预览样片的导入、预览、单图导出和批量导出；结果必须明确标识“内嵌 JPEG 预览”。
3. 验证无预览样片返回明确失败，不得静默使用传感器数据显影、其他缩略图或伪装成完整 RAW。
4. 在 macOS arm64、macOS x64、Windows x64 分别执行；开发机上的单平台或交叉构建结果不能替代平台验收。

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
