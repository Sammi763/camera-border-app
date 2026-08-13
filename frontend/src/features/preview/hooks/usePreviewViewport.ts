/**
 * 预览缩放/拖拽视口 Hook。
 *
 * 管理缩放级别和平移偏移，支持：
 * - 滚轮缩放（以鼠标位置为锚点，X/Y 独立计算）
 * - 双击在 fit / 100% 之间切换
 * - 按住拖拽平移（带二维边界钳制）
 * - 一键"适应窗口"/"100%"
 *
 * 缩放和平移只影响预览展示，不影响导出结果。
 * 纯状态逻辑在 viewportReducer.ts 中，便于单元测试。
 *
 * 容器尺寸变化时：
 * - fit 模式不受影响（scale 恒为 1.0）
 * - actual 模式重新计算 scale（naturalSize / newContainerSize）
 * - custom 模式保持 scale 不变，但偏移会被重新钳制
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  type ViewportState,
  type ViewportMode,
  type ViewportDimensions,
  clampScale,
  createInitialViewport,
  applyZoomTo,
  applyDragMove,
  applyResetToFit,
  applyResetToActual,
  applyDoubleClick,
  WHEEL_ZOOM_STEP
} from "./viewportReducer"

/** 重新导出类型，供外部使用。 */
export type { ViewportState, ViewportMode, ViewportDimensions }

/** 视口控制器。 */
export type ViewportController = {
  readonly state: ViewportState
  /** 处理滚轮缩放事件。 */
  readonly handleWheel: (e: React.WheelEvent<HTMLDivElement>) => void
  /** 处理拖拽移动。 */
  readonly handleDragMove: (deltaX: number, deltaY: number) => void
  /** 重置为适应窗口。 */
  readonly resetToFit: () => void
  /** 重置为 100%。 */
  readonly resetToActual: () => void
  /** 双击：在 fit 和 100% 之间切换。 */
  readonly handleDoubleClick: () => void
  /** 是否处于拖拽中。 */
  readonly isDragging: boolean
  /** 开始拖拽。 */
  readonly startDrag: () => void
  /** 结束拖拽。 */
  readonly endDrag: () => void
  /** 设置容器和图片尺寸（供 reducer 计算 fit/actual/clamp）。 */
  readonly setDimensions: (containerW: number, containerH: number, naturalW: number, naturalH: number) => void
}

/** 初始尺寸（全 0，表示未知）。 */
const ZERO_DIMS: ViewportDimensions = { containerW: 0, containerH: 0, naturalW: 0, naturalH: 0 }

/**
 * 预览视口 Hook。
 *
 * 切换图片时自动重置为适应窗口。
 * 容器 resize 时通过 setDimensions 更新尺寸，actual 模式会重新计算 scale。
 */
export const usePreviewViewport = (imageKey: string | null): ViewportController => {
  const [state, setState] = useState<ViewportState>(createInitialViewport())
  const [isDragging, setIsDragging] = useState(false)
  const [dims, setDims] = useState<ViewportDimensions>(ZERO_DIMS)
  const dimsRef = useRef(dims)
  const lastScaleRef = useRef(1.0)

  // 保持 ref 同步，供回调使用
  dimsRef.current = dims

  // 切换图片时重置
  useEffect(() => {
    setState(createInitialViewport())
    lastScaleRef.current = 1.0
  }, [imageKey])

  const setDimensions = useCallback((containerW: number, containerH: number, naturalW: number, naturalH: number): void => {
    const next = { containerW, containerH, naturalW, naturalH }
    setDims((prev) => {
      // 尺寸未变化时不触发更新
      if (prev.containerW === containerW && prev.containerH === containerH &&
          prev.naturalW === naturalW && prev.naturalH === naturalH) {
        return prev
      }
      return next
    })
  }, [])

  // 容器尺寸变化时，actual 模式重新计算 scale
  useEffect(() => {
    if (dims.containerW <= 0 || dims.containerH <= 0) return
    setState((prev) => {
      if (prev.mode === "actual") {
        // actual 模式：按新容器尺寸重新计算 scale
        const next = applyResetToActual(dims)
        lastScaleRef.current = next.scale
        return next
      }
      if (prev.mode === "custom") {
        // custom 模式：保持 scale，但重新钳制偏移
        const canvasW = dims.containerW * prev.scale
        const canvasH = dims.containerH * prev.scale
        // 复用 applyDragMove 做钳制（deltaX=0, deltaY=0）
        const clamped = applyDragMove(prev, 0, 0, dims)
        return clamped
      }
      // fit 模式不受影响
      return prev
    })
  }, [dims])

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>): void => {
    const d = dimsRef.current
    if (d.containerW <= 0 || d.containerH <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const anchorX = e.clientX - rect.left
    const anchorY = e.clientY - rect.top
    const delta = e.deltaY > 0 ? -WHEEL_ZOOM_STEP : WHEEL_ZOOM_STEP
    const newScale = lastScaleRef.current * (1 + delta)
    setState((prev) => applyZoomTo(prev, newScale, anchorX, anchorY, d))
    lastScaleRef.current = clampScale(newScale)
  }, [])

  const handleDragMove = useCallback((deltaX: number, deltaY: number): void => {
    const d = dimsRef.current
    if (d.containerW <= 0 || d.containerH <= 0) return
    setState((prev) => applyDragMove(prev, deltaX, deltaY, d))
  }, [])

  const resetToFit = useCallback((): void => {
    setState(applyResetToFit())
    lastScaleRef.current = 1.0
  }, [])

  const resetToActual = useCallback((): void => {
    const d = dimsRef.current
    if (d.containerW <= 0 || d.containerH <= 0) return
    const next = applyResetToActual(d)
    setState(next)
    lastScaleRef.current = next.scale
  }, [])

  const handleDoubleClick = useCallback((): void => {
    const d = dimsRef.current
    if (d.containerW <= 0 || d.containerH <= 0) return
    setState((prev) => {
      const next = applyDoubleClick(prev, d)
      lastScaleRef.current = next.scale
      return next
    })
  }, [])

  const startDrag = useCallback((): void => {
    setIsDragging(true)
  }, [])

  const endDrag = useCallback((): void => {
    setIsDragging(false)
  }, [])

  return {
    state,
    handleWheel,
    handleDragMove,
    resetToFit,
    resetToActual,
    handleDoubleClick,
    isDragging,
    startDrag,
    endDrag,
    setDimensions
  }
}
