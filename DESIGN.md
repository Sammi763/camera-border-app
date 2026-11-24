# Camera Border App Design System

## 0. 产品契约与界面术语

本文件只定义视觉和交互表现；最终平台、输入/输出格式、导出档位和能力边界以
[docs/prd.md §0](docs/prd.md) 为准。界面文案统一使用以下产品术语：

- **版式**：边框、文字和拍摄信息的排版组合。
- **拍摄信息预设**：可复用的相机、镜头、胶片和拍摄画幅信息。
- **拍摄画幅**：照片的实际拍摄格式或比例，不是裁剪或导出尺寸。
- **边框布局建议**：根据拍摄画幅给出的留白/边框建议，不自动裁剪、不改变原图尺寸。

导出界面固定显示“快速分享”“标准交付”“高保真归档”三个档位，并在档位内显示受限的
输出格式选择：快速分享/标准交付为 JPEG 或 PNG 8-bit，高保真归档为 TIFF 或按源位深
的 PNG 8/16-bit。界面必须显示尺寸、位深、色彩空间、ICC 和 GPS/位置处理结果。标准
交付与高保真归档保留 GPS/位置；快速分享移除 GPS/位置。修图、云同步、登录、自动更新
和真实 RAW 显影不属于产品范围。

## 1. Atmosphere & Identity

照片占据工作台中央。实色中性底面和细分隔线组织队列、工具与输出。强调色用于主操作、选中与焦点，曲线通道用对应色标记。

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
|------|-------|-------|------|-------|
| Surface/base | --workbench-base | #eeedeb | #191a1c | 工作台底色 |
| Surface/panel | --workbench-panel | #faf9f7 | #232426 | 顶栏、侧栏、导出栏 |
| Surface/control | --workbench-control | #f0efed | #2b2d30 | 曲线绘图区与分段控件 |
| Glass/strong | --glass-bg-strong | rgba(255,255,255,.84) | rgba(38,45,59,.84) | 弹窗、抽屉、悬浮工具条 |
| Glass/border | --glass-border | rgba(255,255,255,.72) | rgba(255,255,255,.16) | 高光边缘 |
| Text/primary | --text-primary | #1b2230 | #f3f6fb | 标题、正文 |
| Text/secondary | --text-secondary | #4b5566 | #c2cbd9 | 次要说明 |
| Text/tertiary | --text-tertiary | #556173 | #8f9aab | 提示、元数据 |
| Border/default | --border-default | rgba(21,36,61,.13) | rgba(255,255,255,.13) | 输入框、分隔 |
| Border/subtle | --border-subtle | rgba(21,36,61,.075) | rgba(255,255,255,.08) | 内部轻分隔 |
| Accent/primary | --accent-primary | #007aff | #0a84ff | 主操作、选中态、焦点 |
| Accent/text | --accent-text | #0066d6 | #4fa3ff | 小字号蓝色文字（保证对比度） |
| Accent/hover | --accent-hover | #0066d6 | #3f9bff | 悬停 |
| Status/success | --status-success | #17643a | #6fd59a | 成功 |
| Status/warning | --status-warning | #9a6200 | #f0bf6a | 警告 |
| Status/error | --status-error | #b3261e | #ff8a84 | 错误 |
| Preview/black | --studio-preview-black | #111111 | #111111 | 中性黑预览底 |
| Preview/gray | --studio-preview-gray | #4F4F4F | #4F4F4F | 中性灰预览底 |
| Preview/white | --studio-preview-white | #F7F7F7 | #F7F7F7 | 中性白预览底 |

### Rules

- 浅色使用近白和中性灰，深色使用炭灰和石墨灰。
- 蓝色只用于交互、选中和焦点，不做大面积装饰。
- 小字号蓝色文字使用 `--accent-text`（浅色 #0066d6 / 深色 #4fa3ff），边框与焦点环保留 #007AFF；
  主按钮使用更深的蓝色渐变承载白色文字，避免纯 #007AFF 上的文字对比度不足。
- 预览背景固定为中性黑 `#111111`、中性灰 `#4F4F4F`、中性白 `#F7F7F7`，浅色与深色主题共用；
  该 token 只影响工作台预览底色，不进入 RenderRecipe 或导出配方。
- 主题 `warm` 是既有持久化标识，界面文案为「浅色」；新用户默认「跟随系统」。
- 除 DESIGN.md 与 `styles.css` 的 token 定义外，不直接引入新的原始颜色值。

## 3. Typography

### Scale

| Level | Size | Weight | Line Height | Tracking | Usage |
|-------|------|--------|-------------|----------|-------|
| H1 | 32px / 2rem | 700 | 1.15 | -0.02em | 主标题 |
| H2 | 20px / 1.25rem | 650 | 1.25 | -0.01em | 抽屉/弹窗标题 |
| H3 | 16px / 1rem | 650 | 1.35 | 0 | 面板标题 |
| Body/lg | 16px / 1rem | 400 | 1.6 | 0 | 引导文本 |
| Body | 14px / 0.875rem | 400 | 1.5 | 0 | 正文、控件 |
| Caption | 12px / 0.75rem | 500 | 1.4 | 0.02em | 次要元数据 |
| Overline | 12px / 0.75rem | 600 | 1.3 | 0.08em | 分组标签 |

### Font Stack

- Primary: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`
- Mono: `"SFMono-Regular", "JetBrains Mono", Consolas, monospace`

### Rules

- 标题、正文和控件统一使用本机系统无衬线字体；不再使用衬线字体建立摄影出版感。
- 尺寸、比例、色值、文件名等参数使用等宽字体并保持等宽数字。
- 正文和页签使用 14px，辅助标签、曲线读数与次要元数据使用 12px。
- 不使用随意的字号解决三栏布局溢出，优先调整间距与换行。

## 4. Spacing, Radii & Layout

### Base Unit

所有间距基于 4px。

| Token | Value | Usage |
|-------|-------|-------|
| --space-1 | 4px | Tight |
| --space-2 | 8px | Compact |
| --space-3 | 12px | Input padding |
| --space-4 | 16px | Standard |
| --space-5 | 20px | Comfortable |
| --space-6 | 24px | Card padding |
| --space-8 | 32px | Group spacing |
| --space-10 | 40px | Section spacing |
| --space-12 | 48px | Major split |
| --space-16 | 64px | Page rhythm |

### Radii

| Token | Value | Usage |
|-------|-------|-------|
| --radius-control | 12px | 按钮、输入框、分段控件内层 |
| 工作台面板 | 10px | 顶栏、侧栏、导出栏 |
| --radius-modal | 24px | 抽屉、弹窗 |

### Grid

- 桌面优先采用工作台式三栏：左队列 / 中预览 / 右检查器。
- 三栏之间使用 12px 间距与 12px 外边距；窄窗口（≤1100px）按 预览 → 队列 → 检查器 纵向堆叠。
- 栏宽可拖拽调整，也可用方向键、Shift 加速和 Home 复位。
- 不使用随意的 magic number。

## 5. Components

### Workspace Shell

- **Structure**: 顶栏 + 左侧队列 + 中间预览 + 右侧检查器 + 固定导出栏。
- **Variants**: light, dark, system; desktop, narrow.
- **Spacing**: 12px 外壳留白，10px 面板圆角。
- **Accessibility**: landmark clear，焦点环 2px 蓝色，分栏手柄键盘可达。
- **Motion**: 抽屉、弹窗和按压使用 transform/opacity。

### Queue Item

- **Structure**: 复选框 + 46px 缩略图 + 文件名（完整路径放在 title 提示中）+ 定位/删除。
- **Height**: 常规行 60–64px；RAW/HEIC、预设、身份覆盖等状态徽标变多时允许自然增高，不裁切提示。
- **Name & badges**: `.queueFileName` 单行省略完整文件名（完整名称由 `aria-label`/`title` 提供）；
  徽标位于同名 `.queueName` 的可换行 flex 容器中，空间不足时整体换行而不是压缩或裁切。
- **Actions**: 底部常驻“数量 + 全选/撤销/重做/更多”；280px 左栏下数量独立一行，四个按钮同排，
  全选占两格、其余各一格，不横向溢出。排序、删除已选与清空队列收进 208px 玻璃“更多”浮层。
- **States**: default, hover, active, checked, missing, dragging, drop target.
- **Rules**: 当前照片使用中性高亮底与蓝色侧边标记；批量勾选是独立状态；队列条目自身不叠加 backdrop-filter。
- **Portal menus**: “更多”浮层与右键菜单都 Portal 到 `body`，共用 `--queue-menu-*` 浮层 token
  （背景、边框、文字、hover、danger、分隔线、阴影）；浅色/深色主题通过
  `body:has(.workspaceShell[data-theme])` 补齐，不支持 backdrop-filter 时回退为不透明面板。

### Preview & Floating Toolbar

- **Structure**: 照片画布 + 底部悬浮玻璃工具条（网格 / 原图 / 适应 / 100%）。
- **Rules**: 照片区域四周留白，画布不应用模糊或颜色滤镜；工具条只在自身背景上做玻璃效果。
- **States**: idle, loading, active, area-insufficient, engine sync, actual-pixel badges.

### Template Gallery

- **Structure**: 固定双列模板卡片 + 画廊下方独立的“当前版式设置”分组。
- **Rules**: 卡片首屏只显示 4:3 缩略图、名称、“详情”文字按钮和应用按钮；长说明与字段默认收在
  `.templateGalleryDetails[hidden]` 中。摄影信息卡的布局/边框控件不再嵌在卡片里，只用轻分隔与留白分组。
- **States**: default, hover, active, recommended, details expanded, scrolled gallery.

### Tabs & Settings

- **Structure**: 页签（样式 / 摄影信息 / 底片 / 输出）+ 分组设置。
- **Rules**: 选中页签使用底线；页签支持 roving tabindex 与方向键切换；设置分组用留白与轻分隔，不用重复边框卡片；输入框统一 12px 圆角。

### 曲线

- 「总 / R / G / B」平铺切换，所选通道使用对应折线色与选中底色。
- 方形绘图区使用四等分网格、对角基准线和线性折线。固定端点为小方块，可编辑点为有大命中区的圆点。图下显示输入、输出以及加点和删点。

### Export Dock

- **Structure**: 实色导出栏。左侧范围，中间输出摘要与任务反馈，右侧单一主导出按钮。
- **Rules**: 每个范围只有一个主命令；引擎不可用或档位不可用时在主按钮之前解释。状态区可同时包含
  预检、错误与进度等多个 span，使用可换行的 `inline-flex` 与 4/10px 间距，避免相邻状态文本粘连。

### Welcome, Drawers & Dialogs

- **Structure**: 单一拖入区、侧滑抽屉、缩放淡入弹窗。
- **Rules**: 抽屉和弹窗使用 24px 圆角；抽屉支持焦点圈定、Escape 关闭并恢复打开者焦点。

## 6. Motion & Interaction

### Timing

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 120–160ms | ease-out | Hover、颜色 |
| Press | 90ms 按下 / 220ms 回弹 | cubic-bezier(0.34, 1.56, 0.64, 1) | 按钮缩放至 0.97 后回弹 |
| Drawer | 300ms | cubic-bezier(0.22, 1, 0.36, 1) | 侧滑/上滑，末尾轻微回弹 |
| Dialog | 240ms | cubic-bezier(0.34, 1.56, 0.64, 1) | 0.97 → 1 缩放并淡入 |

### Rules

- 只允许 `transform` 和 `opacity` 动画；本轮不引入动画依赖。
- 快速连续操作立即响应最新状态，不等待动画结束。
- 切换照片不应用弹跳或缩放动画。
- 启用 `prefers-reduced-motion` 时取消位移、缩放和回弹，仅保留即时状态变化。

## 7. Depth, Surface & Fallback

### Strategy

主工作台采用实色面板，临时工具条与弹层使用半透明面板。

| Type | Value | Usage |
|------|-------|-------|
| Workbench | 实色底与 1px 分隔线 | 顶栏、侧栏、导出栏 |
| Overlay | 半透明底、模糊和阴影 | 抽屉、弹窗、浮层 |
| Content surface | 84%+ 不透明度 | 表单、设置与文字密集区域 |
| Neutral canvas | 黑/灰/白纯色 | 照片预览区，不使用模糊 |
| Fallback | `@supports not (backdrop-filter)` 高不透明度面板 | 不支持模糊的 WebView |

### Rules

- 模糊用于临时工具条和弹层。
- 照片区域不受玻璃滤镜影响；导出配方与画质判断不能依赖界面材质。
- 边框与阴影用于建立层次，不靠重色块或强对比分割。
- 队列“更多”浮层与右键菜单是临时浮层：使用玻璃底、轻边框和现有阴影层级，
  不新增模糊强度；减少动态效果时只保留即时显示。
