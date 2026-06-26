# 图片边框工具

一个面向摄影工作流的本地桌面图片边框工具。项目目标是让摄影用户可以快速为照片添加边框、文字信息和胶片风格排版，并以尽量保留原图质量的方式导出成品，主要侧重于胶片，后续会兼容数码。

当前项目采用 Electron + React + Java 本地图像引擎的架构：界面运行在桌面 App 中，图像读取、预览同步和原图导出由本地 Java 服务完成，图片不会上传到云端。

## 主要功能

### 图片导入

- 支持从本机选择图片文件（多选）或图片文件夹导入。
- 支持 JPG / JPEG / PNG / WebP / TIFF 图片格式。
- 文件夹导入自动扫描当前层级图片，按文件名自然排序。
- 首张图片自动选中，切换图片触发预览。
- 空文件夹显示中文提示。

### 边框与文字

- 支持纯色边框和基础渐变边框（线性/径向，多停靠点）。
- 支持上下左右边框独立调整。
- 支持画幅预设和推荐边框值联动，包括半格、135、645、6x6、6x7、6x8、6x9、6x12。
- 支持文字内容、字号、颜色、字体、位置和放置区域调整。
- 支持文字放在图片上或边框上。
- 支持每张图片独立文字覆盖，适合批量出图时填写不同信息。
- 支持基础 EXIF 读取并填充相机、镜头、光圈、快门、ISO、焦距等文字信息。

### 变量文本

- 文字模板支持变量占位符，如 `{Camera} · {Lens} · {Film}`。
- 支持的变量：相机、镜头、胶片、冲洗工艺、扫描仪、实验室、地点、卷名、帧号。
- 变量在 Canvas 即时预览、引擎预览、单图导出、批量导出四条链路一致解析。
- 每图文字覆盖中的变量也会被解析。

### 视觉模板

- 内置 9 套视觉模板，覆盖经典、暗房、胶片、档案风格。
- 模板卡片带纯 CSS 缩略图，一键应用到当前设置。
- 支持用户保存自定义模板，可设置默认模板。
- 支持模板 JSON 导入/导出，拖拽 JSON 文件直接应用或保存。
- 内置模板分类：经典、胶片、暗房、档案。

### Roll 胶卷工作流

- 创建 Roll 绑定相机、镜头、胶片、冲洗、扫描仪、实验室、地点信息。
- 将 Roll 应用到当前图片或全部图片。
- 每张图片可覆盖 Roll 中的任意字段。
- Roll 信息通过变量文本自动填充到边框文字中。
- 删除 Roll 时自动清理队列中的悬空绑定。

### 摄影资产库

- 本地管理相机、镜头、胶片、扫描仪、实验室、冲洗工艺六类资产。
- 胶片字段支持从后端内置胶片库一键导入（15 款常见胶片）。
- Roll 编辑表单可从资产库候选项中快速选择。
- Electron 模式持久化到 `userData/assets.json`，浏览器模式降级到 localStorage。

### 导出

- 单图导出使用系统保存对话框，用户自选本机路径和文件名。
- 批量导出使用系统目录选择器，用户自选本机目录。
- 支持 PNG / JPEG 原图尺寸导出。
- 批量导出进度展示（当前/总数/成功/失败）。
- 文件名冲突自动追加序号。

### 预览

- Canvas 即时预览，设置修改后立即重绘。
- 后台同步 Java 引擎预览，显示同步状态。
- 引擎预览失败时降级到 Canvas 即时预览。

### 检查器面板

- 右侧检查器用折叠分组承载渲染设置、摄影信息、模板、Roll、摄影资产库。
- 默认展开渲染设置，其余折叠，会话内记忆展开状态。
- 支持左右栏宽度拖拽调整，宽度持久化到 sessionStorage。
- 右栏可折叠为竖条，给预览区让出空间。

## 项目结构

```text
camera-border-app/
├── electron/       # Electron 桌面壳，负责窗口、IPC、文件选择、保存目录、Java 引擎生命周期
├── frontend/       # React + TypeScript + Vite 前端，负责工作台 UI、状态和即时预览
├── java-engine/    # Spring Boot 本地图像引擎，负责预览、渲染、导出、EXIF 读取
├── scripts/        # 开发辅助脚本
├── ARCHITECTURE.md # 项目架构规范
├── DESIGN.md       # 视觉和交互方向
└── README.md
```

## 技术栈

- 桌面壳：Electron 31
- 前端：React 18、TypeScript 5、Vite 6、Vitest
- 图像引擎：Java 11、Spring Boot 2.7、Java2D、ImageIO
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

### 一键启动（推荐）

在项目根目录运行：

```bash
pnpm install
pnpm dev
```

此命令会自动启动 Vite 开发服务器，等待就绪后启动 Electron。适用于日常开发。

### 手动分步启动

#### 1. 安装依赖

```bash
pnpm install
```

#### 2. 启动 Java 引擎

在 IDEA 中运行：

```text
java-engine/src/main/java/com/camborder/app/CameraBorderApplication.java
```

也可以在终端运行：

```bash
cd java-engine
mvn spring-boot:run
```

默认服务地址：`http://127.0.0.1:8080`

#### 3. 启动前端开发服务

```bash
cd frontend
pnpm dev
```

默认前端地址：`http://127.0.0.1:5173`

#### 4. 启动 Electron App

```bash
cd electron
pnpm dev
```

开发模式下，Electron 会加载 Vite 页面，并连接外部 Java 引擎。此时不需要先执行 `mvn package`。

> 注意：Electron 的 preload 脚本使用 CommonJS 格式编译。`electron/package.json` 不包含 `"type": "module"`，以确保 Node.js 正确加载编译产物。

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
# 后端测试
cd java-engine
mvn test

# 前端测试
cd frontend
pnpm test

# 前端类型检查
cd frontend
pnpm typecheck

# 前端构建
cd frontend
pnpm build

# Electron 类型检查
cd electron
pnpm typecheck
```

根目录也提供了部分快捷脚本：

```bash
pnpm typecheck
pnpm build:frontend
```

## 测试覆盖

- 后端：95 个测试，覆盖预览、导出、画幅格式、胶片库、文本变量格式化等。
- 前端：55 个测试，覆盖变量文本解析、内置模板校验、模板 JSON 编解码、资产库 JSON 编解码、有效文本解析等。

## 当前边界

项目仍在 MVP 阶段。当前重点是完成稳定好用的单图和批量出图流程。

暂未作为首版重点的能力包括：

- ICC Profile 全链路保留
- 16-bit 图像处理
- TIFF 高位深导出
- EXIF / XMP / IPTC / GPS 完整写回
- Contact Sheet 接触表
- Logo 自动识别
- AI 辅助能力
- Windows / macOS 安装包发布

这些能力已经在项目文档中规划为后续阶段。
