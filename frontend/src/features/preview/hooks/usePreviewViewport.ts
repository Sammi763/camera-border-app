/**
 * 预览两态视口 Hook。
 *
 * fit 与 actual 是唯一的展示状态；actual 保持 1:1 像素尺寸，内容溢出时只允许
 * 二维拖拽。滚轮自由缩放和 custom zoom 不属于产品契约，也不影响 RenderRecipe/导出。
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  type ViewportState,
  type ViewportMode,
  type ViewportDimensions,
  createInitialViewport,
  applyDragMove,
  applyResetToFit,
  applyResetToActual,
  applyDoubleClick,
  reconcileViewportBounds
} from "./viewportReducer"

export type { ViewportState, ViewportMode, ViewportDimensions }

export type ViewportController = {
  readonly state: ViewportState
  readonly handleDragMove: (deltaX: number, deltaY: number) => void
  readonly resetToFit: () => void
  readonly resetToActual: () => void
  readonly handleDoubleClick: () => void
  readonly isDragging: boolean
  readonly startDrag: () => void
  readonly endDrag: () => void
  readonly setDimensions: (containerW: number, containerH: number, naturalW: number, naturalH: number) => void
}

const ZERO_DIMS: ViewportDimensions = { containerW: 0, containerH: 0, naturalW: 0, naturalH: 0 }

export const usePreviewViewport = (imageKey: string | null): ViewportController => {
  const [state, setState] = useState<ViewportState>(createInitialViewport())
  const [isDragging, setIsDragging] = useState(false)
  const [dims, setDims] = useState<ViewportDimensions>(ZERO_DIMS)
  const dimsRef = useRef(dims)
  dimsRef.current = dims

  useEffect(() => {
    setState(createInitialViewport())
    setIsDragging(false)
  }, [imageKey])

  const setDimensions = useCallback((containerW: number, containerH: number, naturalW: number, naturalH: number): void => {
    const next = { containerW, containerH, naturalW, naturalH }
    setDims((previous) => previous.containerW === containerW
      && previous.containerH === containerH
      && previous.naturalW === naturalW
      && previous.naturalH === naturalH
      ? previous
      : next)
  }, [])

  useEffect(() => {
    setState((previous) => reconcileViewportBounds(previous, dims))
  }, [dims])

  const handleDragMove = useCallback((deltaX: number, deltaY: number): void => {
    setState((previous) => applyDragMove(previous, deltaX, deltaY, dimsRef.current))
  }, [])

  const resetToFit = useCallback((): void => {
    setState(applyResetToFit())
  }, [])

  const resetToActual = useCallback((): void => {
    setState((previous) => {
      const next = applyResetToActual(dimsRef.current)
      return next.mode === "fit" ? previous : next
    })
  }, [])

  const handleDoubleClick = useCallback((): void => {
    setState((previous) => applyDoubleClick(previous, dimsRef.current))
  }, [])

  const startDrag = useCallback((): void => {
    setIsDragging(true)
  }, [])

  const endDrag = useCallback((): void => {
    setIsDragging(false)
  }, [])

  return {
    state,
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
