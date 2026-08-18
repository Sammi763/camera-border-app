# 图片边框工具

一个面向摄影工作流的本地桌面图片边框工具。项目目标是让摄影用户可以快速为数码或胶片照片添加边框、摄影信息和可复用模板，并以尽量保留原图质量的方式批量导出成品。应用面向 Windows 和 macOS 打包发布，不要求登录，图片和用户资产默认只保存在本机。

当前项目采用 Electron + React + Java 本地图像引擎的架构：界面运行在桌面 App 中，图像读取、预览同步和原图导出由本地 Java 服务完成，图片不会上传到云端。

## 最短运行路径

```bash
pnpm install

# 先启动 Java 引擎（dev 模式不会自动启动 jar）
cd java-engine && mvn spring-boot:run

# 再一键启动前端 + Electron（Vite :5173 → Electron）
cd .. && pnpm dev
```

环境要求、分步启动、托管模式、日常命令与排障见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 文档入口

| 文档 | 用途 |
|---|---|
| [AGENTS.md](AGENTS.md) | **每个任务开始前必读**：工程规则速览、不变量、验证要求 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 架构边界、API 设计规则、结构规范、测试规则 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 环境搭建、日常命令、验证路径、故障恢复 |
| [docs/prd.md](docs/prd.md) | PRD 与路线图：产品定位、功能设计、阶段计划、验收标准 |
| [docs/tasks.md](docs/tasks.md) | 按依赖拆分的实施任务、完成条件与验证路径 |
| [docs/adr/](docs/adr/) | 关键决策的原因与替代方案 |
| [docs/cookbook.md](docs/cookbook.md) | 常见任务操作步骤（加端点/变量/模板/字体等） |
| [DESIGN.md](DESIGN.md) | 设计系统（色彩 token、字体、间距、组件） |
| [electron/README.md](electron/README.md) | 桌面壳：职责、IPC 桥接 API、持久化位置 |
| [frontend/README.md](frontend/README.md) | 前端：目录、数据流、桌面/浏览器模式差异 |
| [java-engine/README.md](java-engine/README.md) | 引擎：分层、API 索引、渲染管线、存储语义 |
| [java-engine/docs/FONT_CANDIDATES.md](java-engine/docs/FONT_CANDIDATES.md) | 字体候选与授权核验 |

## 主要功能

> 本节同时记录当前已具备能力与已经确定的 MVP 目标；标注为摄影预设、统一画幅和安装包的部分以 [docs/tasks.md](docs/tasks.md) 的完成状态为准。

### 图片导入

- 支持从本机选择图片文件（多选）或图片文件夹导入。
- 支持拖拽图片到队列面板直接导入（桌面模式）。
- 支持 JPG / JPEG / PNG / WebP / TIFF 图片格式。
- 代码层面已具备 RAW 嵌入式预览提取与 HEIC/HEIF 桌面模式转换（macOS），是否正式纳入支持格式待产品确认（见 [docs/prd.md §3.3](docs/prd.md)）。
- 文件夹导入自动扫描当前层级图片，按文件名自然排序。
- 首张图片自动选中，切换图片触发预览。
- 空文件夹显示中文提示。

### 边框与文字

- 支持纯色边框和基础渐变边框（线性/径向，多停靠点）。
- 支持上下左右边框独立调整。
- 支持拍摄画幅预设和推荐边框值联动：数码包括 M43、APS-C、135 全画幅、4433 中画幅；胶片包括半格、135、645、6x6、6x7、6x8、6x9、6x10、6x12。
- 画幅预设只提供比例和边框建议，不会未经确认裁剪或改变原图尺寸。
- 支持文字内容、字号、颜色、字体、位置和放置区域调整。
- 支持文字放在图片上或边框上。
- 支持每张图片独立文字覆盖，适合批量出图时填写不同信息。
- 支持基础 EXIF 读取并填充相机、镜头、光圈、快门、ISO、焦距等文字信息。

### 变量文本

- 文字模板支持变量占位符，如 `{Camera} · {Lens} · {Film}`。
- 数码照片优先从 EXIF 读取相机、镜头、焦距、光圈、快门、ISO、拍摄时间等信息。
- 胶片照片可通过摄影预设补充相机、镜头、胶片、画幅、地点和帧号等信息。
- 支持的变量包括相机、镜头、胶片、拍摄画幅、地点、帧号和自定义文本；冲洗、扫描、实验室和 Roll 不属于当前版本的用户流程。
- 变量在 Canvas 即时预览、引擎预览、单图导出、批量导出四条链路一致解析。
- 每图文字覆盖中的变量也会被解析。
- 字段来源优先级为：每图覆盖 > 摄影预设 > EXIF > 空；数码用户无需创建预设即可使用 EXIF 信息。

### 视觉模板

- 内置视觉模板，覆盖经典、胶片信息、极简和社交分享等摄影使用场景。
- 模板卡片带纯 CSS 缩略图，一键应用到当前设置。
- 支持用户保存自定义模板，可设置默认模板。
- 支持模板 JSON 导入/导出，拖拽 JSON 文件直接应用或保存。
- 视觉模板分类与摄影预设分类相互独立，避免把“怎么拍摄”和“怎么排版”混为一谈。

### 摄影预设

- 数码照片直接读取 EXIF；只有 EXIF 不完整或胶片照片没有 EXIF 时，才需要选择摄影预设。
- 用户可创建、编辑、复制和删除摄影预设，并为预设设置分类。
- 预设可保存相机、镜头、胶片和拍摄画幅等信息，可应用到当前图片、选中图片或全部图片。
- 每张图片可以覆盖预设中的地点、帧号和自定义文本等字段。
- 预设信息通过变量文本自动填充到边框文字中，且不会写回或修改原图元数据。

### 摄影资产库

- 本地管理相机、镜头、胶片三类摄影资产。
- 摄影预设可以引用资产库中的相机、镜头和胶片，也可以直接输入一次性信息。
- 摄影预设支持用户自定义分类，资产库按相机、镜头、胶片类型管理；首版优先保证快速录入和复用，不追求完整的内置器材数据库。
- Electron 模式持久化到 `userData/assets.json`，浏览器模式降级到 localStorage。

### 导出

- 单图导出使用系统保存对话框，用户自选本机路径和文件名。
- 批量导出使用系统目录选择器，用户自选本机目录；多图并行导出，进度实时展示。
- 支持 PNG / JPEG 原图尺寸导出。
- 支持输出尺寸预设：原图 / 1080P / 2K / 4K / 自定义长边，按长边等比缩小。
- 批量导出进度展示（当前/总数/成功/失败）。
- 文件名冲突自动追加序号。

### 预览

- Canvas 即时预览，设置修改后立即重绘。
- 后台同步 Java 引擎预览，显示同步状态。
- 引擎预览失败时降级到 Canvas 即时预览。

### 检查器面板

- 右侧检查器用折叠分组承载渲染设置、摄影信息、模板、摄影预设和摄影资产库。
- 默认展开渲染设置，其余折叠，会话内记忆展开状态。
- 支持左右栏宽度拖拽调整，宽度持久化到 sessionStorage。
- 右栏可折叠为竖条，给预览区让出空间。

## 项目结构

```text
camera-border-app/
├── electron/       # Electron 桌面壳，负责窗口、IPC、文件选择、保存目录、Java 引擎生命周期
├── frontend/       # React + TypeScript + Vite 前端，负责工作台 UI、状态和即时预览
├── java-engine/    # Spring Boot 本地图像引擎，负责预览、渲染、导出、EXIF 读取
├── docs/           # PRD（prd.md）、任务清单（tasks.md）、决策记录（adr/）、操作手册（cookbook.md）
├── scripts/        # 开发辅助脚本（dev.sh）
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

## 当前边界

项目仍在 MVP 阶段。当前重点是完成稳定好用的单图和批量出图流程，并让数码 EXIF 与胶片摄影预设都能顺畅进入同一套排版流程。

暂未作为首版重点的能力包括：

- ICC Profile 全链路保留
- 16-bit 图像处理
- TIFF 高位深导出
- EXIF / XMP / IPTC / GPS 完整写回
- 胶卷 Roll、冲洗、扫描、实验室管理
- 暗房专属工作流和接触表
- Logo 自动识别
- AI 辅助能力
- 自动更新、代码签名和公证

Windows `.exe` 和 macOS `.dmg` 打包是当前 MVP 的交付前置任务；Roll、冲洗、扫描、暗房和接触表明确延期。完整任务拆分见 [docs/tasks.md](docs/tasks.md)，产品规划与优先级见 [docs/prd.md](docs/prd.md)。
