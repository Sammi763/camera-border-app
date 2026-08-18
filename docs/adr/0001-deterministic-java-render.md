# ADR-0001：最终导出走 Java 图像引擎，不用 DOM 截图

- 状态：已接受（整理自 `docs/prd.md` §5.2，2025-08 文档重构）
- 权威代码：`java-engine/.../service/impl/Java2DImageRenderService.java`、`ImageRenderService.java`

## 背景

同类工具（如 Copicseal）用 DOM/CSS 模板 + Puppeteer 截图实现复杂版式，开发快、表达力强。
本项目长期目标是 TIFF、16-bit、ICC 的高保真导出与「预览与导出一致」，DOM 截图本质接近屏幕截图，不满足该目标。

## 决策

- 最终导出由 Java 图像引擎根据**结构化 recipe**（`RenderRecipe`）确定性渲染，不依赖 DOM/CSS。
- 前端模板只负责预览与编辑；模板最终必须能转换为可验证的 `RenderRecipe`。
- 色彩一致性有可验证标准（无色彩效果导出 RGB 误差 ≤ 1，高保真模式 ΔE < 1，见 `docs/prd.md` §3.16）。

## 替代方案

- DOM/Puppeteer 截图：版式表达强，但输出非像素精确、无法做高位深/ICC 保真，否决。
- 纯前端 Canvas 导出：与引擎实现重复且无法满足专业保真路线，仅保留为即时预览降级链路。

## 后果

- 模板系统被约束为「结构化参数」形态，视觉自由度的实现成本高于 DOM 方案（可接受）。
- 预览与导出必须共享同一套渲染逻辑，否则会出现「预览对、导出不对」（见 [ADR-0002](0002-preview-export-share-recipe.md)）。
- 专业能力（ICC/16-bit/TIFF）可增量加入引擎而不改变整体架构。
