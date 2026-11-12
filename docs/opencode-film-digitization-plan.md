# OpenCode 执行方案：翻拍 RAW、彩负转正与校色

本文是交给 OpenCode 的施工任务书，目标模型为用户配置的 `DeepSeek-v4.1-flash-max`。这是新增产品能力的提案与实施安排，不代表功能已经实现或验收。编制日期：2026-11-11。

不假设该模型的上下文上限、基准成绩或 OpenCode 中的真实 provider/model ID，不据此修改模型配置。执行方式采用小任务、固定契约、证据验收和持久交接，减少长会话中的遗漏。

## 1. 能力目标

摄影用户把数码相机翻拍的彩色负片 RAW 导入应用，在本机完成真实 RAW 解码、光源校准、片基取样、负片转正、全局校色与曲线调整，支持逐张编辑和整卷同步，再导出不带框母版或带边框成品。首批以 Kodak Gold 200 和 Kodak Portra 160 的真实样片验证。

第一版需要交付：

- 真实传感器 RAW 路径与现有内嵌 JPEG 路径明确区分。
- 光源参考、片基参考、通道剪裁提示、通用彩负转正。
- 正片视图下的曝光、RGB 平衡、饱和度、黑白点、RGB 总曲线及 R/G/B 分通道曲线。
- 直方图、区域取样、原始负片/基础转正/当前结果对比。
- 保留已有图片放置能力，新增独立于版式的底片画面裁切和校平。
- 每图编辑、撤销重做、会话恢复、选择性批量同步。
- 明确的工作色彩空间、sRGB 预览、sRGB 分享输出、带 ICC 的 16-bit TIFF 母版。
- 保留原图；所有派生输出写入用户选择的新路径。

Gold 200、Portra 160 首先作为拍摄身份与验证样本分类。只有实际校准证据支持时才增加对应转换配置；没有证据时使用明确标注的通用彩负配置，不伪造两个“专业还原”预设。

## 2. 固定约束与现状

### 2.1 本任务的范围变化

现有 [PRD §0](prd.md)、[架构规则 §4](../ARCHITECTURE.md) 和 [RAW 说明](raw-and-fidelity.md) 限制 RAW 为内嵌 JPEG，并排除修图、曲线、真实显影。本方案提出新增显式的底片处理模式。T00 先同步范围及 ADR，再开始生产代码；不得直接删除旧限制而让旧模式改变含义。

保留以下不变量：本地处理、无运行时联网依赖、Electron 安全边界、单一 RenderRecipe、预览与导出同源、默认不改普通照片、默认不缩小或覆盖原图、真实报告像素来源和输出事实。

### 2.2 已核对的代码接点

| 接点 | 当前事实 | 实施要求 |
|---|---|---|
| `java-engine/.../util/RawDecoder.java`、`ImageReader.java` | RAW 扫描内嵌 JPEG；标准图先规范到 sRGB | 新增真实 RAW 分支，底片处理输入不能先经过旧 sRGB 规范化 |
| `java-engine/.../model/RenderRecipe.java` | 现有字段面向版式，没有像素编辑配方 | 增加可选、带版本的处理配置；缺省保留旧行为 |
| `java-engine/.../dto/SourceDecode.java` | 实际 mode 为 `standard`、`embedded-jpeg` | 保留旧枚举语义，新增显式传感器来源；不要把文档中的说明文字误当现有枚举 |
| `java-engine/.../util/ImageColorConverter.java`、`PixelBufferFactory.java` | 支持高位深栅格，但当前合成工作空间为 sRGB | 高位深容器不能代替浮点宽色域管线 |
| `java-engine/.../util/ImageEncoder.java` | 专业编码入口假定输入为 sRGB | 新路径必须传递真实工作空间，禁止重贴标签或提前转到 sRGB |
| `java-engine/.../service/ImageRenderService.java` | ComposeOutcome 携带图像、来源、源事实 | 若演进结果类型，预览与导出两个调用方同步迁移 |
| `frontend/src/features/settings/utils/buildRecipe.ts` | 配方唯一装配点，另有裸图预览请求 | 扩展唯一装配逻辑，并审计裸图、对比、缩略图及实际尺寸预览 |
| `frontend/src/features/preview/hooks/usePreview.ts` | 裸图供 Canvas，后台同步完整引擎预览 | 校色模式使用引擎校色结果，禁止显示未经处理的 Canvas 图冒充当前结果 |
| `frontend/src/features/queue/hooks/useQueue.ts` | 会话存 localStorage，已有历史与恢复 | 扩展每图编辑数据并兼容旧会话，不另造持久化系统 |
| `frontend/src/features/preview/hooks/useExportController.ts` | 提交前冻结设置和队列项 | 新增嵌套编辑配方必须深复制，批量逐项解析 |
| `electron/src/main/protocol.ts` | 生产 API 路由显式白名单 | 新端点必须添加精确路由及允许方法，禁止放开整个 `/api/**` |
| `java-engine/.../service/impl/RuntimeCapabilitiesService.java` | 随包组件探测；`rawEmbeddedJpeg` 能力已有 | 新能力基于真实组件与运行结果探测，缺失时不可用 |
| `scripts/prepare-package-resources.mjs`、`scripts/package-app.sh` | 已有专业组件、清单和打包流程 | 复用资源组装机制，不能只依赖开发机工具 |

表中 `java-engine/.../` 均指 `java-engine/src/main/java/com/camborder/app/`。打开文件前先用 `rg --files` 确认路径，仓库演进后以实际源码为准。

### 2.3 工作区保护

编制方案时，工作区存在大量尚未提交的 UI、几何、队列、预览与渲染改动，它们就是本次实施要兼容的输入基线。

- 开始时记录 `git status --short`、HEAD 和当前差异清单；在临时目录保存必要的基线差异。
- 不运行 `git reset --hard`、`git clean` 或批量 checkout；不自动 stash、提交、推送或创建 PR。
- 不把“文件已脏”误认为可以覆盖；在实际工作树内容上做最小补丁。
- 默认串行执行，不启动并行 agent 修改共享文件。一个任务跨多个子系统时，只改契约必需的接点。
- 只使用 pnpm workspace 和根 `pnpm-lock.yaml`，不更新历史 `frontend/package-lock.json`。

## 3. 实现契约

### 3.1 边界和处理顺序

```text
受控本地文件
  → RAW 解码 / 带明确 profile 的栅格读取
  → 翻拍光源与相机校准
  → 线性宽色域浮点工作图
  → 片基校正、负片密度建模、正片映射
  → 正片曝光 / RGB 平衡 / 黑白点 / 曲线 / 饱和度
  → 源图坐标下的裁切与校平
  → 照片与边框、文字、Logo 合成
  ├─ 预览：缩放、转换至 sRGB、嵌入匹配 ICC → 界面显示
  └─ 导出：转换至选定输出空间、量化和编码、元数据写回、独立核验
```

- Java 引擎拥有处理算法和原生组件调用；Electron 只做路径、资源配置和系统能力；前端只做交互、配方状态与显示。
- 首选评估随包 LibRaw 小型 helper，由 Java 通过受控进程调用，避免在第一版同时引入 JNI、Node 原生插件和另一套 HTTP 服务。该选择须通过 T01 的真实样本验证。
- helper 是 Java 引擎的内部实现部件，不构成第四个业务服务。原生源码可归属 `java-engine/src/main/native/`；这是为了明确原生解码边界，只有选型通过后才新增该目录。
- 固定版本、构建参数、目标架构、校验和及所用许可证分支；禁止运行时下载或回退系统 PATH。开发构建需要的编译工具与最终用户运行依赖要分开说明。
- 新增 `frontend/src/features/editing/` 的理由是集中独立的底片编辑业务，避免继续扩张 WorkspacePage 和 SettingsPanel；不引入通用节点图、插件系统或多层注册表。

### 3.2 数据模型

T02 冻结完整字段、默认值和范围，方向如下。这里的分组名是设计输入，未冻结前不能各端自行发明不同字段。

| 模型 | 必须表达的含义 |
|---|---|
| `RenderRecipe.imageProcessing` | 可选；缺省或 null 走旧模式。包含独立 schemaVersion、算法版本、输入模式、RAW 参数、负片参数、正片调整、源图裁切 |
| RAW 参数 | 明确使用传感器数据；光源校准引用或数值、解码选项。真实 RAW 失败不得自动换成内嵌 JPEG |
| 负片参数 | enabled、片基 RGB 参考及其空间/阶段、密度范围、已验证的转换配置及版本 |
| 正片调整 | 数值定义明确的曝光、RGB 平衡、黑白点、饱和度、总曲线、分通道曲线；零调整应为恒等映射 |
| 曲线 | 点数上限、固定端点、严格递增 x、单调 y、插值方法、输入域、越域行为和顺序。第一版只支持单调曲线，避免不受控过冲 |
| 源图几何 | 归一化裁切框和校平角度，与现有用于版式填充的 imagePlacement 分开；方向只物理应用一次 |
| 每图编辑 | 存在队列项或由队列项稳定 ID 索引，和摄影身份/版式设置分离；缺失字段迁移为关闭处理 |
| 校准配置 | 分开保存翻拍设备/光源参考、同卷片基参考和成片风格；应用时解析为可复现的有效数值 |
| 源版本快照 | 预检和提交时记录源文件标识/版本，读取前后核对；精度敏感的参考图关联内容指纹。版本不符明确失败，不继续使用旧片基/缓存 |
| 来源与结果事实 | 保留原文件、像素来源、传感器有效位深（已知时）、工作数据类型、处理尺寸、输出位深、实际 ICC；不能混为一个 bitDepth |

新增数值必须检查有限值、范围和组合合法性。第一版可提供 RGB 平衡而暂不提供 Kelvin 色温；只有色温/色调变换的算法定义及验证齐全时才展示对应控件，不能用 RGB 偏移伪装物理色温。

### 3.3 色彩和精度

- 建议工作空间为线性 Rec.2020，核心像素处理使用 float32；最终具体实现和 CMM 适配由 T01 的探针实验决定并写入 ADR。
- RAW 参数需要显式控制线性输出、自动提亮、自动白平衡和相机输入变换，防止每张图产生不可追踪的自动变化。若解码器在相机矩阵或 RGB 输出阶段会夹断负值/超范围值，记录边界并验证是否满足该模式，不能只设 gamma=1 就宣称完整线性保真。
- 16-bit 线性 TIFF 可作为算法测试输入，但不得自动经过旧 sRGB 读取路径；无 ICC/未知传递函数的 TIFF 不得猜成线性负片。显式输入解释须保存在配方中。
- 比较源片基与画面数据时必须使用相同校准、工作空间和阶段。密度模型必须说明正片映射的物理或近似含义，不能只算一次 log 就声称完成色彩还原。
- 不通过 `getRGB/setRGB` 或 8-bit Canvas 读回完成专业像素处理。先证明照片像素在缩放、几何和合成中没有被静默降为 8-bit。
- Java2D 可继续绘制文字/Logo 等装饰覆盖层；照片处理、重采样和覆盖层合成的高精度路径须通过探针验证。若使用独立装饰层，颜色由界面 sRGB 解释后转换到实际合成空间。
- 预览由引擎转换并标记 sRGB，显示器转换交给浏览器/系统完成，避免双重应用显示器 ICC。宽色域显示预览与软打样不是第一版承诺。
- 有意校色后的结果不能套用“与原负片像素相同”的保真判据；分别验收算法、处理后参考输出、编码误差和元数据事实。

最低数值检查：在归一化 `[0,1]` 合成数据上，纯 float 恒等调整的最大绝对误差不超过 `2e-6`；不含其他处理的 `+1 EV` 对 `[0,0.5]` 输入应等于乘二，使用同一误差门槛。曲线端点按冻结定义精确命中，单调曲线采样不得反向或过冲。用覆盖低有效位的16-bit渐变检验全幅处理，不能先量化为8-bit再扩成16-bit。ICC 转换以独立参考为基准，沿用现有专业保真说明中的色差目标；负片还原的实际场景色差不能借用该门槛，须在 T01/T02 根据真实标定样本事先定义。任何新门槛都须在跑对应验收前冻结，不能看到结果后放宽。

### 3.4 预览、分析与状态

- 延续 `POST /api/preview`、`POST /api/export-preflight`、现有 render jobs；它们读取同一处理配方。
- 为取样与直方图增加一个职责明确的分析入口，建议 `POST /api/image-analysis`。T02 冻结请求响应；不要每个工具增加一套接口。
- 分析请求含相同 recipe、分析阶段和可选 ROI；响应含配方签名、文件版本、实际分析尺寸/采样方式、直方图、区域统计及剪裁事实。统计阶段不含边框、文字、Logo。
- ROI 基于已应用 EXIF 方向、尚未执行编辑几何的完整源图归一化坐标。前端把当前视图中的取样框逆变换到该空间；返回值不由屏幕像素推算。
- 对比模式只改变展示阶段，不写回当前配方；原始负片视图也走相同真实 RAW 来源。
- 同步中可显示明确标记的上一张同图、旧配方结果；切换图片不能保留上一张图作为新图。引擎不可用时不可继续宣称校色预览已同步。
- 丢弃过期响应只是 UI 防护，还要实现引擎/原生工作的有界调度和可协作取消，不能把 HTTP abort 等同于后端已经停止计算。
- 缓存键包含源文件版本、完整配方、算法版本、输出空间、分析阶段及尺寸；不持久化 blob URL。缓存、原生输出和全幅缓冲均有资源上限。
- 状态至少区分：关闭处理、等待校准、计算中、可用、输入不支持、组件不可用、计算失败、源文件变化。错误沿用 4xx=请求/输入问题、5xx=内部或组件异常，并在 T02 固定稳定错误码。

### 3.5 导出与兼容

- 普通照片旧模式、旧模板和旧请求继续工作。摄影信息预设不隐式开启负片处理；Gold/Portra 的文本字段不参与算法。
- 首版底片模式支持两个明确的输出组合：sRGB JPEG 分享成品；16-bit TIFF 母版，可选 sRGB 或经验证、随包可用的宽色域输出 ICC。
- 不把新语义强塞进原有“源 ICC/源位深”档位。T02 在现有 ExportSettings/custom 路径上设计显式处理输出策略，保留普通模式原有固定档位。RAW 相机输入配置不等于成品输出 ICC。
- “不带框母版”仍使用同一 recipe，将 border、gradient、texts、logo、borderStyle 等装饰全部明确禁用，不只把边框宽度设为零。
- 单图和批量导出冻结相同的每图处理参数及校准数值。冻结后修改曲线或共享校准不能污染已提交任务；排队期间源文件变化必须发现并明确失败，不能默默处理新内容。
- 翻拍 EXIF 是翻拍设备/时间，原胶片拍摄身份独立保存。不能把两者混写，也不能用虚构字段填满 EXIF；输出后的方向、尺寸、位深和 profile 标签必须更新。

## 4. 本轮非目标

- 不做完整 Lightroom/Photoshop 替代、图层系统、通用插件平台、云处理、AI 自动还原。
- 不首发蒙版、局部笔刷、修尘修复、自动透视、颗粒生成、胶片仿真 LUT 商店。
- 不承诺根据胶片名称唯一恢复“原始真实颜色”；不把厂商密度曲线直接当相机 RGB 校准曲线。
- 不承诺所有 RAW 扩展名和相机机型。正式支持按真实样片逐项登记；现有 RAW 内嵌 JPEG 矩阵继续独立保留。
- 不提前扩展 Windows/macOS x64 正式支持；正式验收仍优先 macOS arm64，候选平台不能冒用其证据。

## 5. 待验证事项与处理方式

| 未知项 | 处理方式 | 阻塞范围 |
|---|---|---|
| 用户翻拍相机与 RAW 格式 | T00 检查现有样片；缺少时列出机型、格式和样片需求，合成测试继续开展 | 对应真实机型支持与最终摄影验收 |
| Gold/Portra 的片边、光源参考与参考成片 | 可使用同卷独立片边图；参考成片只是视觉对照，色卡/灰阶才用于相应数值测量 | 胶片校准及视觉质量验收 |
| LibRaw 固定构建能否保留所需动态范围 | T01 比较真实 RAW、线性输出、输入矩阵、通道分布和已知参考解码 | 真实 RAW 方案冻结 |
| 浮点 CMM 与宽色域合成路径 | T01 对 Java 现有路径和必要的 LittleCMS 适配做有限比较，选一个通过验证的方案 | T04 色彩底座 |
| 目标机器性能预算 | T01 记录硬件、图像尺寸、预先设定的内存/延时预算，再测量；无实际硬件记未验收 | 性能及安装后验收 |

缺少私有真实样片时，不下载来路不明的替代图，不伪造通过。可以完成不依赖它的代码与合成测试，但对应真实 RAW、胶片或平台验收保持 `NOT_RUN`，最终报告单独列出。

## 6. 执行交接

### 6.1 OpenCode 工作协议

1. 每轮读本文件、根 AGENTS.md、当前任务的指定文件、下方进度记录及实际 diff。不要每轮遍历整个仓库。
2. 默认按依赖连续推进，一次只实现一个任务；任务验收后自动进入下一就绪任务，不逐项要求用户批准常规实现。遇到真实依赖阻塞时继续独立任务，不能隐瞒阻塞或标记伪完成。
3. 一个任务预计跨越过多职责时，拆成 `Txx-a/Txx-b`，先在本文件记录理由、输入输出和验收；不要为了凑文件数量制造抽象。
4. 先写精确的成功/失败验收，再实现相应代码。禁止删测试、降低阈值、把所有异常改成成功或用 `any` 批量绕过契约。
5. 每步同步对应模块 README/cookbook。新增目录、依赖、DTO、端点要写明必要性；技术事实以源码和实际命令为准。
6. 使用简体中文注释和开发说明。算法与第三方 API 只参考官方文档、源码或原始论文；复用代码须遵守所选许可证，不把开源实现无说明地复制进来。
7. 每个任务结束记录：修改文件、行为变化、实际执行命令及结果、可复核证据、待验收事项、下一任务。没有运行的检查写 `NOT_RUN`，不写“应该通过”。
8. 不执行无关重构，不自动升级 Electron/React/Spring Boot/JDK，不引入 Python 运行时，不改变用户指定模型。

### 6.2 依赖与顺序

默认执行顺序：T00 → T01 → T02 → T03 → T04 → T05 → T06 → T07 → T08 → T09 → T10 → T11 → T12 → T13。

实际依赖：T03、T04、T08 均依赖 T02；T05 依赖 T04；T06 依赖 T05；T07 依赖 T06；T09 依赖 T07/T08；T10 依赖 T03/T09；T11 依赖 T03/T06/T08；T12 依赖 T10/T11；T13 依赖全部生产任务。T03 若因原生资源阻塞，可在 T02 已冻结的合成输入契约下先做 T04–T09，不能宣称完成真实 RAW 链路。

### T00：保护基线、确认新模式范围

- **先读**：AGENTS.md、ARCHITECTURE.md、CONTRIBUTING.md、prd §0、raw-and-fidelity、docs/adr、当前 git diff。
- **工作**：记录工作树和现有检查结果；盘点可用 RAW/片基/参考样本及缺项；新增一篇底片处理 ADR，同步 PRD/架构中的模式边界，保留普通模式的约定。
- **验证**：执行本节末的基线命令，已有失败逐项记录；核对文档链接。
- **出口**：说明现有能力、新增承诺、样片缺口和初始测试状态；没有生产算法改动。已有失败不归因于本任务，也不通过删除测试“修复”。

### T01：做两个可复核的技术探针

- **先读**：RawDecoder、ImageReader、ImageColorConverter、PixelBufferFactory、ImageEncoder、ImageRenderService、Java2DImageRenderService。
- **工作 A**：在临时实验区验证 LibRaw 的真实 RAW → 线性高位深输出，确认相机矩阵、白平衡、gamma、自动提亮、方向与通道夹断行为；输出真实尺寸和来源。
- **工作 B**：用已知 float/16-bit 梯度、宽色域色块和装饰合成探针验证读入 → 工作空间 → 缩放/几何 → 合成 → 输出，观察是否经过 8-bit 或 sRGB 瓶颈；必要时比较一个 LittleCMS 方案。
- **验证**：每个探针保存命令、构建配置、工具版本、输入 SHA-256、输出事实和数值误差；基准期望由独立计算或独立工具生成。读取文件事实而非仅看截图。
- **出口**：把选型、精度边界、内存与延时测量和失败项写回 ADR。没有真实样片时标记对应探针未验收；不得直接做完整 UI 来掩盖底层未知。

### T02：冻结增量契约与验收样本

- **先读**：RenderRecipe、RenderRecipeValidator、SourceDecode、PreviewRequest/Response、ExportSettings、RenderJobSnapshot、CapabilitiesResponse、前端 preview.ts、buildRecipe.ts、runtime.ts、desktopApi.ts。
- **工作**：在 ADR 中冻结本方案第 3 节所需字段、枚举、范围、默认值、版本、阶段、错误码和输出组合；定义分析接口。为旧请求、新请求、非法请求建立共享 JSON 用例；定义恒等调整与数值精度验收。
- **验证**：Java/TypeScript 类型与序列化对齐；旧请求缺字段仍可用；空 body、缺必填字段、非法枚举、非法尺寸、未知 schemaVersion 拒绝；新配置尚未可执行时明确不可用，不静默忽略。
- **出口**：所有生产任务可依该契约实施；前端不先造“临时 DTO”。可增加 `fixtures/film-digitization/` 保存跨 Java/前端共享的合成样本及期望，理由是需要统一验证新领域的几何和配方行为。

若 T01 仅缺真实 RAW 样片，可先冻结已验证的栅格/通用负片处理契约以推进独立任务；传感器分支的未验证选项单独登记，保持不可用，不能借此宣称真实 RAW 通过。

### T03：接入受控真实 RAW 解码

- **范围**：Java RAW 读取与能力服务；Electron 资源路径配置；必要的组件构建/清单脚本。先不改完整编辑界面。
- **工作**：实现 T01 选定 helper 适配；白名单参数、进程超时、取消、输出大小与像素上限、临时文件清理、有界日志；新增真实 RAW 来源与 capability。沿用旧内嵌 JPEG 模式。
- **验证**：有效真实 RAW；无内嵌 JPEG 但传感器有效的 RAW；损坏/不支持机型；组件缺失/错误架构/无执行权限/超时/非零退出/非法输出；空格和中文路径；取消清理；方向只处理一次。Linux CI 用可控替身验证进程协议，真实解码走单列的原生集成检查。
- **出口**：真实 RAW 失败不会换用 JPEG；源图不变；尺寸/方向/来源如实报告。开发环境若需显式组件路径，也只能使用指定校验后的工具，禁止搜系统 PATH。

### T04：建立高精度处理和合成底座

- **范围**：Java 图像读取、工作缓冲、颜色转换、几何/缩放、合成结果携带的颜色事实；保留旧模式入口。
- **工作**：按 T01 方案实现 float 工作图及实际工作空间传递；支持受控线性测试 TIFF；验证照片与装饰层合成。只实现此次需要的直接流水线。
- **验证**：恒等处理、灰阶、色域外色块、负值/超范围中间值、真实16-bit梯度、缩放/旋转、透明覆盖层；无效 ICC、缺失必需 profile、内存/尺寸超限；输出前不得夹断或降精度的阶段有断言。
- **出口**：能在无 UI 条件下输出经验证的工作图和参考图；源事实、工作事实、输出事实分开。不能仅以“输出 TIFF 标成16-bit”通过验收。

### T05：实现通用彩负转正与片基校准

- **范围**：Java 负片算法、处理配方校验、真实/合成测试样本。
- **工作**：光源校准和片基校正分开；片基可来自同图 ROI 或同卷参考帧；实现有明确数据域的密度模型与正片映射；底层先接受明确有效的参数，不引入未经验证的自动算法。
- **验证**：已知透过率/密度的合成灰阶、不同通道片基、零值/近零值、无效片基、饱和参考、剪裁通道、负密度及超范围数据；Gold/Portra 实图验证单列保存。期望不能调用同一实现生成。
- **出口**：正片亮暗关系正确，无 NaN/Inf；灰阶和通道行为符合冻结模型；片基参数携带参考空间与版本。胶片视觉还原仅按实际样片证据报告。

### T06：实现基础调整和曲线

- **范围**：Java 正片调整与曲线；新增配方字段的统一校验。
- **工作**：按冻结顺序实现曝光、RGB 平衡、黑白点、单调 RGB 总曲线/分通道曲线、饱和度；冻结插值、数值域、端点与越域策略。先不增加高光恢复或局部处理。
- **验证**：恒等配方、曝光档位对应的线性倍率、曲线端点和中间点、灰阶中性、通道隔离、组合顺序；重复/乱序 x、非单调 y、点数超限、非有限值、黑白点颠倒、非法版本；插值不能在控制点间越界过冲。
- **出口**：参数能稳定序列化并在引擎预览/导出复现；无隐藏自动参数；用户控件的零值语义明确。

### T07：实现图像分析接口

- **范围**：Java controller/service/DTO、前端 engine API 封装和类型、Electron 精确代理路由。
- **工作**：实现冻结的分析阶段、ROI 坐标、直方图、区域统计、RAW/工作/输出剪裁事实区分；响应带源版本和配方签名。分析与渲染复用处理阶段。
- **验证**：全图和 ROI 成功；带旋转/裁切的坐标映射；空 body、错误阶段、零面积/越界 ROI、无效配方；过期响应；引擎取消和资源限制；生产路由只允许正确方法。
- **出口**：源图取样不依赖浏览器颜色读回；装饰不污染统计；采样精度/分辨率如实报告。真实传感器剪裁警告需要来自实际传感器事实，不能由 sRGB 预览饱和值猜测。

### T08：接入每图编辑状态、恢复与撤销

- **范围**：queue/types、useQueue、编辑 hook、必要的 settings/buildRecipe/WorkspacePage 组装和测试。
- **工作**：每图独立保存编辑配方，兼容旧会话；新增源图裁切和校平的状态；复用现有全局历史协调方式，曲线一次拖动形成一次历史动作。摄影预设/模板与处理参数分离。
- **验证**：切换图片参数不串图；旧数据迁移、损坏配方、未知版本、存储失败可解释；撤销重做/重启恢复；共享配置复制隔离；重新定位丢失文件保留编辑，但校验源指纹并失效旧缓存/取样。
- **出口**：刷新或重启后编辑可恢复；错误编辑数据不静默恢复成一张“看似已调好”的图。该步不新增 sidecar 文件体系、数据库或任意文件写权限。

### T09：实现底片处理面板与工具

- **范围**：`features/editing/`、工作台入口、预览区交互和必要样式；不重做现有设计系统。
- **工作**：显式进入底片模式；按“光源 → 片基 → 转正 → 基础调整 → 曲线 → 源图裁切/校平”排列；提供取样框、直方图、曲线、对比、重置和来源提示；新增面板入口不挤入拍摄身份字段。
- **验证**：键盘调整、输入范围、取消取样、曲线拖动、快捷键焦点、窄窗口；能力缺失时操作禁用并说明；旋转/缩放后的取样与裁切框位置；切图中旧工具状态不能写入新图。
- **出口**：所有可用控件有真实引擎语义；没有占位滑块、假直方图、固定效果贴图。首版 Gold/Portra 没有校准证据时界面明确显示使用通用转换。

### T10：贯通权威预览、对比与缓存

- **范围**：usePreview、PreviewPanel、useActualSizePreview、previewCache、队列缩略图和裸图预览入口。
- **工作**：底片模式展示引擎正片结果；负片/基础转正/当前结果使用一致来源。前端 Canvas 保留交互覆盖层和普通模式行为；避免把边框/曲线再应用一次。参数拖动合并请求，过期工作可取消。
- **验证**：快速拖动和切图不回退；三种对比图正确；分析阶段匹配当前图；源文件、算法或配方变化失效缓存；引擎失败有明确状态；100%检查不把放大的低清图标为真实像素检查；普通模式回归。
- **出口**：当前预览状态能对应一个确定配方版本；新流程不走未校色的 nativeImage/Canvas 兜底冒充成功；预览缓存不持有无界全幅 float 数据。

### T11：贯通母版、带框成品与导出预检

- **范围**：ExportSettings、DefaultExportPreflightService、ImageEncoder、ComposeOutcome 调用链、useExportController、输出面板和结果事实。
- **工作**：实现底片模式显式输出组合、处理图工作空间到目标 ICC 的真实转换、不带框母版开关及独立输出事实。复用已有任务机制，单图及批量均按对应条目的有效配方冻结。
- **验证**：sRGB JPEG、16-bit TIFF、宽色域 TIFF及完整装饰合成；母版无任何装饰残留；独立工具确认实际位深/ICC/尺寸/方向/元数据；写入失败、无效输出空间、冲突路径、源文件在排队后变化、导出期间编辑、深层曲线数组修改；清理半成品。
- **出口**：宽色域输出不先经过 sRGB；真实RAW、原JPEG位深、工作float与输出16-bit分别报告；已有普通模式固定档位不变。不能只检查 mock 请求就宣称导出通过。

### T12：整卷配置与选择性批量同步

- **范围**：编辑状态、队列操作范围、同步面板、导出快照和共享校准引用。
- **工作**：分开同步光源配置、片基配置、基础调整、曲线；范围复用 active/checked/all。第一版使用稳定校准 ID/版本或应用时展开的数值，不复活旧 Roll 持久化模型。
- **验证**：只改所选字段和所选图片；一次批量动作可撤销；复制后互不污染；不同设备/空间的配置禁止盲套；未知配置/缺失参考解释；导出冻结后修改共享校准不改变任务；批次中个别损坏图不污染其他结果。
- **出口**：同卷复用共性设置且保留逐图覆盖；摄影身份仍能记录卷名，但不会隐式决定算法。

### T13：安装后离线验收与交付

- **范围**：打包资源、组件清单、能力快照、发布校验与文档；仅修复本功能问题。
- **工作**：macOS arm64 安装包携带真实RAW组件和所需profile，确认动态库依赖/架构/签名处理及退出清理；离线完成导入、取样、编辑、恢复、母版/成品、批量流程。
- **验证**：本节末的相关全量检查；实际安装包 E2E；无系统工具环境、组件缺失/损坏/错误架构；取消与退出不留原生进程；重复编辑和导出测量内存/延时。原有性能门不得为通过测试而直接放宽，新流程按 T01 记录的预算单列验证。
- **出口**：支持矩阵写清机型、输入、平台与证据；源码能力、合成测试、真实样本、安装包四类证据分别报告。缺真实样片/目标机器的部分保持 NOT_RUN，不宣称正式支持。

### 6.3 验证命令

以下命令与现有 CI/CONTRIBUTING 对齐；按改动范围执行。T00 做初始基线，最终合并前覆盖所有受影响项。

```bash
# 在仓库根目录
pnpm --filter frontend typecheck
pnpm --filter frontend test
pnpm --filter frontend build
pnpm --filter electron typecheck
pnpm --filter electron test
pnpm test:scripts

# 在 java-engine/ 目录
mvn test
```

原生解码、数值探针、真实样片和新增处理性能检查的实际命令在 T01/T03/T04 落地后登记在对应 README；不得杜撰尚不存在的脚本名。现有 `pnpm perf:smoke`、`pnpm e2e:packaged` 的环境和安装产物前置条件按 CONTRIBUTING 和发布文档执行。

Java/前端接口测试必须同时覆盖成功、空 body、缺字段、非法枚举、非法尺寸及本领域失败。共享处理行为需比较同一配方的引擎预览、单图导出、批量导出；色彩比较先统一目标空间，并将重采样、JPEG 压缩误差与算法误差分开。

### 6.4 进度记录与恢复

初始状态如下。执行者在真实完成后更新，不用“代码已写”替代“检查已过”。

| 任务 | 状态 | 证据/未验收事项 |
|---|---|---|
| T00 | DONE | 基线与既有未提交改动保留；未提交/推送/重置 |
| T01 | DONE | 真实 Sony RAW 与精度探针见 ADR-0007；原始记录保留为历史 |
| T02 | DONE | 单一配方与共享契约；本轮外围字段补充见 ADR-0007 当前修订 |
| T03 | IMPLEMENTED_NOT_VERIFIED | 真实本机 Sony ARW 解码/完整导出通过；无内嵌 JPEG、其他机型/平台样片未验收 |
| T04 | DONE | 浮点照片与独立装饰合成；匹配线性 ICC 输入/输出、低有效位回归与真实输出回读 |
| T05 | IMPLEMENTED_NOT_VERIFIED | 通用彩负、片基/光源参考解析与数值测试完成；Gold/Portra 真实还原未验收，camera-rgb 手工片基不支持 |
| T06 | DONE | 调整顺序/数值测试；曲线增删点、键盘、拖动与手势撤销接通 |
| T07 | DONE | 分析直方图/统计、目标空间边界、有界调度、代次取消与失败状态 |
| T08 | DONE | 逐图会话/历史/恢复、源版本回传、任务冻结、损坏数据隔离 |
| T09 | DONE | 片基框选/参考/校准保存、真实曲线与窄窗口检查；胶卷效果不冒充已标定 |
| T10 | DONE | 三阶段切换、校色队列缩略图、完整像素检查、取样源坐标与配方缓存失效 |
| T11 | DONE | 三种实际编码、浮点带框/无框、元数据与独立回读；输出控件/扩展名/预检一致 |
| T12 | DONE | 展开数值校准 ID/版本、参考指纹与空间检查、选择性同步及一次撤销 |
| T13 | TODO | 用户要求先不打包；未来单独验收干净离线机器、真实彩负和其他平台；历史 DMG 不含本轮修改 |

允许状态：TODO、IN_PROGRESS、IMPLEMENTED_NOT_VERIFIED、DONE、BLOCKED。BLOCKED 必须写明具体外部依赖、已完成部分及可以继续的任务；最终支持证据另用 PASS/FAIL/NOT_RUN 表示，不混用“任务代码完成”和“平台已验收”。

每任务交接记录模板：

```text
任务：
起点 HEAD / 相关用户已有改动：
已修改文件与行为：
实际验证命令、退出码与结果：
样片/数值/安装包证据：
未验收事项与原因：
契约变化及理由（没有则写无）：
下一个就绪任务与需先读的文件：
```

### 6.5 可直接粘贴给 OpenCode 的启动指令

```text
在当前 camera-border-app 工作区执行 docs/opencode-film-digitization-plan.md。
使用我在 OpenCode 中配置的 DeepSeek-v4.1-flash-max，不修改模型配置。

先读根 AGENTS.md、任务书和当前 git status/diff，保护已有未提交改动。
从 T00 开始，按依赖逐项实施；一次只处理一个任务，验证通过后自动进入下一就绪任务。
每个任务完成后更新任务书的状态与交接证据，不只输出计划，不每个任务都等待我确认。

真实 RAW、浮点色彩、负片转换要先有可复核证据，再接完整 UI。
缺少真实样片或原生组件时如实记录，只阻塞依赖它的部分，继续可独立验证的工作。
不以 mock、内嵌 JPEG、截图或16-bit文件标签替代真实 RAW/精度验收。
普通模式保持兼容，新处理参数进入同一 RenderRecipe；生产端点同步 Electron 精确白名单。
每图状态、预览、分析、单图导出和批量导出必须使用同一份有效处理配方。
不得删除测试或降低断言来通过检查，不自动提交、推送、发布或覆盖源图。

每阶段简要报告：完成内容、验证结果、未验收项、下一任务。
如果上下文不足，先保存交接记录；恢复时只读任务书、当前任务必要文件和实际 diff。
```

只需返工某个阶段时，补充：`本轮只执行 Txx，依任务书核对前置条件，完成验证与交接记录后结束。`

## 7. 技术参考与交付判定

- [LibRaw 数据结构及处理参数](https://www.libraw.org/docs/API-datastruct-eng.html)：解码选项、线性输出、位深、自动提亮和相机参数；实际支持以选定固定构建验证。
- [darktable negadoctor 官方说明](https://docs.darktable.org/usermanual/5.6/en/module-reference/processing-modules/negadoctor/)：光源参考、未曝光片基、负片处理和调整顺序。用于理解流程，不表示已获得代码复制授权或适用同一算法。
- [LittleCMS 官方说明](https://littlecms.com/color-engine/)：ICC 转换组件选型参考，是否需要原生适配由探针决定。
- [Kodak Gold 200 技术资料](https://www.kodakprofessional.com/sites/default/files/wysiwyg/pro/resources/E7022%20Gold%20tech%20sheet.pdf)、[Portra 160 技术资料](https://www.kodakprofessional.com/sites/default/files/2025-07/e4051.pdf)：乳剂特性参考，不能直接当作特定翻拍相机的 RGB 反演配置。

**交付状态**：可直接开始 T00 和 T01；T02 的生产契约依赖技术探针结论。T03–T13 以冻结契约和各自前置条件为准。真正完成指真实摄影流程及对应平台证据通过；仅有合成测试、源码或 UI 时不能宣称全部完成。

## 8. 执行记录

### T00：保护基线、确认新模式范围（DONE，2026-11-11）

```text
任务：T00
起点 HEAD / 相关用户已有改动：0641bf9（codex/photography-workflow）；工作树 47 个已跟踪文件修改 + 52 个未跟踪文件，未提交、未 stash、未覆盖。
已修改文件与行为：
  - docs/adr/0007-explicit-film-digitization-mode.md（新增）：冻结显式底片模式与普通模式边界、管线、契约方向、样片盘点、后果与替代方案。
  - docs/prd.md：新增 §0.7 显式底片范围；§0.2/§0.3.1/§0.5/§1.4/§3.3/§4.1/§4.2/§4.3/§7/§11 区分普通模式与底片模式，旧语义保留。
  - ARCHITECTURE.md：§2 标注新模式实施中；§4.1 增加 imageProcessing 可选契约；§4.3 区分普通模式与底片模式来源。
  - docs/raw-and-fidelity.md：拆分普通模式与底片模式的 RAW/ICC/验收口径。
  - README.md、docs/cookbook.md、docs/tasks.md、docs/test-samples.md、java-engine/README.md、frontend/README.md、electron/README.md：同步模式边界与样片缺口，未宣称已实现。
实际验证命令、退出码与结果：
  - pnpm --filter frontend typecheck → exit 0
  - pnpm --filter electron typecheck → exit 0
  - pnpm test:scripts → exit 0（12 项断言全部通过）
  - pnpm --filter frontend test → exit 0（65 文件 / 618 用例通过）
  - pnpm --filter electron test → exit 0（15 文件 / 147 用例通过）
  - pnpm --filter frontend build → exit 0（vite build 成功）
  - cd java-engine && mvn test → exit 0（Tests run: 208, Failures: 0, Errors: 0）
  日志与基线 diff 保存在 /private/var/folders/5s/1bjlhnb56yb27lvfjbdw9c8r0000gn/T/opencode/film-digitization-baseline/（worktree-tracked.diff sha256 e5145a16108127fa74ed7152d3e04a58f51f456c614403efa1b0f41a881d09bb）。
样片/数值/安装包证据：
  - 本机 photos/（gitignore，本机数据）：6 份 Sony ILCE-7M5 ARW（7008×4672，容器 16-bit，Display P3，内容为正片），可作 T01 真实 RAW 探针；4 份 JPEG 与 5 份 TIFF 正片扫描，只能做普通模式回归。
  - 缺少：彩负片边/未曝光片基、Gold 200/Portra 160 真实负片、翻拍光源/灰卡/色卡、同卷参考成片、16-bit 线性 TIFF 测试输入；对应验收保持 NOT_RUN。
  - 硬件：Apple M2 Pro / 32 GB / macOS 27.2（26B123）arm64；性能预算待 T01 测量。
未验收事项与原因：底片模式全部生产能力（真实 RAW、负片算法、校色、UI、导出）未实现，无生产算法改动；ADR 边界不是功能完成。
契约变化及理由：新增可选的 RenderRecipe.imageProcessing 方向和显式模式边界（ADR-0007）；普通模式字段、请求和导出档位不变。
下一个就绪任务与需先读的文件：T01；先读 RawDecoder、ImageReader、ImageColorConverter、PixelBufferFactory、ImageEncoder、ImageRenderService、Java2DImageRenderService，以及本记录与 ADR-0007。
```

### T01：真实 RAW 与精度探针（DONE，2026-11-11）

```text
任务：T01
起点 HEAD / 相关用户已有改动：0641bf9 + T00 文档改动；未触碰用户代码改动。
已修改文件与行为：
  - docs/adr/0007-explicit-film-digitization-mode.md：写回探针结果与 T01 选型（LibRaw 0.22.3、inset crop、方向只一次、float32 工作空间、装饰层、CMM、精度边界、预算）。
  - 无生产代码改动；探针脚本和日志保存在本机临时目录 .../opencode/t01-libraw/。
实际验证命令、退出码与结果：
  - clang++ 编译 LibRaw 0.22.3 静态探针 + `./t01_raw_probe photos/DSC04875.ARW out/full` → exit 0。
  - `./LibRaw-0.22.3/bin/raw-identify -v photos/DSC04875.ARW` → exit 0；Sony ILCE-7M5，raw 7168×5120，inset 7008×4672（left 12/top 8），flip=5，raw_bps=14，black=512，maximum=16383，linearity=15360，cam_mul=2310/1024/1699/1024。
  - 6 份 ARW 单张线性 sRGB 解码：2.42–3.02s，峰值 RSS 804.4–804.5MB；预设预算 ≤15s/≤4GB → PASS（仅本机）。
  - Node 独立复算 gamma：602,688 样本最大误差 2/65535；auto-brighten 倍率 1.239–2.234；unclip 最大差 29,440/65535。
  - Java 探针：16-bit 常量 4097 经 ImageScaler/BorderComposer 变为 4112（8-bit 量化）；ImageEncoder 单独写 TIFF 读回 4097；ImageReader 读 16-bit TIFF 保持 TYPE_USHORT。
  - Java ColorConvertOp 与 lcms 2.19 tificc 对同一 16-bit TIFF 最大差 3/65535；同空间 sRGB→sRGB 会改变 64/65535，float XYZ 往返误差 7.6e-6。
样片/数值/安装包证据：
  - 输入 SHA-256：DSC04875 ARW 551d6aac…f87f（其余见 ADR-0007 样片盘点）；LibRaw 源码 SHA-256 789f3c33…227e4。
  - 探针日志：t01-libraw/out/full、out/single、out/T01JavaProbe.txt、out/ppm-analysis.json、out/cmm-adobe-lcms.txt。
未验收事项与原因：真实彩负/片基/光源/色卡样本缺失；损坏 RAW、无内嵌 JPEG、非 Sony 机型、超时/取消/非法输出与安装包性能未跑，保持 NOT_RUN。
契约变化及理由：无生产契约变化；T01 选型写入 ADR-0007。
下一个就绪任务与需先读的文件：T02；先读 RenderRecipe、RenderRecipeValidator、SourceDecode、PreviewRequest/Response、ExportSettings、RenderJobSnapshot、CapabilitiesResponse、前端 preview.ts、buildRecipe.ts、runtime.ts、desktopApi.ts，以及 ADR-0007。
```

### T02：冻结增量契约与验收样本（DONE，2026-11-11）

```text
任务：T02
起点 HEAD / 相关用户已有改动：0641bf9 + T00/T01 文档与探针；未触碰用户已有 UI/渲染改动。
已修改文件与行为：
  - docs/adr/0007-explicit-film-digitization-mode.md：新增 T02 冻结契约（字段/枚举/范围/默认值/版本/阶段/错误码/输出组合/数值门槛）。
  - java-engine/model/ImageProcessingConfig.java（新增 + RenderRecipe.imageProcessing）：可选底片处理模型，普通模式缺省 null。
  - java-engine/util/ImageProcessingValidator.java + RenderRecipeValidator：结构校验、稳定错误码、T02 501 可用性闸门；预览/导出/预检生产入口统一调用。
  - java-engine/dto/ImageAnalysisRequest/Response：冻结分析接口；SourceDecode 增加 sensor-raw/linear-tiff 与 sensorBitDepth；CapabilitiesResponse 增加 filmDigitization；ExportSettings 增加 filmOutput/borderlessMaster；FidelityReport.Facts 增加来源/工作/输出事实。
  - java-engine/exception/ApiException + dto/ErrorResponse：可选稳定 code，旧异常不输出 code。
  - fixtures/film-digitization/：旧请求、sensor-raw、linear-tiff 与 23 个非法用例。
  - frontend/types/imageProcessing.ts、types/preview.ts、buildRecipe.ts：前端契约镜像与可选 imageProcessing 传递；新增契约测试。
实际验证命令、退出码与结果：
  - cd java-engine && mvn test → exit 0（Tests run: 217, Failures: 0, Errors: 0, Skipped: 0）
  - pnpm --filter frontend typecheck → exit 0
  - pnpm --filter frontend test → exit 0（66 文件 / 621 用例通过）
  - 新测试：ImageProcessingContractTest 7 项、PreviewControllerTest 30 项、imageProcessingContract.test.ts 3 项。
样片/数值/安装包证据：
  - 共享用例：fixtures/film-digitization/preview-legacy.json、preview-film-valid.json、preview-film-linear-tiff.json、invalid-image-processing-cases.json。
  - 非法用例覆盖未知 schema/算法、缺 raw、非法 enum、autoBright、曲线端点/顺序/单调、ROI/裁切/旋转、密度、黑白点、饱和度、未登记 profile、负片缺片基。
未验收事项与原因：分析接口、导出组合和处理管线尚未实现；合法新配置当前明确返回 501，不是功能完成。真实负片/RAW 失败路径仍 NOT_RUN。
契约变化及理由：新增可选 RenderRecipe.imageProcessing、分析 DTO、SourceDecode 新来源、ExportSettings 底片输出字段、Facts 扩展与稳定错误码；普通模式旧字段/旧档位不变。
下一个就绪任务与需先读的文件：T03；先读 RawDecoder、ImageReader、SourceDecode、RuntimeCapabilitiesService、electron/src/main/protocol.ts、scripts/prepare-package-resources.mjs、scripts/package-app.sh、java-engine/README.md，以及 ADR-0007 T01/T02 节。
```

### T03：接入受控真实 RAW 解码（DONE，2026-11-11）

```text
任务：T03
起点 HEAD / 相关用户已有改动：0641bf9 + T00–T02 改动；未触碰用户已有 UI/渲染改动。
已修改文件与行为：
  - java-engine/src/main/native/film_raw_helper.cpp（新增）：LibRaw 0.22.3 受控 helper，白名单参数，RGB16 小端 + 元数据；只报告方向不旋转；处理前冻结 black/flip/preMul 等事实。
  - scripts/build-libraw-helper.sh（新增）+ package-app.sh + validate-package.mjs/test：固定源码 SHA-256、macOS 11 目标、静态 LibRaw、产物 helper.json（二进制 SHA-256）。
  - java-engine/util/FilmRawDecoder.java + exception/FilmRawException.java（新增）：PID 进程调用、超时/取消、像素上限、输出校验、源 SHA/size/mtime 前后核对、临时目录清理、有界日志、不回退内嵌 JPEG。
  - RuntimeCapabilitiesService：新增 libraw 组件探测（helper.json 校验和/版本/架构 + --version）与 filmDigitization 能力（完整管线完成前 available=false）。
  - electron engineRuntime/appLifecycle：仅在 macOS arm64 存在 helper 时注入 CAMBORDER_LIBRAW_HELPER_PATH。
  - java-engine/README.md、docs/cookbook.md、electron/README.md、CONTRIBUTING.md：登记构建/验证命令与边界。
实际验证命令、退出码与结果：
  - bash scripts/build-libraw-helper.sh → exit 0；产物 minos 11.0，依赖仅系统 libz/libc++/libSystem；--version = film-raw-helper 1.0.0 libraw 0.22.3-Release。
  - helper 真实解码 DSC04875.ARW → exit 0，2.31s / 峰值 542MB；7008×4672、flip=5→EXIF 8、14-bit、black=512、maximum=16383、线性上限 15360、camMul 2310/1024/1699/1024。
  - cd java-engine && mvn test -Dtest='FilmRawDecoderTest,FilmRawDecoderNativeTest' → exit 0，12 项通过。
  - cd java-engine && mvn test → exit 0（Tests run: 233, Failures: 0, Errors: 0）。
  - pnpm --filter electron typecheck → exit 0；node scripts/validate-package.test.mjs → 5 pass。
样片/数值/安装包证据：
  - 真实样本：photos/DSC04875.ARW（本机 gitignored），断言输出尺寸/方向/位深/黑电平/线性上限。
  - helper.json：源码 SHA 789f3c33…、二进制 SHA 由构建写入（当前 0438ec7d…），打包校验核对。
  - 替身测试覆盖：helper 缺失/不可执行、超时、取消清理、非零退出、非法输出、像素上限、源文件变化、空格和中文路径。
未验收事项与原因：无内嵌 JPEG 但传感器有效的真实样片缺失；非 Sony 机型、其他 NEF/CR2/CR3/RAF/DNG/ORF/RW2/PEF 样片、Windows/macOS x64 helper、安装包内 helper 运行均保持 NOT_RUN。真实负片算法未开始。
契约变化及理由：新增 components.libraw 与 filmDigitization 能力字段（T02 已预留）；普通模式 RAW/内嵌 JPEG 语义不变。
下一个就绪任务与需先读的文件：T04；先读 PixelBufferFactory、ImageColorConverter、ImageScaler、ImagePlacementRenderer、BorderComposer、ImageEncoder、ImageRenderService、Java2DImageRenderService、FilmRawDecoder、ADR-0007 T01 选型与 T02 契约。
```

### T04：建立高精度处理和合成底座（DONE，2026-11-11）

```text
任务：T04
起点 HEAD / 相关用户已有改动：0641bf9 + T00–T03 改动；未改旧模式生产链路。
已修改文件与行为：
  - java-engine/util/FloatRgbImage.java（新增）：float32 线性 Rec.2020 工作图，保留负值/超范围，无隐式夹断。
  - java-engine/util/FilmColorSpace.java（新增）：sRGB/Rec.2020/相机矩阵直接运算；编码/线性传递函数，不经过 CMM。
  - java-engine/util/FloatImageOps.java（新增）：恒等、+EV、面积/双线性缩放、0/90/180/270/任意角旋转、sRGB 8-bit 装饰层 alpha 合成、输出阶段 16-bit/8-bit 量化。
  - java-engine/util/FilmLinearTiffReader.java + exception/FilmProcessingException.java（新增）：受控 16-bit 线性 TIFF 读取，无 ICC 显式声明，200M 像素上限，ICC/相机矩阵输入明确失败。
  - java-engine/util/FilmProcessingFacts.java（新增）：源/工作/输出事实分开。
实际验证命令、退出码与结果：
  - cd java-engine && mvn test -Dtest='FloatImageOpsTest,FilmColorSpaceTest,FilmLinearTiffReaderTest' → exit 0，21 项通过。
  - cd java-engine && mvn test -Dtest='FilmRawDecoderNativeTest' → exit 0，3 项通过（真实 ARW→float→16-bit TIFF，13.9s）。
  - cd java-engine && mvn test → exit 0（Tests run: 256, Failures: 0, Errors: 0）。
样片/数值/安装包证据：
  - 恒等逐样本精确；+1EV 对 [0,0.5] 精确 ×2；常量图任意缩放误差 ≤1e-6。
  - 16-bit TIFF 读取保持 0x1001 等低有效位；输出 TIFF 实际 TYPE_USHORT，样本非 257 倍数（未降 8-bit）。
  - Rec.2020 绿转 sRGB 保留负值；透明装饰 alpha=0 不改底图；旋转 90° 映射正确。
  - 真实 ARW 7008×4672 转 float 工作图并写出 16-bit TIFF，独立读回位深/尺寸通过。
未验收事项与原因：带 ICC 的线性输入、真实文字/Logo 装饰层、缩放视觉质量与性能、真实彩负算法、macOS x64/Windows 浮点路径；T04 尚未接入预览/导出入口，旧模式不变。
契约变化及理由：无新契约字段；实现 T02 已冻结的 float32 工作空间与显式线性输入边界。
下一个就绪任务与需先读的文件：T05；先读 FilmRawDecoder/FloatImageOps/FilmColorSpace/FilmLinearTiffReader、T02 负片字段（LightSource/FilmBase/Density）、ADR-0007 T01/T04 节。
```

### T05：实现通用彩负转正与片基校准（DONE，2026-11-11）

```text
任务：T05
起点 HEAD / 相关用户已有改动：0641bf9 + T00–T04；未改旧模式生产链路。
已修改文件与行为：
  - java-engine/util/FilmNegativeProcessor.java（新增）：通用彩负 T=image/base、D=-log10(T)、密度范围归一化、positive=normalized；光源增益、ROI 中位数/手工片基、剪裁计数、无 NaN/Inf。
  - java-engine/test/util/FilmNegativeProcessorTest.java（新增）：11 项合成/边界测试，期望由独立公式手算。
实际验证命令、退出码与结果：
  - mvn test -Dtest='FilmNegativeProcessorTest' → exit 0，11 项通过。
  - cd java-engine && mvn test → exit 0（Tests run: 267, Failures: 0, Errors: 0）。
样片/数值/安装包证据：
  - 已知 T=0.5/0.25 → D=0.301/0.602，positive 单调且更暗负片更亮正片；逐通道 base 独立；ROI 中位数精确；增益 [2,1,0.5] 改变透过率；零/近零、负密度、饱和参考、非法 base/stage/reference-frame/calibrationId 均有断言。
  - 无真实 Gold/Portra 负片/片基样片，视觉与场景色差未验收。
未验收事项与原因：Gold 200/Portra 160 实图、参考帧片基、camera-rgb 片基、真实片基/光源样片、视觉质量与场景色差；T05 尚未接入预览/导出入口。
契约变化及理由：无新契约字段；实现 T02 的负片字段，未登记 profile 仍拒绝。
下一个就绪任务与需先读的文件：T06；先读 T02 PositiveAdjustments/Curve、FilmNegativeProcessor、FloatImageOps/FloatRgbImage、ADR-0007 T02/T05 节。
```

### T06：实现基础调整和曲线（DONE，2026-11-11）

```text
任务：T06
起点 HEAD / 相关用户已有改动：0641bf9 + T00–T05；未改旧模式生产链路。
已修改文件与行为：
  - java-engine/util/FilmPositiveProcessor.java（新增）：按冻结顺序实现曝光、RGB 平衡、黑白点、总曲线、分通道曲线、饱和度；线性插值、端点/单调/越域策略；无夹断零调整。
  - java-engine/test/util/FilmPositiveProcessorTest.java（新增）：13 项恒等/曝光/顺序/曲线/饱和度/非法输入/序列化测试。
实际验证命令、退出码与结果：
  - mvn test -Dtest='FilmPositiveProcessorTest' → exit 0，13 项通过。
  - cd java-engine && mvn test → exit 0（Tests run: 280, Failures: 0, Errors: 0）。
样片/数值/安装包证据：
  - 零调整逐样本恒等（含负值/超范围）；+1EV 对 [0,0.5] 精确 ×2；总曲线端点/中点；曲线采样不反向/不过冲；通道曲线隔离；灰色在饱和度下保持中性；曲线顺序影响结果被明确断言。
  - Jackson 序列化往返后逐样本一致；非法重复 x/非单调 y/点过多/黑白点颠倒均返回稳定 code。
未验收事项与原因：真实 Gold/Portra 视觉质量、T10/T11 预览/导出复现、T09 曲线 UI 拖动未完成；本轮只有引擎算法和序列化证据。
契约变化及理由：无新契约字段；实现 T02 的正片字段。
下一个就绪任务与需先读的文件：T07；先读 ImageAnalysisRequest/Response、ImageProcessingValidator、FilmRawDecoder/FilmNegativeProcessor/FilmPositiveProcessor、Electron protocol 白名单、前端 engine API，及 ADR-0007 T02/T06 节。
```

### T07：实现图像分析接口（DONE，2026-11-11）

```text
任务：T07
起点 HEAD / 相关用户已有改动：0641bf9 + T00–T06；未改旧模式生产链路。
已修改文件与行为：
  - java-engine/service/ImageAnalysisService + impl/DefaultImageAnalysisService + service/impl/FilmProcessingPipeline + controller/ImageAnalysisController（新增）：POST /api/image-analysis，复用 RAW/线性读取、负片、正片阶段；ROI/直方图/统计/剪裁/签名/源版本。
  - electron/src/main/protocol.ts：新增精确 POST /api/image-analysis 路由；protocol.test.ts 覆盖。
  - frontend/services/engine/imageAnalysisApi.ts + types/imageProcessing.ts：前端分析客户端与类型；imageAnalysisApi.test.ts。
实际验证命令、退出码与结果：
  - mvn test -Dtest='FilmProcessingPipelineTest,DefaultImageAnalysisServiceTest,ImageAnalysisControllerTest' → exit 0，13 项通过。
  - mvn test -Dtest='FilmRawDecoderNativeTest' → exit 0，4 项通过（真实 ARW sensor clipping 事实）。
  - cd java-engine && mvn test → exit 0（Tests run: 293）。
  - pnpm --filter frontend typecheck/test → exit 0（624 项）；pnpm --filter electron test → exit 0（148 项）。
样片/数值/安装包证据：
  - 全图/ROI 统计、256 桶直方图、clipping sensor/working/output 分开；sensor 来自 raw linearMax/maximum，native 真实 ARW 断言 available=true 且包含 linearMax。
  - 分析阶段忽略 sourceGeometry（编辑几何），ROI 为已应用 EXIF 的完整源图归一化坐标；装饰不进入统计。
  - 前端分析客户端保留 EngineHttpError code；空 body/非法 stage/ROI/schema 均有 400 断言。
未验收事项与原因：UI 取样框逆变换、旋转/裁切视图映射（T09/T10）、过期响应取消/缓存（T10）、输出阶段剪裁事实（T11）、真实负片视觉质量；接口尚未被 UI 消费。
契约变化及理由：无新字段；新增端点并复用 T02 分析 DTO；Electron 精确白名单只允许 POST。
下一个就绪任务与需先读的文件：T08；先读 frontend queue/types、useQueue、useSettings、buildRecipe、WorkspacePage 组装、历史/撤销 hook、预览缓存键，及 ADR-0007 T02/T07 节。
```

### T08：接入每图编辑状态、恢复与撤销（DONE，2026-11-11）

```text
任务：T08
起点 HEAD / 相关用户已有改动：0641bf9 + T00–T07；未改旧模式 UI/导出链路。
已修改文件与行为：
  - frontend/features/queue/types.ts + useQueue.ts：QueueItem.imageProcessing/imageProcessingError/sourceVersion；activeImageProcessing；setActiveImageProcessing（历史、historyTag 合并、深复制）；getEffectiveImageProcessing；旧会话迁移与损坏配置错误标记。
  - frontend/features/queue/imageProcessingSession.ts（新增）：schema/算法/输入模式迁移、JSON 深复制。
  - frontend/features/preview/hooks/useExportController.ts：freezeQueueItem 深复制 imageProcessing。
  - QueuePanel.test.tsx mock、useQueue.test.tsx：新增 7 项 T08 测试。
实际验证命令、退出码与结果：
  - pnpm --filter frontend typecheck → exit 0。
  - pnpm --filter frontend test → exit 0（67 文件 / 631 用例）。
样片/数值/安装包证据：
  - 两图各自设置不同曝光后切换不串图；同 historyTag 两次写入撤销一次回到关闭；深复制后外部修改不污染队列；刷新恢复 0.4；旧会话缺字段迁移普通模式；schemaVersion=99 返回错误解释且关闭处理；localStorage.setItem 抛错不影响内存会话。
  - relocateItem 保留编辑并清空 sourceVersion，等待 T10 重新校验。
未验收事项与原因：底片编辑面板/曲线与取样 UI（T09）、源指纹实际获取与缓存/取样失效（T10）、共享校准批量同步（T12）、真实损坏会话手工验收；未改 WorkspacePage 预览装配，避免在 T10 前使用 501 的生产预览。
契约变化及理由：QueueItem 新增可选每图字段；不改变普通模式或摄影预设字段。
下一个就绪任务与需先读的文件：T09；先读 frontend 设计系统/styles、WorkspacePage、SettingsPanel、PreviewPanel、buildRecipe、queue controller、ADR-0007 T02/T07/T08 节。
```

### T09：实现底片处理面板与工具（DONE，2026-11-11）

```text
任务：T09
起点 HEAD / 相关用户已有改动：0641bf9 + T00–T08；未改普通模式样式页签行为。
已修改文件与行为：
  - frontend/features/editing/defaults.ts（新增）：按 RAW/TIFF 生成默认 sensor-raw/linear-tiff 配置。
  - frontend/features/editing/components/FilmEditingPanel.tsx、CurveEditor.tsx（新增）：显式开启、光源/片基/密度/基础调整/曲线/源图裁切校平控件；端点固定+中间点拖动、historyTag 合并。
  - WorkspacePage.tsx / WorkspaceTabs.tsx：新增「底片」页签并接入 queue per-image config/onChange；styles.css 增加面板/曲线样式。
  - FilmEditingPanel.test.tsx、CurveEditor.test.tsx、WorkspacePage.test.tsx 更新。
实际验证命令、退出码与结果：
  - pnpm --filter frontend typecheck → exit 0。
  - pnpm --filter frontend test → exit 0（69 文件 / 639 用例）。
样片/数值/安装包证据：
  - 能力缺失时按钮禁用并展示原因；RAW 开启生成 sensor-raw 配置；曝光/片基/校平/曲线重置写回真实 recipe 与 historyTag；曲线中间点拖动保持单调，端点不可拖动；关闭写回 null 并展示错误。
  - 生产能力当前仍为 available=false，面板禁用而非展示假控件；T10 贯通后启用。
未验收事项与原因：能力开启后的真实 UI 手动走查、预览取样框拖动、旋转/缩放坐标映射、切图旧工具态、窄窗口/键盘逐点调整；真实 Gold/Portra 视觉质量。
契约变化及理由：无新契约字段；UI 只写入 T02 冻结配置。
下一个就绪任务与需先读的文件：T10；先读 usePreview、PreviewPanel、useActualSizePreview、previewCache、队列缩略图/裸图入口、WorkspacePage 组装、ADR-0007 T02/T08/T09 节。
```

### T10：贯通权威预览、对比与缓存（DONE，2026-11-11）

```text
任务：T10
起点 HEAD / 相关用户已有改动：0641bf9 + T00–T09；普通模式预览链路保留。
已修改文件与行为：
  - usePreview：新增每图 imageProcessing 参数；底片模式只请求引擎结果，不加载普通源图/本地 nativeImage 兜底；缓存键包含完整 RenderRecipe（含处理配置）与源版本；过期请求 abort。
  - PreviewPanel：底片模式只渲染引擎 engineDisplayUrl；未同步显示明确加载，失败显示错误；不把未处理 Canvas 当当前结果，也不进入 100% 代理像素宣称。
  - preview/types：新增 filmMode 状态；WorkspacePage 传入 queue.activeImageProcessing。
  - 前端服务层：previewCache 已有 recipe hash；usePreview 引擎请求也使用 createPreviewCacheKey。
实际验证命令、退出码与结果：
  - pnpm --filter frontend typecheck → exit 0；frontend test → 70 文件 / 641 用例通过。
  - mvn test → 294 项通过（含预览控制器 film 成功用例与真实 ARW sensor facts）。
样片/数值/安装包证据：
  - usePreview.film 测试：底片模式 currentImage=null、只显示 engine 结果；引擎失败时 currentImage 保持 null 且不调用本地未处理预览。
  - PreviewController 线性 TIFF 底片预览返回 200，sourceDecode.mode=linear-tiff。
未验收事项与原因：负片/基础转正/当前结果三种对比图尚未做独立展示；队列缩略图、裸图预览和 100% 原图在底片模式仍可能走普通源图；旋转/裁切取样框映射、快速拖动合并请求度量未完成。
契约变化及理由：无新字段；底片模式增加明确展示状态。
下一个就绪任务与需先读的文件：T11；先读 ExportSettings、DefaultExportPreflightService、ImageEncoder、DefaultRenderJobService、useExportController、ExportDock/输出面板、ADR-0007 T02/T10 节。
```

### T11：贯通母版、带框成品与导出预检（DONE，2026-11-11）

```text
任务：T11
起点 HEAD / 相关用户已有改动：0641bf9 + T00–T10；普通模式固定档位不变。
已修改文件与行为：
  - java-engine/service/impl/FilmExportService.java（新增）：srgb-jpeg、tiff16-srgb、tiff16-rec2020；borderlessMaster 直接输出浮点处理图，带框用 composeProcessed；宽色域带框母版明确拒绝到 T13。
  - ImageEncoder/ImageMetadataPayload：新增 film TIFF/JPEG 写入与 ICC-only payload；TIFF 实际 16-bit；JPEG 8-bit sRGB 写 ICC。
  - DefaultRenderJobService：每项 imageProcessing 走 FilmExportService，普通模式路径不变；冻结快照深复制。
  - RenderJobController/DefaultExportPreflightService：允许底片 output，校验 filmOutput/format；预检按 film 输出组合和源扩展名检查，不再读取内嵌 JPEG 冒充底片源。
  - frontend useExportController：每图 recipe 携带 imageProcessing，导出设置写 filmOutput/borderlessMaster，tier=custom；WorkspacePage 输出页签新增底片输出组合与不带框母版开关；RenderSettings 增加默认字段。
实际验证命令、退出码与结果：
  - mvn test -Dtest='FilmExportServiceTest' → exit 0，5 项通过。
  - cd java-engine && mvn test → exit 0（Tests run: 299）。
  - pnpm --filter frontend typecheck/test → exit 0（641 项）。
样片/数值/安装包证据：
  - borderless sRGB JPEG 实际 JPEG 8-bit + ICC；borderless sRGB TIFF 实际 TYPE_USHORT + ICC，尺寸 2×1 证明无边框；Rec.2020 TIFF 使用系统 profile 通过（测试仅在有 profile 的机器运行）；带框 sRGB TIFF 尺寸增加证明装饰合成生效。
  - 缺 filmOutput/格式不匹配返回稳定错误码；导出的普通模式路径未改。
未验收事项与原因：带框 16-bit/宽色域母版的高精度装饰合成（当前 composeProcessed 会经过 Java2D 量化）；JPEG/TIFF 实际 ICC 与位深尚未由独立 ExifTool/sips 对真实文件核验（T13）；真实 RAW 导出和批量任务未在安装包内跑；宽色域带框母版被明确限制为不支持。
契约变化及理由：实现 T02 的 filmOutput/borderlessMaster，未新增字段；普通固定档位保持原语义。
下一个就绪任务与需先读的文件：T12；先读 useQueue/types、useExportController、FilmEditingPanel、OperationScope、ADR-0007 T02/T08/T11 节。
```

### T12：整卷配置与选择性批量同步（DONE，2026-11-11）

```text
任务：T12
起点 HEAD / 相关用户已有改动：0641bf9 + T00–T11；复用 queue 快照历史。
已修改文件与行为：
  - queue/types + useQueue：新增 FilmSyncField 与 syncImageProcessing(scope, source, fields)；六组字段独立合并、active/checked/all、一次撤销、每目标深复制、损坏条目跳过。
  - FilmEditingPanel：同卷同步范围/字段复选/按钮；WorkspacePage 传入 queue 同步方法与 operationScope。
  - useExportController：每图 imageProcessing 深复制随冻结任务保存，避免同步污染已提交任务。
实际验证命令、退出码与结果：
  - pnpm --filter frontend typecheck → exit 0。
  - pnpm --filter frontend test -- useQueue → exit 0（36 项）。
样片/数值/安装包证据：
  - 三图分别设置曝光后，仅同步 positive/curves 到 all：三图曝光一致、B 的片基未被 A 覆盖、A 自身不被反向覆盖；一次撤销恢复 B/C 原值。
  - 源配置同步后外部修改不污染目标；未勾选组保留逐图覆盖；参考帧/calibrationId 不自动解析。
未验收事项与原因：跨设备/工作色彩空间自动换算、真实同卷参考帧解析、共享校准持久化 ID 解析未实现；上述引用在后端仍明确拒绝。
契约变化及理由：新增 FilmSyncField/syncImageProcessing；不改变 RenderRecipe 字段。
下一个就绪任务与需先读的文件：T13；先读 scripts/package-app.sh、validate-package.mjs、professional-tools/libraw、release-checklist/support-matrix、ADR-0007 全部记录。
```

### T13：安装后离线验收与交付（BLOCKED，2026-11-11）

```text
任务：T13
起点 HEAD / 相关用户已有改动：0641bf9 + T00–T12；打包链路复用既有流程。
已修改文件与行为：
  - scripts/package-app.sh：macOS arm64 缺少 helper 时调用 build-libraw-helper.sh。
  - scripts/validate-package.mjs/test：macOS arm64 校验 helper 文件、Mach-O arm64、清单版本和二进制 SHA-256；测试 fixture 同步。
  - docs/support-matrix.md、docs/release-checklist.md、README/java-engine/electron/cookbook：登记 LibRaw helper、底片模式边界与安装包校验项。
实际验证命令、退出码与结果：
  - ARCH=arm64 bash scripts/package-app.sh → exit 0，产出 DMG/blockmap/manifest/SHA-256。
  - App 内 helper: Mach-O 64-bit executable arm64；--version = film-raw-helper 1.0.0 libraw 0.22.3-Release。
  - bash scripts/smoke-test.sh "…/Camera Border.app/Contents/MacOS/Camera Border" → exit 0，/api/health 通过。
  - pnpm test:scripts → exit 0。
样片/数值/安装包证据：
  - 安装包包含 professional-tools/libraw/macos-arm64/{film-raw-helper,helper.json}；helper.json 源码 SHA 789f3c33…、二进制 SHA 3660537d…。
  - 本机 bundle/App 资源路径与清单校验通过；并未完成干净机器离线安装、卸载、真实摄影流程。
未验收事项与原因（BLOCKED 外部依赖）：
  - 真实 Gold 200/Portra 160 彩负、片边/未曝光片基、光源/色卡、同卷参考成片缺失。
  - 无干净 macOS arm64 离线机器做安装/卸载/离线 E2E；Windows/macOS x64 未构建 LibRaw helper。
  - T11 带框 16-bit/宽色域母版的 Java2D 量化边界未解决；宽色域带框母版明确拒绝。
契约变化及理由：无新契约；安装包新增 LibRaw 内部组件。
交付状态：源码、合成测试、本机 ARW 探针和本机 DMG 冒烟通过；真实胶片与平台安装证据 NOT_RUN，不宣称正式支持。
```

## 9. OpenCode 原始交接（历史记录，完成状态以第 10 节为准）

- 原执行者将 T00–T12 标记为 DONE、T13 标记为 BLOCKED；复核发现该结论不满足任务出口，已在第 10 节纠正。原交接记录声称缺少真实
  Gold 200/Portra 160 彩负、片边/片基/光源/色卡样片，以及没有干净的 macOS arm64 离线
  机器做安装/卸载/真实摄影流程。Windows/macOS x64 helper 也未构建。
- 最终检查（本机）：`mvn test` 299 项通过；`pnpm --filter frontend typecheck/test` 通过
  （70 文件 / 643 用例）；`pnpm --filter electron typecheck/test` 通过（148 用例）；
  `pnpm --filter frontend build` 通过；`pnpm test:scripts` 通过。
- 安装包：`ARCH=arm64 bash scripts/package-app.sh` exit 0；DMG 与 App 内包含
  `professional-tools/libraw/macos-arm64/film-raw-helper` + `helper.json`；
  `scripts/smoke-test.sh` 对 App 启动/`/api/health` 通过。
- 仍需外部输入的验收：真实彩负片基/光源/Gold/Portra 样片；干净 macOS arm64 离线安装 E2E；
  Windows/macOS x64 helper 与安装包；真实负片场景色差门槛（T05 前冻结，不得看结果后放宽）。
- 已知限制：带框 16-bit/宽色域母版仍经过 Java2D 装饰量化（宽色域带框明确拒绝）；
  T10 的三种对比图、队列缩略图、100% 底片视图与取样框拖动未闭环；T03 无内嵌 JPEG 的
  真实传感器样片仍 NOT_RUN；T12 的 calibrationId/参考帧解析仍由 T05 明确拒绝。
- 本轮没有提交、推送、创建 PR，也没有覆盖 `photos/` 原图或用户已有未提交改动。



## 10. Codex 复核与功能补齐（当前权威状态）

原报告“仅 T13 被外部条件阻塞”不成立；早期将错误宽色域和高位深输出禁用只避免了错误文件，未实现工作流。按用户要求，本轮继续完成高精度合成、匹配 ICC 的三种编码、元数据与独立文件回读、分析 UI、取样、完整像素检查、缩略图、曲线交互、参考帧及可复现校准复用。详细行为、回归入口和限制以 [复核记录](film-digitization-review.md) 为准。

进度表的 DONE 只表示对应源码与本地回归完成。真实 Gold/Portra 还原、无内嵌 JPEG 机型和跨平台支持仍按实际证据登记。用户明确“先不打包”，本轮不重建 DMG，不把历史安装包结果复用为新代码的安装后证据；T13 留待后续授权打包时开展。
