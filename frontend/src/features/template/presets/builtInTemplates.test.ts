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
  imagePlacement: { mode: "fit", focalX: 0.5, focalY: 0.5, rotation: 0, targetAspectRatio: null },
  gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
  exportFormat: "png",
  jpegQuality: 95,
  outputSizePreset: "original",
  customOutputLongEdge: 2048,
  preserveMetadata: false,
  preserveColorProfile: false,
  preferHighBitDepth: false,
  borderStyle: null,
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
      expect(merged.imagePlacement).toBeDefined()
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

  it("Polaroid 明确声明方形图片区和下边框视觉风格", () => {
    const template = BUILT_IN_TEMPLATES.find((item) => item.id === "polaroid")
    expect(template?.settingsPatch.imageArea).toMatchObject({
      orientation: "square",
      ratio: "1:1",
      displayMode: "fit"
    })
    expect(template?.settingsPatch.borderBottom).toBeGreaterThan(template?.settingsPatch.borderTop ?? 0)
    expect(template?.settingsPatch.borderStyle?.id).toBe("polaroid-shadow")
  })

  it("所有模板分类都在预期范围内", () => {
    const validCategories = ["经典", "胶片", "暗房", "档案", "风格"]
    for (const t of BUILT_IN_TEMPLATES) {
      expect(validCategories).toContain(t.category)
    }
  })

  it("首批 8 种确定性边框风格模板齐全，且 borderStyle 配置合法", () => {
    const styleIds = ["exhibition-line", "polaroid-shadow", "film-perforation", "mat-double-line",
      "torn-edge", "negative-band", "magazine-keyline", "archive-label-box"]
    for (const id of styleIds) {
      const template = BUILT_IN_TEMPLATES.find((t) =>
        t.settingsPatch.borderStyle?.id === id && t.category === "风格")
      expect(template, `缺少风格模板：${id}`).toBeDefined()
      const bs = template!.settingsPatch.borderStyle!
      expect(bs.intensity).toBeGreaterThanOrEqual(0)
      expect(bs.intensity).toBeLessThanOrEqual(100)
      expect(bs.edgeWidth).toBeGreaterThanOrEqual(0)
    }
    // 风格模板数量恰为 8（每种风格一个）
    const styleTemplateCount = BUILT_IN_TEMPLATES.filter((t) => t.category === "风格").length
    expect(styleTemplateCount).toBe(8)
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

  // ── 默认「摄影信息卡」画廊留白比例（P3 默认版式调整） ──────────
  // 仅自动应用（即默认「摄影信息卡」）调整边框与字号；其他手动模板与
  // 默认编辑器重置值不变。
  describe("photo-info-card 默认画廊卡纸感留白", () => {
    const photoInfoCard = BUILT_IN_TEMPLATES.find((t) => t.id === "photo-info-card")!
    const photoInfoCardLeft = BUILT_IN_TEMPLATES.find((t) => t.id === "photo-info-card-left")!
    const photoInfoCardDark = BUILT_IN_TEMPLATES.find((t) => t.id === "photo-info-card-dark")!
    const photoInfoCardDarkLeft = BUILT_IN_TEMPLATES.find((t) => t.id === "photo-info-card-dark-left")!

    it("photo-info-card：边框 56/160/56/56（更宽的画廊留白）", () => {
      expect(photoInfoCard.settingsPatch.borderTop).toBe(56)
      expect(photoInfoCard.settingsPatch.borderBottom).toBe(160)
      expect(photoInfoCard.settingsPatch.borderLeft).toBe(56)
      expect(photoInfoCard.settingsPatch.borderRight).toBe(56)
    })

    it("photo-info-card：底部居中字号 28px（更可读）", () => {
      const layers = photoInfoCard.settingsPatch.textLayers!
      expect(layers.length).toBeGreaterThan(0)
      const mainLayer = layers[0]!
      expect(mainLayer.fontSize).toBe(28)
      expect(mainLayer.placement).toBe("border-bottom-center")
    })

    it("photo-info-card：缩略图底边比例与新留白一致（≈ 0.4）", () => {
      expect(photoInfoCard.thumb.bottomRatio).toBeCloseTo(0.4, 1)
    })

    it("photo-info-card：描述提及「画廊」与「卡纸」", () => {
      expect(photoInfoCard.description).toContain("画廊")
      expect(photoInfoCard.description).toContain("卡纸")
    })

    it("photo-info-card：仍为白边（borderColor 白色）+ 文字深灰", () => {
      expect(photoInfoCard.settingsPatch.borderColor).toBe("#ffffff")
      const mainLayer = photoInfoCard.settingsPatch.textLayers![0]!
      expect(mainLayer.color).toBe("#222222")
    })

    it("photo-info-card：4 个变体同步调整（白边/黑边 × 居中/左下）", () => {
      // 白边·左下
      expect(photoInfoCardLeft.settingsPatch.borderTop).toBe(56)
      expect(photoInfoCardLeft.settingsPatch.borderBottom).toBe(160)
      expect(photoInfoCardLeft.settingsPatch.borderLeft).toBe(56)
      expect(photoInfoCardLeft.settingsPatch.borderRight).toBe(56)
      expect(photoInfoCardLeft.settingsPatch.textLayers![0]!.fontSize).toBe(28)
      expect(photoInfoCardLeft.settingsPatch.textLayers![0]!.placement).toBe("border-bottom-left")
      // 黑边·居中
      expect(photoInfoCardDark.settingsPatch.borderTop).toBe(56)
      expect(photoInfoCardDark.settingsPatch.borderBottom).toBe(160)
      expect(photoInfoCardDark.settingsPatch.borderLeft).toBe(56)
      expect(photoInfoCardDark.settingsPatch.borderRight).toBe(56)
      expect(photoInfoCardDark.settingsPatch.textLayers![0]!.fontSize).toBe(28)
      expect(photoInfoCardDark.settingsPatch.borderColor).toBe("#111111")
      // 黑边·左下
      expect(photoInfoCardDarkLeft.settingsPatch.borderTop).toBe(56)
      expect(photoInfoCardDarkLeft.settingsPatch.borderBottom).toBe(160)
      expect(photoInfoCardDarkLeft.settingsPatch.textLayers![0]!.fontSize).toBe(28)
    })

    it("其他手动模板与现有快照不调整边框（保持原有尺寸）", () => {
      // 经典白边、暗房黑边、极简白/黑 仍为旧值
      const classicWhite = BUILT_IN_TEMPLATES.find((t) => t.id === "classic-white")!
      const darkroomBlack = BUILT_IN_TEMPLATES.find((t) => t.id === "darkroom-black")!
      const minimalBlack = BUILT_IN_TEMPLATES.find((t) => t.id === "minimal-black")!
      const minimalWhite = BUILT_IN_TEMPLATES.find((t) => t.id === "minimal-white")!
      expect(classicWhite.settingsPatch.borderTop).toBe(30)
      expect(classicWhite.settingsPatch.borderBottom).toBe(80)
      expect(darkroomBlack.settingsPatch.borderTop).toBe(30)
      expect(darkroomBlack.settingsPatch.borderBottom).toBe(80)
      expect(minimalBlack.settingsPatch.borderTop).toBe(4)
      expect(minimalBlack.settingsPatch.borderBottom).toBe(4)
      expect(minimalWhite.settingsPatch.borderTop).toBe(4)
      expect(minimalWhite.settingsPatch.borderBottom).toBe(4)
    })
  })
})
