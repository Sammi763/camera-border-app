# 图片边框工具

一个面向摄影工作流的本地桌面图片边框工具。项目目标是让摄影用户可以快速为数码或胶片照片添加边框、拍摄信息和可复用版式，并以尽量保留原图质量的方式批量导出成品。当前正式发布目标仅为 macOS arm64；macOS x64 和 Windows x64 保留候选包，不参与正式发布阻塞。应用不要求登录，图片和用户资产默认只保存在本机。

当前项目采用 Electron + React + Java 本地图像引擎的架构：界面运行在桌面 App 中，图像读取、预览同步和原图导出由本地 Java 服务完成，图片不会上传到云端。

## 最短运行路径

```bash
pnpm install

# 先启动 Java 引擎（dev 模式不会自动启动 jar）
cd java-engine && mvn spring-boot:run

# 再一键启动前端 + Electron（Vite :5174 → Electron）
cd .. && pnpm dev
```

环境要求、分步启动、托管模式、日常命令与排障见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 文档入口

| 文档 | 用途 |
|---|---|
| [AGENTS.md](AGENTS.md) | **每个任务开始前必读**：工程规则速览、不变量、验证要求 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 架构边界、API 设计规则、结构规范、测试规则 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 环境搭建、日常命令、验证路径、故障恢复 |
| [docs/prd.md](docs/prd.md) | PRD 与路线图；§0 是最终产品契约、术语、导出档位和验收基线 |
| [docs/tasks.md](docs/tasks.md) | 按依赖拆分的实施任务、完成条件与验证路径 |
| [docs/adr/](docs/adr/) | 关键决策的原因与替代方案 |
| [docs/cookbook.md](docs/cookbook.md) | 常见任务操作步骤（加端点/变量/版式/字体等） |
| [docs/release-checklist.md](docs/release-checklist.md) | 打包链路与干净机器验收清单 |
| [docs/release-scope.json](docs/release-scope.json) | 机器可读的正式目标、候选目标和验收策略 |
| [docs/support-matrix.md](docs/support-matrix.md) | 平台、格式、档位与随包依赖边界 |
| [docs/offline-help.md](docs/offline-help.md) | 离线使用、能力探测与 RAW 用户帮助 |
| [docs/raw-and-fidelity.md](docs/raw-and-fidelity.md) | RAW、ICC、位深、元数据与独立验收口径 |
| [docs/troubleshooting.md](docs/troubleshooting.md) | 引擎、外部工具、路径和安装排障 |
| [docs/user-study-stage6.md](docs/user-study-stage6.md) | 阶段 6 摄影用户首次使用测试记录模板 |
| [DESIGN.md](DESIGN.md) | 设计系统（色彩 token、字体、间距、组件） |
| [electron/README.md](electron/README.md) | 桌面壳：职责、IPC 桥接 API、持久化位置 |
| [frontend/README.md](frontend/README.md) | 前端：目录、数据流、桌面/浏览器模式差异 |
| [java-engine/README.md](java-engine/README.md) | 引擎：分层、API 索引、渲染管线、存储语义 |
| [java-engine/docs/FONT_CANDIDATES.md](java-engine/docs/FONT_CANDIDATES.md) | 字体候选与授权核验 |

## 产品契约摘要

最终支持范围、术语和验收以 [docs/prd.md §0](docs/prd.md) 为唯一权威。本摘要只方便快速查阅：

| 项目 | 冻结范围 |
|---|---|
| 平台 | 正式：macOS arm64；候选：macOS x64、Windows x64（Windows 状态为 `SIMULATED`） |
| 输入 | JPEG、PNG、TIFF、HEIC/HEIF、RAW 内嵌 JPEG 预览 |
| 输出 | JPEG 8-bit、PNG 8/16-bit、TIFF 8/16-bit |
| 固定导出档位 | 快速分享（JPEG 92 / 长边 2048 / sRGB / 移除 GPS/位置）；标准交付（JPEG 95 / 原图尺寸 / 8-bit / 源 ICC + 全部元数据）；高保真归档（TIFF / 原图尺寸 / 源位深 / 源 ICC + 全部元数据） |
| RAW 边界 | 只读取内嵌 JPEG，不做真实 RAW 显影 |

PNG 必须作为档位内的格式变体提供：快速分享和标准交付可选 PNG 8-bit，高保真归档可选
按源位深的 PNG 8/16-bit；这不增加第四个导出档位。标准交付和高保真归档保留 GPS/位置；
快速分享移除 GPS/位置。修图、云同步、登录、自动更新和真实 RAW 显影不属于产品范围。
RAW 扩展名与样片范围、格式/位深/ICC/元数据预期见 [`docs/test-samples.md`](docs/test-samples.md)。

统一术语为：版式、拍摄信息预设、拍摄画幅、边框布局建议。拍摄画幅只产生边框布局建议，
不自动裁剪或改变原图尺寸；版式负责排版，拍摄信息预设负责拍摄身份。

## 当前已实现（工程基线，不等于最终支持）

> 本节只记录当前 HEAD 已存在的工程能力。它不代表 §0 的最终格式、位深、ICC、元数据或
> 阶段 0 只建立可复核基线，不等同于正式发布已就绪；正式门只检查 macOS arm64，候选平台不参与阻塞。

### 统一渐进式工作台

- 打开应用进入统一欢迎页：空队列提供选择照片、拖入照片、加载样片，以及本地处理、无需登录、EXIF 自动读取等价值提示。
- 导入照片后自动应用「拍摄信息卡」默认版式；用户手动选择过版式后，后续导入不再覆盖用户选择。
- 有照片后固定显示顶部栏、左队列、中预览、右侧「样式 / 摄影信息 / 输出」三页签和底部导出 Dock。
- 样式页签提供精选版式画廊（拍摄信息卡 / 经典白边 / 极简黑边 / 拍立得 / 档案标签 / 中画幅留白 / 电影字幕 / 全画幅叠字），带真实布局缩略图、适用场景与信息字段说明，以及确定性规则给出的「推荐」标记（只提示，不修改用户设置）。
- 拍摄信息卡支持 白/黑边框 × 底部居中/左下 布局变体一键切换。
- 拍摄信息摘要为每个字段标注来源（EXIF / 拍摄信息预设 / 每图覆盖），拍摄信息预设、摄影资产库和用户版式管理通过抽屉打开，可应用到当前/已选/全部图片。
- 详细的边框、渐变、字体、图层与版式设置均在统一工作台中完成，共享同一份 RenderRecipe、身份合并链与导出逻辑。

### 图片导入

- 支持从本机选择图片文件（多选）或图片文件夹导入。
- 支持拖拽图片到队列面板直接导入（桌面模式）。
- 当前工程可处理 JPEG、PNG、TIFF 和 HEIC/HEIF；HEIC/HEIF 由随包解码助手转为临时 PNG，并在 macOS arm64 完成验证。macOS x64、Windows x64 尚未覆盖。
- 引擎请求在开发和生产均使用相对 `/api`、`/previews`：开发由 Vite 代理转发，生产由
  `app://app` 安全代理转发到托管 JavaBridge 的当前回环端口；Renderer 不获得绝对引擎地址。
- WebP、BMP 即使在开发环境可被系统解码，也不属于最终支持格式。
- 文件夹导入自动扫描当前层级图片，按文件名自然排序。
- 首张图片自动激活预览；点击缩略图切换当前预览图。
- 空文件夹显示中文提示。

### 方向与预览几何

- EXIF Orientation 1–8 只在 Java 引擎的图片解码边界物理处理一次；这一步与用户在
  `RenderRecipe.imagePlacement.rotation` 中设置的手动旋转分开，避免重复旋转。
- RAW 预览只使用文件内的 `JpgFromRaw` 内嵌 JPEG；内嵌 JPEG 的 Orientation 会先统一为实际
  像素方向，再进入 Canvas、引擎预览和导出链路。
- 「适应画布」保持图片比例并显示完整图片；只有 `fill` 图片区域明确允许裁切，并在界面显示
  裁切状态。
- 预览缩放只有「适应画布」和「100% 像素查看」两态。100% 使用自然合成像素尺寸，内容溢出时
  可滚动或拖拽，未溢出的轴保持居中；不会引入滚轮自由缩放或第三种 custom 状态。
- CSS 显示尺寸、Canvas backing store（按 device pixel ratio）和导出像素尺寸分别记录；四条
  渲染链路继续共用同一份 `RenderRecipe`。
- 图片区域单独设置方向、比例和完整显示/填满裁切；预览尺寸只影响 CSS 预览框，不改变导出像素。
  Polaroid 明确划分图片区、内边距、底部文字区和视觉分隔，编辑辅助线不会进入导出。

### 多选批量工作流

- 队列缩略图带复选框：点击行切换当前预览图，勾选复选框控制批量选中范围，两组状态相互独立。
- 支持全选 / 取消全选，底部显示「已选 N 张」。
- 拍摄信息预设应用支持作用域选择：当前图片 / 已选图片 / 全部图片，操作前明确显示影响数量。
- 批量导出按勾选范围执行（未勾选时导出全部），按钮显示目标张数。

### 边框与文字

- 支持纯色边框和基础渐变边框（线性/径向，多停靠点）。
- 支持上下左右边框独立调整。
- 支持拍摄画幅和边框布局建议联动：数码包括 M43、APS-C、135 全画幅、4433 中画幅；胶片包括半格、135、645、6×6、6×7、6×8、6×9、6×10、6×12。
- 拍摄画幅只提供比例和边框布局建议，不会未经确认裁剪或改变原图尺寸。
- 支持文字内容、字号、颜色、字体、位置和放置区域调整。
- 支持文字放在图片上或边框上。
- 支持每张图片独立文字覆盖，适合批量出图时填写不同信息。
- 支持基础 EXIF 读取并填充相机、镜头、光圈、快门、ISO、焦距等文字信息。

### 变量文本

- 版式文字支持变量占位符，如 `{Camera} · {Lens} · {Film}`。
- 数码照片优先从 EXIF 读取相机、镜头、焦距、光圈、快门、ISO、拍摄时间等信息。
- 胶片照片可通过拍摄信息预设补充相机、镜头、胶片、拍摄画幅、地点和帧号等信息。
- 支持的变量包括相机、镜头、胶片、拍摄画幅、地点、帧号和自定义文本；冲洗、扫描、实验室和 Roll 不属于当前版本的用户流程。
- 变量在 Canvas 即时预览、引擎预览、单图导出、批量导出四条链路一致解析。
- 每图文字覆盖中的变量也会被解析。
- 字段来源优先级为：每图覆盖 > 拍摄信息预设 > EXIF > 空；数码用户无需创建拍摄信息预设即可使用 EXIF 信息。

### 版式

- 内置版式，覆盖经典、胶片信息、极简和分享等摄影使用场景。
- 版式卡片带纯 CSS 缩略图，一键应用到当前设置。
- 支持用户保存自定义版式，可设置默认版式。
- 支持版式 JSON 导入/导出，拖拽 JSON 文件直接应用或保存。
- 版式分类与拍摄信息预设分类相互独立，避免把“怎么拍摄”和“怎么排版”混为一谈。

### 拍摄信息预设

- 数码照片直接读取 EXIF；只有 EXIF 不完整或胶片照片没有 EXIF 时，才需要选择拍摄信息预设。
- 用户可创建、编辑、复制和删除拍摄信息预设，并为预设设置分类。
- 预设可保存相机、镜头、胶片和拍摄画幅等信息，可应用到当前图片、选中图片或全部图片。
- 每张图片可以覆盖预设中的地点、帧号和自定义文本等字段。
- 预设信息通过变量文本自动填充到边框文字中，且不会写回或修改原图元数据。

### 摄影资产库

- 本地管理相机、镜头、胶片三类摄影资产。
- 拍摄信息预设可以引用资产库中的相机、镜头和胶片，也可以直接输入一次性信息。
- 拍摄信息预设支持用户自定义分类，资产库按相机、镜头、胶片类型管理；首版优先保证快速录入和复用，不追求完整的内置器材数据库。
- Electron 模式持久化到 `userData/assets.json`，浏览器模式降级到 localStorage。

### 导出

- 单图导出使用系统保存对话框，用户自选本机路径和文件名。
- 批量导出使用系统目录选择器，用户自选本机目录；任务进入有界异步队列，进度实时展示。
- 当前工程已有 PNG / JPEG 导出路径；最终输出还必须满足 JPEG 8-bit、PNG 8/16-bit、TIFF 8/16-bit 的契约。
- 最终只提供快速分享、标准交付、高保真归档三个固定导出档位；当前的原图 / 1080P / 2K / 4K / 自定义长边控件不代表最终档位。
- 固定档位参数和 GPS/位置策略见 [docs/prd.md §0.3](docs/prd.md)。
- 批量导出完成后显示总数、成功数、失败数与失败文件明细，支持一键重试失败项和打开输出目录。
- 前端为同批文件生成确定性的序号名称；引擎仍会拒绝已有目标、同批重复目标或覆盖源图的路径，绝不静默覆盖文件。

### 预览

- Canvas 即时预览，设置修改后立即重绘。
- 后台同步 Java 引擎预览，显示同步状态。
- 引擎预览失败时降级到 Canvas 即时预览。

### 检查器面板

- 右侧检查器用折叠分组承载渲染设置、拍摄信息、版式、拍摄信息预设和摄影资产库。
- 默认展开渲染设置，其余折叠，会话内记忆展开状态。
- 支持左右栏宽度拖拽调整，宽度持久化到 sessionStorage。
- 右栏可折叠为竖条，给预览区让出空间。

## 项目结构

```text
camera-border-app/
├── electron/       # Electron 桌面壳，负责窗口、IPC、文件选择、保存目录、Java 引擎生命周期、打包资源路径
├── frontend/       # React + TypeScript + Vite 前端，负责统一渐进式工作台 UI、状态和即时预览
├── java-engine/    # Spring Boot 本地图像引擎，负责预览、渲染、导出、EXIF 读取
├── docs/           # PRD（prd.md）、任务清单（tasks.md）、决策记录（adr/）、操作手册（cookbook.md）、发布验收清单
├── scripts/        # 开发与打包脚本（含 Windows 资源预检、图标生成与安装冒烟）
├── photos/         # 开发样片（/api/dev/photos 扫描）
├── AGENTS.md       # 每次任务必读的工程规则速览
├── ARCHITECTURE.md # 项目架构规范
├── CONTRIBUTING.md # 环境、命令、验证、排障
├── DESIGN.md       # 视觉和交互方向
└── README.md
```

## 技术栈

- 桌面壳：Electron 31
- 前端：React 18、TypeScript 5、Vite 6、Vitest
- 图像引擎：Java 11、Spring Boot 2.7、Java2D、ImageIO
- 元数据读取：metadata-extractor
- 包管理：pnpm（workspace：electron + frontend）
- 构建：Maven、TypeScript、Vite
- CI：GitHub Actions（`.github/workflows/ci.yml`，push/PR 全量回归）

## 验证与测试

- 每次提交前跑与 CI 等价的检查：`pnpm --filter frontend typecheck && pnpm --filter frontend test`、`pnpm --filter electron typecheck`、`cd java-engine && mvn test`。
- 测试数量以 CI 实际输出为准，不在文档维护数字（详见 [CONTRIBUTING.md](CONTRIBUTING.md)）。

## 本计划目标（当前未全部实现）

最终产品支持范围冻结为：

- 平台：正式发布为 macOS arm64；macOS x64 与 Windows x64 为候选包，Windows 的状态固定为 `SIMULATED`。
- 输入：JPEG、PNG、TIFF、HEIC/HEIF、RAW 内嵌 JPEG 预览。
- 输出：JPEG 8-bit、PNG 8/16-bit、TIFF 8/16-bit。
- RAW：只读取内嵌 JPEG，不做真实 RAW 显影；没有内嵌 JPEG 时明确失败。
- 导出档位：快速分享（JPEG 92、长边 2048、sRGB、移除 GPS/位置）；标准交付（JPEG 95、原图尺寸、8-bit、保留源 ICC 和全部元数据）；高保真归档（TIFF、原图尺寸、源位深、源 ICC、全部元数据）。
- 标准交付和高保真归档必须保留 GPS/位置。

详细定义、统一术语和样片矩阵以 [docs/prd.md §0](docs/prd.md) 为准。最终产品不做修图、
云同步、登录、自动更新或真实 RAW 显影；Linux、Windows arm64 和移动端也不在发行范围内。

## 当前限制

当前版本仍需按平台样片矩阵继续验收输出位深与完整元数据覆盖；Java 导出会对 EXIF、ICC
和高位深逐项返回 `APPLIED` 或 `DOWNGRADED`，不会把未应用能力标成成功。HEIC/HEIF 使用随包
解码助手，RAW 当前只能按内嵌 JPEG 预览路径验收，不能以任何真实显影路径作为产品承诺。

打包脚本已支持 macOS `.dmg` 与 Windows x64 `.exe` 的构建链路（`pnpm fetch:runtime && pnpm package`，
随包 Java Runtime，最终用户无需安装 Java、Node.js 或 Python）。正式发布只等待 macOS arm64 的
安装、离线、样片和干净机器证据；macOS x64 与 Windows x64 仍按
[docs/release-checklist.md](docs/release-checklist.md) 记录候选结果，Windows 不得写成平台验收 `PASS`。代码签名、公证不属于当前测试包要求；
自动更新属于明确不做能力。完整任务拆分见 [docs/tasks.md](docs/tasks.md)，产品规划与优先级见
[docs/prd.md](docs/prd.md)。
