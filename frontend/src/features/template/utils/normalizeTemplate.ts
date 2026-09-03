/**
 * 模板设置兼容迁移工具。
 *
 * 阶段 2 引入 textLayers 多段文字系统后，旧模板 / 旧用户设置 / 旧导入 JSON
 * 仍使用 textContent / textFontSize / textColor / textPlacement / textArea / fontFamily
 * 单段文字字段。本模块提供统一迁移函数，确保所有入口（内置模板应用、用户模板加载、
 * 导入 JSON、拖拽导入、默认模板自动加载）都走同一套逻辑，不各写一份分叉判断。
 *
 * 迁移规则：
 * 1. 如果 patch / settings 已包含 textLayers（非 undefined），直接使用，不做迁移。
 * 2. 如果不含 textLayers 但含旧单段文字字段，把旧字段映射成单元素 textLayers 数组。
 *    - 旧 textContent 为空字符串 → textLayers 设为空数组（无文字）。
 *    - 旧 textContent 非空 → 生成 1 个 enabled 图层 + 2 个 disabled 图层。
 * 3. 旧单段字段同时保留（向后兼容），但渲染时以 textLayers 为准。
 */

import type { RenderSettings, RenderSettingsInput, TextLayerSettings } from "../../settings/types"
import { normalizeImagePlacement } from "../../preview/canvas/imagePlacementGeometry"

/** 旧画幅 id 到 v2 目标比例的迁移表。 */
const legacyAspectRatio = (id: string): number | null => ({
  "half-frame": 3 / 4,
  "135": 3 / 2,
  "645": 4 / 3,
  "6x6": 1,
  "6x7": 5 / 4,
  "6x8": 10 / 7,
  "6x9": 45 / 28,
  "6x10": 25 / 14,
  "6x12": 15 / 7
}[id] ?? null)

/**
 * 从旧单段文字字段生成 textLayers 数组。
 *
 * @param textContent 文字内容
 * @param fontFamily 字体
 * @param fontSize 字号
 * @param color 颜色
 * @param placement 位置（top-center / center / bottom-center）
 * @param textArea 放置区域（image / border）
 * @returns 迁移后的 textLayers 数组（可能为空）
 */
const migrateLegacyToLayers = (
  textContent: string,
  fontFamily: string,
  fontSize: number,
  color: string,
  placement: string,
  textArea: "image" | "border"
): readonly TextLayerSettings[] => {
  const content = textContent.trim()
  if (content.length === 0) {
    return []
  }

  const baseLayer: TextLayerSettings = {
    id: "layer-1",
    enabled: true,
    content,
    fontFamily,
    fontSize,
    color,
    placement,
    textArea,
    marginX: 0,
    marginY: 20,
    lineSpacing: 0,
    letterSpacing: 0,
    backgroundEnabled: false,
    backgroundColor: "#000000",
    backgroundPaddingX: 6,
    backgroundPaddingY: 3,
    shadowEnabled: false,
    shadowColor: "#000000",
    shadowBlur: 0,
    shadowOffsetX: 2,
    shadowOffsetY: 2,
    strokeEnabled: false,
    strokeColor: "#000000",
    strokeWidth: 1,
  }

  const disabledLayer = (id: string): TextLayerSettings => ({
    ...baseLayer,
    id,
    enabled: false,
    content: "",
  })

  return [baseLayer, disabledLayer("layer-2"), disabledLayer("layer-3")]
}

/**
 * 规范化模板 patch：确保 patch 应用后 textLayers 始终存在且与文字字段一致。
 *
 * 当 patch 不含 textLayers 但含旧单段文字字段时，自动生成 textLayers。
 * 当 patch 含 textLayers 时，不做额外处理。
 * 当 patch 既不含 textLayers 也不含旧文字字段时，不做处理（不覆盖已有 textLayers）。
 *
 * @param patch 模板 settingsPatch 或完整 settings
 * @returns 规范化后的 patch（可能新增了 textLayers 字段）
 */
export const normalizeTemplatePatch = (
  patch: RenderSettingsInput
): Partial<RenderSettings> => {
  const legacyFilmFormat = patch.filmFormat
  const legacyAutoCrop = patch.autoCrop
  const { filmFormat: _filmFormat, autoCrop: _autoCrop, ...withoutLegacyLayout } = patch
  const layoutPatch: Partial<RenderSettings> = patch.imagePlacement === undefined && (legacyFilmFormat !== undefined || legacyAutoCrop !== undefined)
    ? {
        layoutPresetId: legacyFilmFormat ?? null,
        imagePlacement: normalizeImagePlacement({
          mode: legacyAutoCrop === true ? "fill" : "fit",
          targetAspectRatio: legacyFilmFormat === undefined || legacyFilmFormat === null ? null : legacyAspectRatio(legacyFilmFormat)
        })
      }
    : {}

  // 不含任何旧文字字段 → 不迁移（patch 可能只改边框等非文字字段）
  if (
    patch.textContent === undefined &&
    patch.textFontSize === undefined &&
    patch.textColor === undefined &&
    patch.textPlacement === undefined &&
    patch.textArea === undefined &&
    patch.fontFamily === undefined
  ) {
    return { ...withoutLegacyLayout, ...layoutPatch }
  }

  // 从旧字段生成 textLayers
  const textContent = patch.textContent ?? ""
  const fontFamily = patch.fontFamily ?? "sans-serif"
  const fontSize = patch.textFontSize ?? 16
  const color = patch.textColor ?? "#000000"
  const placement = patch.textPlacement ?? "bottom-center"
  const textArea = patch.textArea ?? "border"

  return {
    ...withoutLegacyLayout,
    ...layoutPatch,
    textLayers: migrateLegacyToLayers(textContent, fontFamily, fontSize, color, placement, textArea),
  }
}

/**
 * 规范化完整 RenderSettings：确保 textLayers 始终存在。
 *
 * 用于：
 * - 用户模板加载（从 localStorage / Electron userData 读取的旧设置）
 * - 导入模板 JSON（decodeTemplateJson 已做基础兼容，这里做最终迁移）
 * - 默认模板自动加载
 *
 * @param settings 可能缺少 textLayers 的旧设置
 * @returns 规范化后的完整设置（textLayers 保证非 undefined）
 */
export const normalizeTemplateSettings = (
  settings: RenderSettingsInput
): RenderSettings => {
  // 已有多段图层直接保留；旧空数组/缺失字段才从单段字段迁移。
  const layers = settings.textLayers !== undefined && settings.textLayers.length > 0
    ? settings.textLayers.map((layer) => ({
        ...layer,
        lineSpacing: layer.lineSpacing ?? 0,
        letterSpacing: layer.letterSpacing ?? 0
      }))
    : migrateLegacyToLayers(
        settings.textContent ?? "",
        settings.fontFamily ?? "sans-serif",
        settings.textFontSize ?? 24,
        settings.textColor ?? "#000000",
        settings.textPlacement ?? "bottom-center",
        settings.textArea ?? "image"
      )

  const legacyFilmFormat = settings.filmFormat
  const legacyAutoCrop = settings.autoCrop
  const { filmFormat: _filmFormat, autoCrop: _autoCrop, ...withoutLegacyLayout } = settings
  const currentPlacement = normalizeImagePlacement(
    settings.imagePlacement ?? {
      mode: legacyAutoCrop === true ? "fill" : "fit",
      targetAspectRatio: legacyFilmFormat === null || legacyFilmFormat === undefined ? null : legacyAspectRatio(legacyFilmFormat)
    }
  )

  return {
    ...withoutLegacyLayout,
    borderColor: withoutLegacyLayout.borderColor ?? "#ffffff",
    borderTop: withoutLegacyLayout.borderTop ?? 20,
    borderBottom: withoutLegacyLayout.borderBottom ?? 20,
    borderLeft: withoutLegacyLayout.borderLeft ?? 20,
    borderRight: withoutLegacyLayout.borderRight ?? 20,
    textContent: withoutLegacyLayout.textContent ?? "",
    textFontSize: withoutLegacyLayout.textFontSize ?? 24,
    textColor: withoutLegacyLayout.textColor ?? "#000000",
    textPlacement: withoutLegacyLayout.textPlacement ?? "bottom-center",
    textArea: withoutLegacyLayout.textArea ?? "border",
    fontFamily: withoutLegacyLayout.fontFamily ?? "sans-serif",
    gradient: withoutLegacyLayout.gradient ?? {
      enabled: false,
      type: "linear",
      angle: 0,
      stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }]
    },
    borderStyle: withoutLegacyLayout.borderStyle ?? null,
    exportFormat: withoutLegacyLayout.exportFormat ?? "png",
    jpegQuality: withoutLegacyLayout.jpegQuality ?? 95,
    outputSizePreset: withoutLegacyLayout.outputSizePreset ?? "original",
    customOutputLongEdge: withoutLegacyLayout.customOutputLongEdge ?? 2048,
    preserveMetadata: withoutLegacyLayout.preserveMetadata ?? false,
    preserveColorProfile: withoutLegacyLayout.preserveColorProfile ?? false,
    preferHighBitDepth: withoutLegacyLayout.preferHighBitDepth ?? false,
    logo: withoutLegacyLayout.logo ?? {
      enabled: false,
      mode: "auto-brand",
      brand: null,
      placement: "border-top-right",
      size: 14,
      colorMode: "auto-contrast",
      imagePath: null,
      opacity: 1,
      autoContrast: true
    },
    textLayers: layers,
    imagePlacement: currentPlacement,
    layoutPresetId: settings.layoutPresetId ?? legacyFilmFormat ?? null
  }
}

/**
 * 判断一个 RenderSettings 是否为旧格式（缺少 textLayers 或 textLayers 为空但 textContent 非空）。
 *
 * 用于测试和调试，不用于业务逻辑判断。
 */
export const isLegacySettings = (settings: RenderSettings): boolean => {
  if (settings.textLayers === undefined) {
    return true
  }
  if (settings.textLayers.length === 0 && settings.textContent.trim().length > 0) {
    return true
  }
  return false
}
