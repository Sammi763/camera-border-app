import { describe, expect, it } from "vitest"
import { BUILT_IN_TEMPLATES } from "./builtInTemplates"
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
  autoCrop: false,
  filmFormat: null,
  gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
  exportFormat: "png",
  jpegQuality: 95,
}

describe("BUILT_IN_TEMPLATES", () => {
  it("内置模板不少于 8 个", () => {
    expect(BUILT_IN_TEMPLATES.length).toBeGreaterThanOrEqual(8)
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
})
