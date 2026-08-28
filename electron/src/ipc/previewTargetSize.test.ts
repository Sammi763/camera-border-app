import { describe, expect, it } from "vitest"
import { MAX_DIMENSION_CAP, resolvePreviewTargetSize } from "./previewTargetSize"

describe("resolvePreviewTargetSize 本地预览目标尺寸", () => {
  it("横图：同时遵守 maxWidth 与 maxHeight（纵横比保持）", () => {
    // 1600x1200 (4:3)，请求 400x400 → scale=0.25 → 400x300
    const target = resolvePreviewTargetSize(1600, 1200, 400, 400)
    expect(target).toEqual({ width: 400, height: 300 })
  })

  it("竖图：高度是约束时按 maxHeight 缩放", () => {
    // 1200x1600 (3:4)，请求 400x400 → scale=0.25 → 300x400
    const target = resolvePreviewTargetSize(1200, 1600, 400, 400)
    expect(target).toEqual({ width: 300, height: 400 })
  })

  it("超长图：maxWidth/maxHeight 无界时按 2048 封顶，且纵横比保持", () => {
    const wide = resolvePreviewTargetSize(8000, 6000, 99999, 99999)
    expect(wide!.width).toBeLessThanOrEqual(MAX_DIMENSION_CAP)
    expect(wide!.height).toBeLessThanOrEqual(MAX_DIMENSION_CAP)
    expect(wide!.width / wide!.height).toBeCloseTo(8000 / 6000, 5)
    expect(wide).toEqual({ width: 2048, height: 1536 })

    const tall = resolvePreviewTargetSize(6000, 8000, 99999, 99999)
    expect(tall!.height).toBeLessThanOrEqual(MAX_DIMENSION_CAP)
    expect(tall!.width / tall!.height).toBeCloseTo(6000 / 8000, 5)
  })

  it("原图小于请求时不得放大（scale=1 原样返回）", () => {
    const small = resolvePreviewTargetSize(100, 200, 400, 400)
    expect(small).toEqual({ width: 100, height: 200 })
  })

  it("窄边请求也不放大（min 语义）", () => {
    // 100x50，请求 1000x1000 → scale=1
    expect(resolvePreviewTargetSize(100, 50, 1000, 1000)).toEqual({ width: 100, height: 50 })
  })

  it("只给 maxWidth（maxHeight 无界）：按宽度约束缩放", () => {
    const target = resolvePreviewTargetSize(1600, 1200, 800, 99999)
    expect(target).toEqual({ width: 800, height: 600 })
  })

  it("只给 maxHeight（maxWidth 无界）：按高度约束缩放", () => {
    const target = resolvePreviewTargetSize(1600, 1200, 99999, 600)
    expect(target).toEqual({ width: 800, height: 600 })
  })

  it("结果边长不小于 1", () => {
    const target = resolvePreviewTargetSize(8000, 8000, 1, 1)
    expect(target!.width).toBeGreaterThanOrEqual(1)
    expect(target!.height).toBeGreaterThanOrEqual(1)
  })

  it("非法原图尺寸返回 null", () => {
    expect(resolvePreviewTargetSize(0, 100, 400, 400)).toBeNull()
    expect(resolvePreviewTargetSize(100, 0, 400, 400)).toBeNull()
    expect(resolvePreviewTargetSize(-1, 100, 400, 400)).toBeNull()
    expect(resolvePreviewTargetSize(Number.NaN, 100, 400, 400)).toBeNull()
    expect(resolvePreviewTargetSize(Number.POSITIVE_INFINITY, 100, 400, 400)).toBeNull()
  })

  it("自定义 cap 生效", () => {
    const target = resolvePreviewTargetSize(10000, 10000, 99999, 99999, 1000)
    expect(target!.width).toBe(1000)
    expect(target!.height).toBe(1000)
  })
})
