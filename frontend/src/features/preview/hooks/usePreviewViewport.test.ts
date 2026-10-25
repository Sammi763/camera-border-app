import { describe, expect, it } from "vitest"
import {
  type ViewportState,
  type ViewportDimensions,
  clampOffset,
  createInitialViewport,
  applyDragMove,
  applyResetToFit,
  applyResetToActual,
  applyDoubleClick,
  reconcileViewportBounds
} from "./viewportReducer"

const dims = (containerW: number, containerH: number, naturalW: number, naturalH: number): ViewportDimensions => ({
  containerW, containerH, naturalW, naturalH
})

describe("预览两态视口纯逻辑", () => {
  it("默认状态只有 fit 且 scale 为 1", () => {
    expect(createInitialViewport()).toEqual({ mode: "fit", scale: 1, offsetX: 0, offsetY: 0 })
  })

  it("内容小于容器时两个轴都精确居中", () => {
    expect(clampOffset(80, 100, 300)).toBe(100)
    expect(clampOffset(-80, 100, 200)).toBe(50)
  })

  it("内容溢出时只允许在容器边界内平移", () => {
    expect(clampOffset(20, 800, 400)).toBe(0)
    expect(clampOffset(-500, 800, 400)).toBe(-400)
    expect(clampOffset(-120, 800, 400)).toBe(-120)
  })

  it("actual 固定为 1:1，并按两个轴分别居中或落入溢出范围", () => {
    const result = applyResetToActual(dims(400, 300, 800, 200))
    expect(result).toEqual({ mode: "actual", scale: 1, offsetX: 0, offsetY: 50 })
  })

  it("尺寸未知时不进入 actual", () => {
    expect(applyResetToActual(dims(0, 300, 800, 200))).toEqual(createInitialViewport())
    expect(applyResetToActual(dims(400, 300, 0, 200))).toEqual(createInitialViewport())
  })

  it("双击只在 fit 与 actual 之间切换，不产生 custom", () => {
    const actual = applyDoubleClick(createInitialViewport(), dims(400, 300, 800, 600))
    expect(actual.mode).toBe("actual")
    expect(actual.scale).toBe(1)
    expect(applyDoubleClick(actual, dims(400, 300, 800, 600))).toEqual(applyResetToFit())
  })

  it("fit 拖拽不会创建第三种缩放状态", () => {
    const state = createInitialViewport()
    expect(applyDragMove(state, 60, 40, dims(400, 300, 800, 600))).toBe(state)
  })

  it("actual 拖拽按自然 Canvas 尺寸钳制且不变形", () => {
    const state: ViewportState = { mode: "actual", scale: 1, offsetX: -200, offsetY: -100 }
    const result = applyDragMove(state, -500, 500, dims(400, 300, 800, 600))
    expect(result).toEqual({ mode: "actual", scale: 1, offsetX: -400, offsetY: 0 })
  })

  it("actual resize 后溢出轴保留合法偏移，未溢出轴回到中心", () => {
    const state: ViewportState = { mode: "actual", scale: 1, offsetX: -350, offsetY: -20 }
    expect(reconcileViewportBounds(state, dims(500, 400, 800, 200))).toEqual({
      mode: "actual",
      scale: 1,
      offsetX: -300,
      offsetY: 100
    })
  })
})
