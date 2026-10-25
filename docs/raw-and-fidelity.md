# RAW 与专业保真说明

## RAW 的明确边界

产品只抽取并使用 RAW 文件中可读取的内嵌 JPEG 预览。它不读取传感器数据，不去马赛克，
不执行曝光、白平衡、降噪或真实 RAW 显影，也不启动 LibRaw 或其它外部显影程序。

成功的 RAW 报告必须同时包含：

- `sourceDecode=embedded-jpeg-preview`（或等价的中文说明）；
- 实际抽取 JPEG 的宽度和高度；
- 输出文件实际尺寸、格式和位深。

没有内嵌 JPEG 或抽取失败时，导入/预览/导出必须失败；不能用传感器尺寸、应用缩略图或
“完整保真”字样补齐报告。

## ICC 与色彩

引擎先读取源 ICC，再把像素转换到目标色彩空间，最后嵌入目标 ICC。只复制 profile 而不转换
像素不算完成。无 ICC 源按 sRGB 处理，并在报告中写明 `sRGB-assumed`。

JPEG 输出固定 8-bit。PNG/TIFF 的 8/16-bit 必须由独立工具读取实际文件确认；8-bit 来源不能
报告为有效 16-bit。预览响应和导出响应都应报告实际使用的 ICC，而不是仅报告用户选择。

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
ΔE00 P95 ≤ 2。RAW 的比较基准只能是抽取出的内嵌 JPEG，不能与传感器 RAW 做虚假比较。
