/**
 * 内置视觉模板数据。
 *
 * 模板方向偏胶片、暗房、档案馆、展览展示风格，
 * 非互联网卡片风。每个模板只需提供 settingsPatch，
 * 应用时与当前设置合并，避免覆盖用户已调整的无关参数。
 *
 * 阶段 2 新增：多段文字模板使用 textLayers 而非 textContent。
 */

import type { RenderSettings, TextLayerSettings } from "../../settings/types"

/** 内置模板分类。 */
export type TemplateCategory = "经典" | "胶片" | "暗房" | "档案"

/** 内置视觉模板。 */
export type BuiltInTemplate = {
  readonly id: string
  readonly name: string
  readonly category: TemplateCategory
  readonly description: string
  /** 仅包含需要覆盖的字段，应用时与当前 settings 合并。 */
  readonly settingsPatch: Partial<RenderSettings>
  /** 缩略图配色，用于纯 CSS 渲染缩略图。 */
  readonly thumb: {
    readonly borderColor: string
    readonly photoColor: string
    readonly textColor: string
    readonly bottomRatio: number
  }
}

/**
 * 创建文字图层快捷函数。
 */
const layer = (
  id: string,
  content: string,
  fontSize: number,
  color: string,
  placement: string,
  textArea: "image" | "border",
  marginY: number,
  fontFamily: string = "sans-serif",
  extra?: Partial<TextLayerSettings>
): TextLayerSettings => ({
  id,
  enabled: true,
  content,
  fontFamily,
  fontSize,
  color,
  placement,
  textArea,
  marginX: 0,
  marginY,
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
  ...extra,
})

/** 禁用的第三图层（通用）。 */
const disabledLayer3 = (id: string = "layer-3"): TextLayerSettings => ({
  ...layer(id, "", 14, "#888888", "top-center", "border", 8),
  enabled: false,
})

/**
 * 内置视觉模板列表。
 *
 * 设计原则：
 * - settingsPatch 只覆盖必要字段，不复制完整 settings
 * - textContent 使用变量占位符，运行时由 resolveEffectiveText 解析
 * - textArea / textPlacement 使用已有枚举值，不引入新坐标
 */
export const BUILT_IN_TEMPLATES: readonly BuiltInTemplate[] = [
  // ── 经典 ──────────────────────────────────────────────
  {
    id: "classic-white",
    name: "经典白边",
    category: "经典",
    description: "白色四边边框，底部略宽，黑色文字放边框底部。适合大多数照片。",
    settingsPatch: {
      borderColor: "#ffffff",
      borderTop: 30,
      borderBottom: 80,
      borderLeft: 30,
      borderRight: 30,
      textContent: "{Camera} · {Lens} · {Film}",
      textFontSize: 20,
      textColor: "#222222",
      textPlacement: "bottom-center",
      textArea: "border",
      fontFamily: "serif",
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
    },
    thumb: { borderColor: "#ffffff", photoColor: "#b0a898", textColor: "#222222", bottomRatio: 0.28 },
  },

  // ── 暗房 ──────────────────────────────────────────────
  {
    id: "darkroom-black",
    name: "暗房黑边",
    category: "暗房",
    description: "黑色边框，白色文字放边框底部。适合暗调、夜景、高反差照片。",
    settingsPatch: {
      borderColor: "#111111",
      borderTop: 30,
      borderBottom: 80,
      borderLeft: 30,
      borderRight: 30,
      textContent: "{Camera} · {Lens} · {Film}",
      textFontSize: 20,
      textColor: "#e8e8e8",
      textPlacement: "bottom-center",
      textArea: "border",
      fontFamily: "serif",
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
    },
    thumb: { borderColor: "#111111", photoColor: "#4a4540", textColor: "#e8e8e8", bottomRatio: 0.28 },
  },
  {
    id: "darkroom-sheet",
    name: "Darkroom Sheet",
    category: "暗房",
    description: "深灰底参数条风格，双行文字展示完整拍摄信息。",
    settingsPatch: {
      borderColor: "#1a1a1a",
      borderTop: 20,
      borderBottom: 90,
      borderLeft: 20,
      borderRight: 20,
      textContent: "{Camera} · {Lens}\n{CaptureFormat} · {Film}",
      textFontSize: 18,
      textColor: "#cccccc",
      textPlacement: "bottom-center",
      textArea: "border",
      fontFamily: "sans-serif",
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
    },
    thumb: { borderColor: "#1a1a1a", photoColor: "#3d3830", textColor: "#cccccc", bottomRatio: 0.32 },
  },

  // ── 胶片 ──────────────────────────────────────────────
  {
    id: "polaroid",
    name: "Polaroid 拍立得",
    category: "胶片",
    description: "白边上左右窄、下边很宽，文字放下边框。拍立得即时显影风格。",
    settingsPatch: {
      borderColor: "#f5f0e8",
      borderTop: 20,
      borderBottom: 120,
      borderLeft: 20,
      borderRight: 20,
      textContent: "{Location} · {Film}",
      textFontSize: 22,
      textColor: "#555555",
      textPlacement: "bottom-center",
      textArea: "border",
      fontFamily: "851 Tegaki Zatsu",
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
    },
    thumb: { borderColor: "#f5f0e8", photoColor: "#a8c0b0", textColor: "#555555", bottomRatio: 0.40 },
  },
  {
    id: "negative-sleeve",
    name: "Negative Sleeve",
    category: "胶片",
    description: "暖灰牛皮纸色边框，低饱和深色文字，模拟负片袋质感。",
    settingsPatch: {
      borderColor: "#c8b89a",
      borderTop: 25,
      borderBottom: 90,
      borderLeft: 25,
      borderRight: 25,
      textContent: "{Film} · {Camera} · #{FrameNumber}",
      textFontSize: 18,
      textColor: "#3a3028",
      textPlacement: "bottom-center",
      textArea: "border",
      fontFamily: "serif",
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
    },
    thumb: { borderColor: "#c8b89a", photoColor: "#8a7d6a", textColor: "#3a3028", bottomRatio: 0.30 },
  },

  // ── 档案 ──────────────────────────────────────────────
  {
    id: "museum-exhibit",
    name: "Museum 展览留白",
    category: "档案",
    description: "大面积白色留白，下边框较宽，字号克制。博物馆展览展示风格。",
    settingsPatch: {
      borderColor: "#faf8f4",
      borderTop: 50,
      borderBottom: 140,
      borderLeft: 50,
      borderRight: 50,
      textContent: "{CaptureFormat} · {Film}\n{Location}",
      textFontSize: 16,
      textColor: "#444444",
      textPlacement: "bottom-center",
      textArea: "border",
      fontFamily: "serif",
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
    },
    thumb: { borderColor: "#faf8f4", photoColor: "#c0b8a8", textColor: "#444444", bottomRatio: 0.35 },
  },
  {
    id: "archive-label",
    name: "Archive 档案标签",
    category: "档案",
    description: "米白浅灰边框，底部区域展示胶片、地点、帧号等归档信息。",
    settingsPatch: {
      borderColor: "#e8e2d8",
      borderTop: 25,
      borderBottom: 80,
      borderLeft: 25,
      borderRight: 25,
      textContent: "{Film} · {Location} · #{FrameNumber}",
      textFontSize: 17,
      textColor: "#555048",
      textPlacement: "bottom-center",
      textArea: "border",
      fontFamily: "sans-serif",
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
    },
    thumb: { borderColor: "#e8e2d8", photoColor: "#a09888", textColor: "#555048", bottomRatio: 0.28 },
  },

  // ── 极简 ──────────────────────────────────────────────
  {
    id: "minimal-black",
    name: "Minimal Black 极简黑框",
    category: "经典",
    description: "极窄黑边，无文字。适合只需干净边框、不想打扰画面的场景。",
    settingsPatch: {
      borderColor: "#000000",
      borderTop: 4,
      borderBottom: 4,
      borderLeft: 4,
      borderRight: 4,
      textContent: "",
      textFontSize: 14,
      textColor: "#ffffff",
      textPlacement: "bottom-center",
      textArea: "border",
      fontFamily: "sans-serif",
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
    },
    thumb: { borderColor: "#000000", photoColor: "#6b6560", textColor: "#ffffff", bottomRatio: 0.04 },
  },
  {
    id: "minimal-white",
    name: "Minimal White 极简白框",
    category: "经典",
    description: "极窄白边，无文字。干净、中性，适合任何题材。",
    settingsPatch: {
      borderColor: "#ffffff",
      borderTop: 4,
      borderBottom: 4,
      borderLeft: 4,
      borderRight: 4,
      textContent: "",
      textFontSize: 14,
      textColor: "#000000",
      textPlacement: "bottom-center",
      textArea: "border",
      fontFamily: "sans-serif",
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
    },
    thumb: { borderColor: "#ffffff", photoColor: "#6b6560", textColor: "#000000", bottomRatio: 0.04 },
  },

  // ── 多段文字模板（阶段 2 新增） ──────────────────────────
  {
    id: "darkroom-info-bar",
    name: "Darkroom Info Bar",
    category: "暗房",
    description: "深色边框双行信息条。第一行相机·镜头，第二行画幅·胶片，字号更小。",
    settingsPatch: {
      borderColor: "#1a1a1a",
      borderTop: 20,
      borderBottom: 90,
      borderLeft: 20,
      borderRight: 20,
      textLayers: [
        layer("l1", "{Camera} · {Lens}", 20, "#e0e0e0", "bottom-center", "border", 20, "sans-serif"),
        layer("l2", "{CaptureFormat} · {Film}", 14, "#999999", "bottom-center", "border", 48, "sans-serif"),
        disabledLayer3("l3"),
      ],
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
    },
    thumb: { borderColor: "#1a1a1a", photoColor: "#3d3830", textColor: "#e0e0e0", bottomRatio: 0.32 },
  },
  {
    id: "archive-two-line",
    name: "Archive Two-Line",
    category: "档案",
    description: "浅色边框双行归档信息。第一行胶片·地点，第二行画幅·帧号。",
    settingsPatch: {
      borderColor: "#e8e2d8",
      borderTop: 25,
      borderBottom: 80,
      borderLeft: 25,
      borderRight: 25,
      textLayers: [
        layer("l1", "{Film} · {Location}", 18, "#555048", "bottom-center", "border", 18, "serif"),
        layer("l2", "{CaptureFormat} · #{FrameNumber}", 14, "#888888", "bottom-center", "border", 44, "serif"),
        disabledLayer3("l3"),
      ],
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
    },
    thumb: { borderColor: "#e8e2d8", photoColor: "#a09888", textColor: "#555048", bottomRatio: 0.28 },
  },
  {
    id: "museum-caption",
    name: "Museum Caption",
    category: "档案",
    description: "大面积白色留白，双行展览说明。第一行画幅·胶片，第二行地点·相机。",
    settingsPatch: {
      borderColor: "#faf8f4",
      borderTop: 50,
      borderBottom: 140,
      borderLeft: 50,
      borderRight: 50,
      textLayers: [
        layer("l1", "{CaptureFormat} · {Film}", 18, "#333333", "bottom-center", "border", 30, "serif"),
        layer("l2", "{Location} · {Camera}", 14, "#777777", "bottom-center", "border", 58, "serif"),
        disabledLayer3("l3"),
      ],
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
    },
    thumb: { borderColor: "#faf8f4", photoColor: "#c0b8a8", textColor: "#444444", bottomRatio: 0.35 },
  },
  {
    id: "contact-note-strip",
    name: "Contact Note Strip",
    category: "暗房",
    description: "底部细信息条，三行分层展示相机、胶片、地点，字号递减。",
    settingsPatch: {
      borderColor: "#222222",
      borderTop: 8,
      borderBottom: 70,
      borderLeft: 8,
      borderRight: 8,
      textLayers: [
        layer("l1", "{Camera}", 16, "#e8e8e8", "bottom-center", "border", 10, "sans-serif"),
        layer("l2", "{Film}", 13, "#aaaaaa", "bottom-center", "border", 30, "sans-serif"),
        layer("l3", "{Location}", 11, "#888888", "bottom-center", "border", 48, "sans-serif"),
      ],
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
    },
    thumb: { borderColor: "#222222", photoColor: "#4a4540", textColor: "#e8e8e8", bottomRatio: 0.25 },
  },

  // ── 品牌标识模板 ──────────────────────────────────────
  {
    id: "brand-mark-darkroom",
    name: "Brand Mark Darkroom",
    category: "暗房",
    description: "深色边框，自动识别相机品牌并显示在右上角，双行文字信息条。",
    settingsPatch: {
      borderColor: "#1a1a1a",
      borderTop: 20,
      borderBottom: 90,
      borderLeft: 20,
      borderRight: 20,
      textLayers: [
        layer("l1", "{Camera} · {Lens}", 20, "#e0e0e0", "bottom-center", "border", 20, "sans-serif"),
        layer("l2", "{CaptureFormat} · {Film}", 14, "#999999", "bottom-center", "border", 48, "sans-serif"),
        disabledLayer3("l3"),
      ],
      logo: { enabled: true, mode: "auto-brand", brand: null, placement: "border-top-right", size: 16, colorMode: "auto-contrast" },
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
    },
    thumb: { borderColor: "#1a1a1a", photoColor: "#3d3830", textColor: "#e0e0e0", bottomRatio: 0.32 },
  },
  {
    id: "brand-mark-archive",
    name: "Brand Mark Archive",
    category: "档案",
    description: "浅色边框，自动识别相机品牌并显示在右上角，归档风格双行文字。",
    settingsPatch: {
      borderColor: "#e8e2d8",
      borderTop: 25,
      borderBottom: 80,
      borderLeft: 25,
      borderRight: 25,
      textLayers: [
        layer("l1", "{Film} · {Location}", 18, "#555048", "bottom-center", "border", 18, "serif"),
        layer("l2", "{CaptureFormat} · #{FrameNumber}", 14, "#888888", "bottom-center", "border", 44, "serif"),
        disabledLayer3("l3"),
      ],
      logo: { enabled: true, mode: "auto-brand", brand: null, placement: "border-top-right", size: 14, colorMode: "auto-contrast" },
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
    },
    thumb: { borderColor: "#e8e2d8", photoColor: "#a09888", textColor: "#555048", bottomRatio: 0.28 },
  },
]
