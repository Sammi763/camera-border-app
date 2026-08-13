/**
 * 共享的文字构建工具。
 *
 * 从 RenderSettings 构建引擎请求用的 TextItem[] 数组。
 * 四条渲染链路（Canvas 即时预览 / 引擎预览 / 单图导出 / 批量导出）
 * 都调用此函数，确保文字结果一致。
 *
 * 设计要点：
 * - textLayers 是唯一的文字来源（normalizeTemplateSettings 已确保旧设置迁移）
 * - textOverride 用于"快捷单段"覆盖：覆盖 textLayers[0] 的 content
 * - resolvedTexts 用于多段变量解析后的内容（与 textLayers 下标对齐）
 * - textOverride 和 resolvedTexts 不同时使用：textOverride 是旧单段兼容，
 *   resolvedTexts 是多段解析结果
 */

import type { TextItem } from "../../../types/preview"
import type { RenderSettings, TextLayerSettings } from "../types"

/**
 * 将文字位置和放置区域编码为 placement 字符串。
 *
 * 编码规则：
 * - 图片上：image-top-center / image-center / image-bottom-center
 * - 边框上：border-top-center / border-bottom-center
 * - 保留旧值 top-center / center / bottom-center（不带前缀时按 textArea 补前缀）
 */
export const encodePlacement = (textArea: string, textPlacement: string): string => {
  if (textPlacement.startsWith("image-") || textPlacement.startsWith("border-")) {
    return textPlacement
  }
  const areaPrefix = textArea === "border" ? "border" : "image"
  return `${areaPrefix}-${textPlacement}`
}

/**
 * 将单个 TextLayerSettings 转换为引擎 TextItem。
 */
const layerToTextItem = (layer: TextLayerSettings, content: string): TextItem => ({
  content,
  fontFamily: layer.fontFamily,
  fontSize: layer.fontSize,
  color: layer.color,
  placement: encodePlacement(layer.textArea, layer.placement),
  marginX: layer.marginX,
  marginY: layer.marginY,
  backgroundEnabled: layer.backgroundEnabled,
  backgroundColor: layer.backgroundColor,
  backgroundPaddingX: layer.backgroundPaddingX,
  backgroundPaddingY: layer.backgroundPaddingY,
  shadowEnabled: layer.shadowEnabled,
  shadowColor: layer.shadowColor,
  shadowBlur: layer.shadowBlur,
  shadowOffsetX: layer.shadowOffsetX,
  shadowOffsetY: layer.shadowOffsetY,
  strokeEnabled: layer.strokeEnabled,
  strokeColor: layer.strokeColor,
  strokeWidth: layer.strokeWidth,
})

/**
 * 从 RenderSettings 构建引擎请求用的 TextItem[] 数组。
 *
 * 四条渲染链路统一调用此函数，确保文字结果一致。
 *
 * @param settings 渲染设置（textLayers 已经过 normalizeTemplateSettings 迁移）
 * @param textOverride 快捷单段覆盖：非空时覆盖 textLayers[0] 的 content；
 *   为 null 时不覆盖；为 undefined 时也不覆盖。
 * @param resolvedTexts 多段变量解析后的内容数组（与 textLayers 下标对齐），
 *   null 表示使用 layer.content 原始值。
 *   如果 textOverride 非空，resolvedTexts[0] 会被 textOverride 覆盖。
 * @returns 引擎请求用的 TextItem[] 数组
 */
export const buildTextsFromSettings = (
  settings: RenderSettings,
  textOverride?: string | null,
  resolvedTexts?: readonly (string | null)[] | null
): readonly TextItem[] => {
  const layers = settings.textLayers
  if (layers.length === 0) {
    return []
  }

  const items: TextItem[] = []
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i]!
    if (!layer.enabled) {
      continue
    }

    // 确定最终内容：textOverride 覆盖第 0 层，resolvedTexts 覆盖对应层
    let content: string
    if (i === 0 && textOverride !== undefined && textOverride !== null && textOverride.trim().length > 0) {
      content = textOverride.trim()
    } else {
      const resolved = resolvedTexts?.[i] ?? layer.content
      content = (resolved ?? "").trim()
    }

    if (content.length === 0) {
      continue
    }

    items.push(layerToTextItem(layer, content))
  }

  return items
}

/**
 * 解析 logo 品牌文字。
 *
 * 三条消费链路（buildResolvedRenderSettings / buildRecipeFromSettings / buildPreviewRequest）
 * 共用此函数，确保品牌标识解析规则一致。
 *
 * 规则：
 * - brand-text 模式：直接使用 settings 中配置的品牌文字
 * - auto-brand 模式：
 *   1. 优先使用 resolvedBrand 参数（批量导出 / 引擎预览传入的每图品牌）
 *   2. resolvedBrand 为 undefined（未传）时回退到 settings.logo.brand
 *      （单图导出使用 resolvedSettings，brand 已由 buildResolvedRenderSettings 写入）
 *   3. resolvedBrand 为 null（明确未识别）时返回 null，不回退
 *
 * @param mode logo 模式
 * @param brand settings.logo.brand 中的品牌文字
 * @param resolvedBrand 当前图片识别到的品牌文字（undefined=未传，null=未识别）
 */
export const resolveLogoBrand = (
  mode: "auto-brand" | "brand-text",
  brand: string | null,
  resolvedBrand?: string | null
): string | null => {
  if (mode === "brand-text") {
    return brand ?? null
  }
  if (resolvedBrand !== undefined) {
    return resolvedBrand
  }
  return brand ?? null
}

/**
 * 从已解析数据构建"已渲染态" RenderSettings。
 *
 * 四条链路（Canvas 即时预览 / 引擎预览 / 单图导出 / 批量导出）共同调用此函数，
 * 确保文字内容、品牌标识、textOverride 全部在同一处合并，避免各链路各自写一套逻辑。
 *
 * 合并规则：
 * - textLayers：将 resolvedTexts 对应层的 content 替换为已解析值；
 *   textOverride 非空时覆盖第 0 层。
 * - logo：auto-brand 模式下将 brand 替换为 resolvedBrand。
 * - 不修改原 settings 对象（immutable）。
 *
 * @param settings 原始渲染设置
 * @param textOverride 快捷单段文字覆盖（已解析变量），null 表示不覆盖
 * @param resolvedTexts 每段文字图层已解析变量后的内容数组，null 表示全部用原始 content
 * @param resolvedBrand 当前图片识别到的品牌文字，null 表示未识别
 * @returns 已合并的渲染设置（新对象，不修改原 settings）
 */
export const buildResolvedRenderSettings = (
  settings: RenderSettings,
  textOverride?: string | null,
  resolvedTexts?: readonly (string | null)[] | null,
  resolvedBrand?: string | null
): RenderSettings => {
  // 合并文字图层：将已解析内容替换原始占位符
  const mergedLayers: readonly TextLayerSettings[] = settings.textLayers.map((layer, i) => {
    let content = layer.content
    if (i === 0 && textOverride !== undefined && textOverride !== null && textOverride.trim().length > 0) {
      content = textOverride.trim()
    } else if (resolvedTexts?.[i] !== undefined && resolvedTexts[i] !== null) {
      content = resolvedTexts[i]!
    }
    return { ...layer, content }
  })

  // 合并品牌标识
  const logo = settings.logo
  const mergedLogo = logo.enabled
    ? {
        ...logo,
        brand: resolveLogoBrand(logo.mode, logo.brand, resolvedBrand),
      }
    : logo

  return {
    ...settings,
    textLayers: mergedLayers,
    logo: mergedLogo,
  }
}
