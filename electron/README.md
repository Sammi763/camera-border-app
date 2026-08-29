# electron — 桌面壳模块

桌面壳（Electron 31 + TypeScript，CommonJS 编译）。负责窗口生命周期、系统能力（文件选择/保存）、
启动与管理本地 Java 引擎、用户数据持久化。**不实现任何业务渲染逻辑**（渲染归 java-engine，UI 归 frontend）。

## 目录结构（实际布局）

```text
electron/src/
  main/      应用启动、窗口创建、生命周期编排（main.ts、appLifecycle.ts、createMainWindow.ts、protocol.ts）
  engine/    Java 引擎启动/停止、健康探测、配置、随包运行时解析与托管单例
             （JavaBridge.ts、engineHealth.ts、engineConfig.ts、engineRuntime.ts、managedEngine.ts）
  ipc/       IPC handler：文件对话框、模板/资产/摄影预设存储、HEIC 转换、引擎诊断与重试
  preload/   preload 脚本，暴露白名单 API（window.desktop / window.desktopRuntime）
  paths/     路径解析（开发 / 打包双模式）
  config/    应用配置（appConfig.ts、devMode.ts）
  types/     preload 契约类型（desktopApi.ts）与 IPC 通道常量

打包资源布局（extraResources，见 electron-builder.yml 与 scripts/package-app.sh）：

```text
<resources>/
  frontend/                            前端构建产物（app:// 协议加载）
  java-engine/camera-border-engine.jar 引擎 jar（JavaBridge spawn）
  java-runtime/                        随包 Java Runtime（Temurin JRE，用户无需安装 Java）
```
```

## 脚本

| 命令 | 用途 |
|---|---|
| `pnpm dev` | 开发模式：先准备 macOS 本地 Electron 运行时，再编译并启动 Electron，连接外部 java-engine（IDEA 启动）+ Vite dev server（:5174），不启动 jar |
| `pnpm dev:managed` | 托管模式：Electron 自行启动 jar，加载 frontend/dist，不依赖外部 Vite（需先 `mvn package` + `pnpm build`） |
| `pnpm typecheck` | 仅做类型检查，不输出产物 |
| `pnpm build` | 编译 TypeScript 到 dist/ |

> 注意：preload 按 CommonJS 编译（`tsconfig.json` 的 `module: CommonJS`）。
> `package.json` **不包含** `"type": "module"`，以确保 Node.js 正确加载编译产物——不要加。

## 安全约束

- `contextIsolation: true`、`nodeIntegration: false`
- preload 仅暴露白名单 API（`window.desktop` 能力集合 + `window.desktopRuntime` 静态信息），渲染进程不直接访问文件系统
- IPC handler 只读写受控路径（userData 下固定 JSON 文件、用户经系统对话框选择的路径）

## 渲染进程可见的桥接 API（契约层：`electron/src/types/desktopApi.ts`）

`window.desktopRuntime`（启动期静态信息）：`appName`、`platform`、`engine.{managed, baseUrl}`。

`window.desktop` 能力分组（IPC 通道见 `types/desktopApi.ts` 的 `IPC_CHANNELS`）：

| 分组 | 方法 | 说明 |
|---|---|---|
| 文件选择 | `selectImages` / `selectImageSources` / `selectImageFiles` / `selectImageFolder` | 打开系统对话框选图/选文件夹 |
| 导出目标 | `selectExportPath` / `selectExportDirectory` | 单图保存路径 / 批量导出目录 |
| 模板存储 | `readTemplates` / `writeTemplates` / `exportTemplateJson` / `importTemplateJson` | userData JSON 读写 + 导入导出 |
| 资产/摄影预设 | `readAssets` / `writeAssets`（资产库）、`readPresets` / `writePresets`（摄影预设）；`readRolls` / `writeRolls` 为旧版 Roll 兼容读取，不扩展 | userData JSON 读写 |
| 图像转换 | `convertHeicFiles` | 当前开发实现：HEIC/HEIF 经 macOS `sips` 转临时 JPEG；不代表最终平台支持，最终口径见 [docs/prd.md §0](../docs/prd.md) 与 [样片矩阵](../docs/test-samples.md) |
| 字体 | `listSystemFonts` | 枚举系统字体族 |
| 目录打开 | `openDirectory` | 在系统文件管理器中打开目录（批量导出后查看产物；仅接受真实存在的目录） |
| 系统通知 | `showNotification` | 导出完成/失败系统通知（title/body 必须非空字符串；平台不支持或创建失败返回 `false`，不抛异常；只展示文件名不外泄绝对路径） |
| 本地图片预览 | `loadLocalImagePreview` | 主进程用 `nativeImage` 读取本地图片并缩放，返回 dataURL + 尺寸。仅接受绝对路径、常规文件与栅格白名单（JPEG/PNG/WebP/BMP/TIFF）；任何失败返回 `null` 不抛异常。缩放同时遵守 `maxWidth`/`maxHeight`、保持纵横比、不放大原图、最大边长 2048；优先用原生缩略图器（`createThumbnailFromPath`，低内存），失败回退 `createFromPath`。引擎不可用时工作台本地预览兜底 |
| 日志打开 | `openLogFile` | 在系统默认应用中直接打开引擎日志**文件**；仅允许 `userData/logs` 下的**常规文件**（`resolve` 规范化拦截 `../` 穿越、`realpath` 拦截符号链接/大小写绕过、`stat` 确认是普通文件），不存在或打开失败返回 `false` |
| 引擎诊断 | `getEngineDiagnostics` / `retryEngineStart` | 托管模式失败分类（jar 缺失 / 随包运行时缺失损坏 / 运行时被安全软件阻止 / 启动失败 / 端口占用 / 启动中 / 健康超时）、日志路径与重试 |
| 引擎地址 | `getEngineBaseUrl` | 返回 JavaBridge 实际 baseUrl（含自动选择端口）。前端启动与引擎重试后经 `syncEngineBaseUrl` 同步，健康检查/预览/EXIF/导出全部指向实际端口 |

> 前端有独立的类型副本（`frontend/src/types/runtime.ts`），不跨包导入本文件；字段名必须保持一致。

## 持久化位置（用户数据）

- `app.getPath("userData")/templates.json` — 用户模板
- `app.getPath("userData")/assets.json` — 摄影资产库
- `app.getPath("userData")/presets.json` — 摄影预设（P0-05，替代 Roll 成为主流程）
- `app.getPath("userData")/rolls.json` — 旧版 Roll 数据；仅保留兼容读取与迁移，不再由 UI 使用，也不扩展字段

文件不存在时读取返回 `"[]"`；读取失败记录日志并返回兜底值。浏览器模式（无 Electron）降级到 localStorage，两种模式数据不互通（[ADR-0006](../docs/adr/0006-three-process-memory-stores.md)）。

## 验证与已知限制

- 验证：`pnpm typecheck`；冒烟走 `pnpm dev`（开发）或 `pnpm dev:managed`（托管）；打包与干净机器验收见 [docs/release-checklist.md](../docs/release-checklist.md)。
- HEIC/HEIF 当前开发实现依赖 macOS `sips`，这是开发环境限制而非最终产品范围。Windows x64 的最终 HEIC/HEIF 状态为 `NOT_RUN`，必须通过 [docs/prd.md §0](../docs/prd.md) 和 [样片矩阵](../docs/test-samples.md) 后才能宣称支持。
- 引擎 URL / 就绪超时配置在 `engine/engineConfig.ts`（默认 `http://127.0.0.1:8099`，20s）。
- 打包模式**必须**使用随包 Java Runtime（`requireBundledRuntime`）：解析不到时进入 `runtime-missing` 诊断，不回退系统 Java；仅开发模式允许回退系统 PATH。最终用户不需要安装 Java、Node.js 或 Python，Electron 自带应用运行时。
- 引擎 stdout/stderr 落盘到 `userData/logs/engine.log`（启动时自动创建日志目录；目录/权限问题以 logWarning 计入诊断）。启动时写入 `[engine-start]` 横幅（platform / arch / node 版本 / jar 路径 / java 路径 / baseUrl / 时间），子进程退出时写入 `[engine-exit]`（exit code + signal），便于用户反馈日志后直接定位问题；「查看日志」经 `openLogFile` 直接打开该文件。
- 健康探测超时后引擎状态为 `unhealthy(health-timeout)`，不再保持 starting/running；「重试」终止旧进程（SIGTERM→SIGKILL 兜底）后重启。
- 引擎状态机：`stopped → starting → running`，失败分支 `crashed(reason)` / `unhealthy(health-timeout)`。`starting` 与 `running` 明确区分，避免 UI 同时显示「引擎运行中」与「引擎不可用」。
- **失败分类（runtime-blocked 仅用于明确的启动被阻止）**：普通 JAR 错误、Spring Boot 初始化失败、参数错误等非零退出一律归类 `start-failed`；只有 `spawn` 错误 `EACCES/EPERM`（如 Windows Defender / SmartScreen 拒绝执行）才归类 `runtime-blocked`。诊断页与日志据此给出对应提示（`classifySpawnError`）。
- **异步启动与退出竞态**：`retry()` 先等待旧进程真正退出、再 `await start()`（含端口探测与 spawn）后才返回，调用方随后启动 `waitForReady()`；`dispose()` 置 `shuttingDown` 标记，仍在端口探测中的 `start()` 探测完成后不得再 spawn（不留下孤儿 Java 进程）；`waitForReady()` 在 dispose 后立即中止轮询，不会挂起；并发 `start`/`retry` 共享同一启动流程，不会重复 spawn。
- **端口自动选择**：托管模式启动前探测默认端口（8099）；被占用时自动选择下一个可用回环端口，最终地址经 `JavaBridge.getActualBaseUrl()` 提供给诊断层与 `getEngineBaseUrl` IPC。**生产窗口在端口探测完成后再创建**（`appLifecycle` 先 `await startEngine()` 再建窗），前端首屏即可经 IPC 拿到实际端口；**每次重试前重置实际地址为配置默认**（8099 释放后自动恢复，不复用旧备用端口）。开发模式继续使用 `CAMBORDER_ENGINE_PORT` 配置。
- **健康探测可取消超时与代次隔离**：`pollEngineHealth` 每次请求带 `AbortSignal.timeout`（连接后长期无响应也能终止，`readyTimeoutMs` 才真正生效）；`waitForReady()` 捕获启动代次，重试/退出后旧探测结果作废，不会把新引擎误标为 unhealthy。
- **代码签名（env 驱动）**：`electron-builder.yml` 不再写死 `mac.identity: null`；设置 `CSC_LINK`/`CSC_KEY_PASSWORD` 即启用签名（mac 公证另设 `APPLE_*`）。`scripts/package-app.sh` 在未提供证书时对 mac 显式传 `--config.mac.identity=null` 保持本地未签名构建；`build-hooks/afterPack.cjs` **仅当对产物 `codesign -dv` 确认真实开发者签名后才跳过 ad-hoc**（APPLE_ID 只是公证账号，不代表已签名；未签名时仍走 ad-hoc，避免产出未签名应用）。本机无证书，现有产物为未签名（见 release-checklist）。
- 应用运行**不需要联网**，也不在运行时下载任何文件；图片只在本机处理。
- RAW 输入：只接受引擎读取到的内嵌 JPEG 预览；无可读取预览时明确失败。Electron 不携带、注入或启动任何外部 RAW 显影工具。
- 引擎端口可用环境变量 `CAMBORDER_ENGINE_PORT` 覆盖（默认 8099）。
- macOS 本地开发：`scripts/prepare-electron-dev.mjs` 会检查 Electron.app 是否完整，并修复 npm 开发副本的 ad-hoc 签名/隔离属性；它只作用于 `node_modules`，不参与正式打包签名。若依赖安装中断，可手动执行根目录 `pnpm prepare:electron-dev`。
- macOS 打包签名：`build-hooks/afterPack.cjs` 在 DMG 前对嵌套 framework/helper 与外层 ad-hoc 签名，**不重签 java-runtime**（会破坏 Temurin hardened-runtime 签名导致 SIGKILL）。
