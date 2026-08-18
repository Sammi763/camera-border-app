# electron — 桌面壳模块

桌面壳（Electron 31 + TypeScript，CommonJS 编译）。负责窗口生命周期、系统能力（文件选择/保存）、
启动与管理本地 Java 引擎、用户数据持久化。**不实现任何业务渲染逻辑**（渲染归 java-engine，UI 归 frontend）。

## 目录结构（实际布局）

```text
electron/src/
  main/      应用启动、窗口创建、生命周期编排（main.ts、appLifecycle.ts、createMainWindow.ts、protocol.ts）
  engine/    Java 引擎启动/停止、健康探测、配置（JavaBridge.ts、engineHealth.ts、engineConfig.ts）
  ipc/       IPC handler：文件对话框、模板/资产/摄影预设存储、HEIC 转换
  preload/   preload 脚本，暴露白名单 API（window.desktop / window.desktopRuntime）
  paths/     路径解析
  config/    应用配置（appConfig.ts、devMode.ts）
  types/     preload 契约类型（desktopApi.ts）与 IPC 通道常量
```

## 脚本

| 命令 | 用途 |
|---|---|
| `pnpm dev` | 开发模式：编译后启动 Electron，连接外部 java-engine（IDEA 启动）+ Vite dev server（:5173），不启动 jar |
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

> 前端有独立的类型副本（`frontend/src/types/runtime.ts`），不跨包导入本文件；字段名必须保持一致。

## 持久化位置（用户数据）

- `app.getPath("userData")/templates.json` — 用户模板
- `app.getPath("userData")/assets.json` — 摄影资产库
- `app.getPath("userData")/presets.json` — 摄影预设（P0-05，替代 Roll 成为主流程）
- `app.getPath("userData")/rolls.json` — 旧版 Roll 数据；仅保留兼容读取与迁移，不再由 UI 使用，也不扩展字段

文件不存在时读取返回 `"[]"`；读取失败记录日志并返回兜底值。浏览器模式（无 Electron）降级到 localStorage，两种模式数据不互通（[ADR-0006](../docs/adr/0006-three-process-memory-stores.md)）。

## 验证与已知限制

- 验证：`pnpm typecheck`；冒烟走 `pnpm dev`（开发）或 `pnpm dev:managed`（托管）。
- HEIC 转换仅 macOS（`sips`），Windows/Linux 下转换失败（返回 null）。
- 引擎 URL / 就绪超时配置在 `engine/engineConfig.ts`（默认 `http://127.0.0.1:8080`，20s）。
