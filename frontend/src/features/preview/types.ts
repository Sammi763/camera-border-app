/**
 * 预览模块的 UI 状态类型。
 */

import type { PreviewResponse } from "../../types/preview"

/**
 * 引擎预览同步状态。
 * - idle: 尚无图片
 * - syncing: 正在等待引擎返回
 * - synced: 引擎预览已同步
 * - error: 引擎预览失败，但即时预览仍可用
 */
export type EngineSyncStatus = "idle" | "syncing" | "synced" | "error"

/**
 * 暴露给 UI 的预览状态。
 *
 * 即时预览由 Canvas 前端渲染提供（基于 currentImage），引擎预览用于校验。
 * displayUrl 优先使用引擎返回的 URL，引擎未就绪时使用 null（Canvas 兜底）。
 */
export type PreviewState =
  | { readonly kind: "idle" }
  | {
      readonly kind: "active"
      readonly filePath: string
      readonly fileName: string
      /** 当前图片元素，供 Canvas 即时渲染使用。图片加载前为 null。 */
      readonly currentImage: HTMLImageElement | null
      /** 引擎预览的可加载 URL，引擎未就绪时为 null。 */
      readonly engineDisplayUrl: string | null
      /** 引擎同步状态。 */
      readonly engineSyncStatus: EngineSyncStatus
      /** 引擎预览的原始响应，引擎未就绪时为 null。 */
      readonly engineResponse: PreviewResponse | null
    }
