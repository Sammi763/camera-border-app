import { describe, expect, it } from "vitest"
import { applyFilmFormatSettings } from "./applyFilmFormat"
import type { RenderSettings } from "../types"

/** 一份带用户自定义边框与图片布局/尺寸设置的渲染设置。 */
const makeSettings = (): RenderSettings => ({
  borderColor: "#ff0000",
  borderTop: 111,
  borderBottom: 222,
  borderLeft: 333,
  borderRight: 444,
  textContent: "",
  textFontSize: 28,
  textColor: "#000000",
  textPlacement: "bottom-center",
  textArea: "border",
  fontFamily: "sans-serif",
  textLayers: [],
  gradient: { enabled: false, type: "linear", angle: 0, stops: [] },
  exportFormat: "jpeg",
  jpegQuality: 90,
  outputSizePreset: "original",
  customOutputLongEdge: 0,
  preserveMetadata: true,
  preserveColorProfile: true,
  preferHighBitDepth: false,
  borderStyle: null,
  logo: { enabled: false, mode: "auto-brand", brand: null, placement: "border-bottom-right", size: 48, colorMode: "auto-contrast" }
})

const fmt6x10 = { id: "6x10", label: "6x10", recommendedBorder: { top: 1, bottom: 2, left: 3, right: 4, color: "#ffffff" } }
const fmt6x12 = { id: "6x12", label: "6x12", recommendedBorder: { top: 9, bottom: 8, left: 7, right: 6, color: "#ffffff" } }

describe("applyFilmFormatSettings 画幅切换", () => {
  it("6x10 与 6x12 都可切换并填充推荐边框", () => {
    const s = makeSettings()
    const patch10 = applyFilmFormatSettings(s, "6x10", fmt6x10)
    expect(patch10.layoutPresetId).toBe("6x10")
    expect(patch10.imagePlacement?.targetAspectRatio).toBeCloseTo(25 / 14)
    expect(patch10.borderTop).toBe(1)
    expect(patch10.borderBottom).toBe(2)

    const patch12 = applyFilmFormatSettings(s, "6x12", fmt6x12)
    expect(patch12.layoutPresetId).toBe("6x12")
    expect(patch12.imagePlacement?.targetAspectRatio).toBeCloseTo(15 / 7)
    expect(patch12.borderTop).toBe(9)
  })

  it("切换画幅不会覆盖用户边框和图片模式/尺寸设置", () => {
    const s = makeSettings()
    const patch = applyFilmFormatSettings(s, "6x10", fmt6x10)
    // 画幅补丁里不应包含裁剪与尺寸字段
    expect("outputSizePreset" in patch).toBe(false)
    expect("customOutputLongEdge" in patch).toBe(false)
    // 用户手动设置的边框颜色保持不变
    expect("borderColor" in patch).toBe(false)
    // 未在补丁中的设置原样保留
    const merged = { ...s, ...patch }
    expect(merged.imagePlacement?.mode).toBe("fit")
    expect(merged.outputSizePreset).toBe("original")
    expect(merged.borderColor).toBe("#ff0000")
  })

  it("未知画幅（无推荐边框）只切换画幅 id，保留用户边框", () => {
    const s = makeSettings()
    const patch = applyFilmFormatSettings(s, "unknown-format", undefined)
    expect(patch.layoutPresetId).toBe("unknown-format")
    expect("borderTop" in patch).toBe(false)
    expect({ ...s, ...patch }.borderTop).toBe(111)
  })

  it("清除画幅（空 id）只清空 v2 目标比例，不动边框与图片模式", () => {
    const s = makeSettings()
    const patch = applyFilmFormatSettings(s, "", undefined)
    expect(patch.layoutPresetId).toBeNull()
    expect(patch.imagePlacement).toMatchObject({ mode: "fit", targetAspectRatio: null })
  })
})
