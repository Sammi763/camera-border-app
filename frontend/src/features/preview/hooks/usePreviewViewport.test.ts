import { describe, expect, it } from "vitest"
import {
  type ViewportState,
  type ViewportDimensions,
  clampScale,
  clampOffset,
  createInitialViewport,
  applyZoomTo,
  applyDragMove,
  applyResetToFit,
  applyResetToActual,
  applyDoubleClick,
  MIN_SCALE,
  MAX_SCALE
} from "./viewportReducer"

/** 辅助：构造尺寸。 */
const dims = (containerW: number, containerH: number, naturalW: number, naturalH: number): ViewportDimensions => ({
  containerW, containerH, naturalW, naturalH
})

describe("viewportReducer 纯逻辑", () => {
  describe("createInitialViewport", () => {
    it("默认 mode 为 fit，scale 为 1.0，偏移为 0", () => {
      const state = createInitialViewport()
      expect(state.mode).toBe("fit")
      expect(state.scale).toBe(1.0)
      expect(state.offsetX).toBe(0)
      expect(state.offsetY).toBe(0)
    })
  })

  describe("clampScale", () => {
    it("正常值不变", () => {
      expect(clampScale(1.0)).toBe(1.0)
      expect(clampScale(2.5)).toBe(2.5)
    })
    it("钳制到最大值", () => {
      expect(clampScale(100)).toBe(MAX_SCALE)
    })
    it("钳制到最小值", () => {
      expect(clampScale(0.001)).toBe(MIN_SCALE)
    })
    it("NaN 回退到 1.0", () => {
      expect(clampScale(NaN)).toBe(1.0)
    })
  })

  describe("clampOffset", () => {
    it("画布小于容器时偏移为 0（居中）", () => {
      expect(clampOffset(50, 100, 200)).toBe(0)
    })
    it("画布大于容器时钳制到有效范围", () => {
      expect(clampOffset(50, 400, 200)).toBe(0)
      expect(clampOffset(-300, 400, 200)).toBe(-200)
      expect(clampOffset(-100, 400, 200)).toBe(-100)
    })
  })

  describe("applyResetToFit", () => {
    it("重置为 fit 模式", () => {
      const state: ViewportState = { mode: "custom", scale: 3.0, offsetX: 50, offsetY: 30 }
      const result = applyResetToFit()
      expect(result.mode).toBe("fit")
      expect(result.scale).toBe(1.0)
    })
  })

  // ---- 二维 100% 测试 --------------------------------------------------------

  describe("applyResetToActual 二维计算", () => {
    it("非正方形容器：宽高比不同时取较大缩放比", () => {
      // 容器 400×200，自然尺寸 800×600
      // scaleW = 800/400 = 2.0, scaleH = 600/200 = 3.0 → 取 3.0
      const result = applyResetToActual(dims(400, 200, 800, 600))
      expect(result.mode).toBe("actual")
      expect(result.scale).toBe(3.0)
    })

    it("横图：宽 > 高，宽度决定缩放比", () => {
      // 容器 400×400，自然尺寸 1200×300
      // scaleW = 3.0, scaleH = 0.75 → 取 3.0
      const result = applyResetToActual(dims(400, 400, 1200, 300))
      expect(result.scale).toBe(3.0)
    })

    it("竖图：高 > 宽，高度决定缩放比", () => {
      // 容器 400×400，自然尺寸 300×1200
      // scaleW = 0.75, scaleH = 3.0 → 取 3.0
      const result = applyResetToActual(dims(400, 400, 300, 1200))
      expect(result.scale).toBe(3.0)
    })

    it("自然尺寸小于容器时仍大于 1.0（100% 不缩小）", () => {
      // 容器 800×600，自然尺寸 200×150
      // scaleW = 0.25, scaleH = 0.25 → 取 0.25
      const result = applyResetToActual(dims(800, 600, 200, 150))
      expect(result.scale).toBe(0.25)
    })

    it("尺寸为 0 时回退到 fit", () => {
      const result = applyResetToActual(dims(0, 200, 800, 600))
      expect(result.mode).toBe("fit")
      expect(result.scale).toBe(1.0)
    })
  })

  // ---- 双击测试 --------------------------------------------------------------

  describe("applyDoubleClick", () => {
    it("从 fit 切换到 actual", () => {
      const state = createInitialViewport()
      const result = applyDoubleClick(state, dims(400, 200, 800, 600))
      expect(result.mode).toBe("actual")
      expect(result.scale).toBe(3.0)
    })

    it("从 actual 切换回 fit", () => {
      const state: ViewportState = { mode: "actual", scale: 3.0, offsetX: 0, offsetY: 0 }
      const result = applyDoubleClick(state, dims(400, 200, 800, 600))
      expect(result.mode).toBe("fit")
      expect(result.scale).toBe(1.0)
    })

    it("从 custom 切换回 fit", () => {
      const state: ViewportState = { mode: "custom", scale: 3.5, offsetX: -50, offsetY: 30 }
      const result = applyDoubleClick(state, dims(400, 200, 800, 600))
      expect(result.mode).toBe("fit")
      expect(result.scale).toBe(1.0)
    })
  })

  // ---- 二维拖拽钳制测试 ------------------------------------------------------

  describe("applyDragMove 二维钳制", () => {
    it("X 和 Y 分别钳制：宽方向有富余，高方向无富余", () => {
      // 容器 400×200，scale=1.0 → 画布 400×200 = 容器
      // 拖拽 (10, 10) → 两轴都无富余，偏移钳制到 0
      const state = createInitialViewport()
      const result = applyDragMove(state, 10, 10, dims(400, 200, 800, 600))
      expect(result.offsetX).toBe(0)
      expect(result.offsetY).toBe(0)
    })

    it("X 和 Y 分别钳制：scale=2.0 时两轴都有富余", () => {
      // 容器 400×200，scale=2.0 → 画布 800×400
      // 拖拽 (-50, -30) → X 范围 [-400,0]，Y 范围 [-200,0]
      const state: ViewportState = { mode: "custom", scale: 2.0, offsetX: 0, offsetY: 0 }
      const result = applyDragMove(state, -50, -30, dims(400, 200, 800, 600))
      expect(result.offsetX).toBe(-50)
      expect(result.offsetY).toBe(-30)
    })

    it("X 钳制但 Y 不钳制：宽方向溢出，高方向不溢出", () => {
      // 容器 400×200，scale=2.0 → 画布 800×400
      // X 有富余（800 > 400），Y 有富余（400 > 200）
      // 但如果 scale=1.5 → 画布 600×300
      // X 有富余（600 > 400），Y 有富余（300 > 200）
      // 如果 scale=1.0 → 画布 400×200 = 容器，两轴都无富余
      // 如果容器 400×400, scale=2.0 → 画布 800×800
      // X 有富余，Y 有富余
      // 需要一个宽有富余但高没有的场景：
      // 容器 400×400, scale=1.5 → 画布 600×600 → 两轴都有富余
      // 容器 400×400, scale=0.5 → 画布 200×200 → 两轴都无富余
      // 不存在单轴有富余的情况，因为 canvas = container * scale 两轴一起放大
      // 但当容器非正方形时，单轴 maxOffset 不同
      // 容器 400×200, scale=3.0 → 画布 1200×600
      // X: maxOffset = 1200-400 = 800, Y: maxOffset = 600-200 = 400
      const state: ViewportState = { mode: "custom", scale: 3.0, offsetX: 0, offsetY: 0 }
      // 拖拽 (-500, -500) → X 在 [-800,0] 内保持 -500，Y 超出 [-400,0] 钳制到 -400
      const result = applyDragMove(state, -500, -500, dims(400, 200, 800, 600))
      expect(result.offsetX).toBe(-500)
      expect(result.offsetY).toBe(-400)
    })

    it("向右拖拽时钳制到 0（不能让画布左边露出空白）", () => {
      const state = createInitialViewport()
      const result = applyDragMove(state, 10, 20, dims(400, 200, 800, 600))
      expect(result.offsetX).toBe(0)
    })

    it("fit 模式下拖拽切换到 custom", () => {
      const state = createInitialViewport()
      const result = applyDragMove(state, 0, 0, dims(200, 200, 800, 600))
      expect(result.mode).toBe("custom")
    })
  })

  // ---- 二维缩放锚点测试 ------------------------------------------------------

  describe("applyZoomTo 二维计算", () => {
    it("缩放到指定比例", () => {
      const state = createInitialViewport()
      const result = applyZoomTo(state, 2.0, 0, 0, dims(400, 200, 800, 600))
      expect(result.mode).toBe("custom")
      expect(result.scale).toBe(2.0)
    })

    it("X 和 Y 偏移分别钳制", () => {
      // 容器 400×200，从 fit 缩放到 3.0，锚点在 (200, 100)
      const state = createInitialViewport()
      const result = applyZoomTo(state, 3.0, 200, 100, dims(400, 200, 800, 600))
      expect(result.scale).toBe(3.0)
      // 画布 1200×600，X maxOffset = 800, Y maxOffset = 400
      // 锚点 (200, 100)，ratio = 3.0
      // rawOffsetX = 200 - (200 - 0) * 3.0 = 200 - 600 = -400
      // rawOffsetY = 100 - (100 - 0) * 3.0 = 100 - 300 = -200
      // 两轴都在有效范围内
      expect(result.offsetX).toBe(-400)
      expect(result.offsetY).toBe(-200)
    })

    it("钳制到最大值", () => {
      const state = createInitialViewport()
      const result = applyZoomTo(state, 100, 0, 0, dims(400, 200, 800, 600))
      expect(result.scale).toBe(MAX_SCALE)
    })

    it("钳制到最小值", () => {
      const state = createInitialViewport()
      const result = applyZoomTo(state, 0.001, 0, 0, dims(400, 200, 800, 600))
      expect(result.scale).toBe(MIN_SCALE)
    })

    it("以鼠标位置为锚点缩放，锚点处内容保持不动", () => {
      // 容器 400×400，从 scale=2.0 缩放到 4.0，锚点 (100, 200)
      const state: ViewportState = { mode: "custom", scale: 2.0, offsetX: -200, offsetY: -400 }
      const result = applyZoomTo(state, 4.0, 100, 200, dims(400, 400, 800, 800))
      // ratio = 4.0 / 2.0 = 2.0
      // rawOffsetX = 100 - (100 - (-200)) * 2.0 = 100 - 600 = -500
      // rawOffsetY = 200 - (200 - (-400)) * 2.0 = 200 - 1200 = -1000
      // 画布 1600×1600，X maxOffset = 1200, Y maxOffset = 1200
      // -500 在 [-1200, 0] 内，-1000 在 [-1200, 0] 内
      expect(result.scale).toBe(4.0)
      expect(result.offsetX).toBe(-500)
      expect(result.offsetY).toBe(-1000)
    })
  })
})
