import { describe, expect, it } from "vitest"
import { relativeLuminance, isDarkColor, autoContrastColor } from "./colorContrast"

describe("relativeLuminance", () => {
  it("黑色亮度为 0", () => {
    expect(relativeLuminance("#000000")).toBe(0)
  })

  it("白色亮度为 1", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 2)
  })

  it("灰色亮度约 0.5", () => {
    expect(relativeLuminance("#808080")).toBeCloseTo(0.5, 1)
  })

  it("纯红亮度约 0.3", () => {
    expect(relativeLuminance("#ff0000")).toBeCloseTo(0.299, 2)
  })

  it("纯绿亮度约 0.59", () => {
    expect(relativeLuminance("#00ff00")).toBeCloseTo(0.587, 2)
  })
})

describe("isDarkColor", () => {
  it("黑色是深色", () => {
    expect(isDarkColor("#000000")).toBe(true)
  })

  it("白色不是深色", () => {
    expect(isDarkColor("#ffffff")).toBe(false)
  })

  it("#1a1a1a 是深色", () => {
    expect(isDarkColor("#1a1a1a")).toBe(true)
  })

  it("#e8e2d8 不是深色", () => {
    expect(isDarkColor("#e8e2d8")).toBe(false)
  })

  it("#222222 是深色", () => {
    expect(isDarkColor("#222222")).toBe(true)
  })
})

describe("autoContrastColor", () => {
  it("深色边框返回浅色", () => {
    expect(autoContrastColor("#000000")).toBe("#f0f0f0")
  })

  it("浅色边框返回深色", () => {
    expect(autoContrastColor("#ffffff")).toBe("#222222")
  })

  it("#1a1a1a 返回浅色", () => {
    expect(autoContrastColor("#1a1a1a")).toBe("#f0f0f0")
  })

  it("#e8e2d8 返回深色", () => {
    expect(autoContrastColor("#e8e2d8")).toBe("#222222")
  })
})
