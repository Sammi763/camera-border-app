/**
 * 共享的渲染配方（RenderRecipe）构建工具。
 *
 * 四条链路（Canvas 即时预览 / 引擎预览 / 单图导出 / 批量导出）统一从这里
 * 构建引擎请求的 recipe，避免各处手写一遍 border/gradient/texts/logo 映射——
 * 契约一旦演进只需改这一处，杜绝"预览对、导出不对"的字段漂移。
 *
 * 与 buildTexts.ts（文字构建）配套：本文件负责 recipe 外层结构，
 * buildTextsFromSettings 负责 texts[] 的构建与变量合并。
 */

import type {
  GradientConfig,
  LogoConfig,
  PreviewRequest,
  RenderRecipe
} from "../../../types/preview"
import type { RenderSettings } from "../types"
import { buildTextsFromSettings, resolveLogoBrand } from "./buildTexts"
import { imagePlacementFromSettings } from "./imageArea"
import { normalizeImagePlacement } from "../../preview/canvas/imagePlacementGeometry"

/** 配方只读取明确的 v2 imagePlacement；模板兼容字段不进入渲染边界。 */
const recipeImagePlacement = (settings: RenderSettings) => imagePlacementFromSettings(settings)

/**
 * 将 UI 渐变设置转换为 API 渐变配置。
 * 未启用或停靠点不足 2 个时返回 null（等价于不启用渐变，退回纯色边框）。
 */
export const toGradientConfig = (s: RenderSettings): GradientConfig | null => {
  if (!s.gradient.enabled || s.gradient.stops.length < 2) {
    return null
  }
  return {
    enabled: true,
    type: s.gradient.type,
    angle: s.gradient.angle,
    stops: s.gradient.stops
  }
}

/**
 * 从设置构建引擎用 RenderRecipe。
 *
 * @param filePath 图片路径（引擎实际处理的路径）
 * @param settings 渲染设置
 * @param textOverride 快捷单段文字覆盖（覆盖 textLayers[0] 的 content）
 * @param resolvedTexts 已解析变量的文字内容数组（与 textLayers 下标对齐）
 * @param resolvedBrand 当前图片识别到的品牌文字（auto-brand 模式使用）
 */
export const buildRecipeFromSettings = (
  filePath: string,
  settings: RenderSettings,
  textOverride?: string | null,
  resolvedTexts?: readonly (string | null)[] | null,
  resolvedBrand?: string | null
): RenderRecipe => {
  const current = settings
  const logo: LogoConfig | null = current.logo.enabled
    ? {
        enabled: true,
        mode: current.logo.mode,
        brand: resolveLogoBrand(current.logo.mode, current.logo.brand, resolvedBrand),
        placement: current.logo.placement,
        size: current.logo.size,
        colorMode: current.logo.colorMode,
        imagePath: current.logo.imagePath ?? null,
        opacity: current.logo.opacity ?? 1,
        autoContrast: current.logo.autoContrast ?? current.logo.colorMode === "auto-contrast"
      }
    : null

  return {
    imagePath: filePath,
    border: {
      top: current.borderTop,
      bottom: current.borderBottom,
      left: current.borderLeft,
      right: current.borderRight,
      color: current.borderColor
    },
    gradient: toGradientConfig(current),
    texts: buildTextsFromSettings(current, textOverride, resolvedTexts),
    imagePlacement: recipeImagePlacement(current),
    logo,
    borderStyle: current.borderStyle
  }
}

/**
 * 构建引擎预览请求（带缩放约束）。
 * 预览与导出共享同一 recipe，仅在外围补充 maxWidth/maxHeight（ARCHITECTURE.md §4.1）。
 */
export const buildPreviewRequest = (
  filePath: string,
  settings: RenderSettings,
  maxWidth: number,
  maxHeight: number,
  textOverride?: string | null,
  resolvedTexts?: readonly (string | null)[] | null,
  resolvedBrand?: string | null
): PreviewRequest => ({
  recipe: buildRecipeFromSettings(filePath, settings, textOverride, resolvedTexts, resolvedBrand),
  maxWidth,
  maxHeight
})

/**
 * 构建「裸图」预览请求：不加边框、不加文字，仅用于取回原图缩小图
 * 供 Canvas 即时预览使用（引擎不可达时预览链路依赖此请求）。
 */
export const buildPlainImagePreviewRequest = (
  filePath: string,
  maxWidth: number,
  maxHeight: number
): PreviewRequest => ({
  recipe: {
    imagePath: filePath,
    border: { top: 0, bottom: 0, left: 0, right: 0, color: "#000000" },
    gradient: null,
    texts: [],
    imagePlacement: normalizeImagePlacement()
  },
  maxWidth,
  maxHeight
})
