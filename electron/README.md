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
| 图像转换 | `convertHeicFiles` | HEIC/HEIF → 临时 JPEG（macOS `sips`） |
| 字体 | `listSystemFonts` | 枚举系统字体族 |
| 目录打开 | `openDirectory` | 在系统文件管理器中打开目录（批量导出后查看产物；仅接受真实存在的目录） |
| 系统通知 | `showNotification` | 导出完成/失败系统通知（title/body 必须非空字符串；平台不支持或创建失败返回 `false`，不抛异常；只展示文件名不外泄绝对路径） |
| 引擎诊断 | `getEngineDiagnostics` / `retryEngineStart` | 托管模式失败分类（jar 缺失 / 随包运行时缺失损坏 / 启动失败 / 端口占用 / 健康超时）、日志路径与重试 |

> 前端有独立的类型副本（`frontend/src/types/runtime.ts`），不跨包导入本文件；字段名必须保持一致。

## 持久化位置（用户数据）

- `app.getPath("userData")/templates.json` — 用户模板
- `app.getPath("userData")/assets.json` — 摄影资产库
- `app.getPath("userData")/presets.json` — 摄影预设（P0-05，替代 Roll 成为主流程）
- `app.getPath("userData")/rolls.json` — 旧版 Roll 数据；仅保留兼容读取与迁移，不再由 UI 使用，也不扩展字段

文件不存在时读取返回 `"[]"`；读取失败记录日志并返回兜底值。浏览器模式（无 Electron）降级到 localStorage，两种模式数据不互通（[ADR-0006](../docs/adr/0006-three-process-memory-stores.md)）。

## 验证与已知限制

- 验证：`pnpm typecheck`；冒烟走 `pnpm dev`（开发）或 `pnpm dev:managed`（托管）；打包与干净机器验收见 [docs/release-checklist.md](../docs/release-checklist.md)。
- HEIC 转换仅 macOS（`sips`），Windows/Linux 下转换失败（返回 null）。
- 引擎 URL / 就绪超时配置在 `engine/engineConfig.ts`（默认 `http://127.0.0.1:8099`，20s）。
- 打包模式**必须**使用随包 Java Runtime（`requireBundledRuntime`）：解析不到时进入 `runtime-missing` 诊断，不回退系统 Java；仅开发模式允许回退系统 PATH。最终用户不需要安装 Java、Node.js 或 Python，Electron 自带应用运行时。
- 引擎 stdout/stderr 落盘到 `userData/logs/engine.log`（启动时自动创建日志目录；目录/权限问题以 logWarning 计入诊断），供故障页面「查看日志」定位。
- 健康探测超时后引擎状态为 `unhealthy(health-timeout)`，不再保持 running；「重试」终止旧进程（SIGTERM→SIGKILL 兜底）后重启。
- RAW 显影：随包 `<resources>/libraw/camborder-libraw-sampler(.exe)` 存在时经 `CAMBORDER_LIBRAW_PATH` 注入引擎；缺失时引擎显式降级嵌入预览。
- 引擎端口可用环境变量 `CAMBORDER_ENGINE_PORT` 覆盖（默认 8099）。
- macOS 本地开发：`scripts/prepare-electron-dev.mjs` 会检查 Electron.app 是否完整，并修复 npm 开发副本的 ad-hoc 签名/隔离属性；它只作用于 `node_modules`，不参与正式打包签名。若依赖安装中断，可手动执行根目录 `pnpm prepare:electron-dev`。
- macOS 打包签名：`build-hooks/afterPack.cjs` 在 DMG 前对嵌套 framework/helper 与外层 ad-hoc 签名，**不重签 java-runtime**（会破坏 Temurin hardened-runtime 签名导致 SIGKILL）。
