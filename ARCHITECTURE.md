# Camera Border App Architecture Rules

本文件定义这个仓库的项目架构约束。目标不是追求“抽象完整”，而是避免各模块在早期就长歪。

适用范围：

- `electron/`
- `frontend/`
- `java-engine/`

> 文档定位：本文件是**架构规则与边界**。产品方向见 [docs/prd.md](docs/prd.md)；每次任务必读的规则速览见 [AGENTS.md](AGENTS.md)；环境与命令见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 1. 总体边界

这个项目是一个本地桌面应用，分为三个明确子系统：

- `electron/`：桌面壳。负责窗口生命周期、系统能力、启动和管理本地 Java 引擎。
- `frontend/`：工作台 UI。负责交互、状态、预览展示、任务状态展示。
- `java-engine/`：本地图像处理引擎。负责渲染、预览、导出、元数据处理。

硬性规则：

- `electron/` 不实现业务渲染逻辑。
- `frontend/` 不直接操作本地文件系统和 Java 进程。
- `java-engine/` 不关心 UI 布局和前端交互细节。
- 跨子系统通信必须通过明确的 API 或 preload 暴露接口完成，禁止隐式耦合。

## 2. 当前阶段

项目已过“先搭稳定框架”阶段：工作台骨架、Java 引擎生命周期、预览/渲染接口、模板系统、摄影资产库均已落地。
当前处于可安装摄影师 MVP 的稳定化阶段：数码走 EXIF，胶片走可分类摄影预设，具体任务与优先级见 [docs/prd.md](docs/prd.md) 第 8、9 节和 [docs/tasks.md](docs/tasks.md)。

架构上仍遵守本文件约束；是否新增抽象/分层按第 7 节规则判断。

## 3. Repo 级结构规范

### 3.1 Electron

当前结构（描述性，与代码一致）：

```text
electron/src/
  main/       应用启动、窗口创建、生命周期编排（main.ts、appLifecycle.ts、createMainWindow.ts）
  engine/     Java 引擎启动/停止、健康探测、配置、随包运行时解析与托管单例
              （JavaBridge.ts、engineHealth.ts、engineConfig.ts、engineRuntime.ts、managedEngine.ts）
  ipc/        IPC handler（文件对话框、模板/资产/摄影预设存储、HEIC 转换、引擎诊断与重试）
  preload/    preload 脚本，暴露白名单 API
  paths/      路径解析（开发 / 打包双模式：frontendDistDir、engineJarPath、javaRuntimeDir）
  config/     应用配置（appConfig.ts、devMode.ts）
  types/      preload 契约类型与 IPC 通道常量（desktopApi.ts）
```

规则：

- 主进程代码按职责分目录，`main/` 只负责应用启动、窗口创建、生命周期编排，不堆业务判断和大量字符串常量。
- `engine/` 只负责 Java 引擎的启动、停止、健康探测、错误包装；打包模式使用随包 Java Runtime（`engineRuntime.ts` 解析），不依赖用户本机安装 Java。
- `preload/` 只暴露经过筛选的安全运行时接口（`window.desktop` / `window.desktopRuntime`）。

### 3.2 Frontend

当前结构（描述性，与代码一致）：

```text
frontend/src/
  app/         入口（main.tsx、App.tsx）
  pages/       工作台页面（WorkspacePage：统一渐进式工作台的状态装配）
  features/    按业务分组的界面和状态逻辑：
               queue/（队列与批量选中）、preview/、settings/、template/、metadata/、
               workspace/（欢迎页与拖放路由）、quick/（兼容工具）、engineHealth/（引擎故障提示）
  components/  可复用基础 UI（页签、焦点受限抽屉、顶部栏）
  services/    engine/（Java HTTP 客户端）、desktop/（桌面桥接、HEIC 转换）
  types/       共享类型
  utils/       工具
  styles/      设计 token 与全局样式
```

规则：

- `app/` 与 `pages/` 只负责页面骨架组合，不承载大量业务逻辑。
- `services/engine/` 只放请求封装和响应映射。
- `components/` 放可复用基础 UI。
- `features/` 放按业务分组的界面和状态逻辑，例如 `queue/`、`preview/`、`settings/`、`template/`、`metadata/`。
- `types/` 只放共享类型，不放行为逻辑。
- 前端禁止自行定义与后端长期契约冲突的“临时 DTO”。

### 3.3 Java Engine

当前结构（描述性，与代码一致）：

```text
java-engine/src/main/java/com/camborder/app/
  controller/   HTTP 接口输入输出
  dto/          请求/响应对象
  model/        渲染领域模型（RenderRecipe、BorderConfig、TextItem 等）
  service/      业务接口；service/impl/ 为实现
  repository/   内存存储（任务状态、预览存储）
  util/         图像/颜色/文字/路径/元数据工具
  exception/    受控异常与统一错误处理
  config/       配置
```

规则：

- `controller/` 只负责 HTTP 接口输入输出。
- `service/` 承载引擎行为，实现放 `service/impl/`，不把逻辑塞进 controller。
- `model/` 放渲染领域模型，`dto/` 放请求/响应对象。
- 新增实现遵循现有命名（`XxxService` 接口 + `XxxServiceImpl` 实现）。

## 4. API 设计规则

### 4.1 单一渲染配方

预览和导出必须共享同一份核心渲染配置：

- 使用 `RenderRecipe` 作为共享核心模型。
- `PreviewRequest` 和 `RenderJobRequest` 只能在外围补充预览尺寸、导出设置等差异字段。
- 禁止为预览和导出维护两套意义相同但字段不一致的配置结构。

### 4.2 本地语义优先

这是桌面本地应用，字段命名必须反映本地资源语义：

- 用 `imagePath`
- 不用 `imageUrl`

除非后续真的支持远程资源，否则禁止引入 URL 语义。

### 4.3 面向 PRD 的最小正确模型

即使是 MVP，占位结构也必须朝真实目标对齐：

- 边框使用 `top/bottom/left/right`，不要只做单个 `width`
- 文本使用 `texts[]`，不要只做单个 `text`
- 导出设置单独建 `ExportSettings`
- 预览接口和导出接口都基于 `RenderRecipe`
- 可选边框风格使用 `RenderRecipe.borderStyle`（id/intensity/edgeWidth/holeCount/paperTone）：
  Canvas 与 Java2D 使用同一套风格 ID 与几何规格（权威定义在
  `java-engine/util/BorderStyleRenderer` 类注释）；未识别 id 或缺省时两端都保持原行为
- 图片解码来源 `sourceDecode {mode, format, warning}` 随预览/导出响应返回；
  RAW 只允许使用文件内嵌 JPEG；报告必须明确像素来源和尺寸，禁止把传感器 RAW
  当作已完成显影，也不得提供外部显影分支。

### 4.4 接口风格

- `GET` 只用于纯读取且参数简单的接口
- 配置复杂的预览请求必须使用 `POST`
- 异步导出任务使用 job 风格接口，例如：
  - `POST /api/render-jobs`
  - `GET /api/render-jobs/{jobId}`

## 5. 校验与错误处理

### 5.1 请求校验

所有系统边界输入必须校验，至少包括：

- 必填字段
- 数值范围
- 枚举合法性
- 空 body

禁止把“空请求也返回 200”固化成测试用例。

### 5.2 错误语义

- 4xx：请求不合法
- 5xx：服务内部异常
- 受控异常应返回明确的 4xx/5xx 响应（经 `GlobalExceptionHandler`），不能吞掉明显的非法输入

## 6. 测试规则

每个新增接口至少覆盖两类测试：

- happy path
- invalid input / failure path

禁止只测“能通”。尤其是以下场景必须测：

- 空 body
- 缺少必填字段
- 非法枚举值
- 非法尺寸参数

## 7. 命名与抽象规则

### 7.1 什么时候可以抽象

只有在以下条件之一成立时才允许新增抽象层：

- 已出现第二个明确实现
- 已存在重复逻辑
- 不抽象会明显让边界混乱

否则先保持直接。

### 7.2 什么时候不要抽象

以下情况禁止过度设计：

- 为尚未实现的 V2/V3 能力提前铺很多接口
- 为单一占位实现引入过多工厂、策略、注册表
- 前端先做一整套复杂状态架构，但还没有真实数据流

## 8. 注释与说明语言

为了降低协作成本，仓库内新增的代码注释、说明性文案和面向开发者的错误提示统一使用简体中文。

适用范围：

- 代码注释
- 提交给协作 agent 的代码内说明
- 面向开发者的占位提示和 TODO 说明
- 新增架构文档、设计说明、开发说明

规则：

- 默认使用简体中文，不中英混杂表达同一层含义。
- 变量名、类型名、接口名、路径名仍按现有代码风格使用英文。
- 面向最终用户的界面文案可以根据产品需要使用英文或中英混合，但代码注释和开发说明仍保持简体中文。
- 引用外部协议字段或第三方库原始术语时，可保留英文原词，但解释说明使用简体中文。

## 9. Definition of Done

一个任务完成前，必须同时满足：

- 代码位置符合本文件结构约束（第 3 节）
- 接口命名与字段命名符合本文件规则（第 4 节）
- 至少有基础成功路径和失败路径测试（第 6 节）
- 新增抽象/分层有明确理由（第 7 节）
- 没有把 UI 草稿直接硬编码成后端长期契约

## 10. Agent Working Rules

给执行 agent 的硬约束速览见根目录 [AGENTS.md](AGENTS.md)（每次任务必读）。
其要点均出自本文件，不在此重复：先判断子系统归属、不跨子系统顺手重构、改 API/DTO 前检查第 4 节、
新增目录/分层必须说明理由（第 7 节）、测试必须含失败路径（第 6 节）、注释默认简体中文（第 8 节）。

## 11. 路线图

产品阶段计划与优先级见 [docs/prd.md](docs/prd.md)（第 8、9 节），架构相关任务随其推进。
本文件不再维护“推荐下一步”，避免与路线图漂移。
