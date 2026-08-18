import { describe, expect, it } from "vitest"
import { BUILT_IN_TEMPLATES } from "./builtInTemplates"
import { normalizeTemplatePatch } from "../utils/normalizeTemplate"
import { buildTextsFromSettings } from "../../settings/utils/buildTexts"
import type { RenderSettings } from "../../settings/types"

/** 最小合法 RenderSettings，用于验证 patch 合并不会丢失必需字段。 */
const MINIMAL_SETTINGS: RenderSettings = {
  borderColor: "#ffffff",
  borderTop: 20,
  borderBottom: 20,
  borderLeft: 20,
  borderRight: 20,
  textContent: "",
  textFontSize: 24,
  textColor: "#000000",
  textPlacement: "bottom-center",
  textArea: "image",
  fontFamily: "sans-serif",
  textLayers: [],
  autoCrop: false,
  filmFormat: null,
  gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
  exportFormat: "png",
  jpegQuality: 95,
  outputSizePreset: "original",
  customOutputLongEdge: 2048,
  preserveMetadata: false,
  preserveColorProfile: false,
  preferHighBitDepth: false,
  logo: { enabled: false, mode: "auto-brand", brand: null, placement: "border-top-right", size: 14, colorMode: "auto-contrast" },
}

describe("BUILT_IN_TEMPLATES", () => {
  it("内置模板不少于 8 个", () => {
    expect(BUILT_IN_TEMPLATES.length).toBeGreaterThanOrEqual(8)
  })

  it("内置模板不少于 12 个（含 4 个多段文字模板）", () => {
    expect(BUILT_IN_TEMPLATES.length).toBeGreaterThanOrEqual(12)
  })

  it("内置模板不少于 14 个（含 2 个品牌标识模板）", () => {
    expect(BUILT_IN_TEMPLATES.length).toBeGreaterThanOrEqual(14)
  })

  it("每个模板都有 id/name/category/description/settingsPatch", () => {
    for (const t of BUILT_IN_TEMPLATES) {
      expect(t.id).toBeTruthy()
      expect(t.name).toBeTruthy()
      expect(t.category).toBeTruthy()
      expect(t.description).toBeTruthy()
      expect(t.settingsPatch).toBeTruthy()
    }
  })

  it("每个模板 id 唯一", () => {
    const ids = BUILT_IN_TEMPLATES.map((t) => t.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it("每个模板 settingsPatch 不为空对象", () => {
    for (const t of BUILT_IN_TEMPLATES) {
      expect(Object.keys(t.settingsPatch).length).toBeGreaterThan(0)
    }
  })

  it("模板 patch 合并到当前 settings 后不会丢失必需字段", () => {
    for (const t of BUILT_IN_TEMPLATES) {
      const merged = { ...MINIMAL_SETTINGS, ...t.settingsPatch }
      // 验证所有 RenderSettings 字段仍存在
      expect(merged.borderColor).toBeDefined()
      expect(merged.borderTop).toBeDefined()
      expect(merged.borderBottom).toBeDefined()
      expect(merged.borderLeft).toBeDefined()
      expect(merged.borderRight).toBeDefined()
      expect(merged.textContent).toBeDefined()
      expect(merged.textFontSize).toBeDefined()
      expect(merged.textColor).toBeDefined()
      expect(merged.textPlacement).toBeDefined()
      expect(merged.textArea).toBeDefined()
      expect(merged.fontFamily).toBeDefined()
      expect(merged.autoCrop).toBeDefined()
      expect(merged.filmFormat).toBeDefined()
      expect(merged.gradient).toBeDefined()
      expect(merged.exportFormat).toBeDefined()
      expect(merged.jpegQuality).toBeDefined()
      expect(merged.textLayers).toBeDefined()
    }
  })

  it("至少有一个模板会把 textArea 设置为 border", () => {
    const hasBorderText = BUILT_IN_TEMPLATES.some((t) => t.settingsPatch.textArea === "border")
    expect(hasBorderText).toBe(true)
  })

  it("每个模板都有 thumb 配置", () => {
    for (const t of BUILT_IN_TEMPLATES) {
      expect(t.thumb).toBeDefined()
      expect(t.thumb.borderColor).toBeTruthy()
      expect(t.thumb.photoColor).toBeTruthy()
      expect(t.thumb.textColor).toBeTruthy()
      expect(t.thumb.bottomRatio).toBeGreaterThanOrEqual(0)
      expect(t.thumb.bottomRatio).toBeLessThanOrEqual(1)
    }
  })

  it("所有模板分类都在预期范围内", () => {
    const validCategories = ["经典", "胶片", "暗房", "档案"]
    for (const t of BUILT_IN_TEMPLATES) {
      expect(validCategories).toContain(t.category)
    }
  })

  it("内置模板不向用户暴露旧暗房变量", () => {
    const serialized = JSON.stringify(BUILT_IN_TEMPLATES)
    expect(serialized).not.toMatch(/\{(Developer|Scanner|Lab|RollName)\}/)
  })

  it("4 个多段文字模板都包含 textLayers 且至少 2 段", () => {
    const multiTextIds = ["darkroom-info-bar", "archive-two-line", "museum-caption", "contact-note-strip"]
    for (const id of multiTextIds) {
      const template = BUILT_IN_TEMPLATES.find((t) => t.id === id)
      expect(template, `模板 ${id} 应存在`).toBeDefined()
      const layers = template!.settingsPatch.textLayers
      expect(layers, `${id} 应包含 textLayers`).toBeDefined()
      expect(layers!.length).toBeGreaterThanOrEqual(2)
    }
  })

  it("Darkroom Info Bar 第一行是 {Camera} · {Lens}", () => {
    const template = BUILT_IN_TEMPLATES.find((t) => t.id === "darkroom-info-bar")
    expect(template).toBeDefined()
    const layers = template!.settingsPatch.textLayers!
    expect(layers[0]!.content).toBe("{Camera} · {Lens}")
    expect(layers[1]!.content).toBe("{CaptureFormat} · {Film}")
    // 第二行字号更小
    expect(layers[1]!.fontSize).toBeLessThan(layers[0]!.fontSize)
  })

  it("Contact Note Strip 有 3 段文字", () => {
    const template = BUILT_IN_TEMPLATES.find((t) => t.id === "contact-note-strip")
    expect(template).toBeDefined()
    const layers = template!.settingsPatch.textLayers!
    expect(layers.length).toBe(3)
    expect(layers[0]!.content).toBe("{Camera}")
    expect(layers[1]!.content).toBe("{Film}")
    expect(layers[2]!.content).toBe("{Location}")
  })

  it("旧模板（classic-white）经 normalizeTemplatePatch 迁移后，渲染 texts[0].content 与 textContent 一致", () => {
    const template = BUILT_IN_TEMPLATES.find((t) => t.id === "classic-white")!
    const normalizedPatch = normalizeTemplatePatch(template.settingsPatch)
    const merged = { ...MINIMAL_SETTINGS, ...normalizedPatch }
    const texts = buildTextsFromSettings(merged)
    expect(texts.length).toBeGreaterThan(0)
    expect(texts[0]!.content).toBe(template.settingsPatch.textContent)
  })

  it("旧模板（darkroom-black）迁移后渲染的文字内容与模板定义一致，不落回默认三段", () => {
    const template = BUILT_IN_TEMPLATES.find((t) => t.id === "darkroom-black")!
    const normalizedPatch = normalizeTemplatePatch(template.settingsPatch)
    const merged = { ...MINIMAL_SETTINGS, ...normalizedPatch }
    const texts = buildTextsFromSettings(merged)
    // 迁移后应只有 1 段 enabled（旧 textContent），2 段 disabled
    expect(texts.length).toBe(1)
    expect(texts[0]!.content).toBe("{Camera} · {Lens} · {Film}")
  })

  it("极简模板（minimal-black，无文字）迁移后不残留默认文字", () => {
    const template = BUILT_IN_TEMPLATES.find((t) => t.id === "minimal-black")!
    const normalizedPatch = normalizeTemplatePatch(template.settingsPatch)
    const merged = { ...MINIMAL_SETTINGS, ...normalizedPatch }
    const texts = buildTextsFromSettings(merged)
    expect(texts.length).toBe(0)
  })

  it("多段模板（darkroom-info-bar）迁移后渲染 2 段 enabled 文字", () => {
    const template = BUILT_IN_TEMPLATES.find((t) => t.id === "darkroom-info-bar")!
    const merged = { ...MINIMAL_SETTINGS, ...template.settingsPatch }
    const texts = buildTextsFromSettings(merged)
    expect(texts.length).toBe(2)
    expect(texts[0]!.content).toBe("{Camera} · {Lens}")
    expect(texts[1]!.content).toBe("{CaptureFormat} · {Film}")
  })

  it("Brand Mark Darkroom 品牌标识模板包含 logo 配置", () => {
    const template = BUILT_IN_TEMPLATES.find((t) => t.id === "brand-mark-darkroom")!
    expect(template).toBeDefined()
    expect(template.settingsPatch.logo).toBeDefined()
    expect(template.settingsPatch.logo!.enabled).toBe(true)
    expect(template.settingsPatch.logo!.mode).toBe("auto-brand")
    expect(template.settingsPatch.logo!.placement).toBe("border-top-right")
  })

  it("Brand Mark Archive 品牌标识模板包含 logo 配置", () => {
    const template = BUILT_IN_TEMPLATES.find((t) => t.id === "brand-mark-archive")!
    expect(template).toBeDefined()
    expect(template.settingsPatch.logo).toBeDefined()
    expect(template.settingsPatch.logo!.enabled).toBe(true)
    expect(template.settingsPatch.logo!.mode).toBe("auto-brand")
    expect(template.settingsPatch.logo!.placement).toBe("border-top-right")
  })

  it("Brand Mark Darkroom 品牌标识模板应用后 logo.enabled 为 true", () => {
    const template = BUILT_IN_TEMPLATES.find((t) => t.id === "brand-mark-darkroom")!
    const merged = { ...MINIMAL_SETTINGS, ...template.settingsPatch }
    expect(merged.logo.enabled).toBe(true)
    expect(merged.logo.mode).toBe("auto-brand")
  })

  it("Brand Mark Archive 品牌标识模板应用后 logo.enabled 为 true", () => {
    const template = BUILT_IN_TEMPLATES.find((t) => t.id === "brand-mark-archive")!
    const merged = { ...MINIMAL_SETTINGS, ...template.settingsPatch }
    expect(merged.logo.enabled).toBe(true)
    expect(merged.logo.mode).toBe("auto-brand")
  })
})
