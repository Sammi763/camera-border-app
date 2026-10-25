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
| POST | `/api/preview` | 生成预览，返回预览 id |
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

- RAW 只读取文件内可读取的内嵌 JPEG 预览，不解码传感器数据、不去马赛克，也不做曝光、
  白平衡或其他真实 RAW 显影。
- 有内嵌 JPEG 时，`sourceDecode` 只能说明“内嵌 JPEG 预览”；没有可读取内嵌 JPEG 时，
  导入、预览和导出必须明确失败。
- 产品渲染管线不包含外部 RAW 显影 CLI、子进程或随包工具；不得以其他缩略图伪装成完整
  RAW 显影。

## 存储语义

- `RenderJobStore`：内存任务状态表，默认最多保留 256 条终态任务，终态首次被观察到后保留
  30 分钟；每次存取/登记时执行清理，queued/running 任务不会被淘汰。达到容量或 TTL 后，
  `GET /api/render-jobs/{jobId}` 按未知任务返回 HTTP 404。引擎进程重启仍会丢失全部内存状态，
  但重启不是释放任务记录的唯一策略；可通过 `app.render-jobs.max-terminal-jobs` 和
  `app.render-jobs.terminal-ttl-seconds` 调整。`PreviewStore`：按 LRU 条目数和 PNG 字节数
  同时受限的内存预览表，绝不缓存完整分辨率 `BufferedImage`（[ADR-0006](../docs/adr/0006-three-process-memory-stores.md)）。
- 无数据库；用户数据（模板、相机/镜头/胶片资产、摄影预设）由 Electron 主进程持久化，引擎不持有；旧 Roll 数据迁移由 Electron/前端处理。

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
