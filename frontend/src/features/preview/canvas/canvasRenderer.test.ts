import { describe, expect, it } from "vitest"
import {
  calculateFocalFromPointer,
  calculatePreviewImageLayout,
  computeTextPosition,
  drawBorderStyle,
  drawImageGridOverlay,
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

  it("90° 旋转时诊断区域使用旋转后的实际照片包围盒", () => {
    const layout = calculatePreviewImageLayout(
      640,
      360,
      64,
      48,
      0,
      0,
      0,
      0,
      { rotation: 90 }
    )

    expect(layout).not.toBeNull()
    expect(layout!.x).toBeCloseTo(185)
    expect(layout!.y).toBe(0)
    expect(layout!.width).toBeCloseTo(270)
    expect(layout!.height).toBeCloseTo(360)
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

describe("drawImageGridOverlay（构图辅助线）", () => {
  /** 记录绘制调用的最小 ctx 桩。 */
  const createRecordingContext = (): {
    context: CanvasRenderingContext2D
    segments: { from: { x: number; y: number }; to: { x: number; y: number } }[]
    strokes: number
    saveCount: number
    restoreCount: number
  } => {
    const segments: { from: { x: number; y: number }; to: { x: number; y: number } }[] = []
    let lastPoint: { x: number; y: number } | null = null
    let strokes = 0
    let saveCount = 0
    let restoreCount = 0
    const context = {
      save: () => { saveCount += 1 },
      restore: () => { restoreCount += 1 },
      beginPath: () => { lastPoint = null },
      moveTo: (x: number, y: number) => { lastPoint = { x, y } },
      lineTo: (x: number, y: number) => {
        segments.push({ from: lastPoint ?? { x, y }, to: { x, y } })
        lastPoint = { x, y }
      },
      stroke: () => { strokes += 1 }
    } as unknown as CanvasRenderingContext2D
    return { context, segments, get strokes() { return strokes }, get saveCount() { return saveCount }, get restoreCount() { return restoreCount } }
  }

  it("正常区域绘制 4 条三分线与 1 次中心十字（2 次 stroke）", () => {
    const recording = createRecordingContext()
    drawImageGridOverlay(recording.context, { x: 10, y: 20, width: 300, height: 150 })
    // 三分线 4 条（每条 1 段）+ 中心十字 2 段
    expect(recording.segments).toHaveLength(6)
    expect(recording.strokes).toBe(2)
    expect(recording.saveCount).toBe(1)
    expect(recording.restoreCount).toBe(1)
    // 竖向三分线：从区域顶边画到底边（排除中心十字的竖臂）
    const verticals = recording.segments.filter((s) => s.from.x === s.to.x && s.from.y === 20 && s.to.y === 170)
    expect(verticals.map((s) => s.from.x).sort((a, b) => a - b)).toEqual([110, 210])
    // 中心十字横臂：交点为区域中心 (160, 95)，臂长为短边 150 的 5%
    const cross = recording.segments[4]!
    expect(cross.from.x).toBeCloseTo(152.5)
    expect(cross.from.y).toBe(95)
    expect(cross.to.x).toBeCloseTo(167.5)
    expect(cross.to.y).toBe(95)
  })

  it("零尺寸或非法区域安全跳过，不产生任何绘制调用", () => {
    const recording = createRecordingContext()
    drawImageGridOverlay(recording.context, { x: 0, y: 0, width: 0, height: 100 })
    drawImageGridOverlay(recording.context, { x: 0, y: 0, width: 100, height: 0 })
    drawImageGridOverlay(recording.context, { x: 0, y: 0, width: Number.NaN, height: 100 })
    expect(recording.segments).toHaveLength(0)
    expect(recording.strokes).toBe(0)
    expect(recording.saveCount).toBe(0)
  })
})

describe("calculateFocalFromPointer（构图焦点换算）", () => {
  it("区域内指针换算为 0–1 归一化焦点", () => {
    const rect = { x: 10, y: 20, width: 100, height: 200 }
    expect(calculateFocalFromPointer({ x: 60, y: 120 }, rect)).toEqual({ focalX: 0.5, focalY: 0.5 })
    expect(calculateFocalFromPointer({ x: 10, y: 20 }, rect)).toEqual({ focalX: 0, focalY: 0 })
    expect(calculateFocalFromPointer({ x: 110, y: 220 }, rect)).toEqual({ focalX: 1, focalY: 1 })
  })

  it("区域外指针返回 null；非法输入安全处理", () => {
    const rect = { x: 0, y: 0, width: 100, height: 100 }
    expect(calculateFocalFromPointer({ x: -1, y: 50 }, rect)).toBeNull()
    expect(calculateFocalFromPointer({ x: 50, y: 100.5 }, rect)).toBeNull()
    expect(calculateFocalFromPointer({ x: Number.NaN, y: 0 }, rect)).toBeNull()
    expect(calculateFocalFromPointer({ x: 0, y: 0 }, { x: 0, y: 0, width: 0, height: 0 })).toBeNull()
  })
})
