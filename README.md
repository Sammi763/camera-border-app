# 相机边框工具

一个面向摄影工作流的本地桌面图片边框工具。项目目标是让摄影用户可以快速为照片添加边框、文字信息和胶片风格排版，并以尽量保留原图质量的方式导出成品。

当前项目采用 Electron + React + Java 本地图像引擎的架构：界面运行在桌面 App 中，图像读取、预览同步和原图导出由本地 Java 服务完成，图片不会上传到云端。

## 主要功能

- 支持导入单张或多张本地图片。
- 支持 JPG / JPEG / TIF / TIFF 图片作为输入。
- 支持左侧图片队列、缩略图和当前图片切换。
- 支持纯色边框和基础渐变边框。
- 支持上下左右边框独立调整。
- 支持画幅预设和推荐边框值联动，包括半格、135、645、6x6、6x7、6x8、6x9、6x12。
- 支持文字内容、字号、颜色、字体、位置和放置区域调整。
- 支持文字放在图片上或边框上。
- 支持每张图片独立文字覆盖，适合批量出图时填写不同信息。
- 支持基础 EXIF 读取并填充相机、镜头、光圈、快门、ISO、焦距等文字信息。
- 支持模板保存、加载、删除和默认模板。
- 支持实时 Canvas 预览，同时后台同步 Java 引擎预览。
- 支持 PNG / JPEG 原图尺寸导出。
- 支持批量导出和导出进度展示。

## 项目结构

```text
camera-border-app/
├── electron/       # Electron 桌面壳，负责窗口、IPC、文件选择、保存目录、Java 引擎生命周期
├── frontend/       # React + TypeScript + Vite 前端，负责工作台 UI、状态和即时预览
├── java-engine/    # Spring Boot 本地图像引擎，负责预览、渲染、导出、EXIF 读取
├── ARCHITECTURE.md # 项目架构规范
├── DESIGN.md       # 视觉和交互方向
└── 图片边框工具-PRD与开发计划.md
```

## 技术栈

- 桌面壳：Electron
- 前端：React、TypeScript、Vite
- 图像引擎：Java 11、Spring Boot、Java2D、ImageIO
- 元数据读取：metadata-extractor
- 包管理：pnpm
- 构建：Maven、TypeScript、Vite

## 开发环境

建议使用：

- Node.js 20+
- pnpm 9+
- Java 11+
- Maven 3.9+
- IntelliJ IDEA：启动 `java-engine`
- WebStorm 或 VS Code：启动 `frontend` 和 `electron`

## 开发启动

日常开发建议使用外部引擎模式：由 IDEA 启动 Java 服务，Electron 只连接它。这种方式不用每次打 jar，更贴近日常开发体验。

### 1. 安装依赖

```bash
pnpm install
```

### 2. 启动 Java 引擎

在 IDEA 中运行：

```text
java-engine/src/main/java/com/camborder/app/CameraBorderApplication.java
```

也可以在终端运行：

```bash
cd java-engine
mvn spring-boot:run
```

默认服务地址：

```text
http://127.0.0.1:8080
```

### 3. 启动前端开发服务

```bash
cd frontend
pnpm dev
```

默认前端地址：

```text
http://127.0.0.1:5173
```

### 4. 启动 Electron App

```bash
cd electron
pnpm dev
```

开发模式下，Electron 会加载 Vite 页面，并连接外部 Java 引擎。此时不需要先执行 `mvn package`。

## 托管模式

托管模式用于验证 Electron 管理 Java jar 的行为，更接近未来打包后的运行方式。

```bash
cd java-engine
mvn package
```

```bash
cd frontend
pnpm build
```

```bash
cd electron
pnpm dev:managed
```

## 常用检查

```bash
cd java-engine
mvn test
```

```bash
cd frontend
pnpm typecheck
pnpm build
```

```bash
cd electron
pnpm typecheck
```

根目录也提供了部分快捷脚本：

```bash
pnpm typecheck
pnpm build:frontend
```

## 本地数据和忽略文件

以下内容不会上传到 Git：

- `photos/`：本地测试样片目录
- `exports/`：本地导出结果目录
- `node_modules/`
- `dist/`
- `target/`
- `.idea/`
- `.claude/`
- `.github/modernize/`

Electron 模式下，模板文件会保存在系统的 userData 目录中，例如 macOS 上通常位于：

```text
~/Library/Application Support/electron/templates.json
```

## 当前边界

项目仍在 MVP 阶段。当前重点是完成稳定好用的单图和批量出图流程。

暂未作为首版重点的能力包括：

- ICC Profile 全链路保留
- 16-bit 图像处理
- TIFF 高位深导出
- EXIF / XMP / IPTC / GPS 完整写回
- Windows / macOS 安装包发布

这些能力已经在 PRD 中规划为后续阶段。
