import { describe, expect, it } from "vitest"
import {
  calculatePreviewImageLayout,
  computeTextPosition,
  drawBorderStyle,
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

describe("computeTextPosition", () => {
  const args = {
    imgX: 100,
    imgY: 40,
    imgW: 400,
    imgH: 200,
    canvasW: 600,
    canvasH: 320,
    borderTop: 40,
    borderBottom: 80,
    borderLeft: 20,
    borderRight: 20,
    marginX: 10,
    marginY: 0,
  } as const
  const position = (area: "image" | "border", placement: string) => computeTextPosition(
    area,
    placement,
    args.imgX,
    args.imgY,
    args.imgW,
    args.imgH,
    args.canvasW,
    args.canvasH,
    args.borderTop,
    args.borderBottom,
    args.borderLeft,
    args.borderRight,
    args.marginX,
    args.marginY
  )

  it("支持图片区域的九宫格位置（包括无前缀 UI 值）", () => {
    expect(position("image", "top-left").align).toBe("left")
    expect(position("image", "center-right").align).toBe("right")
    expect(position("image", "bottom-center").y).toBe(240)
  })

  it("支持边框区域的六个位置（包括无前缀 UI 值）", () => {
    expect(position("border", "top-left").align).toBe("left")
    expect(position("border", "top-right").align).toBe("right")
    expect(position("border", "bottom-left").y).toBe(280)
  })
})

describe("drawBorderStyle", () => {
  it("负片边只有一侧条带时仍绘制该侧齿孔，且 135 齿孔保持双侧约束", () => {
    let holes = 0
    const context = {
      save: () => undefined,
      restore: () => undefined,
      fillRect: () => undefined,
      beginPath: () => undefined,
      closePath: () => undefined,
      roundRect: () => undefined,
      fill: () => { holes += 1 },
      set fillStyle(_value: string) { /* noop */ },
      set globalAlpha(_value: number) { /* noop */ }
    } as unknown as CanvasRenderingContext2D

    drawBorderStyle(context, {
      id: "negative-band",
      intensity: 80,
      edgeWidth: 8,
      holeCount: 4,
      paperTone: "#cfcfcf"
    }, 0, 0, 100, 100, 100, 120, 40, 0)
    expect(holes).toBe(4)

    holes = 0
    drawBorderStyle(context, {
      id: "film-perforation",
      intensity: 80,
      edgeWidth: 8,
      holeCount: 4,
      paperTone: "#e8e8e8"
    }, 0, 0, 100, 100, 100, 120, 40, 0)
    expect(holes).toBe(0)
  })
})
