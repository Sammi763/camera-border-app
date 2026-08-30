import { describe, expect, it } from "vitest"
import {
  calculatePreviewImageLayout,
  MIN_VISIBLE_PREVIEW_IMAGE_EDGE
} from "./canvasRenderer"

describe("calculatePreviewImageLayout", () => {
  it("默认摄影信息卡在足够的预览空间中保留实际照片区域", () => {
    const layout = calculatePreviewImageLayout(
      640,
      360,
      5035,
      3339,
      56,
      160,
      56,
      56
    )

    expect(layout).not.toBeNull()
    expect(layout!.width).toBeGreaterThan(MIN_VISIBLE_PREVIEW_IMAGE_EDGE)
    expect(layout!.height).toBeGreaterThan(MIN_VISIBLE_PREVIEW_IMAGE_EDGE)
  })

  it("边框已占满空间时返回 null，供界面显示明确提示而不是绘制纯边框", () => {
    expect(calculatePreviewImageLayout(
      640,
      216,
      5035,
      3339,
      56,
      160,
      56,
      56
    )).toBeNull()
  })

  it("即使可用空间为正，照片短边不足最小可见尺寸时仍返回 null", () => {
    expect(calculatePreviewImageLayout(
      640,
      239,
      5035,
      3339,
      56,
      160,
      56,
      56
    )).toBeNull()
  })

  it("零边框模板使用整个 Canvas 作为可绘制照片区域", () => {
    const layout = calculatePreviewImageLayout(
      640,
      360,
      5035,
      3339,
      0,
      0,
      0,
      0
    )

    expect(layout).not.toBeNull()
    expect(layout!.x).toBeCloseTo(48.5714)
    expect(layout!.y).toBe(0)
    expect(layout!.width).toBeCloseTo(542.8571)
    expect(layout!.height).toBe(360)
  })
})
