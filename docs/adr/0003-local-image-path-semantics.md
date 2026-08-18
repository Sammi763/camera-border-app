# ADR-0003：本地资源语义，用 imagePath 不用 imageUrl

- 状态：已接受（整理自 `ARCHITECTURE.md` §4.2，2025-08 文档重构）
- 权威代码：`RenderRecipe.imagePath`、`OutputPathValidator`（导出路径校验）

## 背景

本项目是本地桌面应用，图片资源全部在本机磁盘。若字段命名引入 URL 语义，会误导实现走向「远程资源」方向，并污染安全边界判断。

## 决策

- 字段一律使用 `imagePath`（本地文件路径），禁止使用 `imageUrl`。
- 除非未来真实支持远程资源，否则不引入 URL 语义。
- 图片不出本机（不上传云端）；跨进程传输的是本地路径，由拥有文件系统权限的进程（Java 引擎 / Electron 主进程）消费。

## 替代方案

- 统一抽象为 URL（本地 file:// 也是 URL）：增加不必要的抽象层，违背 [ARCHITECTURE.md §7](../../ARCHITECTURE.md) 抽象规则，否决。

## 后果

- 安全边界清晰：渲染进程无文件系统权限；引擎对 `imagePath`/`outputPath` 做校验（空路径 4xx、父目录可写检查）。
- 未来若加远程资源，需显式扩展协议层并重新评估安全边界，而不是靠改字段名。
