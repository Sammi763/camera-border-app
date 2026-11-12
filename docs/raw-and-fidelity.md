# RAW 与专业保真说明

## RAW 的明确边界（普通模式）

普通模式（`RenderRecipe.imageProcessing` 缺省或为 `null`）只抽取并使用 RAW 文件中可读取的
内嵌 JPEG 预览。它不读取传感器数据，不去马赛克，不执行曝光、白平衡、降噪或真实 RAW 显影，
也不启动 LibRaw 或其它外部显影程序。

成功的 RAW 报告必须同时包含：

- `sourceDecode=embedded-jpeg-preview`（或等价的中文说明）；
- 实际抽取 JPEG 的宽度和高度；
- 输出文件实际尺寸、格式和位深。

没有内嵌 JPEG 或抽取失败时，导入/预览/导出必须失败；不能用传感器尺寸、应用缩略图或
“完整保真”字样补齐报告。

## 底片数字化模式（显式模式）

底片数字化是独立的显式模式，只有用户主动开启并且 `imageProcessing` 明确表达传感器 RAW
输入时才读取真实传感器数据；范围、样片和验收见
[ADR-0007](adr/0007-explicit-film-digitization-mode.md) 与
[执行方案](opencode-film-digitization-plan.md)。规则：

- 真实 RAW 失败（损坏、机型不支持、组件缺失、超时、非零退出、非法输出）必须明确失败，
  不得自动回退到内嵌 JPEG，也不得用缩略图冒充传感器像素。
- 普通模式的 RAW 内嵌 JPEG 语义、旧请求、旧模板和固定导出档位不因该模式改变；两种模式的
  来源事实必须分开报告。
- 工作空间、原生 helper、路径和精度门槛在对应任务验证通过前不得写入支持矩阵；缺少真实
  负片/片基/光源样片时对应验收保持 `NOT_RUN`。

## ICC 与色彩

普通模式先读取源 ICC，再把像素转换到目标色彩空间，最后嵌入目标 ICC。只复制 profile 而不转换
像素不算完成。无 ICC 源按 sRGB 处理，并在报告中写明 `sRGB-assumed`。

JPEG 输出固定 8-bit。PNG/TIFF 的 8/16-bit 必须由独立工具读取实际文件确认；8-bit 来源不能
报告为有效 16-bit。预览响应和导出响应都应报告实际使用的 ICC，而不是仅报告用户选择。
底片模式的线性宽色域浮点工作空间与 16-bit TIFF 母版要求超出普通模式的固定档位，必须按
ADR-0007 单独验收，不能套用普通模式的“源 ICC 保留”口径。

## 元数据

受控 ExifTool 服务负责复制 EXIF、XMP、IPTC、GPS、ICC 和 DPI，并在写回后更新 Width、Height、
Orientation、BitDepth、ColorSpace 等标签，同时不保留指向旧尺寸的缩略图。

- 快速分享：移除 GPS 与位置字段。
- 标准交付、高保真归档：保留 GPS、EXIF、XMP、IPTC、ICC 和 DPI（源文件实际存在时）。
- 外部进程超时、退出码非零、输出无效或独立读取失败：导出失败，不返回 `completed`，不返回
  `SKIPPED`，并清理临时文件。

## 验收方法

验收必须从输出文件读取事实：使用独立 ExifTool 检查 Width/Height、Orientation、BitDepth、
ColorSpace、EXIF/XMP/IPTC/GPS/ICC/DPI；再用独立图像工具确认 PNG/TIFF 的位深。应用自己的
`FidelityReport` 只能作为交叉信息，不能替代独立读取。

颜色样片应覆盖 sRGB、Adobe RGB 和无 ICC；颜色转换目标为 ΔE00 P95 ≤ 1，JPEG 质量 95 目标为
ΔE00 P95 ≤ 2。普通模式的 RAW 比较基准只能是抽取出的内嵌 JPEG，不能与传感器 RAW 做虚假
比较；底片模式的传感器 RAW、负片还原和色差门槛按 ADR-0007 单独定义，不能借用本段的成品
色差门槛。


底片模式按显式 RAW/线性 TIFF 输入定义进入 float32 线性 Rec.2020，不能套用普通模式“无 ICC 按 sRGB”假设。宽色域输出为线性编码加 TRC=1 的匹配 ICC；sRGB 输出执行实际矩阵及传递函数转换。照片与独立装饰层浮点合成后再量化一次，元数据复用受控写回/回读。预检结果仅为预计，完成报告才是输出文件事实；实现与验收入口见 [底片复核记录](film-digitization-review.md)。
