# 测试样片矩阵

本文件是阶段 0 的样片验收基线，定义每种输入格式、位深、ICC 和元数据组合在三个固定
导出档位下的预期结果。样片文件可以分批补齐，但在对应样片通过前，不得把该组合写成
“正式支持”。产品契约的唯一权威是 [docs/prd.md §0](prd.md)。

## 1. 统一约定

- `完整元数据` 至少包含 EXIF、XMP、IPTC 和 GPS/位置；`无元数据` 表示这些字段均不存在。
- `有 ICC` 的样片至少准备 sRGB 和 Adobe RGB 两种 profile；`无 ICC` 的样片按 sRGB 处理，报告必须标记 `sRGB-assumed`，输出中的 sRGB 只表示工作色彩，不得冒充源图原有 profile。
- 位深组合按格式能力覆盖：JPEG 和 RAW 的内嵌 JPEG 使用 8-bit；PNG、TIFF 各覆盖 8-bit 与 16-bit；HEIC/HEIF 当前以 8-bit 样片验收。遇到其他输入位深时，必须先扩展契约，不能静默转换后宣称“源位深保留”。
- RAW 的位深和像素只取内嵌 JPEG 预览；RAW 传感器数据不参与解码，不能用 RAW 原始位深替代内嵌 JPEG 位深。
- 下表的“快速分享”固定为 JPEG 8-bit、质量 92、长边 2048、sRGB，并移除 GPS/位置。
- 下表的“标准交付”固定为 JPEG 8-bit、质量 95、原图尺寸，并保留源 ICC 和全部元数据（含 GPS/位置）。
- 下表的“高保真归档”固定为 TIFF、原图尺寸、源位深、源 ICC 和全部元数据（含 GPS/位置）。
- 源图没有 ICC 时，标准交付和高保真归档按 sRGB 处理并写入实际输出，报告说明 `sRGB-assumed`；源图没有 EXIF/XMP/IPTC/GPS 等元数据时不得伪造该类源数据，并在结果中说明。
- 源图小于 2048 像素时，快速分享不得放大；其他两档保持原图尺寸。
- 所有档位都必须写入新路径，不覆盖原图；版式渲染内容不属于本矩阵的元数据断言。

## 2. RAW 扩展名与样片范围

RAW 的最终验收扩展名冻结为九种：NEF、CR2、CR3、ARW、RAF、DNG、ORF、RW2、PEF。每种
扩展名必须各有一份真实相机样片：一份可读取内嵌 JPEG，另一份明确没有内嵌 JPEG。下表是
固定文件名和验收状态；`NOT_RUN` 表示二进制样片尚未放入仓库，不表示格式已通过。

| 扩展名 | 带内嵌 JPEG 样片 | 无内嵌 JPEG 样片 | 当前状态 |
|---|---|---|---|
| `.nef` | `raw-nef-embedded-jpeg.nef` | `raw-nef-no-embedded-jpeg.nef` | NOT_RUN |
| `.cr2` | `raw-cr2-embedded-jpeg.cr2` | `raw-cr2-no-embedded-jpeg.cr2` | NOT_RUN |
| `.cr3` | `raw-cr3-embedded-jpeg.cr3` | `raw-cr3-no-embedded-jpeg.cr3` | NOT_RUN |
| `.arw` | `raw-arw-embedded-jpeg.arw` | `raw-arw-no-embedded-jpeg.arw` | NOT_RUN |
| `.raf` | `raw-raf-embedded-jpeg.raf` | `raw-raf-no-embedded-jpeg.raf` | NOT_RUN |
| `.dng` | `raw-dng-embedded-jpeg.dng` | `raw-dng-no-embedded-jpeg.dng` | NOT_RUN |
| `.orf` | `raw-orf-embedded-jpeg.orf` | `raw-orf-no-embedded-jpeg.orf` | NOT_RUN |
| `.rw2` | `raw-rw2-embedded-jpeg.rw2` | `raw-rw2-no-embedded-jpeg.rw2` | NOT_RUN |
| `.pef` | `raw-pef-embedded-jpeg.pef` | `raw-pef-no-embedded-jpeg.pef` | NOT_RUN |

每一行都必须执行“导入 → 预览 → 单图导出 → 批量导出”验证。下方矩阵的 R8-SRGB-FULL
和 R-FAIL 是上述九种扩展名的共同预期结果模板；验收记录必须把模板分别实例化到每个
固定文件名，不得用一个扩展名推断其他扩展名。

## 3. 最小样片矩阵

建议文件名是稳定的测试 ID，不要求与相机原始文件名一致。`完整` 样片必须含 GPS/位置，
这样可以同时验证快速分享的移除和另外两档的保留。

| ID / 建议文件名 | 输入格式 | 输入位深 | 源 ICC | 源元数据 | 快速分享预期 | 标准交付预期 | 高保真归档预期 |
|---|---|---:|---|---|---|---|---|
| J8-SRGB-FULL / `jpeg-8-srgb-full.jpg` | JPEG | 8-bit | sRGB | 完整 | JPEG 8-bit / 92 / 长边 2048 / sRGB；移除 GPS/位置 | JPEG 8-bit / 95 / 原图尺寸；sRGB + 全部元数据，GPS/位置保留 | TIFF 8-bit / 原图尺寸；sRGB + 全部元数据，GPS/位置保留 |
| J8-ADOBE-FULL / `jpeg-8-adobe-rgb-full.jpg` | JPEG | 8-bit | Adobe RGB | 完整 | JPEG 8-bit / 92 / 长边 2048；转换为 sRGB，移除 GPS/位置 | JPEG 8-bit / 95 / 原图尺寸；Adobe RGB + 全部元数据，GPS/位置保留 | TIFF 8-bit / 原图尺寸；Adobe RGB + 全部元数据，GPS/位置保留 |
| J8-NONE-NONE / `jpeg-8-no-icc-no-metadata.jpg` | JPEG | 8-bit | 无 | 无 | JPEG 8-bit / 92 / 长边 2048 / sRGB；移除 GPS/位置 | JPEG 8-bit / 95 / 原图尺寸；sRGB-assumed；源无元数据 | TIFF 8-bit / 原图尺寸；sRGB-assumed；源无元数据 |
| P8-SRGB-FULL / `png-8-srgb-full.png` | PNG | 8-bit | sRGB | 完整 | PNG 输入成功；JPEG 8-bit / 92 / 长边 2048 / sRGB；移除 GPS/位置 | JPEG 8-bit / 95 / 原图尺寸；sRGB + 全部元数据，GPS/位置保留 | TIFF 8-bit / 原图尺寸；sRGB + 全部元数据，GPS/位置保留 |
| P8-NONE-NONE / `png-8-no-icc-no-metadata.png` | PNG | 8-bit | 无 | 无 | PNG 输入成功；JPEG 8-bit / 92 / 长边 2048 / sRGB；移除 GPS/位置 | JPEG 8-bit / 95 / 原图尺寸；sRGB-assumed；源无元数据 | TIFF 8-bit / 原图尺寸；sRGB-assumed；源无元数据 |
| P16-SRGB-FULL / `png-16-srgb-full.png` | PNG | 16-bit | sRGB | 完整 | JPEG 8-bit / 92 / 长边 2048 / sRGB；明确发生 16→8-bit，移除 GPS/位置 | JPEG 8-bit / 95 / 原图尺寸；明确为 16→8-bit；sRGB + 全部元数据，GPS/位置保留 | TIFF 16-bit / 原图尺寸；sRGB + 全部元数据，GPS/位置保留 |
| P16-NONE-NONE / `png-16-no-icc-no-metadata.png` | PNG | 16-bit | 无 | 无 | JPEG 8-bit / 92 / 长边 2048 / sRGB；明确发生 16→8-bit，移除 GPS/位置 | JPEG 8-bit / 95 / 原图尺寸；明确为 16→8-bit；sRGB-assumed；源无元数据 | TIFF 16-bit / 原图尺寸；sRGB-assumed；源无元数据 |
| T8-SRGB-FULL / `tiff-8-srgb-full.tif` | TIFF | 8-bit | sRGB | 完整 | JPEG 8-bit / 92 / 长边 2048 / sRGB；移除 GPS/位置 | JPEG 8-bit / 95 / 原图尺寸；sRGB + 全部元数据，GPS/位置保留 | TIFF 8-bit / 原图尺寸；sRGB + 全部元数据，GPS/位置保留 |
| T8-NONE-NONE / `tiff-8-no-icc-no-metadata.tif` | TIFF | 8-bit | 无 | 无 | JPEG 8-bit / 92 / 长边 2048 / sRGB；移除 GPS/位置 | JPEG 8-bit / 95 / 原图尺寸；sRGB-assumed；源无元数据 | TIFF 8-bit / 原图尺寸；sRGB-assumed；源无元数据 |
| T16-ADOBE-FULL / `tiff-16-adobe-rgb-full.tif` | TIFF | 16-bit | Adobe RGB | 完整 | JPEG 8-bit / 92 / 长边 2048；转换为 sRGB，并明确 16→8-bit；移除 GPS/位置 | JPEG 8-bit / 95 / 原图尺寸；Adobe RGB + 全部元数据，明确 16→8-bit，GPS/位置保留 | TIFF 16-bit / 原图尺寸；Adobe RGB + 全部元数据，GPS/位置保留 |
| T16-NONE-NONE / `tiff-16-no-icc-no-metadata.tif` | TIFF | 16-bit | 无 | 无 | JPEG 8-bit / 92 / 长边 2048 / sRGB；明确 16→8-bit，移除 GPS/位置 | JPEG 8-bit / 95 / 原图尺寸；明确 16→8-bit；sRGB-assumed；源无元数据 | TIFF 16-bit / 原图尺寸；sRGB-assumed；源无元数据 |
| H8-SRGB-FULL / `heic-8-srgb-full.heic` | HEIC | 8-bit | sRGB | 完整 | 输入成功；JPEG 8-bit / 92 / 长边 2048 / sRGB；移除 GPS/位置 | JPEG 8-bit / 95 / 原图尺寸；sRGB + 全部元数据，GPS/位置保留 | TIFF 8-bit / 原图尺寸；sRGB + 全部元数据，GPS/位置保留 |
| H8-NONE-NONE / `heic-8-no-icc-no-metadata.heic` | HEIC | 8-bit | 无 | 无 | 输入成功；JPEG 8-bit / 92 / 长边 2048 / sRGB；移除 GPS/位置 | JPEG 8-bit / 95 / 原图尺寸；sRGB-assumed；源无元数据 | TIFF 8-bit / 原图尺寸；sRGB-assumed；源无元数据 |
| F8-SRGB-FULL / `heif-8-srgb-full.heif` | HEIF | 8-bit | sRGB | 完整 | 输入成功；JPEG 8-bit / 92 / 长边 2048 / sRGB；移除 GPS/位置 | JPEG 8-bit / 95 / 原图尺寸；sRGB + 全部元数据，GPS/位置保留 | TIFF 8-bit / 原图尺寸；sRGB + 全部元数据，GPS/位置保留 |
| F8-NONE-NONE / `heif-8-no-icc-no-metadata.heif` | HEIF | 8-bit | 无 | 无 | 输入成功；JPEG 8-bit / 92 / 长边 2048 / sRGB；移除 GPS/位置 | JPEG 8-bit / 95 / 原图尺寸；sRGB-assumed；源无元数据 | TIFF 8-bit / 原图尺寸；sRGB-assumed；源无元数据 |
| R8-SRGB-FULL / `raw-nef-embedded-jpeg.nef` | RAW（NEF，内嵌 JPEG） | 内嵌 JPEG 8-bit | 内嵌 JPEG 的 sRGB | 可读取的完整元数据 | 按内嵌 JPEG 处理；JPEG 8-bit / 92 / 长边 2048 / sRGB；移除 GPS/位置 | 按内嵌 JPEG 处理；JPEG 8-bit / 95 / 原图尺寸；源 ICC + 全部可读取元数据，GPS/位置保留 | 按内嵌 JPEG 处理；TIFF 8-bit / 原图尺寸；源 ICC + 全部可读取元数据，GPS/位置保留 |
| R-FAIL / `raw-nef-no-embedded-jpeg.nef` | RAW（NEF，无内嵌 JPEG） | 不适用 | 不适用 | 不适用 | 导入/预览明确失败，不导出 | 导入/预览明确失败，不导出 | 导入/预览明确失败，不导出 |

NEF 是矩阵中的代表性 RAW 行；CR2、CR3、ARW、RAF、DNG、ORF、RW2、PEF 必须按照第 2 节
的固定文件名复制这两条预期结果，并分别记录实际内嵌 JPEG 状态。

## 4. PNG 输出能力

PNG 8-bit/16-bit 是必须提供的格式级能力，不是第四个导出档位。导出界面必须先选择一个
固定档位，再在该档位允许的输出格式中选择 JPEG、PNG 或 TIFF；不允许创建独立的“PNG
档位”或其他自定义档位。

| 固定档位 | 规范默认格式 | 必须提供的 PNG 变体 | PNG 变体预期 |
|---|---|---|---|
| 快速分享 | JPEG 8-bit / 质量 92 | PNG 8-bit | 长边 2048、sRGB、移除 GPS/位置 |
| 标准交付 | JPEG 8-bit / 质量 95 | PNG 8-bit | 原图尺寸、源 ICC、全部可表达元数据、保留 GPS/位置 |
| 高保真归档 | TIFF / 源位深 | PNG 8/16-bit（按源位深） | 原图尺寸、源 ICC、全部可表达元数据、保留 GPS/位置 |

PNG 变体不使用 JPEG 质量参数；目标容器无法承载的源元数据必须明确标记不支持或使导出
失败，不能静默声称“全部元数据”已保留。

## 5. Stage 4 已纳入的真实样片

Stage 4 的 macOS arm64 验收固定使用 [fixtures/stage4/README.md](../fixtures/stage4/README.md) 中列出的真实 JPEG、真实 TIFF 和原始 HEIC/HEIF。清单记录了来源、许可/使用权限、SHA-256、关键 EXIF、方向和 ICC 字节数；`geometry-golden.json` 与非对称方向图同时供 Canvas 测试和 Java 测试读取。未列入清单的个人照片仍只属于本机开发数据，不作为发布证据。

## 6. 其他样片状态

当前仓库已有若干 JPEG 和 TIFF 开发样片，但其 ICC、XMP、IPTC、GPS 和实际位深尚未由本
矩阵逐项核验。它们只能用于现有开发流程冒烟，不能替代上表的命名样片。HEIC、HEIF、RAW
正向/失败样片以及有/无 ICC、16-bit、完整/无元数据组合均标记为待补齐或待核验，直到有
明确的文件和验收记录。

## 7. 验收记录

每个平台、每个样片、每个导出档位单独记录，至少包含：平台架构、样片 ID、源格式/位深/
ICC/元数据、输出格式/位深/尺寸/ICC/元数据、GPS/位置结果、是否覆盖原图、证据路径和
失败原因。记录状态只允许使用 `PASS`、`FAIL`、`NOT_RUN`；`NOT_RUN` 不得统计为正式支持。
