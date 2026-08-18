# ADR-0002：预览与导出共享 RenderRecipe（单一渲染配方）

- 状态：已接受（整理自 `ARCHITECTURE.md` §4.1，2025-08 文档重构）
- 权威代码：`java-engine/.../model/RenderRecipe.java`、`PreviewRequest.java`、`RenderJobRequest.java`、`ImageRenderService.java`

## 背景

预览与导出若各自维护一套「意义相同但字段不一致」的配置结构，必然出现预览效果与导出成品不一致（同类工具 OneFrame 的教训：预览模块与导出模块必须共享布局计算）。

## 决策

- `RenderRecipe` 是预览与导出的**共享核心渲染配置**。
- `PreviewRequest` / `RenderJobRequest` 只能在外围补充差异字段（预览尺寸、导出设置如 `ExportSettings`）。
- 禁止为预览和导出维护两套字段不一致的配置。

## 替代方案

- 预览用轻量配置、导出用完整配置：短期省事，长期必然漂移，否决。

## 后果

- 新增渲染能力时只需扩展 `RenderRecipe` 一处，四条链路（Canvas 即时预览 / 引擎预览 / 单图导出 / 批量导出）自动保持一致。
- 前端 `buildRecipe.ts` 负责把 UI 设置收敛为 recipe，是前端侧的唯一装配点（`frontend/src/features/settings/utils/buildRecipe.ts`）。
