import { describe, expect, it } from "vitest"
import { normalizeTemplatePatch, normalizeTemplateSettings, isLegacySettings } from "./normalizeTemplate"
import { migrateLegacyTemplateLayout } from "./legacyTemplateMigration"
import type { RenderSettings, TextLayerSettings } from "../../settings/types"

/** 构造最小合法旧格式 RenderSettings（不含 textLayers）。 */
const legacySettings: RenderSettings = {
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
  textLayers: [],
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

/** 构造最小合法多段格式 RenderSettings（含 textLayers）。 */
const multiLayerSettings: RenderSettings = {
  ...legacySettings,
  textLayers: [
    { ...legacySettings, id: "l1", enabled: true, content: "{Camera}", fontFamily: "serif", fontSize: 20, color: "#222222", placement: "bottom-center", textArea: "border", marginX: 0, marginY: 20, backgroundEnabled: false, backgroundColor: "#000000", backgroundPaddingX: 6, backgroundPaddingY: 3, shadowEnabled: false, shadowColor: "#000000", shadowBlur: 0, shadowOffsetX: 2, shadowOffsetY: 2, strokeEnabled: false, strokeColor: "#000000", strokeWidth: 1 } as TextLayerSettings,
  ],
}

describe("normalizeTemplatePatch", () => {
  it("patch 不含 textLayers 但含旧文字字段时，自动生成 textLayers", () => {
    const patch = normalizeTemplatePatch({
      textContent: "{Camera} · {Film}",
      textFontSize: 18,
      textColor: "#333333",
      textPlacement: "bottom-center",
      textArea: "border",
      fontFamily: "serif",
    })
    expect(patch.textLayers).toBeDefined()
    expect(patch.textLayers!.length).toBe(3)
    expect(patch.textLayers![0]!.enabled).toBe(true)
    expect(patch.textLayers![0]!.content).toBe("{Camera} · {Film}")
    expect(patch.textLayers![1]!.enabled).toBe(false)
    expect(patch.textLayers![2]!.enabled).toBe(false)
  })

  it("patch 已含 textLayers 时不迁移", () => {
    const patch = normalizeTemplatePatch({
      textLayers: [
        { ...multiLayerSettings.textLayers[0]!, id: "x1", content: "hello" },
      ],
    })
    expect(patch.textLayers!.length).toBe(1)
    expect(patch.textLayers![0]!.content).toBe("hello")
  })

  it("patch 不含任何文字字段时不迁移", () => {
    const patch = normalizeTemplatePatch({
      borderColor: "#000000",
      borderTop: 10,
    })
    expect(patch.textLayers).toBeUndefined()
  })

  it("旧 textContent 为空时生成空 textLayers（无文字）", () => {
    const patch = normalizeTemplatePatch({
      textContent: "",
      textFontSize: 14,
      textColor: "#000000",
      textPlacement: "bottom-center",
      textArea: "border",
      fontFamily: "sans-serif",
    })
    expect(patch.textLayers).toBeDefined()
    expect(patch.textLayers!.length).toBe(0)
  })

  it("旧模板布局字段只在 adapter 迁移时消费，不会写入当前设置补丁", () => {
    const patch = migrateLegacyTemplateLayout({
      filmFormat: "135",
      autoCrop: true,
    })
    expect(patch.imagePlacement).toMatchObject({ mode: "fill", targetAspectRatio: 1.5 })
    expect(patch.layoutPresetId).toBe("135")
    expect(patch).not.toHaveProperty("filmFormat")
    expect(patch).not.toHaveProperty("autoCrop")
  })
})

describe("normalizeTemplateSettings", () => {
  it("旧格式 settings（textLayers 为空 + textContent 非空）迁移到 textLayers", () => {
    const result = normalizeTemplateSettings(legacySettings)
    expect(result.textLayers.length).toBe(3)
    expect(result.textLayers[0]!.enabled).toBe(true)
    expect(result.textLayers[0]!.content).toBe("{Camera} · {Lens} · {Film}")
    expect(result.textLayers[1]!.enabled).toBe(false)
    expect(result.imagePlacement).toMatchObject({ mode: "fit", targetAspectRatio: null })
    expect(result).not.toHaveProperty("filmFormat")
  })

  it("旧模板画幅与裁剪字段只在 adapter 中转换为 v2 图片布局", () => {
    const result = normalizeTemplateSettings(migrateLegacyTemplateLayout({
      ...legacySettings,
      filmFormat: "135",
      autoCrop: true,
    }))
    expect(result.imagePlacement).toEqual({
      mode: "fill",
      focalX: 0.5,
      focalY: 0.5,
      rotation: 0,
      targetAspectRatio: 1.5
    })
    expect(result).not.toHaveProperty("filmFormat")
    expect(result).not.toHaveProperty("autoCrop")
  })

  it("已含 textLayers 的 settings 不迁移", () => {
    const result = normalizeTemplateSettings(multiLayerSettings)
    expect(result.textLayers.length).toBe(1)
    expect(result.textLayers[0]!.content).toBe("{Camera}")
  })

  it("旧 textContent 为空时迁移为空 textLayers", () => {
    const emptyText: RenderSettings = { ...legacySettings, textContent: "" }
    const result = normalizeTemplateSettings(emptyText)
    expect(result.textLayers.length).toBe(0)
  })

  it("极简模板（无文字）迁移后 textLayers 为空，不残留默认文字", () => {
    const minimalPatch = normalizeTemplatePatch({
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
    })
    const merged = { ...legacySettings, ...minimalPatch }
    const result = normalizeTemplateSettings(merged)
    expect(result.textLayers.length).toBe(0)
  })
})

describe("isLegacySettings", () => {
  it("textLayers 为空 + textContent 非空 → true", () => {
    expect(isLegacySettings(legacySettings)).toBe(true)
  })

  it("textLayers 非空 → false", () => {
    expect(isLegacySettings(multiLayerSettings)).toBe(false)
  })

  it("textLayers 为空 + textContent 也为空 → false", () => {
    expect(isLegacySettings({ ...legacySettings, textContent: "" })).toBe(false)
  })
})
