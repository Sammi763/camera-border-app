# java-engine — 本地图像引擎模块

Spring Boot 2.7（Java 11）本地服务，开发默认监听 `http://127.0.0.1:8099`。
生产 Electron 页面不直接访问该绝对地址，而是通过 Electron 的 `app://app` 安全代理进入。
负责图片读取、预览渲染、导出渲染、EXIF 元数据读取与格式化、拍摄画幅/胶片库/字体查询。
**不关心 UI 与前端交互细节**；UI 状态、文件对话框由 frontend / electron 负责。

## 分层（实际目录）

```text
java-engine/src/main/java/com/camborder/app/
  controller/   HTTP 边界：输入输出与状态码
  dto/          请求/响应对象（PreviewRequest、RenderJobRequest、ExportSettings…）
  model/        渲染模型（RenderRecipe、BorderConfig、GradientConfig、TextItem、LogoConfig…）
  service/      业务接口；service/impl/ 为实现（ImageRenderService、PreviewService、RenderJobService…）
  repository/   内存存储（RenderJobStore、PreviewStore）
  util/         图像/颜色/文字/路径/元数据工具（ImageReader、ImageScaler、BorderComposer、GradientPainter、TextRenderer、LogoRenderer、ImageEncoder、ColorParser、OutputPathValidator、RawDecoder）
  exception/    受控异常 + GlobalExceptionHandler（统一 4xx/5xx）
  config/       配置（DevCorsConfig 等）
```

## API 端点

> **权威定义在 `controller/` 源码**，下表仅为索引（`docs/prd.md` §7 有产品视角版本）。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/capabilities` | 探测随包 ImageIO/ExifTool、输入输出格式、位深与三个导出档位的真实能力 |
| GET | `/api/dev/photos` | 样片浏览器：扫描仓库根 `photos/`（可用 `app.dev.photos-dir` 覆盖） |
| POST | `/api/preview` | 生成预览，返回预览 id；底片请求可用 `clientId`/`generation` 合并调参 |
| POST | `/api/image-analysis` | 底片阶段直方图/区域统计；与预览共用 `clientId`/`generation` |
| DELETE | `/api/film-requests/{clientId}?generation=n` | 取消该视图不高于指定代次的底片交互任务，幂等 `204`；不取消导出 |
| GET | `/api/film-stage-cache` | 只读诊断：阶段缓存命中率、字节、预算与保留区占用 |
| POST | `/api/export-preflight` | 在导出前校验档位、格式、路径、源事实与运行时能力 |
| GET | `/previews/{id}` | 获取预览 PNG |
| POST | `/api/render-jobs` | 提交 1–100 个冻结导出快照，返回 `202 + jobId` |
| GET | `/api/render-jobs/{jobId}` | 查询总进度、当前项、逐项结果与失败原因 |
| DELETE | `/api/render-jobs/{jobId}` | 取消尚未执行的项；当前写盘项自然收尾 |
| GET | `/api/film-formats` | 画幅枚举 + 推荐边框（仅建议，不强制）：数码 M43/APS-C/135 全画幅/4433，胶片半格/135/645/6x6/6x7/6x8/6x9/6x10/6x12（6x10 新增、6x12 保留，与前端画幅目录契约一致） |
| POST | `/api/photo-metadata` | EXIF 元数据读取 |
| GET | `/api/fonts` | 引擎可用字体族列表 |
| GET | `/api/assets/film-stocks` | 内置胶片库 |
| POST | `/api/metadata/format` | 文本变量格式化（`{Camera}` 等替换 + 分隔符清理） |

开发时，`config/DevCorsConfig` 只放行 Vite 的 `http://localhost:5174` 和
`http://127.0.0.1:5174`，覆盖 `/api/**` 与 `/previews/**` 的 `GET` / `POST` / `DELETE` /
`OPTIONS`。生产 `app://` 请求不依赖 Java CORS，而由 Electron 主进程代理；不得把任意外部
Origin 加入该配置。

阶段五的专业控件必须先读取 `/api/capabilities`，再提交 `/api/export-preflight`。能力结果
只来自随包的固定版本组件：缺少 ExifTool 或 TIFF ImageIO 时对应能力为 `false`，不会回退
到系统 PATH。实际导出由受控 ExifTool 写回并再次独立读取输出文件，完成后在
`FidelityReport` 中返回实际尺寸、方向、位深、色彩空间、ICC 和 EXIF/XMP/IPTC/GPS 事实。

## 渲染管线（预览与导出共用）

`ImageReader`（预览/缩略图按目标盒在 ImageIO 解码阶段 subsampling；导出传无约束尺寸；RAW
仅由 `RawDecoder` 提取可读取的内嵌 JPEG 预览；无内嵌 JPEG 时返回受控失败）
→ `ImageScaler`（按目标尺寸等比缩放）
→ `BorderComposer` / `GradientPainter` / `BorderStyleRenderer` / `TextRenderer` / `LogoRenderer`
→ `ImageEncoder`（PNG/JPEG/TIFF）→ `OutputPathValidator`（导出路径校验，父目录可写）。

预览与导出共享同一套 `ImageRenderService` 渲染逻辑，避免「预览对、导出不对」（[ADR-0002](../docs/adr/0002-preview-export-share-recipe.md)）。

`ImageReader` 在解码边界读取并物理应用 EXIF Orientation 1–8，返回有向像素尺寸和
`orientationApplied` 事实；用户手动旋转仍由 `RenderRecipe.imagePlacement.rotation` 单独处理。
因此 Canvas、Java 预览、单图导出和批量导出都从同一套有向尺寸与图片区域几何开始。

### 边框风格（borderStyle）

`RenderRecipe.borderStyle` 承载 8 种确定性风格（exhibition-line / polaroid-shadow /
film-perforation / mat-double-line / torn-edge / negative-band / magazine-keyline /
archive-label-box）。几何规格的唯一权威定义在 `util/BorderStyleRenderer` 类注释，
前端 Canvas 逐条对应实现；未识别 id 或 null 保持原行为。

### RAW 输入边界（产品契约）

- 普通模式只读取文件内可读取的内嵌 JPEG 预览，不解码传感器数据、不去马赛克，也不做曝光、
  白平衡或其他真实 RAW 显影。
- 有内嵌 JPEG 时，`sourceDecode` 只能说明“内嵌 JPEG 预览”；没有可读取内嵌 JPEG 时，
  导入、预览和导出必须明确失败。
- 普通模式渲染管线不包含外部 RAW 显影 CLI、子进程或随包工具；不得以其他缩略图伪装成
  完整 RAW 显影。
- 底片数字化模式是用户显式开启的独立模式，计划由随包、固定版本的受控 helper 读取真实
  传感器 RAW；它不改变上述普通模式语义。当前实施中，验收前能力探测必须返回不可用，见
  [ADR-0007](../docs/adr/0007-explicit-film-digitization-mode.md)。

### 真实 RAW helper（T03）

`java-engine/src/main/native/film_raw_helper.cpp` 是 LibRaw 0.22.3 的受控子进程适配器，
不是第四个业务服务。构建命令（运行验收与产物构建分别记录）：

```bash
bash scripts/build-libraw-helper.sh
TARGET_OS=macos ARCH=x64 bash scripts/build-libraw-helper-cross.sh
TARGET_OS=win ARCH=x64 bash scripts/build-libraw-helper-cross.sh
```

产物：`professional-tools/libraw/macos-arm64/film-raw-helper` 与 `helper.json`。helper 只接受
`--input/--output/--metadata/--crop/--white-balance/--highlight/--max-pixels/--version` 白名单参数，
输出 RGB16 小端二进制 + 元数据 JSON；方向只报告不旋转。Java 侧 `util/FilmRawDecoder` 负责
超时/取消、像素上限、输出头校验、临时文件清理、源文件 SHA-256/size/mtime 前后核对，并禁止
在真实 RAW 失败时回退内嵌 JPEG。能力探测只从 Electron 注入的 `CAMBORDER_LIBRAW_HELPER_PATH`
读取，要求 `helper.json` 的二进制 SHA-256、版本和架构匹配，不搜索系统 PATH。

验证：

```bash
cd java-engine && mvn test -Dtest='FilmRawDecoderTest,FilmRawDecoderNativeTest'
```

`FilmRawDecoderTest` 用可控 shell 替身覆盖协议/超时/非零退出/非法输出/路径含空格和中文/取消；
`FilmRawDecoderNativeTest` 只在 macOS arm64 且有本机 ARW 样片时执行真实解码，Linux CI 跳过。

### 底片处理、分析与导出（T04–T11）

- 处理底座：`FloatRgbImage`（float32 线性 Rec.2020）、`FilmColorSpace`、`FloatImageOps`
  （面积/双线性缩放、旋转、装饰 alpha 合成、输出量化）；`FilmLinearTiffReader` 读取显式
  16-bit 线性 TIFF。
- 算法：`FilmNegativeProcessor`（通用彩负 + 片基/密度/剪裁事实）、`FilmPositiveProcessor`
  （曝光/RGB 平衡/黑白点/单调曲线/饱和度）。
- `POST /api/image-analysis`：`raw-linear`/`base-positive`/`current-positive` 阶段、ROI、
  直方图、区域统计、分阶段剪裁事实；统计不含边框/文字/Logo。
- 导出：`FilmExportService` 支持 `srgb-jpeg`、`tiff16-srgb`、`tiff16-rec2020` 与
  `borderlessMaster`；带 ICC 的 TIFF/JPEG 由 `ImageEncoder.writeFilm*` 写出。
  宽色域带框母版当前明确拒绝，真实负片/安装包证据未验收，见
  [ADR-0007](../docs/adr/0007-explicit-film-digitization-mode.md)。
- 调度：`FilmTaskScheduler` 是全引擎唯一重型任务闸门；交互任务按视图/类型只保留最新
  待处理项，等待上限 16，交互优先但对等待中的导出最多连续执行两个交互。新代次取消旧
  代次等待与执行中计算；导出冻结快照不因调参取消。`DELETE /api/film-requests/{clientId}`
  由 `FilmRequestController` 提供，重复调用幂等返回 `204`。见
  [ADR-0008](../docs/adr/0008-tuning-coalescing-memory-and-stage-cache.md)。
- 内存准入：`FilmInputProbe` 在分配前读取 TIFF 头或调用
  `film-raw-helper --probe --input <path>`；`DefaultFilmMemoryBudgetService` 按阶段估算
  Java 峰值和原生 helper，执行前回收可回收缓存，超预算返回
  `422 / FILM_MEMORY_BUDGET_EXCEEDED`，队列满返回 `429 / FILM_BUSY`。预算租约覆盖解码、
  分析、编码和写出，`Processed.close()` 统一释放。
- 阶段缓存：`FilmStageCache` 保存 `raw-linear` / `base-positive` / `current-positive`
  浮点结果，按字节有界、租约固定、`current-positive` 优先淘汰、同优先级 LRU、空闲 120 秒
  回收；键包含源/参考帧 SHA-256、算法版本、工作空间和实际尺寸，几何/边框/文字/Logo/输出
  格式不使照片阶段失效。缓存关闭用 `app.film.stage-cache.enabled=false` 做逐位回归。
  诊断入口 `GET /api/film-stage-cache` 只返回计数与预算，不含图片路径。

## 渲染几何契约（预览与导出同源一致）

- 配方像素语义（边框、字号、边距、Logo 尺寸、边框风格 edgeWidth）以**全分辨率有向源图**为基准。
- `Java2DImageRenderService.compose` 计算渲染比例：`renderScale = 当前照片宽度 / 全分辨率目标宽度`；
  预览（maxWidth/maxHeight 约束）与档位导出（ExportSettings 尺寸约束）按该比例缩放全部装饰参数；
  原图尺寸导出（0/0）固定为 1，行为与历史版本一致。
- 普通图导出先解码完整有向图像，再按裁切、旋转和尺寸上限绘制到目标照片区域。通常直接绘制到目标尺寸，
  极小的适应画幅输出会保留照片与留白的边缘混合。预检和导出共用 `ImagePlacementRenderer.calculateOutputLayout` 的几何和边距取整。
- 由此保证：同一配方在任意预览尺寸、任意输出档位下，「边框:照片」「文字:照片」构图比例恒定。
  真实渲染的几何一致性由 `PreviewGeometryConsistencyTest`（像素级）与 `ImagePlacementRendererGoldenTest` 验证。
- 实现入口：`util/BorderComposer.insets(border, renderScale)`、`util/TextRenderer.draw(…, renderScale)`、
  `util/LogoRenderer.draw(…, renderScale)`、`util/BorderStyleRenderer.draw(…, renderScale)`。

## 存储语义

- 导出在目标目录中暂存已编码文件，再以硬链接或系统排他改名发布。写盘期间出现同名目标时，该项报告路径冲突并保留已有文件。目标卷缺少排他发布能力时，该项报错。
- 底片不带框母版由共享配方 `recipe.borderlessMaster` 控制当前结果、预检尺寸和导出。旧导出请求省略此字段时继续读取 `export.borderlessMaster`。

- `RenderJobStore`：内存任务状态表，默认最多保留 256 条终态任务，终态首次被观察到后保留
  30 分钟；每次存取/登记时执行清理，queued/running 任务不会被淘汰。达到容量或 TTL 后，
  `GET /api/render-jobs/{jobId}` 按未知任务返回 HTTP 404。引擎进程重启仍会丢失全部内存状态，
  但重启不是释放任务记录的唯一策略；可通过 `app.render-jobs.max-terminal-jobs` 和
  `app.render-jobs.terminal-ttl-seconds` 调整。`PreviewStore`：按 LRU 条目数和 PNG 字节数
  同时受限的内存预览表，绝不缓存完整分辨率 `BufferedImage`（[ADR-0006](../docs/adr/0006-three-process-memory-stores.md)）。
- 无数据库；用户数据（模板、相机/镜头/胶片资产、摄影预设）由 Electron 主进程持久化，引擎不持有；旧 Roll 数据迁移由 Electron/前端处理。
- 底片内存与缓存配置（`application.yml`，均允许引擎配置覆盖并校验）：
  - `app.film.memory.total-budget-bytes`：0=自动 `min(4GiB, 物理内存 25%)`，物理内存未知回退 `2GiB`；
  - `app.film.memory.java-budget-bytes`：0=自动 `min(B, JVM 最大堆 70%)`；
  - `app.film.memory.safety-margin`：估算余量，默认 `0.25`；
  - `app.film.stage-cache.enabled`：默认 `true`；`false` 用于逐位回归；
  - `app.film.stage-cache.max-bytes`：0=自动 `min(1.5GiB, H 的 50%)`，包含在 H 内；
  - `app.film.stage-cache.idle-seconds`：默认 120。
  预算只是准入控制，不是整个应用 RSS 的硬上限；不调用 `System.gc()`。

## 验证

```bash
cd java-engine
mvn test                 # 全量测试（controller 层必须同时覆盖 happy path 与失败路径）
mvn spring-boot:run      # 启动后 curl http://127.0.0.1:8099/api/health
mvn package              # 打包 target/camera-border-engine.jar（托管模式前置）
```

## 已知限制

- 专业导出会按实际文件报告 EXIF、ICC 与位深：JPEG 固定 8-bit，PNG/TIFF 真实支持 8/16-bit；8-bit 源不会报告为有效 16-bit。无 ICC 源按 sRGB 处理并在报告中标记 `sRGB-assumed`，同时写入实际输出 ICC。固定档位无法满足能力时在预检阶段失败，自定义参数才允许明确的 `UNSUPPORTED`/`DOWNGRADED`；不存在 `completed + SKIPPED`。
- 元数据由受控 ExifTool 复制 EXIF/XMP/IPTC/GPS/ICC/DPI，并重写尺寸、方向、位深、色彩空间标签；分享档移除 GPS/位置，标准交付和归档保留。外部进程超时、非零退出或独立读取失败都会使导出失败并清理临时文件。
- RAW：仅提取**内嵌 JPEG 预览**（NEF/CR2/CR3/ARW/RAF/DNG/ORF/RW2/PEF）；无可读取内嵌 JPEG 时明确失败，非完整 RAW 解码。
- `/api/capabilities` 只报告当前随包 TwelveMonkeys、ExifTool、字体和 Electron HEIC 助手真实可用状态；缺组件时固定档位在预检阶段失败，不回退系统工具。完成导出响应中的 `FidelityReport` 来自编码、元数据写回和独立读取后的实际文件事实。
- 错误语义：4xx=请求不合法、5xx=服务异常；受控异常不 500 堆栈直出（`GlobalExceptionHandler`）。
- 字体接入流程与授权核验见 `docs/FONT_CANDIDATES.md`。


## 底片数字化当前实现

底片模式通过同一逐图配方提供三阶段切换、片基框选、RGB 直方图、实际像素检查、单调曲线与校准参考复用；照片及几何使用 float32 线性 Rec.2020，装饰独立合成。支持带框/无框 sRGB JPEG、16-bit sRGB TIFF 与 16-bit 线性 Rec.2020 TIFF，嵌入匹配 ICC，按元数据策略写回并独立回读核验。输入 TIFF 必须由用户确认是真实线性数据，带 ICC 时核验 TRC 与基色。来源指纹、相机/白平衡/空间绑定和单槽调度详见 [底片实施复核](../docs/film-digitization-review.md)。

本轮不打包。真实 Gold 200/Portra 160 校色、无内嵌 JPEG 机型、其他平台及干净机器离线安装保持未验收。当前仅提供通用彩负转换，不宣称胶卷专属还原或正式发布支持。

## 胶片校色 v2 与文献索引

- `POST /api/image-probe`：只读头部/来源事实（JPEG/PNG/TIFF、RAW、FFF），不分配整幅像素；导入、恢复、重新定位和预检共用。
- `POST /api/image-analysis` 支持 `purpose=histogram|neutral-balance`；中性建议强制从 `base-positive` 取样，过滤过暗/剪裁样本，并以 `sourceVersion + recipeSignature + gains` 生成 binding。
- v2 `ImageProcessingConfig` 把 `inputSource` 与 `filmPolarity` 分开；`encoded-raster` 支持显式/嵌入 ICC、8/16-bit、灰阶与透明背景合成；`flextight-fff` 只读 TIFF 容器 RGB16 主图并按 256 行分块。
- `POST /api/film-reference-libraries` / `GET /api/film-references` 只读索引本机 FilmArchive：SHA 相同合并来源、不同修订保留、上游文档 ID 不作为胶片 ID、未知来源不视为官方。

厂商特性曲线的可复现提取入口为 `scripts/extract-film-characteristic-curves.py`，数值与来源指纹见 `docs/film-characteristic-curves.json`，随内置资料索引离线分发。点集保留 logH/Status M 密度域与测量条件，`modelReady=false`；不作为现有像素处理的 LUT 或负片模型。真实 FFF 配对实验见 [补充验收记录](../docs/film-color-review-20261112.md)。

普通和底片合成接受可选的 `RenderRecipe.layoutScale = "photo-short-edge"`。装饰单位为目标照片区域短边的千分之一，预检报告包括预计成品尺寸。缺省配方继续使用原尺寸像素。
当前底片成品的精确预览可以返回 `textBounds`，用于定位已绘制文字。索引对应请求中的 `texts`，坐标按当前预览成品归一化。
