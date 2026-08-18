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
#   引擎地址：http://127.0.0.1:8080

# 2. 再一键启动前端 + Electron
cd .. && pnpm dev
```

`pnpm dev` 执行 `scripts/dev.sh`：启动 Vite（127.0.0.1:5173，`strictPort`），
就绪探测最多 20 秒后启动 Electron 并加载 Vite 页面。
**若 Java 引擎未启动，预览的引擎同步会失败，界面降级到 Canvas 即时预览**（详见排障）。

### 方式二：手动分步启动

```bash
# Java 引擎
cd java-engine
mvn spring-boot:run        # http://127.0.0.1:8080

# 前端（另一个终端）
cd frontend
pnpm dev                   # http://127.0.0.1:5173，Vite 代理 /api 与 /previews → 8080

# Electron（第三个终端）
cd electron
pnpm dev                   # 加载 Vite 页面，连接外部 Java 引擎
```

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
| `cd electron && pnpm dev:managed` | Electron 托管模式 |
| `pnpm typecheck` | 根目录快捷：electron + frontend 类型检查 |
| `pnpm build:frontend` | 根目录快捷：构建 frontend |

## 验证路径（改哪跑哪）

| 改动范围 | 最小验证 | 提交前全量验证 |
|---|---|---|
| java-engine 的 controller/service/util | `cd java-engine && mvn test` | `mvn test` + 冒烟：`curl http://127.0.0.1:8080/api/health`、`POST /api/preview` |
| frontend 功能/工具函数/组件 | `pnpm --filter frontend test` | `pnpm --filter frontend typecheck && pnpm --filter frontend test && pnpm --filter frontend build` |
| electron 主进程/preload/IPC | `pnpm --filter electron typecheck` | `pnpm --filter electron typecheck` + dev 模式冒烟（导入 → 预览 → 导出） |
| 跨子系统 API 契约（新增端点/DTO） | 两端 typecheck + 两端对应测试 | 完整 dev 冒烟：导入 → 预览一致 → 单图/批量导出 |
| 纯文档 | 相对链接可解析（见下） | 无 |

**测试数量不在文档里维护**：CI（`.github/workflows/ci.yml`）在每次 push/PR 自动跑全量回归，
以 `mvn test` / `pnpm test` 的实际输出为准。新增测试时保证既有测试全绿。

## 故障与恢复

| 现象 | 原因 | 恢复 |
|---|---|---|
| 预览区显示「引擎未同步」或一直用 Canvas 降级预览 | Java 引擎没启动（dev 模式不自动起 jar） | 启动 java-engine（127.0.0.1:8080）后刷新 |
| Electron 窗口空白/加载失败 | Vite 未就绪（dev.sh 20 秒超时仍会尝试启动 Electron） | 确认 5173 无占用（`strictPort`，占用即失败）、重跑 `pnpm dev` |
| 8080 / 5173 端口被占用 | 其他进程占用 | 释放端口；改端口需同时改 `vite.config.ts` 与 `electron/src/engine/engineConfig.ts`（ENGINE_BASE_URL） |
| 托管模式启动失败 | 缺少 jar 或 frontend/dist | 按「托管模式」顺序先 `mvn package` 与 `pnpm build` |
| HEIC 图片导入后该项失败（resolved=null） | HEIC 转换仅 macOS（`sips`）；Windows/Linux 不支持 | 先转成 JPG/PNG；或确认平台为 macOS |
| `GET /api/render-jobs/{jobId}` 返回 404 | 任务状态在内存（`RenderJobStore`），引擎重启即丢失 | 重新发起导出任务；批量导出重跑即可 |
| 模板/资产/摄影预设数据「丢了」 | 桌面模式持久化在 `userData` 下；浏览器模式降级 localStorage，两者不互通。旧版本可能仍有 `rolls.json` | 检查对应存储文件和迁移日志；两种模式数据不共享是预期行为 |
| 给 electron/package.json 加了 `"type": "module"` 后 preload 加载报错 | preload 必须按 CommonJS 编译（`tsconfig.json` 的 `module: CommonJS`） | 回退该字段；详见 electron/README.md |

## 文档约定（改文档时遵守）

- **每个事实只有一个权威位置**，其余文档用相对链接指向它；不复制粘贴同一规则。
- 会漂移的信息（测试数量、API 端点清单、依赖版本）优先链接到 CI、源码或 lockfile，不手写维护。
- 新增能力或修改行为时，同步更新对应模块 README；操作步骤写入 [docs/cookbook.md](docs/cookbook.md)。
- 开发文档、注释使用简体中文（[ARCHITECTURE.md §8](ARCHITECTURE.md)）。
- 移动/重命名文档后，用 grep 检查所有指向它的链接。
