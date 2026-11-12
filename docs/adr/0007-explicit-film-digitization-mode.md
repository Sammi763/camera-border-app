# ADR-0007：显式底片数字化模式（真实 RAW、彩负转正与校色）

- 状态：已接受（范围与边界；实现和验收按 [底片数字化执行方案](../opencode-film-digitization-plan.md) 推进）
- 决策日期：2026-11-11
- 权威文档：[docs/opencode-film-digitization-plan.md](../opencode-film-digitization-plan.md)（任务、契约与进度）
- 权威代码（随任务落地逐步补齐）：`java-engine/.../model/RenderRecipe.java`、`java-engine/.../util/RawDecoder.java`、`java-engine/.../service/ImageRenderService.java`、`frontend/src/features/settings/utils/buildRecipe.ts`、`electron/src/main/protocol.ts`

## 背景

当前产品的默认模式是「照片边框工具」：读取普通图片或 RAW 内嵌 JPEG，只在版式层做边框、文字和 Logo 合成，默认不改照片色彩，也不做曝光、白平衡、曲线等像素编辑。这个默认模式的范围、保真和验收口径由 [PRD §0](../prd.md)、[ARCHITECTURE.md §4](../../ARCHITECTURE.md) 与 [RAW 与专业保真说明](../raw-and-fidelity.md) 冻结。

新的用户需求是：把数码相机翻拍的**彩色负片 RAW** 在本机完成真实 RAW 解码、光源校准、片基取样、负片转正、全局校色与曲线调整，并导出不带框母版或带边框成品。它需要读取传感器数据、在线性宽色域空间做浮点处理，和现有「只读内嵌 JPEG、不做修图」的默认模式存在真实冲突。

如果直接删除旧限制，会让旧模式的含义改变：原本明确只使用内嵌 JPEG 的导入、预览和导出可能被误认为已经支持真实显影，普通照片也可能被隐式套上处理。因此本 ADR 冻结为**显式模式**：只有用户主动开启底片处理时才进入新管线，默认模式的含义、字段和输出档位保持不变。

## 决策

### 1. 两种模式并存，默认模式不变

- **普通模式（默认）**：`RenderRecipe.imageProcessing` 缺省或为 `null`。继续使用现有图像读取、内嵌 JPEG、版式合成和三个固定导出档位；不显示底片处理控件，不因胶片名称、拍摄信息预设或模板隐式开启处理。
- **底片数字化模式（显式开启）**：用户对某张图明确进入底片模式并完成必要校准后，`imageProcessing` 才出现。该字段可选、带独立版本，未识别版本或非法配置必须明确失败，不能静默当作关闭处理。
- 同一张图的预览、分析、单图导出和批量导出读取**同一份**有效处理配方；普通模式的渲染语义不因新增模式而改变。

### 2. 处理管线与边界

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

- 算法、原生组件调用和像素处理归 Java 引擎；Electron 只负责路径、资源配置、系统能力与精确代理；前端只负责交互、配方状态和显示。
- 首选评估随包 LibRaw 小型 helper，由 Java 通过受控进程调用。helper 是引擎内部实现部件，不是第四个业务服务。只有 T01 的真实样本验证通过后，才新增 `java-engine/src/main/native/`；禁止运行时下载、搜索系统 PATH 或在失败时回退到内嵌 JPEG。
- 新增前端 `frontend/src/features/editing/` 的理由是集中独立的底片编辑业务，避免继续扩张 `WorkspacePage` 和 `SettingsPanel`；不引入通用节点图、插件系统或多层注册表。

### 3. 真实 RAW 与像素来源

- 底片模式可以使用真实传感器 RAW；普通模式仍只允许内嵌 JPEG。两者的 `SourceDecode` 语义必须明确区分，不能共用一个模糊的「RAW」状态。
- 真实 RAW 失败（损坏、机型不支持、组件缺失、无执行权限、错误架构、超时、非零退出、非法输出）必须明确失败；不得自动切换成内嵌 JPEG，也不得用缩略图或系统预览冒充传感器数据。
- 源事实与结果事实分开记录：原文件、像素来源、传感器有效位深（已知时）、工作数据类型、处理尺寸、输出位深、实际 ICC。不能把它们混成一个 `bitDepth`。
- 方向只在解码边界物理应用一次，并与用户手动旋转、版式放置和源图校平分开。

### 4. RenderRecipe 增量契约

`RenderRecipe.imageProcessing` 只在 T02 冻结后落地，方向如下：

| 分组 | 必须表达的含义 |
|---|---|
| 版本与模式 | 独立 `schemaVersion`、算法版本、输入模式（普通 / 真实传感器 RAW） |
| RAW 参数 | 明确使用传感器数据；光源校准引用或数值、解码选项；不得包含隐式自动变化 |
| 负片参数 | `enabled`、片基 RGB 参考及其空间/阶段、密度范围、已验证的转换配置及版本 |
| 正片调整 | 定义明确的曝光、RGB 平衡、黑白点、饱和度、总曲线、分通道曲线；零调整必须为恒等映射 |
| 曲线 | 点数上限、固定端点、严格递增 x、单调 y、插值方法、输入域、越域行为和顺序；第一版只支持单调曲线 |
| 源图几何 | 归一化裁切框和校平角度，与版式填充的 `imagePlacement` 分开；方向只物理应用一次 |
| 每图编辑 | 存在队列项或由队列项稳定 ID 索引，与摄影身份/版式设置分离；缺失字段迁移为关闭处理 |

数值必须检查有限值、范围和组合合法性。第一版可提供 RGB 平衡而暂不提供 Kelvin 色温；只有色温/色调变换的算法定义及验证齐全时才展示对应控件。

### 5. 色彩、精度与事实

- 候选工作空间为线性 Rec.2020，核心像素处理使用 float32；最终实现和 CMM 适配由 T01 探针决定并回写本 ADR。不得用 8-bit Canvas 读回、`getRGB/setRGB` 或「16-bit 文件标签」替代高位深浮点处理。
- 恒等调整在归一化 `[0,1]` 合成数据上的最大绝对误差不超过 `2e-6`；不含其他处理的 `+1 EV` 对 `[0,0.5]` 输入应等于乘二，使用同一误差门槛。曲线端点按冻结定义精确命中，单调曲线采样不得反向或过冲。
- 预览由引擎转换并标记 sRGB，显示器转换交给浏览器/系统，避免双重应用显示器 ICC。宽色域显示预览与软打样不是第一版承诺。
- 首版导出组合：sRGB JPEG 分享成品；16-bit TIFF 母版，可选 sRGB 或经验证、随包可用的宽色域输出 ICC。RAW 相机输入配置不等于成品输出 ICC。
- 有意校色后的结果不能套用「与原负片像素相同」的保真判据；算法、处理后参考输出、编码误差和元数据事实分别验收。负片还原的场景色差门槛须在 T01/T02 根据真实标定样本事先定义，不能看到结果后放宽。

### 6. 负片算法与胶片身份

- 光源校准和片基校正分开；片基可来自同图 ROI 或同卷参考帧。比较源片基与画面数据时必须使用相同校准、工作空间和阶段。
- 密度模型必须说明正片映射的物理或近似含义，不能只算一次 log 就声称完成色彩还原。底层先接受明确有效的参数，不引入未经验证的自动算法。
- Gold 200、Portra 160 首先作为拍摄身份与验证样本分类。只有实际校准证据支持时才增加对应转换配置；没有证据时使用明确标注的通用彩负配置，不伪造两个「专业还原」预设，也不把厂商密度曲线直接当相机 RGB 校准曲线。
- 摄影信息预设、模板和胶片名称不隐式决定算法；拍摄身份与处理参数分开保存。

### 7. 状态、分析与缓存

- 新增一个职责明确的分析入口（建议 `POST /api/image-analysis`），请求含相同 recipe、分析阶段和可选 ROI；响应含配方签名、文件版本、实际分析尺寸/采样方式、直方图、区域统计及剪裁事实。统计阶段不含边框、文字、Logo。
- ROI 基于已应用 EXIF 方向、尚未执行编辑几何的完整源图归一化坐标；前端把当前视图中的取样框逆变换到该空间，返回值不由屏幕像素推算。
- 状态至少区分：关闭处理、等待校准、计算中、可用、输入不支持、组件不可用、计算失败、源文件变化。错误沿用 4xx=请求/输入问题、5xx=内部或组件异常，并在 T02 固定稳定错误码。
- 缓存键包含源文件版本、完整配方、算法版本、输出空间、分析阶段及尺寸；不持久化 blob URL。缓存、原生输出和全幅缓冲均有资源上限。
- 过期响应丢弃只是 UI 防护；引擎/原生工作还必须有有界调度和可协作取消，不能把 HTTP abort 等同于后端已经停止计算。

### 8. 源版本、导出与兼容

- 预检和提交时记录源文件标识/版本，读取前后核对；精度敏感的参考图关联内容指纹。版本不符明确失败，不继续使用旧片基/缓存。
- 单图和批量导出冻结相同的每图处理参数及校准数值；冻结后修改曲线或共享校准不能污染已提交任务；排队期间源文件变化必须发现并明确失败。
- 「不带框母版」仍使用同一 recipe，将 `border`、`gradient`、`texts`、`logo`、`borderStyle` 等装饰全部明确禁用，不只把边框宽度设为零。
- 普通模式旧请求、旧模板和旧导出档位继续工作；新语义不塞进原有「源 ICC/源位深」档位。底片模式的输出策略与普通模式固定档位分开定义。
- 底片模式沿用现有异步 render jobs；不新增第四套持久化系统或文件写权限。翻拍 EXIF 是翻拍设备/时间，原胶片拍摄身份独立保存，不混写、不伪造字段。

## 样片盘点（T00，2026-11-11）

本机 `photos/` 目录被 `.gitignore` 排除，只作为本机开发数据，不作为发布证据。已核对的事实：

| 样本 | 数量与状态 | 可用于 | 不能用于 |
|---|---|---|---|
| Sony ILCE-7M5 `.ARW` | 6 份，真实传感器 RAW（7008×4672，容器 16-bit，Display P3，内容为正片） | T01 的真实 RAW 解码/线性输出/方向/夹断探针 | 彩负片基、Gold/Portra、负片还原视觉验收 |
| JPEG 正片扫描 | 4 份，5035×3339，sRGB，Lightroom 导出 | 普通模式回归、版式合成对照 | 真实 RAW、负片算法数值验收 |
| TIFF 正片扫描 | 5 份，5035×3339，`sips` 报告 8-bit | 普通模式高位深读取回归（实际位深待 T04 复核） | 16-bit 线性测试输入、负片数值验收 |
| 彩负片边 / 未曝光片基 | 缺失 | — | 片基校正、同卷参考验收 |
| Gold 200 / Portra 160 真实负片 | 缺失 | — | 胶片校准与视觉质量验收 |
| 翻拍光源参考 / 灰卡 / 色卡 | 缺失 | — | 光源校准、数值色差验收 |
| 同卷参考成片（实验室或独立转换） | 缺失 | — | 视觉对照；不能替代色卡数值测量 |
| 16-bit 线性 TIFF 合成测试输入 | 缺失（可由 T04 生成） | T04 精度探针 | 真实相机样本验收 |
| 目标机器性能预算 | 未测量；当前机器 Apple M2 Pro / 32 GB / macOS 27.2 arm64 | T01 记录硬件后测量 | 正式性能验收 |

已记录 SHA-256（本机样本，非仓库证据）：

```text
ARW 551d6aaca89bfff479ed48e15f03a18d5515371e6ce1d0e5eebf0aee4381f87f  DSC04875.ARW
ARW 04f2e1edb08105357146794aded7fb55b9f2fb4e72a4e5a4f103ee558e78236f  DSC04876.ARW
ARW 667b133f3938f03723ec06c8fb403c202ee30b4324c1902890008922f04b3ea0  DSC04877.ARW
ARW aad6214a8ebf8aa169b2b4222b986390a1d144a3ba5736353d4f3ea5e1594f0b  DSC04881.ARW
ARW 1cac3871a5fa0d940e9fdb9fc80bd7dfa54118ae3afcc2c6d76018382bcd762b  DSC04882.ARW
ARW 7228250056a5b9b31b0bf7b66567ffe9fa6203b0e78c7e43c921b737cfdd8fa1  DSC04883.ARW
JPEG d912a5773ff6038ae7cf701e0442e35828792e0b81fefaa77c746b61a66d002a  78330006.jpg
TIFF 3836876beb5383740a5331343dd7ef6bdb795f5f343fb2071d8cac48746ccbb0  83750006.TIF
```

缺少真实负片/片基/光源参考时，可以完成不依赖它们的代码与合成测试，但对应真实 RAW、胶片或平台验收保持 `NOT_RUN`，不下载来路不明的替代图，不伪造通过。

## T01 技术探针结果（2026-11-11）

### 环境与输入

- 硬件/系统：Apple M2 Pro，32 GB RAM，macOS 27.2（26B123）arm64。
- 编译器：Apple clang 21.0.0；Java：Temurin 21.0.10；Maven 3.9.14。
- LibRaw：0.22.3 官方源码包，SHA-256 `789f3c33466210a1a0907f747a97c715d21bbf4af712f257fcbbd90111b227e4`；配置 `./configure --prefix=<temp> --disable-shared CC=clang CXX=clang++`，静态链接 `libraw.a -lz -llcms2`。configure 未找到 libjpeg/OpenMP；helper 必须用 C++ 链接器，不能按 C 目标链接。
- 色彩工具：系统 LittleCMS 2.19（`tificc`/`transicc`）；随包 ExifTool 13.59；真实输入为 6 份 Sony ILCE-7M5 ARW（`photos/`，本机数据，SHA-256 见上文样片盘点）。

### 工作 A：真实 RAW → 线性高位深

探针命令（临时目录，非生产代码）：

```bash
clang++ -std=c++17 -O2 -I LibRaw-0.22.3 t01_raw_probe.cpp \
  LibRaw-0.22.3/lib/.libs/libraw.a -L/opt/homebrew/lib -lz -llcms2 -o t01_raw_probe
/usr/bin/time -l ./t01_raw_probe photos/DSC04875.ARW out/full
./LibRaw-0.22.3/bin/raw-identify -v photos/DSC04875.ARW
```

受控参数：`output_bps=16`、`output_color=1`（线性 sRGB）/`6`（线性 Rec.2020）/`0`（camera RGB）、`use_camera_wb=1`、`no_auto_bright=1`、`gamm[0]=gamm[1]=1.0`、`highlight=0`、`user_flip=0`、`user_qual=3`。

事实：

| 项目 | 结果 |
|---|---|
| 相机/文件 | Sony ILCE-7M5，6 份 ARW 全部成功；真实负片样片仍缺失 |
| 传感器尺寸 | raw 7168×5120；厂商 inset crop 7008×4672（left 12 / top 8），必须先裁切再进入后续管线 |
| 方向 | `flip=5`（90° CCW）；ExifTool 同一文件为 `Orientation=Rotate 270 CW`（8）；应用一次后 4672×7008，与内嵌 JPEG 的物理方向一致 |
| 位深/黑电平 | `raw_bps=14`，black=512，sensor maximum=16383，linearity limit=15360；ExifTool 的 BlackLevel/WhiteLevel 与 LibRaw 一致 |
| 白平衡 | `cam_mul=[2310,1024,1699,1024]`，与 ExifTool `WB_RGGBLevels=2310 1024 1024 1699` 一致；相机矩阵来自 LibRaw 内置数据库，文件本身无 ColorMatrix 标签 |
| 输出 | 线性 sRGB/Rec.2020 均为 7008×4672、16-bit；内嵌 JPEG 是 8-bit 7008×4672（物理方向 4672×7008） |
| 线性 gamma | 以 Node 独立按 sRGB 传递函数复算 602,688 个样本，最大误差 2/65535（仅舍入），证明 `gamm=1/1` 输出为线性数据 |
| 自动提亮 | `no_auto_bright=0` 相对线性输出的逐像素倍率为 1.239–2.234，不是固定倍数；必须显式关闭并记录 |
| 高光 | `highlight=0` 时出现 65535 饱和；`highlight=1` 改变高光样本，最大差 29,440/65535。线性上限 15360 低于 sensor maximum，处理时必须区分“线性有效上限”和“传感器最大值” |
| 内存/延时 | 单张 32MP：2.42–3.02 s，峰值 RSS 804.4–804.5 MB（6 份 ARW）。预设预算 ≤ 15 s、≤ 4 GB，本轮 PASS；该预算只适用于本机，不能替代 T13 安装包性能验收 |

未验收：真实彩负/片基/光源/色卡（缺失）；损坏 RAW、无内嵌 JPEG、非 Sony 机型、超时/取消/非法输出（T03）；真实负片还原视觉质量（T05）。

### 工作 B：读入 → 工作空间 → 缩放/几何 → 合成 → 输出

探针命令：

```bash
javac -cp java-engine/target/classes:<deps> -d probe-classes T01JavaProbe.java
java -cp java-engine/target/classes:<deps>:probe-classes T01JavaProbe
```

事实：

| 检查 | 结果 |
|---|---|
| 现有工作缓冲 | `PixelBufferFactory` 只创建 `TYPE_BYTE`/`TYPE_USHORT`，没有 float 工作图 |
| 16-bit 缩放 | 常量 4097 经 `ImageScaler.scale` 变为 4112；输出所有样本都是 257 的倍数 → Java2D 缩放把 16-bit 静默压成 8-bit |
| 16-bit 合成 | `BorderComposer.compose` 即使不缩放，画布内照片也从 4097 变为 4112；`drawImage` 本身即 8-bit 瓶颈 |
| 16-bit 编码 | `ImageEncoder` 单独写 TIFF 时，常量 4097 读回仍为 4097，文件为 `TYPE_USHORT`；容器/编码器不是瓶颈，Java2D 照片绘制才是 |
| 整数范围 | `setSample(-1)` → 65535，`setSample(70000)` → 4464，`setSample(65536)` → 0；整数缓冲不能表达负值/超范围中间值 |
| 16-bit TIFF 输入 | 无 ICC 的 16-bit TIFF 经 `ImageReader` 保持 `TYPE_USHORT` 和原值；Adobe RGB 16-bit TIFF 会被 `ImageColorConverter` 转到 sRGB（16384/8192/24576 → 16388/8195/24578），普通路径不能直接用于宽色域底片输入 |
| CMM 对照 | Java `ColorConvertOp` sRGB→Adobe 16-bit 输出 15245/9516/24201；LittleCMS 2.19 `tificc` 对同一 16-bit TIFF 输出 15247/9515/24204，最大差 3/65535 |
| CMM 恒等风险 | 同空间 sRGB→sRGB 的 `ColorConvertOp` 把 16384 变为 16448（+64）；float sRGB→XYZ→sRGB 的 0.5 往返误差 7.6e-6，均超过 `2e-6` 恒等门槛。零调整和同空间路径必须绕过 CMM |

### T01 选型结论

1. **真实 RAW**：采用随包、固定版本 LibRaw 0.22.3 静态构建的受控 helper，由 Java 通过有界子进程调用；不使用 JNI、不搜索系统 PATH、不在运行时下载。helper 输出必须显式定义端序（LibRaw `dcraw_make_mem_image` 为 native-endian），并在 Java 侧校验尺寸/通道/位深/超时。
2. **裁切与方向**：使用厂商 inset crop（7008×4672）并报告 raw/inset 尺寸；helper 输出未旋转像素 + `flip` 事实，Java 在解码边界只应用一次方向（`flip=5` 映射 EXIF 8），禁止再次应用 EXIF。
3. **工作空间**：核心照片处理采用 float32 线性 Rec.2020；缩放、几何、照片合成使用自定义浮点实现，不再用 `Graphics2D.drawImage` 处理照片像素。
4. **装饰层**：Java2D 只绘制文字/Logo/边框等装饰到独立 sRGB 图层（含 alpha），再在 float 工作图/输出阶段合成；不得把装饰直接画到 16-bit 照片缓冲上（会触发上述 8-bit 量化）。
5. **CMM**：T01 的 16-bit 文件转换与 LittleCMS 2.19 在 3/65535 内一致，第一版可复用 JDK ICC CMM 做实际 profile 转换；同空间/零调整必须直接计算，不经过 CMM。T04 必须用 float 探针复验后再冻结；若 float 路径不达标，再评估原生 LittleCMS 适配。
6. **解码参数**：底片 RAW 固定显式 `use_camera_wb=1`、`no_auto_bright=1`、`gamm=1/1`、`highlight=0`、`output_bps=16`；自动提亮、自动白平衡、gamma 和裁切不得隐式变化。线性有效上限使用 15360（不是 16383）并在剪裁事实中报告。
7. **精度边界**：现有 Java2D 整数管线不满足后续 `2e-6` 恒等门槛；T04 必须新增 float32 工作图与自定义重采样/合成，不能用“输出 TIFF 标成 16-bit”通过验收。

失败项与边界：LibRaw 未找到 libjpeg/OpenMP 不影响本次 RAW 解码，但 T03 打包需明确依赖；真实负片、其他相机/格式、损坏输入和取消路径未验收，保持 `NOT_RUN`；不能把本机 6 份正片 ARW 当作 Gold/Portra 或负片算法证据。

## T02 冻结契约（2026-11-11）

本节是 `RenderRecipe.imageProcessing`、分析接口、底片输出组合和稳定错误码的权威定义。
Java 模型/校验器、前端类型和 `fixtures/film-digitization/` 必须与本表一致；修改契约先改本节。

### 1. 顶层与模式

| 字段 | 类型/枚举 | 默认 | 规则 |
|---|---|---|---|
| `schemaVersion` | int | `1` | 只接受 `1`；其他值返回 `IMAGE_PROCESSING_UNSUPPORTED_SCHEMA` |
| `algorithmVersion` | string | `film-digitization-v1` | 只接受该值；其他值返回 `IMAGE_PROCESSING_UNSUPPORTED_ALGORITHM` |
| `inputMode` | `sensor-raw` \| `linear-tiff` | 必填 | 其他值返回 `IMAGE_PROCESSING_INVALID_INPUT_MODE` |
| `raw` | object | null | `sensor-raw` 必填；`linear-tiff` 必须为 null |
| `linearInput` | object | null | `linear-tiff` 必填；`sensor-raw` 必须为 null |
| `negative` | object | null | 可为 null（仅线性 RAW/测试输入）；启用时必须完整 |
| `positive` | object | 零调整对象 | 缺省按恒等映射处理 |
| `sourceGeometry` | object | 全图、0° | 缺省按完整源图处理 |

普通模式：`imageProcessing` 缺省或 null。旧请求、旧模板、旧导出档位不受影响。
生产入口在 T02 阶段对结构合法的新配置返回 `501 IMAGE_PROCESSING_NOT_AVAILABLE`，禁止静默忽略。

### 2. RAW 与线性输入

`raw` 字段：

| 字段 | 枚举/范围 | 默认 | 规则 |
|---|---|---|---|
| `whiteBalance` | `camera` \| `daylight` | `camera` | 其他值拒绝 |
| `autoBright` | boolean | `false` | 只允许 false；true 返回 `IMAGE_PROCESSING_UNSUPPORTED_OPTION` |
| `gamma` | `linear` | `linear` | 只允许 linear |
| `highlight` | `clip` \| `unclip` | `clip` | 其他值拒绝 |
| `crop` | `vendor-inset` \| `full-sensor` | `vendor-inset` | 其他值拒绝 |

`linearInput` 字段：

| 字段 | 枚举/范围 | 默认 | 规则 |
|---|---|---|---|
| `transferFunction` | `linear` | `linear` | 只允许 linear；无 ICC/未知传递函数不得猜成线性 |
| `colorSpace` | `linear-srgb` \| `linear-rec2020` \| `linear-camera-rgb` | 必填 | 其他值拒绝 |
| `bitDepth` | int | `16` | 只允许 16 |
| `iccSha256` | 64 位十六进制 \| null | null | 非空时必须是 SHA-256；无 ICC 时依赖显式 colorSpace |

### 3. 负片参数

| 字段 | 枚举/范围 | 默认 | 规则 |
|---|---|---|---|
| `enabled` | boolean | `true` | false 时只做 RAW 线性/裁切，不号称已完成转正 |
| `profile` | `generic-color-negative-v1` | 该值 | 未登记 Gold/Portra 专属配置；其他值返回 `IMAGE_PROCESSING_INVALID_NEGATIVE` |
| `lightSource.kind` | `camera-white-balance` \| `calibration` | `camera-white-balance` | calibration 必须提供 id、增益或参考帧之一 |
| `lightSource.rgbGain` | 3 个有限数，[0.1,10] | null | kind=camera-white-balance 时必须为 null |
| `lightSource.referenceFingerprint` | SHA-256 \| null | null | 有值时必须有 referenceImagePath |
| `lightSource.calibrationVersion` | int ≥1 \| null | null | 引用版本 |
| `filmBase.kind` | `roi` \| `reference-frame` \| `manual` | `roi` | 三种来源互斥 |
| `filmBase.roi` | 归一化矩形 | null | kind=roi 必填；坐标见第 5 节 |
| `filmBase.referenceImagePath` | string \| null | null | kind=reference-frame 必填 |
| `filmBase.referenceFingerprint` | SHA-256 \| null | null | 参考帧内容指纹 |
| `filmBase.rgb` | 3 个有限数，[0,4] | null | kind=manual 必填 |
| `filmBase.stage` | `linear-camera-rgb` \| `linear-working` | `linear-working` | 参考必须与画面数据同阶段比较 |
| `density.min/max` | 有限数，0≤min，max≤6，max-min≥0.1 | 0 / 3 | 密度模型 D=-log10(T)，不含自动估计 |

启用负片时 `lightSource`、`filmBase`、`density` 均必填；缺失返回 `IMAGE_PROCESSING_INVALID_NEGATIVE`。
Gold 200/Portra 160 只作为拍摄身份和验证样本；无校准时不得接受其专属配置。

### 4. 正片调整与曲线

零调整必须是恒等映射。处理顺序冻结为：
`曝光 → RGB 平衡 → 黑白点 → 总曲线 → R/G/B 分通道曲线 → 饱和度`。

| 字段 | 范围 | 默认 | 规则 |
|---|---|---|---|
| `exposureEv` | [-5,5] | 0 | 线性倍率 `2^EV` |
| `rgbBalanceEv` | 3 个 [-4,4] | [0,0,0] | 每通道线性倍率 `2^EV`；零值恒等 |
| `blackPoint` | [0,1) | 0 | 黑白点映射 `(v-black)/(white-black)`，结果夹到 [0,1] |
| `whitePoint` | (blackPoint,1] | 1 | 必须大于 blackPoint |
| `saturation` | [0,2] | 1 | Rec.2020 亮度保持；1 为恒等 |
| 曲线 `interpolation` | `linear` | `linear` | 第一版只允许线性插值，避免过冲 |
| 曲线 `points` | 2–17 点 | null=恒等 | 首点精确 (0,0)，末点精确 (1,1)；x 严格递增；y 单调不减；所有值有限且在 [0,1] |

曲线输入域为当前阶段的归一化 [0,1]；越域先夹到端点。总曲线先于分通道曲线；每条曲线独立采样，
不反向、不过冲。端点误差按 1e-9 判定。

### 5. 源图几何

- `sourceGeometry.crop` 为归一化 `{x,y,width,height}`，坐标基于**已应用 EXIF 方向、未应用编辑几何**的完整源图；
  `0≤x,y`，`width/height≥0.01`，`x+width≤1`，`y+height≤1`。
- `rotationDegrees` 范围 [-45,45]，围绕裁切区域中心旋转；输出取与裁切区域同比例的最大居中内接矩形，
  避免留出空白角。方向只在解码边界物理应用一次，几何旋转是独立的编辑变换。
- 该校平/裁切与版式 `imagePlacement` 完全分开；版式只做最终放置，不能反向修改源图几何。

### 6. 分析接口（T07 实现）

`POST /api/image-analysis`

请求：

| 字段 | 类型 | 规则 |
|---|---|---|
| `recipe` | RenderRecipe | 与预览/导出同一份有效配方 |
| `stage` | `raw-linear` \| `base-positive` \| `current-positive` | 其他值 400 |
| `roi` | 归一化矩形 \| null | null=全图；坐标同第 5 节，未应用编辑几何 |

响应：

| 字段 | 含义 |
|---|---|
| `status`/`message` | ok/error 与可解释信息 |
| `recipeSignature` | 有效处理配置的稳定 SHA-256 签名（不含装饰字段） |
| `sourceVersion` | 源文件版本（mtime/size/内容指纹的组合，T07 固定格式） |
| `stage` | 实际分析阶段 |
| `analyzedWidth/Height` | 实际分析尺寸，不是屏幕尺寸 |
| `sampling` | `full` 或 `stride:N` |
| `bucketCount` | 默认 256；直方图数组长度与之一致 |
| `roi` | 实际使用的归一化 ROI |
| `histogram` | red/green/blue/luma 计数 + underflow/overflow |
| `stats` | 像素数、R/G/B 均值/最小/最大、低/高剪裁计数 |
| `clipping.stages` | `sensor` / `working` / `output` 分阶段剪裁事实；不可用时 available=false |

统计阶段不含边框、文字、Logo。ROI 由前端从当前视图逆变换到源图空间，不由屏幕像素反推。
真实传感器剪裁必须来自传感器/工作缓冲事实，不能由 sRGB 预览饱和值猜测。

### 7. 输出组合（T11 实现）

普通模式固定档位不变。底片模式在 `ExportSettings` 增加：

| 字段 | 枚举 | 规则 |
|---|---|---|
| `filmOutput` | `srgb-jpeg` \| `tiff16-srgb` \| `tiff16-rec2020` \| null | 底片模式必填；普通模式必须为 null |
| `borderlessMaster` | boolean | true 时 border/gradient/texts/logo/borderStyle 全部显式禁用 |

| 组合 | 格式/位深 | 色彩 | 尺寸 | 装饰 |
|---|---|---|---|---|
| `srgb-jpeg` | JPEG 8-bit，质量 95 | 转 sRGB 并嵌入实际 ICC | 处理后的源图尺寸 | 可选 |
| `tiff16-srgb` | TIFF 16-bit | sRGB ICC | 处理后的源图尺寸 | 可选 |
| `tiff16-rec2020` | TIFF 16-bit | 随包/经验证的 Rec.2020 ICC | 处理后的源图尺寸 | 可选 |

`borderlessMaster=true` 时禁止任何装饰残留；RAW 相机输入配置不等于成品输出 ICC。

### 8. 稳定错误码

| 错误码 | HTTP | 含义 |
|---|---:|---|
| `IMAGE_PROCESSING_UNSUPPORTED_SCHEMA` | 400 | 未知 schemaVersion |
| `IMAGE_PROCESSING_UNSUPPORTED_ALGORITHM` | 400 | 未知算法版本 |
| `IMAGE_PROCESSING_INVALID_INPUT_MODE` | 400 | 输入模式非法 |
| `IMAGE_PROCESSING_MISSING_RAW_OPTIONS` | 400 | sensor-raw 缺 raw |
| `IMAGE_PROCESSING_UNSUPPORTED_OPTION` | 400 | 明确不支持的选项（如 autoBright=true） |
| `IMAGE_PROCESSING_INVALID_LINEAR_INPUT` | 400 | 线性输入声明缺失/冲突/非法 |
| `IMAGE_PROCESSING_INVALID_NEGATIVE` | 400 | 负片配置缺失或 profile 未登记 |
| `IMAGE_PROCESSING_INVALID_LIGHT_SOURCE` | 400 | 光源引用/增益非法 |
| `IMAGE_PROCESSING_INVALID_FILM_BASE` | 400 | 片基来源/ROI/数值非法 |
| `IMAGE_PROCESSING_INVALID_DENSITY` | 400 | 密度范围非法 |
| `IMAGE_PROCESSING_INVALID_POSITIVE` | 400 | 正片调整范围/组合非法 |
| `IMAGE_PROCESSING_INVALID_CURVE` | 400 | 曲线点、端点、单调性或插值非法 |
| `IMAGE_PROCESSING_INVALID_GEOMETRY` | 400 | 裁切/校平非法 |
| `IMAGE_PROCESSING_NOT_AVAILABLE` | 501 | 结构合法但处理管线尚未落地 |
| `IMAGE_PROCESSING_FILM_OUTPUT_REQUIRED` | 400 | 底片模式缺 filmOutput |
| `IMAGE_PROCESSING_FILM_OUTPUT_INVALID` | 400 | filmOutput/格式组合非法 |

错误响应在保留 `error` 的同时增加可选 `code`；旧异常没有 code 时字段不输出，旧客户端不受影响。

### 9. 数值与验收门槛

- **恒等**：float32 工作图上，零调整全幅处理相对输入的最大绝对误差 ≤ `2e-6`（归一化 [0,1]）。
- **曝光**：不含其他处理的 `+1 EV` 对 `[0,0.5]` 输入等于乘 2，使用同一 `2e-6` 门槛。
- **曲线**：端点精确命中；单调曲线采样不得反向或过冲；线性插值在控制点之间不得超出相邻端点值。
- **位深**：16-bit 低有效位渐变经全幅处理不得先量化为 8-bit；输出 TIFF 的实际位深由独立读取确认。
- **ICC**：实际 profile 转换以独立参考为基准，沿用现有成品色差目标 ΔE00 P95 ≤ 1；同空间/零调整必须绕过 CMM，
  不能把 `ColorConvertOp` 同空间往返当作恒等（T01 已测得 +64/65535 偏差）。
- **负片场景色差**：真实标定样本到位前不冻结数值门槛；T05 必须先用样本定义门槛再跑验收，不得看到结果后放宽。
- 上述门槛在 T04/T06 的自动化测试中执行；只有合成测试或 UI 时不能宣称真实底片还原通过。

### 10. 契约文件与测试

- Java 模型：`model/ImageProcessingConfig.java`；校验：`util/ImageProcessingValidator.java`。
- 共享用例：`fixtures/film-digitization/`（旧请求、sensor-raw、linear-tiff、23 个非法用例）。
- Java：`ImageProcessingContractTest`（结构、错误码、序列化往返、旧请求兼容、501 闸门）、
  `PreviewControllerTest`（合法配置 501、非法配置 400）。
- 前端：`types/imageProcessing.ts`、`types/preview.ts` 镜像；`imageProcessingContract.test.ts`
  （普通模式不写字段、预览/导出共用配置、分析请求阶段）。

## T03 实现记录（2026-11-11）

- **helper 构建**：`scripts/build-libraw-helper.sh` 固定 LibRaw 0.22.3 源码
  SHA-256 `789f3c33…227e4`；`--disable-shared --disable-lcms --disable-jpeg`，
  `MACOSX_DEPLOYMENT_TARGET=11.0`，产物 `professional-tools/libraw/macos-arm64/film-raw-helper`
  + `helper.json`；动态依赖只有系统 `libz`/`libc++`/`libSystem`，minos 11.0。二进制 SHA-256
  由构建脚本写入清单，打包校验与能力探测都核对它。
- **协议**：白名单参数 `--input/--output/--metadata/--crop/--white-balance/--highlight/--max-pixels/--version`。
  输出 28 字节小端头（`FRW1` + 宽高/通道/位深/Orientation/传感器位深/dataBytes）+ RGB16 小端；
  元数据 JSON 含相机、raw/crop 尺寸、flip、EXIF 方向、black/maximum/linearMax、camMul/preMul、
  rgbCam/camXyz、缩略图数量。方向不旋转，只报告；`flip 5 → EXIF 8`。
- **Java 适配**：`util/FilmRawDecoder` 只使用 `CAMBORDER_LIBRAW_HELPER_PATH`；无 PATH 搜索；
  超时默认 60s、可配置 1–600s；`maxPixels` 默认 150M；输出头/长度/方向/位深严格校验；
  临时目录 `camborder-film-raw-*` 在 finally 递归清理；源文件 SHA-256/size/mtime 解码前后一致
  才接受；错误码 `RAW_HELPER_UNAVAILABLE/RAW_INPUT_INVALID/RAW_DECODE_TIMEOUT/RAW_DECODE_CANCELLED/RAW_DECODE_FAILED/RAW_OUTPUT_INVALID/RAW_SOURCE_CHANGED/RAW_PIXEL_LIMIT`，
  分别映射 4xx/5xx，日志有界 8KB。真实 RAW 失败不回退内嵌 JPEG。
- **能力**：Electron 仅在 macOS arm64 存在 helper 时注入路径；Java `components.libraw`
  核对 helper.json SHA-256、版本、架构与 `--version` 后为 true；`filmDigitization.available`
  在完整处理管线（T04/T05/T10/T11）完成前保持 false，避免 UI 提前启用。
- **验证**：`scripts/build-libraw-helper.sh` exit 0，helper 真实 ARW 单张 2.31s / 峰值 542MB；
  `mvn test -Dtest='FilmRawDecoderTest,FilmRawDecoderNativeTest'` 12 项通过（替身协议 + 真实 ARW）；
  全量 `mvn test` 231 项通过；`pnpm --filter electron typecheck` 与 `pnpm test:scripts` 通过。
  真实解码断言 7008×4672、Orientation 8、14-bit、black 512、maximum 16383。
- **未验收**：无内嵌 JPEG 但传感器有效的真实样片、非 Sony 机型/其他 RAW 扩展名、Windows/
  macOS x64 helper、真实负片链路保持 `NOT_RUN`；不能把替身或本机正片 ARW 当作这些证据。

## T04 实现记录（2026-11-11）

- **工作图**：新增 `FloatRgbImage`（float32、线性 Rec.2020、R/G/B 交错、保留负值/超范围）
  + `FilmColorSpace`（sRGB/Rec.2020/相机矩阵，直接矩阵运算，不经过 CMM）+
  `FilmProcessingFacts`（源位深/源色彩空间、工作数据类型/空间、处理尺寸、输出位深/空间分开）。
- **线性输入**：`FilmLinearTiffReader` 只接受显式 `transferFunction=linear` 且 `bitDepth=16`
  的无 ICC TIFF；`linear-rec2020` 直接复制、`linear-srgb` 做矩阵转 Rec.2020、
  `linear-camera-rgb` 明确拒绝（需要 T04 之外的相机矩阵上下文）；带 ICC 的线性输入当前明确
  返回 `LINEAR_INPUT_ICC_UNSUPPORTED`，留给 T11 专业路径；200M 像素上限在解码前检查。
- **照片操作**：`FloatImageOps` 实现恒等复制、+EV 线性倍率、面积平均缩小 + 双线性放大、
  0/90/180/270/任意角度旋转（任意角度双线性、越界为 0）、sRGB 8-bit 装饰层 alpha 合成到
  float 工作图。照片缩放/旋转/合成不使用 Java2D `drawImage`。
- **输出**：只在 `toBufferedImage16` 阶段做 Rec.2020→sRGB、encode、夹断和 16-bit 量化；
  `toLinearSrgb` 保留负值/超范围用于断言。输出 TIFF 仍由现有 `ImageEncoder` 写真实
  `TYPE_USHORT`，不是给 8-bit 文件贴 16-bit 标签。
- **验证**：`mvn test` 256 项通过；T04 新增 23 项。恒等逐样本精确；+1EV 对 [0,0.5] 精确 ×2；
  常量图任意缩放误差 ≤1e-6；16-bit TIFF 低有效位读取/输出不经过 8-bit（输出样本非 257 倍数）；
  2×2 旋转 90° 映射正确；透明装饰 alpha=0 不改底图；宽色域 Rec.2020 绿在转 sRGB 时保留负值，
  到输出阶段才夹断；真实 ARW → float 工作图 → 16-bit TIFF 参考输出 7008×4672，FileRead 为
  `TYPE_USHORT`（native 测试 13.9s）。
- **未验收**：带 ICC 的线性输入（T11）、真实文字/Logo 装饰层（T09/T11）、真实彩负算法（T05）、
  缩放视觉质量与性能预算（T13）、macOS x64/Windows 浮点路径。T04 尚未接入预览/导出生产入口。

## T05 实现记录（2026-11-11）

- **模型**：`FilmNegativeProcessor` 固定为通用近似（`generic-color-negative-v1`）：
  `T=image/base`（同阶段线性光）、`D=-log10(clamp(T,1e-6,1))`、
  `n=clamp((D-min)/(max-min),0,1)`、`positive=n`。高密度（暗负片）对应亮正片；
  这不是 Gold/Portra 专属还原，也不声称完整 H&D 曲线。
- **片基**：支持同图 ROI 的逐通道中位数与手工 RGB；片基值必须有限、>1e-9、≤4；
  零片基、面积为 0、非法 ROI 明确失败。T05 只支持 `linear-working` stage；
  `linear-camera-rgb` 片基与 `reference-frame` 明确返回未解析错误，留给 T12 校准解析器。
- **光源**：`camera-white-balance` 使用单位增益；`calibration` 只接受显式 `rgbGain`（0–10）。
  只有 `calibrationId`/参考帧而没有数值时明确失败，不猜测；增益只作用于画面，片基按同一
  calibrated stage 记录。
- **剪裁事实**：T≤0/近零记入 lowClip，T>1 记入 negativeDensity/highClip，D>max 记入
  highDensityClip；结果保证无 NaN/Inf，越界只按冻结的 clamp 规则处理并计数。
- **验证**：`FilmNegativeProcessorTest` 11 项通过；全量 `mvn test` 267 项通过。独立手算期望
  覆盖已知透过率/密度、逐通道片基、ROI 中位数、光源增益、零/近零、负密度、饱和参考、
  非法片基/stage/reference-frame/calibrationId。真实 Gold 200/Portra 160 负片与视觉质量
  未验收；参考帧与 camera-rgb 片基未验收；不得用本机正片 ARW 宣称胶片还原通过。
- T05 尚未接入预览/导出入口；T06 的正片调整将以该输出为输入。

## T06 实现记录（2026-11-11）

- **顺序与语义**：`FilmPositiveProcessor` 固定执行
  `曝光 → RGB 平衡 → 黑白点 → 总曲线 → R/G/B 分通道曲线 → 饱和度`。
  曝光/RGB 平衡是线性倍率；黑白点是无夹断线性映射 `(v-black)/(white-black)`；
  曲线线性插值、输入域 [0,1]、越域夹端点、端点精确；饱和度用 Rec.2020 亮度
  `0.2627/0.6780/0.0593`，灰色中性保持不变。
- **恒等与数值**：零调整逐样本恒等（含负值/超范围）；+1 EV 对 [0,0.5] 精确乘 2；
  曲线采样不反向、不过冲；参数 Jackson 序列化往返后结果逐样本一致。
- **校验**：重复/乱序 x、非单调 y、点数不在 2–17、非有限值、端点不是 (0,0)/(1,1)、
  非法插值、黑白点颠倒、曝光/RGB/饱和度越界均明确返回 `POSITIVE_INVALID_*`。
- **验证**：`FilmPositiveProcessorTest` 13 项通过；全量 `mvn test` 280 项通过。
- **未验收**：真实 Gold/Portra 视觉质量、预览/导出链路复现（T10/T11）、曲线 UI 拖动
  （T09）；本步只有引擎算法与序列化证据，不宣称界面或成品已闭环。

## T07 实现记录（2026-11-11）

- **端点**：`POST /api/image-analysis`（Controller + `ImageAnalysisService` + `FilmProcessingPipeline`）。
  请求复用 `RenderRecipe`、`stage`（`raw-linear`/`base-positive`/`current-positive`）和可选源图
  归一化 ROI；统计不含边框/文字/Logo。生产 Electron 协议新增精确路由，只允许 POST，
  未放开 `/api/**`。
- **阶段**：`FilmProcessingPipeline` 负责 `sensor-raw`（FilmRawDecoder + float camera→working）
  与 `linear-tiff`（FilmLinearTiffReader），再按阶段串行 `FilmNegativeProcessor` /
  `FilmPositiveProcessor`。`sourceGeometry` 属于编辑几何，分析阶段不应用；ROI 始终是
  已应用 EXIF、未应用编辑裁切的完整源图坐标。
- **响应**：256 桶 R/G/B/luma 直方图、underflow/overflow、区域像素数/均值/最小/最大、
  低/高剪裁计数、`recipeSignature`（有效处理配置 SHA-256，含 stage）、`sourceVersion`
  （RAW 为 sha256/size/mtime，线性 TIFF 同格式）、实际分析尺寸和 `full`/`stride:N` 采样方式。
  剪裁事实分 `sensor`/`working`/`output`：sensor 来自 raw 的 linearMax/maximum，working 来自
  分析区域，output 在 T11 前明确 unavailable。
- **测试**：`FilmProcessingPipelineTest` 4 项、`DefaultImageAnalysisServiceTest` 5 项、
  `ImageAnalysisControllerTest` 4 项、前端 `imageAnalysisApi.test.ts` 3 项、Electron 协议路由；
  全量 `mvn test` 293 项、frontend 624 项、electron 148 项通过。真实 ARW 的 sensor clipping
  native 测试读取实际 linearMax 事实并通过。
- **未验收**：前端取样框逆变换/旋转裁切映射（T09/T10）、过期响应取消与缓存（T10）、
  输出阶段剪裁事实（T11）、真实负片 ROI 取样视觉质量；分析接口尚未被 UI 消费。

## T08 实现记录（2026-11-11）

- **每图状态**：`QueueItem.imageProcessing` 保存该图完整的 `ImageProcessingConfig`（含
  sourceGeometry 裁切/校平）；缺省/null 为普通模式。它和 `presetId`/`identityOverride`
  分离，摄影预设不会隐式开底片处理。
- **迁移**：旧会话缺少字段迁移为 null；损坏/未知 schema/算法/输入模式写入
  `imageProcessingError` 并关闭处理，不静默恢复成“已调好”的图。损坏条目本身仍保留，
  用户可删除或重新定位。
- **历史/恢复**：每图配置进入现有队列快照历史，`setActiveImageProcessing` 支持
  `historyTag` 合并连续手势（一次曲线拖动一条撤销）；撤销/重做/刷新恢复均由队列快照
  与 localStorage 现有机制完成，没有新增 sidecar/DB。写入深复制，外部修改不会污染队列。
- **重定位**：`relocateItem` 保留每图编辑配置，但把 `sourceVersion` 置空，强制 T10
  重新校验源指纹并失效旧缓存/取样；不会把旧片基/缓存静默套到新文件。
- **测试**：`useQueue.test.tsx` 新增 7 项（隔离/撤销合并/深复制/刷新恢复/旧迁移/坏配置/
  存储失败）；frontend 全量 631 项通过，typecheck 通过。QueuePanel mock 已同步新控制器字段。
- **未验收**：UI 面板与源码裁切/校平交互（T09）、源指纹获取与缓存失效（T10）、
  共享校准复制/批量同步（T12）、真实损坏会话的浏览器手工验收。

## T09 实现记录（2026-11-11）

- **入口**：工作台右侧新增「底片」页签（`FilmEditingPanel`），不挤入拍摄身份字段；
  仅当文件是真实 RAW 或线性 TIFF 且 `filmDigitization.available=true` 时可开启。
  当前 T03/T10 尚未把完整管线能力置为 available，实际发布前面板会禁用并显示原因，
  不能把未贯通流程暴露成可用。
- **控件**：显式开启/关闭；输入模式由文件类型决定；光源（相机白平衡/校准增益）、
  片基（同图 ROI/手工 RGB，参考帧留 T12）、密度范围、曝光/RGB 平衡/黑白点/饱和度、
  总曲线与 R/G/B 分通道曲线、源图裁切与校平。所有控件写入 `ImageProcessingConfig`，
  未在前端重新实现算法；零调整保持恒等。
- **曲线**：`CurveEditor` 端点固定、中间点拖动，x 严格递增、y 单调不减；拖动共享
  historyTag，队列历史合并为一次撤销。数值输入均有 min/max/step。
- **交互边界**：预览中的取样框拖动、旋转/缩放后的坐标映射、切图时旧工具态清理属于
  T10；本轮只提供源图归一化 ROI 数值编辑和明确说明，不显示假直方图/假取样框。
- **验证**：`FilmEditingPanel.test.tsx` 6 项、`CurveEditor.test.tsx` 2 项；frontend 全量
  69 文件 / 639 项通过，typecheck 通过；WorkspacePage 页签断言更新为 4 个。
- **未验收**：能力开启后的真实 UI 手动走查、窄窗口视觉、键盘逐点调整、取样框拖动、
  切图工具状态（T10）、真实 Gold/Portra 视觉质量。

## T10 实现记录（2026-11-11）

- **权威预览**：`usePreview` 接受每图 `imageProcessing`；底片模式下不加载普通源图、
  不降级本地 nativeImage，只显示引擎 `engineDisplayUrl`；未同步/失败分别显示明确状态。
  `PreviewPanel` 新增 filmMode 分支，Canvas 不参与底片结果展示。
- **缓存**：引擎预览缓存键使用完整 `RenderRecipe`（含 imageProcessing）哈希 + 源文件
  mtime/size；替换文件或修改配方自然失效。预览存储仍是预览级尺寸，不持有原图 float。
- **后端**：`LocalPreviewServiceImpl` 用 `FilmProcessingPipeline` 生成 current-positive，
  `Java2DImageRenderService.composeProcessed` 只做版式装饰；`PreviewController` 允许
  film 配置（不再 501），普通模式路径不变。
- **验证**：`usePreview.film.test.ts` 2 项（只展示引擎结果/失败不降级普通图）；
  `PreviewControllerTest` 线性 TIFF film 预览 200；frontend 70 文件/641 项、mvn 294 项通过。
- **未验收**：三种对比图（负片/基础转正/当前结果）独立展示、队列缩略图、裸图预览、
  100% 底片视图、旋转/裁切取样框映射和拖动请求合并度量；这些仍按普通源图/代理语义，
  不能宣称已闭环。

## T11 实现记录（2026-11-11）

- **输出组合**：`FilmExportService` 实现 `srgb-jpeg`、`tiff16-srgb`、`tiff16-rec2020`；
  `borderlessMaster=true` 直接写浮点处理图，不带框；带框走 `composeProcessed`。
  宽色域带框母版明确拒绝，留给 T13 的装饰浮点合成。
- **编码/ICC**：`ImageEncoder.writeFilmTiff` 真实 16-bit TIFF + 指定 ICC；
  `writeFilmJpeg` 8-bit JPEG + ICC；`ImageMetadataPayload.iccOnly` 提供 payload。
- **链路**：`DefaultRenderJobService` 对 imageProcessing 项调用 FilmExportService；
  `RenderJobController`/`DefaultExportPreflightService` 校验 filmOutput/format，预检不读
  内嵌 JPEG 冒充底片源；前端导出设置写 filmOutput/borderlessMaster，输出页签提供显式选择。
- **验证**：`FilmExportServiceTest` 5 项；frontend typecheck/test 通过；mvn 299 项通过。
  实测 borderless JPEG/TIFF 的格式、位深、ICC 与尺寸（无边框）；Rec.2020 TIFF 在本机
  profile 上通过；带框 sRGB TIFF 尺寸增加。
- **未验收**：带框 16-bit/宽色域母版的 Java2D 装饰量化边界、独立 ExifTool/sips 对安装包
  输出的位深/ICC 复核（T13）、真实 RAW 批量导出；宽色域带框母版不支持。

## T12 实现记录（2026-11-11）

- **选择性同步**：`useQueue.syncImageProcessing(scope, source, fields)` 支持
  `lightSource`/`filmBase`/`density`/`positive`/`curves`/`sourceGeometry` 六组独立选择，
  范围复用 active/checked/all；一次调用只产生一条队列撤销历史，所有目标独立 JSON 深复制。
- **覆盖规则**：目标已有配置时只替换选中组，未选中组保留逐图覆盖；目标没有配置时以源配置
  为骨架。损坏配置（`imageProcessingError` 非空）条目跳过，不因批量同步被“修好”或污染其他图。
- **校准引用**：显式复制 `calibrationId/version`、参考帧路径/指纹与光源增益；T12 不解析
  calibrationId/同卷参考帧，后端 T05 仍会明确拒绝未解析引用，UI 提示不会自动解析。
- **冻结隔离**：`useExportController.freezeQueueItem` 深复制每图 `imageProcessing`；导出
  提交后同步/编辑共享配置不会改变已冻结任务。
- **验证**：`useQueue.test.tsx` 新增 2 项（选择性同步 + 一次撤销、源深复制）；frontend
  全量测试通过。不同设备/空间配置的自动换算、真实参考帧解析仍 NOT_RUN。
- **未验收**：跨设备/工作空间校准换算、真实同卷参考帧、共享校准持久化 ID 解析（T12 只
  携带引用）；导出冻结的端到端 UI 证据由 T11 导出链路补足。

## T13 实现记录（2026-11-11，安装后验收 BLOCKED）

- **打包**：`ARCH=arm64 bash scripts/package-app.sh` 成功；`electron/release/macos-arm64` 产出
  DMG、blockmap、manifest 和 SHA-256。bundle 与安装包 App 内均包含
  `professional-tools/libraw/macos-arm64/film-raw-helper` + `helper.json`；`file` 为
  Mach-O arm64，helper `--version` 为 `film-raw-helper 1.0.0 libraw 0.22.3-Release`。
- **校验**：`validate-package.mjs` 对 macOS arm64 校验 helper 存在、Mach-O arm64、清单版本与
  二进制 SHA-256；`pnpm test:scripts` 通过；`scripts/smoke-test.sh` 对安装包 App 启动和
  `/api/health` 冒烟通过。
- **文档**：`docs/support-matrix.md` 增加 LibRaw helper 与底片模式边界；`docs/release-checklist.md`
  增加安装包 helper 校验项；README/java-engine/electron/cookbook 已登记构建与限制。
- **BLOCKED 原因（外部依赖，不是代码未实现）**：没有真实 Gold 200/Portra 160 彩负、片边/片基、
  光源/色卡和同卷参考成片；没有干净的 macOS arm64 离线机器做安装/卸载/真实摄影流程。对应
  真实 RAW/负片/安装后 E2E 证据保持 `NOT_RUN`；Windows/macOS x64 helper 也未构建。
- **不得外推**：本机 Sony 正片 ARW、合成 TIFF、替身 helper、DMG 冒烟不能替代真实负片和干净
  机器验收；当前只能宣称“源码/合成测试/本机打包冒烟通过”，不能宣称正式发布支持。



## 后果

- 普通模式与底片模式共享同一 `RenderRecipe` 和预览/导出链路，但处理字段完全可选，旧请求无需迁移。
- 新增原生 helper、随包资源清单和打包校验；组件不可用时能力探测返回不可用，而不是在运行时下载或回退系统工具。
- 新增 `frontend/src/features/editing/` 与队列每图编辑数据；旧会话缺字段时迁移为关闭处理，不静默恢复成「看似已调好」的图。
- 新增分析接口与 Electron 精确白名单路由；禁止放开整个 `/api/**`。
- 真实胶片还原、Gold/Portra 专属配置和性能验收在证据不足时保持 `NOT_RUN`；不会因合成测试或 UI 存在而宣称正式支持。

## 替代方案

- 直接扩展内嵌 JPEG 路径模拟负片转正：没有传感器线性数据，无法做可复核的片基/密度处理，否决。
- 在 8-bit Canvas 或 Java2D `getRGB/setRGB` 上做曲线和色彩调整：精度不足且不可验证，否决。
- 预览与导出各维护一套处理配置：违背单一 RenderRecipe 与四条链路同源不变量，否决。
- 按胶片名称直接套厂商密度曲线或固定 LUT：缺少相机/光源/片基证据，会伪造「专业还原」，否决。
- 第一版直接上 JNI 或 Node 原生插件：同时引入多个原生边界，超出本轮验证能力；先评估受控 helper，T01 不通过再重新决策。

## 待验证事项

- T01：已完成首次真实 RAW/精度探针（见上节）；真实负片、其他相机/格式、损坏输入与取消路径仍未验收。T04 需复验 float32 工作空间和装饰层合成。
- T02：`imageProcessing` 完整字段、枚举、范围、默认值、版本、阶段、错误码与共享 JSON 用例。
- T03：受控 helper 的进程协议、超时、取消、输出上限、临时文件清理、能力探测与错误分类；重点验证 native-endian 输出、inset crop、flip 只应用一次和无内嵌 JPEG 失败不回落。
- T05：真实负片/片基/光源参考到位后的数值标定与视觉对照；缺失时只保留通用彩负配置并标注未验收。


## 实施复核修订

当前行为和未完成项见 [底片实施复核](../film-digitization-review.md)，早期各任务的 DONE 记录保留为历史，不能替代任务书第 10 节的最新状态。

- RenderJobSnapshot 增加可选 `sourceVersion`，表示内容 SHA-256、大小和修改时间构成的源版本。前端存在已知版本时传入；引擎接受底片任务时计算并冻结版本，执行前及实际解码后核对，不匹配返回 `FILM_SOURCE_CHANGED`。普通模式不增加文件读取。
- 源图几何仍属于同一 imageProcessing 配方；分析保持完整有向源图，预览及导出共享浮点裁切/校平。RAW方向在进入分析/负片处理前物理应用一次。
- 当前 `tiff16-rec2020` 使用内置确定性线性 Rec.2020 ICC（D65 基色经 Bradford 适配至 D50，TRC=1），与实际线性像素一致；不依赖系统 profile。照片、源几何、画幅放置与装饰通过 `FilmCompositor` 浮点合成，带框16-bit不再经过照片 Java2D 量化路径。输出经过实际编码、受控 ExifTool 元数据策略及回读核验。
- `PreviewRequest` 外围新增可选 `stage`、`sourceCoordinates`、`actualPixels`（与非零预览上限互斥），分别选择处理阶段、完整有向源坐标取样和自然尺寸检查；不在 RenderRecipe 复制处理字段。预览/分析外围 `clientId`、`generation` 用于有界调度与代次淘汰；无这些字段的旧请求保持兼容。
- 分析外围 `outputSpace` 可选 sRGB 或 linear-rec2020，返回目标空间边界计数；新增 `resolvedFilmBase`、`resolvedLightGain`、`calibrationSpaceKey`，供保存展开后的校准数值。校准键包括输入空间，RAW 另包括机型/白平衡增益/矩阵。绑定校准不能跨空间盲套。
- 同卷参考帧实际读取并核对 SHA-256；持久化校准由前端应用时展开数值并携带 ID/版本。无需引入隐式后端校准数据库；只给 ID 却缺失数值/参考的请求仍明确失败。
- `FidelityReport.outputClipping` 返回实际合成图量化前的目标空间边界计数；预检只填预计输出且 verified=false，最终输出报告保留真实位深、工作类型、算法/源/配方版本。
- 传感器域剪裁统计当前 `available=false`。已去马赛克/白平衡RGB的阈值计数不能等同于传感器原始统计；工作图统计单独返回。
