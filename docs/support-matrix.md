# 支持矩阵（阶段 0 发布范围版）

本文规定产品承诺的边界。实现状态、安装包哈希和安装后证据以
[发布验收清单](release-checklist.md) 与 `electron/release/release-report.json` 为准；没有安装包证据的
平台不能标记为已发布。正式目标与候选目标的机器可读定义见
[`docs/release-scope.json`](release-scope.json)；候选证据不会成为正式发布 blocker。

## 平台与随包依赖

| 目标 | 角色 / 发行形式 | 必须随包提供 | 系统不需要预装 | 当前证据边界 |
|---|---|---|---|---|
| macOS arm64 | `FORMAL`；DMG / 已安装 `.app` | arm64 JRE、Java Engine、ExifTool、HEIC 助手、字体、许可证 | Java、ExifTool、HEIC 扩展、Node.js、pnpm、Python | 原生证据是正式发布阻塞项 |
| macOS x64 | `CANDIDATE`；DMG / 已安装 `.app` | x64 JRE、Java Engine、ExifTool、HEIC 助手、字体、许可证 | 同上 | 可选候选证据，不阻塞正式发布 |
| Windows x64 | `CANDIDATE`；NSIS `.exe` / 已安装目录 | x64 JRE、Java Engine、ExifTool、HEIC 助手、字体、许可证 | 同上 | `SIMULATED`；不写成平台验收 `PASS` |

签名、公证和自动更新不属于本阶段发布清单。Linux、Windows ARM64 和移动端不属于发行目标。

## 输入格式

| 输入 | 预览 | 导出来源 | 说明 |
|---|---|---|---|
| JPEG | 支持 | JPEG 像素 | 按源 ICC/元数据策略处理 |
| PNG | 支持 | PNG 像素 | 用实际文件位深决定 8/16-bit 能力 |
| TIFF | 支持 | TIFF 像素 | 需用独立工具确认实际 8/16-bit |
| HEIC/HEIF | 支持 | 随包解码助手产生的像素 | 不依赖系统扩展；助手缺失时能力为 false |
| RAW（NEF、CR2、CR3、ARW、RAF、DNG、ORF、RW2、PEF） | 仅内嵌 JPEG | 抽取出的内嵌 JPEG | 不读取传感器 RAW，不去马赛克，不做真实显影 |

无可读取内嵌 JPEG 的 RAW 必须明确失败。应用、报告和帮助不能把该路径描述为完整 RAW 显影。

## 输出与导出档位

| 档位 | 默认格式 | 尺寸 | 位深 | 色彩 | 元数据 |
|---|---|---|---|---|---|
| 快速分享 | JPEG | 长边 2048，不放大 | 8-bit | sRGB | 移除 GPS/位置 |
| 标准交付 | JPEG | 原图尺寸 | 8-bit | 源 ICC；无 ICC 按 sRGB | 保留 EXIF/XMP/IPTC/GPS/ICC/DPI |
| 高保真归档 | TIFF | 原图尺寸 | 源位深（源为 8-bit 时仍为 8-bit） | 源 ICC；无 ICC 按 sRGB | 保留 EXIF/XMP/IPTC/GPS/ICC/DPI |

PNG 是档位内的格式变体，不是第四个档位：快速分享和标准交付使用 PNG 8-bit；高保真归档
按源位深使用 PNG 8/16-bit。用户修改档位参数后状态变为 `custom`，只允许报告明确的
`UNSUPPORTED` 或 `DOWNGRADED`，不能把固定档位静默降级。

## 能力探测规则

- `GET /api/capabilities` 只报告当前安装包内实际存在且通过版本/校验和检查的组件。
- ExifTool、TwelveMonkeys、HEIC 助手或随包字体缺失、损坏、版本不符时，对应能力为 `false`。
- 前端只显示 `available=true` 的格式、档位和组件；能力探测失败时专业导出保持阻断。
- 不搜索系统 PATH，不下载替代组件，也不把“当前不支持”能力渲染成可勾选项。
- 外部 ExifTool 超时、非零退出或输出无法独立读取时，导出失败并清理临时文件。

## 相关验收

- 格式、ICC、位深和元数据样片：[docs/test-samples.md](test-samples.md)
- RAW 与保真边界：[docs/raw-and-fidelity.md](raw-and-fidelity.md)
- 离线使用：[docs/offline-help.md](offline-help.md)
- 故障排查：[docs/troubleshooting.md](troubleshooting.md)
- 用户测试记录：[docs/user-study-stage6.md](user-study-stage6.md)
