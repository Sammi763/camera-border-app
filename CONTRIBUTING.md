# CONTRIBUTING.md — 环境、命令、验证与排障

> 本文是「怎么在这个仓库干活」的操作手册：环境搭建、日常命令、验证路径、故障恢复。
> 项目背景与产品方向见 [README.md](README.md) 与 [docs/prd.md](docs/prd.md)；架构规则见 [ARCHITECTURE.md](ARCHITECTURE.md)；
> 每次任务必读的规则速览见 [AGENTS.md](AGENTS.md)。

## 环境要求

| 工具 | 版本 | 用途 |
|---|---|---|
| Node.js | 20+ | 前端与 Electron |
| pnpm | 9+（仓库 `packageManager: pnpm@9.0.0`） | 包管理（根 workspace：`electron` + `frontend`） |
| Java | 11+ | java-engine（`pom.xml` 声明 `java.version=11`） |
| Maven | 3.9+ | java-engine 构建与测试 |
| IDE | IntelliJ IDEA（Java）/ WebStorm 或 VS Code（TS） | 日常开发 |

安装依赖（根目录）：

```bash
pnpm install
```

> 包管理统一使用根目录 `pnpm-lock.yaml`（CI 用 `--frozen-lockfile`）。
> `frontend/package-lock.json` 是历史遗留的 npm lockfile，**不要**以它为准，也不要再更新它。

## 开发启动

### 方式一：一键启动（推荐，但需先起 Java 引擎）

```bash
# 1. 先启动 Java 引擎（dev 模式不会自动启动 jar）
cd java-engine && mvn spring-boot:run
#   或在 IDEA 中运行 java-engine/src/main/java/com/camborder/app/CameraBorderApplication.java
#   引擎地址：http://127.0.0.1:8099

# 2. 再一键启动前端 + Electron
cd .. && pnpm dev
```

`pnpm dev` 执行 `scripts/dev.sh`：启动 Vite（127.0.0.1:5174，`strictPort`），
就绪探测最多 20 秒后启动 Electron 并加载 Vite 页面。
**若 Java 引擎未启动，预览的引擎同步会失败，界面降级到 Canvas 即时预览**（详见排障）。

### 方式二：手动分步启动

```bash
# Java 引擎
cd java-engine
mvn spring-boot:run        # http://127.0.0.1:8099

# 前端（另一个终端）
cd frontend
pnpm dev                   # http://127.0.0.1:5174，Vite 代理 /api 与 /previews → 8099

# Electron（第三个终端）
cd electron
pnpm dev                   # 先准备 macOS Electron 开发运行时，再加载 Vite 页面，连接外部 Java 引擎
```

macOS 如果之前安装依赖时 Electron 二进制下载或解压中断，可在根目录手动恢复一次：

```bash
pnpm prepare:electron-dev
```

该命令只处理 `node_modules` 中的本地开发 Electron，不会修改正式打包的签名策略。

### 托管模式（验证 Electron 管理 jar 的行为，更接近打包后运行方式）

```bash
cd java-engine && mvn package     # 产出 target/camera-border-engine.jar
cd frontend && pnpm build         # 产出 frontend/dist
cd electron && pnpm dev:managed   # Electron 自行启动 jar + 加载 frontend/dist
```

## 日常命令

| 命令（根目录或子目录） | 作用 |
|---|---|
| `pnpm dev` | 一键启动 Vite + Electron（需 Java 引擎已运行） |
| `cd java-engine && mvn test` | Java 引擎全量测试 |
| `cd java-engine && mvn spring-boot:run` | 启动 Java 引擎 |
| `cd java-engine && mvn package` | 打包引擎 jar（托管模式前置步骤） |
| `pnpm --filter frontend test` | 前端单元测试（Vitest） |
| `pnpm --filter frontend typecheck` | 前端类型检查 |
| `pnpm --filter frontend build` | 前端构建（`tsc --noEmit && vite build`） |
| `pnpm --filter electron typecheck` | Electron 类型检查 |
| `pnpm --filter electron test` | Electron 全量测试（Vitest） |
| `pnpm test:scripts` | 脚本级测试：Windows 图标生成、打包产物校验、Electron 开发运行时准备、Java Runtime 解压布局（`scripts/*.test.*`） |
| `pnpm perf:smoke` | 性能 smoke：反查并校验已启动的本地 Java 引擎 PID，连续两轮运行每轮 100 项队列、双并发预览和异步导出，记录 Java RSS 基线/峰值/空闲/两轮空闲增长；默认阈值为启动基线 +600MB，产物写入并清理专属临时目录 |
| `cd electron && pnpm dev:managed` | Electron 托管模式 |
| `pnpm typecheck` | 根目录快捷：electron + frontend 类型检查 |
| `pnpm build:frontend` | 根目录快捷：构建 frontend |
| `pnpm build:engine` | 构建 Java 引擎 jar（`scripts/build-engine.sh`） |
| `pnpm fetch:runtime` | 下载随包 Java Runtime（`scripts/fetch-runtime.sh`，打包前置步骤） |
| `pnpm package` | 一键打包桌面应用（前端 + jar + JRE → electron-builder，`scripts/package-app.sh`） |
| `bash scripts/smoke-test.sh <可执行文件>` | macOS 打包产物冒烟测试（启动应用并等待引擎就绪） |
| `powershell -ExecutionPolicy Bypass -File scripts/smoke-test-windows.ps1` | Windows 原生安装/启动/卸载冒烟 |

## 打包链路（可安装产物）

```bash
# 1. 下载随包 Java Runtime（一次性；TARGETS="macos-arm64 macos-x64 win-x64" 可一次拉全）
pnpm fetch:runtime

# 2. 一键打包：前端构建 → 引擎 jar → 组装资源目录 → electron-builder
pnpm package
# macOS 指定架构：ARCH=arm64 pnpm run package / ARCH=x64 pnpm run package
# Windows 原生 x64 构建（推荐；Windows runner/构建机执行）
TARGET_OS=win ARCH=x64 bash scripts/package-app.sh

# 3. 冒烟测试（见 docs/release-checklist.md 的完整干净机器验收清单）
bash scripts/smoke-test.sh "electron/release/<平台目录>/Camera Border.app/Contents/MacOS/Camera Border"
```

打包资源布局（extraResources，位于应用 resources 目录下）：
`frontend/`（app:// 协议加载）、`java-engine/camera-border-engine.jar`、
`java-runtime/`（Temurin JRE，由 `JavaBridge` 直接 spawn，用户无需安装 Java）。
路径解析见 `electron/src/paths/paths.ts` 与 `engine/engineRuntime.ts`。
安装包由 Electron 自带运行时启动，朋友的电脑不需要安装 Node.js 或 Python；
Node/pnpm、JDK/Maven 仅是开发者构建安装包时需要的工具。

Windows 交付使用原生 Windows x64 runner 生成 NSIS 安装器，避免把 macOS 交叉构建结果
当作正式测试包。GitHub Actions 手动流程见 `.github/workflows/windows-package.yml`，产物只
上传 `Camera-Border-Setup-*.exe`、校验和与清单。当前不配置商业或自签名证书，测试包可能触发
SmartScreen；按「更多信息 → 仍要运行」继续，不关闭 Defender、不添加白名单、不修改安全策略。
T-05A 只验收打包实现和可在本机执行的合成检查；安装、启动、照片流程、断网、重启和卸载
属于 T-05B，必须由外部 Windows x64 环境执行并保存 workflow/installer/冒烟证据。
在真实 Windows 机器仍需完成安装、启动、导入照片、导出、重启和卸载验收。

## 验证路径（改哪跑哪）

| 改动范围 | 最小验证 | 提交前全量验证 |
|---|---|---|
| java-engine 的 controller/service/util | `cd java-engine && mvn test` | `mvn test` + 冒烟：`curl http://127.0.0.1:8099/api/health`、`POST /api/preview` |
| frontend 功能/工具函数/组件 | `pnpm --filter frontend test` | `pnpm --filter frontend typecheck && pnpm --filter frontend test && pnpm --filter frontend build` |
| electron 主进程/preload/IPC | `pnpm --filter electron typecheck` | `pnpm --filter electron typecheck` + dev 模式冒烟（导入 → 预览 → 导出） |
| 跨子系统 API 契约（新增端点/DTO） | 两端 typecheck + 两端对应测试 | 完整 dev 冒烟：导入 → 预览一致 → 单图/批量导出 |
| 纯文档 | 相对链接可解析（见下） | 无 |

**测试数量不在文档里维护**：CI（`.github/workflows/ci.yml`）在每次 push/PR 自动跑全量回归，
以 `mvn test` / `pnpm test` 的实际输出为准。新增测试时保证既有测试全绿。

## 故障与恢复

| 现象 | 原因 | 恢复 |
|---|---|---|
| 预览区显示「引擎未同步」或一直用 Canvas 降级预览 | Java 引擎没启动（dev 模式不自动起 jar） | 启动 java-engine（127.0.0.1:8099）后刷新 |
| Electron 窗口空白/加载失败 | Vite 未就绪（dev.sh 20 秒超时仍会尝试启动 Electron） | 确认 5174 无占用（`strictPort`，占用即失败）、重跑 `pnpm dev` |
| macOS 提示已阻止 Electron 或“恶意软件” | Electron npm 开发二进制不完整或 ad-hoc 签名未被当前系统接受 | 执行 `pnpm prepare:electron-dev`，再重跑 `cd electron && pnpm dev` |
| 8099 / 5174 端口被占用 | 其他进程占用 | 释放端口；临时用 `CAMBORDER_ENGINE_PORT` / `CAMBORDER_FRONTEND_PORT` 覆盖 |
| 托管模式启动失败 | 缺少 jar 或 frontend/dist | 按「托管模式」顺序先 `mvn package` 与 `pnpm build` |
| HEIC/HEIF 图片导入后该项失败（resolved=null） | 随包 HEIC/HEIF worker 能力探测或转换失败；当前仅 macOS arm64 完成验证，macOS x64 / Windows x64 尚未覆盖 | 检查随包解码助手日志和输入限制；必要时先转成 JPG/PNG。最终支持口径以 [docs/prd.md §0](docs/prd.md) 和 [样片矩阵](docs/test-samples.md) 为准 |
| `GET /api/render-jobs/{jobId}` 返回 404 | 任务未知：引擎重启丢失，或终态任务超过默认 30 分钟 TTL / 256 条容量上限被淘汰；queued/running 不会因清理被淘汰 | 重新发起导出任务；批量导出重跑即可 |
| 导出 POST 很快返回 `202` | 当前接口是异步任务契约，正文中的 `jobId` 需要交给 GET 轮询 | 使用前端根级 `useExportController` 或按 [`java-engine/README.md`](java-engine/README.md) 的 GET/DELETE 语义处理 |
| 模板/资产/摄影预设数据「丢了」 | 桌面模式持久化在 `userData` 下；浏览器模式降级 localStorage，两者不互通。旧版本可能仍有 `rolls.json` | 检查对应存储文件和迁移日志；两种模式数据不共享是预期行为 |
| 给 electron/package.json 加了 `"type": "module"` 后 preload 加载报错 | preload 必须按 CommonJS 编译（`tsconfig.json` 的 `module: CommonJS`） | 回退该字段；详见 electron/README.md |

## 文档约定（改文档时遵守）

- **每个事实只有一个权威位置**，其余文档用相对链接指向它；不复制粘贴同一规则。
- 会漂移的信息（测试数量、API 端点清单、依赖版本）优先链接到 CI、源码或 lockfile，不手写维护。
- 新增能力或修改行为时，同步更新对应模块 README；操作步骤写入 [docs/cookbook.md](docs/cookbook.md)。
- 开发文档、注释使用简体中文（[ARCHITECTURE.md §8](ARCHITECTURE.md)）。
- 移动/重命名文档后，用 grep 检查所有指向它的链接。
