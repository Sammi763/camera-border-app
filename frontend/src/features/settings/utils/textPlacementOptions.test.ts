import { describe, expect, it } from "vitest"
import { normalizeTextPlacement, textPlacementOptions } from "./textPlacementOptions"

describe("文字位置选项", () => {
  it("图片区域提供九宫格，边框区域提供上下条带六个位置", () => {
    expect(textPlacementOptions("image")).toHaveLength(9)
    expect(textPlacementOptions("border")).toHaveLength(6)
  })

  it("迁移带前缀的旧值时保留位置语义", () => {
    expect(normalizeTextPlacement("image", "image-bottom-right")).toBe("bottom-right")
    expect(normalizeTextPlacement("border", "border-top-left")).toBe("top-left")
  })

  it("切换到不支持的区域位置时回退到稳定默认值", () => {
    expect(normalizeTextPlacement("border", "center")).toBe("bottom-center")
    expect(normalizeTextPlacement("border", "image-center-left")).toBe("bottom-center")
    expect(normalizeTextPlacement("image", "not-a-position")).toBe("center")
  })
})
