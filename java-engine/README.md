# java-engine — 本地图像引擎模块

Spring Boot 2.7（Java 11）本地服务，默认 `http://127.0.0.1:8080`。
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
| GET | `/api/dev/photos` | 样片浏览器：扫描仓库根 `photos/`（可用 `app.dev.photos-dir` 覆盖） |
| POST | `/api/preview` | 生成预览，返回预览 id |
| GET | `/previews/{id}` | 获取预览 PNG |
| POST | `/api/render-jobs` | 同步渲染导出（直接返回 completed + outputPath） |
| GET | `/api/render-jobs/{jobId}` | 查询最近一次任务（兼容保留） |
| GET | `/api/film-formats` | 画幅枚举 + 推荐边框（仅建议，不强制）：数码 M43/APS-C/135 全画幅/4433，胶片半格/135/645/6x6/6x7/6x8/6x9/6x10/6x12（6x10 新增、6x12 保留，与前端画幅目录契约一致） |
| POST | `/api/photo-metadata` | EXIF 元数据读取 |
| GET | `/api/fonts` | 引擎可用字体族列表 |
| GET | `/api/assets/film-stocks` | 内置胶片库 |
| POST | `/api/metadata/format` | 文本变量格式化（`{Camera}` 等替换 + 分隔符清理） |

## 渲染管线（预览与导出共用）

`ImageReader`（ImageIO；RAW 走 `RawDecoder` 提取内嵌 JPEG 预览）
→ `ImageScaler`（按目标尺寸等比缩放）
→ `BorderComposer` / `GradientPainter` / `TextRenderer` / `LogoRenderer`
→ `ImageEncoder`（PNG/JPEG）→ `OutputPathValidator`（导出路径校验，父目录可写）。

预览与导出共享同一套 `ImageRenderService` 渲染逻辑，避免「预览对、导出不对」（[ADR-0002](../docs/adr/0002-preview-export-share-recipe.md)）。

## 存储语义

- `RenderJobStore` / `PreviewStore`：**内存** `ConcurrentHashMap`，进程重启即丢失（[ADR-0006](../docs/adr/0006-three-process-memory-stores.md)）。
- 无数据库；用户数据（模板、相机/镜头/胶片资产、摄影预设）由 Electron 主进程持久化，引擎不持有；旧 Roll 数据迁移由 Electron/前端处理。

## 验证

```bash
cd java-engine
mvn test                 # 全量测试（controller 层必须同时覆盖 happy path 与失败路径）
mvn spring-boot:run      # 启动后 curl http://127.0.0.1:8080/api/health
mvn package              # 打包 target/camera-border-engine.jar（托管模式前置）
```

## 已知限制

- 未实现：ICC Profile 全链路保留、16-bit 处理、TIFF 高位深导出、EXIF/XMP/IPTC/GPS 写回、导出保真报告（见 [README.md](../README.md) 当前边界与 [docs/prd.md](../docs/prd.md) 路线图）。
- RAW：仅提取**内嵌 JPEG 预览**（NEF/CR2/ARW/DNG/ORF/RW2/PEF/RAF；CR3 视文件是否内嵌标准 JPEG 预览而定），非完整 RAW 解码。
- 错误语义：4xx=请求不合法、5xx=服务异常；受控异常不 500 堆栈直出（`GlobalExceptionHandler`）。
- 字体接入流程与授权核验见 `docs/FONT_CANDIDATES.md`。
