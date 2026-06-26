/**
 * 内置视觉模板数据。
 *
 * 模板方向偏胶片、暗房、档案馆、展览展示风格，
 * 非互联网卡片风。每个模板只需提供 settingsPatch，
 * 应用时与当前设置合并，避免覆盖用户已调整的无关参数。
 */

import type { RenderSettings } from "../../settings/types"

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
      textContent: "{Camera} · {Lens}\n{Film} · {Scanner}",
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
      textContent: "{RollName}\n{Location}",
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
]
