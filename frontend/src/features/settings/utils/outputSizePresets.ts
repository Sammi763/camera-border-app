/**
 * 输出尺寸预设工具。
 *
 * 预设定义「目标长边」：导出前对原图按长边等比缩小（短边随比例），
 * 与引擎 ImageScaler 的 maxWidth/maxHeight 语义一致（0 表示不限制 = 原图尺寸）。
 *
 * 文档 §3.14 导出预设：原图、1080P、2K、4K、小红书、朋友圈、自定义尺寸。
 * MVP 先提供原图 / 1080P / 2K / 4K / 自定义长边，社交平台专用尺寸后续按需补充。
 */

import type { OutputSizePreset, RenderSettings } from "../types"

/** 单个预设的展示信息。 */
export type OutputSizePresetOption = {
  readonly id: OutputSizePreset
  readonly label: string
  /** 目标长边像素，0 表示不限制（原图尺寸）。 */
  readonly longEdge: number
}

/** 输出尺寸预设列表（UI 展示用）。 */
export const OUTPUT_SIZE_PRESETS: readonly OutputSizePresetOption[] = [
  { id: "original", label: "原图尺寸", longEdge: 0 },
  { id: "1080p", label: "1080P（长边 1080）", longEdge: 1080 },
  { id: "2k", label: "2K（长边 2048）", longEdge: 2048 },
  { id: "4k", label: "4K（长边 3840）", longEdge: 3840 },
  { id: "custom", label: "自定义长边", longEdge: 0 }
]

/** 自定义长边的合法范围。 */
export const CUSTOM_LONG_EDGE_MIN = 64
export const CUSTOM_LONG_EDGE_MAX = 100000

/**
 * 解析输出尺寸为引擎可用的 maxWidth/maxHeight。
 *
 * - original：{0, 0}（不缩放）
 * - 预设：长边目标作为 maxWidth 与 maxHeight 的上限（ImageScaler 等比 contain）
 * - custom：用户输入的长边，钳制到合法范围
 */
export const resolveOutputSizeLimit = (
  preset: OutputSizePreset,
  customLongEdge: number
): { readonly maxWidth: number; readonly maxHeight: number } => {
  switch (preset) {
    case "1080p":
      return { maxWidth: 1080, maxHeight: 1080 }
    case "2k":
      return { maxWidth: 2048, maxHeight: 2048 }
    case "4k":
      return { maxWidth: 3840, maxHeight: 3840 }
    case "custom": {
      const edge = Number.isFinite(customLongEdge)
        ? Math.min(CUSTOM_LONG_EDGE_MAX, Math.max(CUSTOM_LONG_EDGE_MIN, Math.round(customLongEdge)))
        : CUSTOM_LONG_EDGE_MIN
      return { maxWidth: edge, maxHeight: edge }
    }
    case "original":
    default:
      return { maxWidth: 0, maxHeight: 0 }
  }
}

/** 从 RenderSettings 解析导出目标尺寸。 */
export const resolveOutputSizeFromSettings = (
  settings: RenderSettings
): { readonly maxWidth: number; readonly maxHeight: number } =>
  resolveOutputSizeLimit(settings.outputSizePreset, settings.customOutputLongEdge)
