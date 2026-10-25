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
export type TemplateCategory = "经典" | "胶片" | "暗房" | "档案" | "风格"

/**
 * 首批 8 种确定性边框风格（与引擎 BorderStyleRenderer / Canvas drawBorderStyle 同一套 ID）。
 */
export const BORDER_STYLE_IDS = [
  "exhibition-line",
  "polaroid-shadow",
  "film-perforation",
  "mat-double-line",
  "torn-edge",
  "negative-band",
  "magazine-keyline",
  "archive-label-box",
] as const

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
  /** 模板使用的信息字段（统一版式画廊展示用，如 ["相机", "镜头", "胶片"]）。 */
  readonly fields?: readonly string[]
}

/**
 * 摄影信息卡四个预设布局变体的模板 id。
 * 白/黑边框 × 底部居中/左下布局，统一工作台「摄影信息卡」用这组 id 做变体切换。
 */
export const PHOTO_INFO_CARD_TEMPLATE_IDS = {
  /** 白边 · 底部居中（默认）。 */
  centerWhite: "photo-info-card",
  /** 白边 · 左下。 */
  leftWhite: "photo-info-card-left",
  /** 黑边 · 底部居中。 */
  centerBlack: "photo-info-card-dark",
  /** 黑边 · 左下。 */
  leftBlack: "photo-info-card-dark-left",
} as const

/**
 * 统一工作台首屏精选模板（6-8 个）。
 * 顺序即展示顺序；摄影信息卡排第一，是导入照片后的默认模板。
 */
export const FEATURED_GALLERY_TEMPLATE_IDS: readonly string[] = [
  PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite,
  "classic-white",
  "minimal-black",
  "polaroid",
  "archive-label",
  "medium-format-margin",
  "cinema-subtitle",
  "full-frame-overlay",
]

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
// CORE_TEMPLATES 为既有模板；BUILT_IN_TEMPLATES 在文件末尾合并风格模板。
const CORE_TEMPLATES: readonly BuiltInTemplate[] = [
  // ── 摄影信息卡（统一工作台默认模板） ──────────────────────
  {
    id: "photo-info-card",
    name: "摄影信息卡",
    category: "经典",
    description: "白边画廊卡纸感：宽上下留白 + 28px 摄影信息条。默认显示相机 · 镜头，胶片照片自动追加胶片名，数码照片自动清理多余分隔符。",
    fields: ["相机", "镜头", "胶片"],
    settingsPatch: {
      borderColor: "#ffffff",
      borderTop: 56,
      borderBottom: 160,
      borderLeft: 56,
      borderRight: 56,
      textLayers: [
        layer("l1", "{Camera} · {Lens} · {Film}", 28, "#222222", "border-bottom-center", "border", 0, "sans-serif"),
        disabledLayer3("l2"),
      ],
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
    },
    thumb: { borderColor: "#ffffff", photoColor: "#a89e90", textColor: "#222222", bottomRatio: 0.4 },
  },
  {
    id: "photo-info-card-left",
    name: "摄影信息卡 · 左下",
    category: "经典",
    description: "白边画廊卡纸感，信息条靠左下排布。适合横构图与长镜头名。",
    fields: ["相机", "镜头", "胶片"],
    settingsPatch: {
      borderColor: "#ffffff",
      borderTop: 56,
      borderBottom: 160,
      borderLeft: 56,
      borderRight: 56,
      textLayers: [
        layer("l1", "{Camera} · {Lens} · {Film}", 28, "#222222", "border-bottom-left", "border", 0, "sans-serif", { marginX: 56 }),
        disabledLayer3("l2"),
      ],
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
    },
    thumb: { borderColor: "#ffffff", photoColor: "#a89e90", textColor: "#222222", bottomRatio: 0.4 },
  },
  {
    id: "photo-info-card-dark",
    name: "摄影信息卡 · 黑",
    category: "经典",
    description: "黑边画廊卡纸感，28px 摄影信息条。适合夜景、高反差与暗调作品。",
    fields: ["相机", "镜头", "胶片"],
    settingsPatch: {
      borderColor: "#111111",
      borderTop: 56,
      borderBottom: 160,
      borderLeft: 56,
      borderRight: 56,
      textLayers: [
        layer("l1", "{Camera} · {Lens} · {Film}", 28, "#eaeaea", "border-bottom-center", "border", 0, "sans-serif"),
        disabledLayer3("l2"),
      ],
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
    },
    thumb: { borderColor: "#111111", photoColor: "#4a4540", textColor: "#eaeaea", bottomRatio: 0.4 },
  },
  {
    id: "photo-info-card-dark-left",
    name: "摄影信息卡 · 黑 · 左下",
    category: "经典",
    description: "黑边画廊卡纸感，信息条靠左下排布。适合暗调横构图。",
    fields: ["相机", "镜头", "胶片"],
    settingsPatch: {
      borderColor: "#111111",
      borderTop: 56,
      borderBottom: 160,
      borderLeft: 56,
      borderRight: 56,
      textLayers: [
        layer("l1", "{Camera} · {Lens} · {Film}", 28, "#eaeaea", "border-bottom-left", "border", 0, "sans-serif", { marginX: 56 }),
        disabledLayer3("l2"),
      ],
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
    },
    thumb: { borderColor: "#111111", photoColor: "#4a4540", textColor: "#eaeaea", bottomRatio: 0.4 },
  },

  // ── 精选补充模板（统一工作台首屏画廊项目） ────────────────
  {
    id: "medium-format-margin",
    name: "中画幅留白",
    category: "档案",
    description: "大面积白色留白，底部一行摄影信息。适合中画幅与低饱和作品。",
    fields: ["相机", "镜头", "胶片"],
    settingsPatch: {
      borderColor: "#fbfaf7",
      borderTop: 56,
      borderBottom: 128,
      borderLeft: 56,
      borderRight: 56,
      textLayers: [
        layer("l1", "{Camera} · {Lens} · {Film}", 16, "#555555", "border-bottom-center", "border", 0, "serif"),
        disabledLayer3("l2"),
      ],
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
    },
    thumb: { borderColor: "#fbfaf7", photoColor: "#c0b8a8", textColor: "#555555", bottomRatio: 0.34 },
  },
  {
    id: "cinema-subtitle",
    name: "电影字幕",
    category: "暗房",
    description: "黑色底部字幕条，白色文字居中，像电影对白字幕。适合横构图叙事感照片。",
    fields: ["相机", "镜头"],
    settingsPatch: {
      borderColor: "#0a0a0a",
      borderTop: 0,
      borderBottom: 68,
      borderLeft: 0,
      borderRight: 0,
      textLayers: [
        layer("l1", "{Camera} · {Lens}", 20, "#f0f0f0", "border-bottom-center", "border", 0, "sans-serif"),
        disabledLayer3("l2"),
      ],
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
    },
    thumb: { borderColor: "#0a0a0a", photoColor: "#3a3a3a", textColor: "#f0f0f0", bottomRatio: 0.24 },
  },
  {
    id: "full-frame-overlay",
    name: "全画幅叠字",
    category: "经典",
    description: "不加边框，文字直接叠加在照片底部，带阴影保证可读。适合不想裁切画面的分享场景。",
    fields: ["相机", "镜头", "胶片"],
    settingsPatch: {
      borderColor: "#ffffff",
      borderTop: 0,
      borderBottom: 0,
      borderLeft: 0,
      borderRight: 0,
      textLayers: [
        layer("l1", "{Camera} · {Lens} · {Film}", 18, "#ffffff", "image-bottom-center", "image", 14, "sans-serif", {
          shadowEnabled: true,
          shadowColor: "#000000",
          shadowBlur: 6,
          shadowOffsetX: 0,
          shadowOffsetY: 1,
        }),
        disabledLayer3("l2"),
      ],
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
    },
    thumb: { borderColor: "#3a3a3a", photoColor: "#6b6560", textColor: "#ffffff", bottomRatio: 0.1 },
  },

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
      imageArea: {
        orientation: "square",
        ratio: "1:1",
        displayMode: "fit",
        focalX: 0.5,
        focalY: 0.5,
        rotation: 0,
        targetAspectRatioOverride: null
      },
      borderStyle: { id: "polaroid-shadow", intensity: 70, edgeWidth: 8, holeCount: 0, paperTone: "" },
      textContent: "{Location} · {Film}",
      textFontSize: 22,
      textColor: "#555555",
      textPlacement: "bottom-center",
      textArea: "border",
      fontFamily: "LXGW WenKai",
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

// ---- 风格模板（首批 8 种确定性边框风格，P1） -------------------------------
// 每个模板通过 borderStyle patch 启用一种风格；旧设置无该字段时保持原行为。

/** 风格模板通用文字层（无文字干扰，仅展示风格本身）。 */
const styleDisabledLayer = (id: string): TextLayerSettings => disabledLayer3(id)

export const STYLE_TEMPLATES: readonly BuiltInTemplate[] = [
  {
    id: "style-exhibition-line",
    name: "极简展览线框",
    category: "风格",
    description: "图片外圈一道细线框，克制、画廊感。适合留白构图与黑白作品。",
    fields: ["线框", "强度", "线宽"],
    settingsPatch: {
      borderColor: "#ffffff",
      borderTop: 40, borderBottom: 40, borderLeft: 40, borderRight: 40,
      textLayers: [styleDisabledLayer("l1")],
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
      borderStyle: { id: "exhibition-line", intensity: 80, edgeWidth: 8, holeCount: 0, paperTone: "#333333" },
    },
    thumb: { borderColor: "#ffffff", photoColor: "#b3aa9c", textColor: "#333333", bottomRatio: 0.05 },
  },
  {
    id: "style-polaroid-shadow",
    name: "宝丽来宽下边",
    category: "风格",
    description: "宽下边框 + 图片底部柔和投影，照片像贴在相纸上。即时显影质感。",
    fields: ["投影", "强度"],
    settingsPatch: {
      borderColor: "#f5f0e8",
      borderTop: 22, borderBottom: 120, borderLeft: 22, borderRight: 22,
      textLayers: [layer("l1", "{Location}", 20, "#555555", "border-bottom-center", "border", 6, "LXGW WenKai"), styleDisabledLayer("l2")],
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
      borderStyle: { id: "polaroid-shadow", intensity: 70, edgeWidth: 10, holeCount: 0, paperTone: "" },
    },
    thumb: { borderColor: "#f5f0e8", photoColor: "#a8c0b0", textColor: "#555555", bottomRatio: 0.4 },
  },
  {
    id: "style-film-perforation",
    name: "135 齿孔",
    category: "风格",
    description: "上下条带各一排胶片齿孔，还原 135 底片形态。适合横构图。",
    fields: ["齿孔数", "孔色"],
    settingsPatch: {
      borderColor: "#141414",
      borderTop: 44, borderBottom: 44, borderLeft: 14, borderRight: 14,
      textLayers: [styleDisabledLayer("l1")],
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
      borderStyle: { id: "film-perforation", intensity: 90, edgeWidth: 12, holeCount: 16, paperTone: "#e8e8e8" },
    },
    thumb: { borderColor: "#141414", photoColor: "#4a4540", textColor: "#e8e8e8", bottomRatio: 0.18 },
  },
  {
    id: "style-mat-double-line",
    name: "中画幅卡纸留白",
    category: "风格",
    description: "大留白卡纸 + 双细装裱线，博物馆卡纸框。适合中画幅与低饱和作品。",
    fields: ["双线", "线距"],
    settingsPatch: {
      borderColor: "#fbfaf7",
      borderTop: 64, borderBottom: 96, borderLeft: 72, borderRight: 72,
      textLayers: [layer("l1", "{Camera} · {Film}", 15, "#777268", "border-bottom-center", "border", 4, "serif"), styleDisabledLayer("l2")],
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
      borderStyle: { id: "mat-double-line", intensity: 65, edgeWidth: 9, holeCount: 0, paperTone: "#9a948a" },
    },
    thumb: { borderColor: "#fbfaf7", photoColor: "#c0b8a8", textColor: "#777268", bottomRatio: 0.28 },
  },
  {
    id: "style-torn-edge",
    name: "撕边纸张",
    category: "风格",
    description: "照片四周呈确定性锯齿撕纸边缘，手工冲印质感。强度控制毛边幅度。",
    fields: ["撕边宽", "毛边幅度"],
    settingsPatch: {
      borderColor: "#efeae2",
      borderTop: 36, borderBottom: 36, borderLeft: 36, borderRight: 36,
      textLayers: [styleDisabledLayer("l1")],
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
      borderStyle: { id: "torn-edge", intensity: 60, edgeWidth: 10, holeCount: 0, paperTone: "#f7f5f0" },
    },
    thumb: { borderColor: "#efeae2", photoColor: "#b0a898", textColor: "#555048", bottomRatio: 0.08 },
  },
  {
    id: "style-negative-band",
    name: "黑色负片边",
    category: "风格",
    description: "上下边框压成负片黑带并带一排小孔，底片袋观感。适合暗调与街头。",
    fields: ["小孔数", "孔色"],
    settingsPatch: {
      borderColor: "#202020",
      borderTop: 40, borderBottom: 40, borderLeft: 12, borderRight: 12,
      textLayers: [layer("l1", "#{FrameNumber} · {Film}", 13, "#bdbdbd", "border-bottom-center", "border", 2, "sans-serif"), styleDisabledLayer("l2")],
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
      borderStyle: { id: "negative-band", intensity: 85, edgeWidth: 8, holeCount: 24, paperTone: "#cfcfcf" },
    },
    thumb: { borderColor: "#0a0a0a", photoColor: "#3d3830", textColor: "#cfcfcf", bottomRatio: 0.18 },
  },
  {
    id: "style-magazine-keyline",
    name: "杂志拼贴边框",
    category: "风格",
    description: "紧贴图片的粗键线 + 外圈细键线，杂志排版经典样式。",
    fields: ["键线", "线宽"],
    settingsPatch: {
      borderColor: "#ffffff",
      borderTop: 30, borderBottom: 30, borderLeft: 30, borderRight: 30,
      textLayers: [styleDisabledLayer("l1")],
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
      borderStyle: { id: "magazine-keyline", intensity: 75, edgeWidth: 8, holeCount: 0, paperTone: "#111111" },
    },
    thumb: { borderColor: "#ffffff", photoColor: "#8a8578", textColor: "#111111", bottomRatio: 0.06 },
  },
  {
    id: "style-archive-label-box",
    name: "摄影档案标签",
    category: "风格",
    description: "右下角绘制档案标签占位框（配合底部文字更像归档卡片）。",
    fields: ["标签框", "画幅"],
    settingsPatch: {
      borderColor: "#e8e2d8",
      borderTop: 25, borderBottom: 88, borderLeft: 25, borderRight: 25,
      textLayers: [
        layer("l1", "{Camera} · {Lens}", 16, "#555048", "border-bottom-center", "border", 6, "sans-serif"),
        layer("l2", "#{FrameNumber} · {CaptureFormat}", 12, "#888888", "border-bottom-left", "border", 0, "sans-serif", { marginX: 20 }),
        styleDisabledLayer("l3"),
      ],
      gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
      borderStyle: { id: "archive-label-box", intensity: 70, edgeWidth: 8, holeCount: 0, paperTone: "#8a8578" },
    },
    thumb: { borderColor: "#e8e2d8", photoColor: "#a09888", textColor: "#555048", bottomRatio: 0.3 },
  },
]

/** 全部内置模板：既有模板 + 首批 8 种确定性风格模板。 */
export const BUILT_IN_TEMPLATES: readonly BuiltInTemplate[] = [
  ...CORE_TEMPLATES,
  ...STYLE_TEMPLATES,
]
