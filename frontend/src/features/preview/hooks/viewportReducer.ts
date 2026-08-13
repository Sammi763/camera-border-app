/**
 * 预览视口纯状态逻辑（不依赖 React）。
 *
 * 视口语义：
 * - fit：画布填满容器，渲染器将图片缩放到容器内（scale = 1.0）
 * - actual（100%）：画布按图片+边框的自然像素尺寸渲染，
 *   scale = max(naturalW / containerW, naturalH / containerH)
 *   确保 1 图片像素 = 1 画布像素，画布可能溢出容器
 * - custom：用户自定义缩放比例
 *
 * 所有缩放、拖拽、钳制逻辑分别使用 width/height，不做单一值近似。
 */

/** 最小缩放比例。 */
export const MIN_SCALE = 0.05

/** 最大缩放比例。 */
export const MAX_SCALE = 16.0

/** 缩放灵敏度（每次滚轮事件的缩放步进）。 */
export const WHEEL_ZOOM_STEP = 0.15

/** 视口模式。 */
export type ViewportMode = "fit" | "actual" | "custom"

/** 视口状态。 */
export type ViewportState = {
  readonly mode: ViewportMode
  readonly scale: number
  readonly offsetX: number
  readonly offsetY: number
}

/** 容器和图片的二维尺寸信息。 */
export type ViewportDimensions = {
  readonly containerW: number
  readonly containerH: number
  readonly naturalW: number
  readonly naturalH: number
}

/**
 * 钳制缩放比例到有效范围。
 */
export const clampScale = (scale: number): number => {
  if (!Number.isFinite(scale)) {
    return 1.0
  }
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

/**
 * 钳制单轴偏移量，确保画布边缘不会完全拖出容器。
 *
 * @param offset 当前偏移
 * @param canvasSize 画布在该轴的像素尺寸
 * @param containerSize 容器在该轴的像素尺寸
 */
export const clampOffset = (
  offset: number,
  canvasSize: number,
  containerSize: number
): number => {
  if (canvasSize <= containerSize) {
    return 0
  }
  const maxOffset = canvasSize - containerSize
  return Math.min(0, Math.max(-maxOffset, offset))
}

/** 创建初始视口状态（fit 模式）。 */
export const createInitialViewport = (): ViewportState => ({
  mode: "fit",
  scale: 1.0,
  offsetX: 0,
  offsetY: 0
})

/** 切换到 fit 模式。 */
export const applyResetToFit = (): ViewportState => createInitialViewport()

/**
 * 切换到 actual（100%）模式。
 *
 * scale = max(naturalW / containerW, naturalH / containerH)
 * 确保画布尺寸 = 自然像素尺寸，1 图片像素对应 1 画布像素。
 */
export const applyResetToActual = (dims: ViewportDimensions): ViewportState => {
  if (dims.naturalW <= 0 || dims.containerW <= 0 || dims.naturalH <= 0 || dims.containerH <= 0) {
    return createInitialViewport()
  }
  const scaleW = dims.naturalW / dims.containerW
  const scaleH = dims.naturalH / dims.containerH
  const scale = clampScale(Math.max(scaleW, scaleH))
  return { mode: "actual", scale, offsetX: 0, offsetY: 0 }
}

/**
 * 双击：在 fit 和 actual 之间切换。
 * custom 模式下双击也回到 fit。
 */
export const applyDoubleClick = (
  state: ViewportState,
  dims: ViewportDimensions
): ViewportState => {
  if (state.mode === "fit") {
    return applyResetToActual(dims)
  }
  return applyResetToFit()
}

/**
 * 以指定锚点为中心缩放（custom 模式）。
 *
 * X 和 Y 轴分别使用各自的容器尺寸计算画布尺寸和钳制偏移。
 *
 * @param state 当前视口状态
 * @param newScale 目标缩放比例
 * @param anchorX 鼠标在容器内的 X 坐标
 * @param anchorY 鼠标在容器内的 Y 坐标
 * @param dims 容器和图片尺寸
 */
export const applyZoomTo = (
  state: ViewportState,
  newScale: number,
  anchorX: number,
  anchorY: number,
  dims: ViewportDimensions
): ViewportState => {
  const clamped = clampScale(newScale)
  const ratio = clamped / state.scale
  const rawOffsetX = anchorX - (anchorX - state.offsetX) * ratio
  const rawOffsetY = anchorY - (anchorY - state.offsetY) * ratio
  // 画布尺寸 = 容器尺寸 × 缩放比例，X/Y 分别计算
  const canvasW = dims.containerW * clamped
  const canvasH = dims.containerH * clamped
  return {
    mode: "custom",
    scale: clamped,
    offsetX: clampOffset(rawOffsetX, canvasW, dims.containerW),
    offsetY: clampOffset(rawOffsetY, canvasH, dims.containerH)
  }
}

/**
 * 拖拽平移（带边界钳制）。
 *
 * X 和 Y 轴分别使用各自的画布和容器尺寸钳制。
 */
export const applyDragMove = (
  state: ViewportState,
  deltaX: number,
  deltaY: number,
  dims: ViewportDimensions
): ViewportState => {
  const scale = state.scale
  const canvasW = dims.containerW * scale
  const canvasH = dims.containerH * scale
  return {
    mode: state.mode === "fit" ? "custom" : state.mode,
    scale,
    offsetX: clampOffset(state.offsetX + deltaX, canvasW, dims.containerW),
    offsetY: clampOffset(state.offsetY + deltaY, canvasH, dims.containerH)
  }
}
