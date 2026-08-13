import { describe, expect, it } from "vitest"
import {
  CUSTOM_LONG_EDGE_MAX,
  CUSTOM_LONG_EDGE_MIN,
  OUTPUT_SIZE_PRESETS,
  resolveOutputSizeLimit
} from "./outputSizePresets"

describe("outputSizePresets", () => {
  it("包含原图与全部尺寸预设", () => {
    const ids = OUTPUT_SIZE_PRESETS.map((p) => p.id)
    expect(ids).toEqual(["original", "1080p", "2k", "4k", "custom"])
  })

  it("原图尺寸返回 0/0（不缩放）", () => {
    expect(resolveOutputSizeLimit("original", 0)).toEqual({ maxWidth: 0, maxHeight: 0 })
  })

  it("1080P 以 1080 为长边上限", () => {
    expect(resolveOutputSizeLimit("1080p", 0)).toEqual({ maxWidth: 1080, maxHeight: 1080 })
  })

  it("2K 以 2048 为长边上限", () => {
    expect(resolveOutputSizeLimit("2k", 0)).toEqual({ maxWidth: 2048, maxHeight: 2048 })
  })

  it("4K 以 3840 为长边上限", () => {
    expect(resolveOutputSizeLimit("4k", 0)).toEqual({ maxWidth: 3840, maxHeight: 3840 })
  })

  it("自定义长边按输入值生效", () => {
    expect(resolveOutputSizeLimit("custom", 1600)).toEqual({ maxWidth: 1600, maxHeight: 1600 })
  })

  it("自定义长边钳制到合法范围", () => {
    expect(resolveOutputSizeLimit("custom", 10)).toEqual({ maxWidth: CUSTOM_LONG_EDGE_MIN, maxHeight: CUSTOM_LONG_EDGE_MIN })
    expect(resolveOutputSizeLimit("custom", 99999999)).toEqual({ maxWidth: CUSTOM_LONG_EDGE_MAX, maxHeight: CUSTOM_LONG_EDGE_MAX })
  })

  it("非法自定义长边回退到最小值", () => {
    expect(resolveOutputSizeLimit("custom", Number.NaN)).toEqual({ maxWidth: CUSTOM_LONG_EDGE_MIN, maxHeight: CUSTOM_LONG_EDGE_MIN })
  })
})
