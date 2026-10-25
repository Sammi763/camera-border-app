/**
 * 预览视口纯状态逻辑（不依赖 React）。
 *
 * 视口只有两种模式：
 * - fit：Canvas 的逻辑尺寸等于容器尺寸，渲染器在其中等比适应；
 * - actual：Canvas 的逻辑尺寸等于自然合成像素尺寸，scale 固定为 1，溢出时可拖拽。
 *
 * CSS 显示尺寸、Canvas backing store 和自然导出尺寸由组件分别记录；这里仅管理
 * actual Canvas 相对于容器的二维偏移，禁止重新引入滚轮或 custom 缩放状态。
 */

export type ViewportMode = "fit" | "actual"

export type ViewportState = {
  readonly mode: ViewportMode
  /** actual 模式固定为 1；保留字段是为了让诊断和现有调用方保持清晰。 */
  readonly scale: 1
  readonly offsetX: number
  readonly offsetY: number
}

export type ViewportDimensions = {
  readonly containerW: number
  readonly containerH: number
  /** 自然合成 Canvas 的逻辑像素尺寸（包含边框）。 */
  readonly naturalW: number
  readonly naturalH: number
}

const isValidDimensions = (dims: ViewportDimensions): boolean =>
  Number.isFinite(dims.containerW) && Number.isFinite(dims.containerH)
  && Number.isFinite(dims.naturalW) && Number.isFinite(dims.naturalH)
  && dims.containerW > 0 && dims.containerH > 0
  && dims.naturalW > 0 && dims.naturalH > 0

/** 小于容器时返回居中偏移，大于容器时返回可拖拽范围内的偏移。 */
export const clampOffset = (
  offset: number,
  contentSize: number,
  containerSize: number
): number => {
  if (!Number.isFinite(contentSize) || !Number.isFinite(containerSize) || containerSize <= 0) {
    return 0
  }
  if (contentSize <= containerSize) {
    return (containerSize - contentSize) / 2
  }
  const minimum = containerSize - contentSize
  const safeOffset = Number.isFinite(offset) ? offset : 0
  return Math.min(0, Math.max(minimum, safeOffset))
}

export const createInitialViewport = (): ViewportState => ({
  mode: "fit",
  scale: 1,
  offsetX: 0,
  offsetY: 0
})

export const applyResetToFit = (): ViewportState => createInitialViewport()

/** 切换到真实 1:1：自然 Canvas 不缩放，初始位置按两个轴分别居中。 */
export const applyResetToActual = (dims: ViewportDimensions): ViewportState => {
  if (!isValidDimensions(dims)) return createInitialViewport()
  return {
    mode: "actual",
    scale: 1,
    offsetX: clampOffset(0, dims.naturalW, dims.containerW),
    offsetY: clampOffset(0, dims.naturalH, dims.containerH)
  }
}

/** 在容器或自然 Canvas 尺寸变化后保持 actual 偏移合法；未溢出轴始终回到中心。 */
export const reconcileViewportBounds = (
  state: ViewportState,
  dims: ViewportDimensions
): ViewportState => {
  if (state.mode !== "actual" || !isValidDimensions(dims)) return state
  const next = {
    mode: "actual" as const,
    scale: 1 as const,
    offsetX: clampOffset(state.offsetX, dims.naturalW, dims.containerW),
    offsetY: clampOffset(state.offsetY, dims.naturalH, dims.containerH)
  }
  if (next.offsetX === state.offsetX && next.offsetY === state.offsetY && state.scale === 1) {
    return state
  }
  return next
}

export const applyDoubleClick = (
  state: ViewportState,
  dims: ViewportDimensions
): ViewportState => state.mode === "fit"
  ? applyResetToActual(dims)
  : applyResetToFit()

/** actual 模式拖拽两个轴分别钳制；fit 模式不因拖拽产生第三种缩放状态。 */
export const applyDragMove = (
  state: ViewportState,
  deltaX: number,
  deltaY: number,
  dims: ViewportDimensions
): ViewportState => {
  if (state.mode !== "actual" || !isValidDimensions(dims)) return state
  return {
    mode: "actual",
    scale: 1,
    offsetX: clampOffset(state.offsetX + deltaX, dims.naturalW, dims.containerW),
    offsetY: clampOffset(state.offsetY + deltaY, dims.naturalH, dims.containerH)
  }
}
