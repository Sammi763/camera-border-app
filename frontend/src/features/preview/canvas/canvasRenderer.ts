/**
 * Canvas 渲染器：在前端即时叠加边框和文字效果。
 *
 * 设计目标：
 * - 用户修改设置时，画面应立即变化，不等待后端
 * - 后端预览用于校验真实引擎输出，Canvas 用于即时反馈
 * - 同一套渲染逻辑同时服务于预览展示和导出下载
 */

import type { RenderSettings, TextArea } from "../../settings/types"

/** 将 CSS 颜色字符串解析为 Canvas 可用的颜色值。 */
const ensureColor = (color: string): string => {
  return color.trim().length > 0 ? color : "#000000"
}

/**
 * 根据文字放置区域、位置和图片/边框尺寸计算文字绘制坐标。
 */
const computeTextPosition = (
  textArea: TextArea,
  placement: string,
  imgX: number,
  imgY: number,
  imgW: number,
  imgH: number,
  canvasW: number,
  canvasH: number,
  borderTop: number,
  borderBottom: number
): { x: number; y: number; baseline: "top" | "middle" | "alphabetic" } => {
  const imageCenterX = imgX + imgW / 2
  const canvasCenterX = canvasW / 2

  if (textArea === "border") {
    switch (placement) {
      case "border-top-center":
      case "top-center":
        return { x: canvasCenterX, y: borderTop / 2, baseline: "middle" }
      case "border-bottom-center":
      case "bottom-center":
      default:
        return { x: canvasCenterX, y: canvasH - borderBottom / 2, baseline: "middle" }
    }
  }

  switch (placement) {
    case "image-top-center":
    case "top-center":
      return { x: imageCenterX, y: imgY + 16, baseline: "top" }
    case "image-center":
    case "center":
      return { x: imageCenterX, y: imgY + imgH / 2, baseline: "middle" }
    case "image-bottom-center":
    case "bottom-center":
    default:
      return { x: imageCenterX, y: imgY + imgH - 16, baseline: "alphabetic" }
  }
}

/**
 * 解析 placement 字符串，提取文字放置区域和位置。
 */
const parsePlacement = (placement: string): { area: TextArea; position: string } => {
  if (placement.startsWith("border-")) {
    return { area: "border", position: placement }
  }
  if (placement.startsWith("image-")) {
    return { area: "image", position: placement }
  }
  return { area: "image", position: placement }
}

/**
 * 将角度转换为弧度，并计算 Canvas createLinearGradient 需要的坐标。
 * 角度定义：0°=从上到下，90°=从左到右，以此类推。
 */
const angleToCoords = (
  angle: number,
  cx: number,
  cy: number,
  radius: number
): { x0: number; y0: number; x1: number; y1: number } => {
  const rad = (angle * Math.PI) / 180
  return {
    x0: cx - Math.sin(rad) * radius,
    y0: cy - Math.cos(rad) * radius,
    x1: cx + Math.sin(rad) * radius,
    y1: cy + Math.cos(rad) * radius
  }
}

/**
 * 在 Canvas 上绘制图片 + 边框（纯色或渐变） + 文字。
 *
 * 渲染顺序：边框底色/渐变 → 图片居中绘制 → 文字叠加
 * 这样边框自然"包裹"在图片外围，文字浮在图片上方。
 */
export const drawPreviewToCanvas = (
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  settings: RenderSettings
): void => {
  const ctx = canvas.getContext("2d")
  if (ctx === null) {
    return
  }

  const cw = canvas.width
  const ch = canvas.height

  const bt = settings.borderTop
  const bb = settings.borderBottom
  const bl = settings.borderLeft
  const br = settings.borderRight

  // 绘制边框背景（渐变或纯色）
  if (settings.gradient.enabled && settings.gradient.stops.length >= 2) {
    const stops = settings.gradient.stops
    const cx = cw / 2
    const cy = ch / 2
    const radius = Math.max(cw, ch) / 2

    let gradient: CanvasGradient
    if (settings.gradient.type === "radial") {
      gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
    } else {
      const coords = angleToCoords(settings.gradient.angle, cx, cy, radius)
      gradient = ctx.createLinearGradient(coords.x0, coords.y0, coords.x1, coords.y1)
    }

    for (const stop of stops) {
      gradient.addColorStop(stop.offset, ensureColor(stop.color))
    }
    ctx.fillStyle = gradient
  } else {
    ctx.fillStyle = ensureColor(settings.borderColor)
  }
  ctx.fillRect(0, 0, cw, ch)

  // 计算边框内可用区域
  const availW = Math.max(0, cw - bl - br)
  const availH = Math.max(0, ch - bt - bb)

  if (availW === 0 || availH === 0) {
    return
  }

  // 按比例缩放图片以适应可用区域
  const imgAspect = image.naturalWidth / image.naturalHeight
  const areaAspect = availW / availH
  let drawW: number
  let drawH: number
  if (imgAspect > areaAspect) {
    drawW = availW
    drawH = availW / imgAspect
  } else {
    drawH = availH
    drawW = availH * imgAspect
  }

  // 居中绘制图片
  const imgX = bl + (availW - drawW) / 2
  const imgY = bt + (availH - drawH) / 2
  ctx.drawImage(image, imgX, imgY, drawW, drawH)

  // 绘制文字（仅当文字内容非空时）
  const text = settings.textContent.trim()
  if (text.length > 0) {
    const fontSize = Math.max(8, settings.textFontSize) * (cw / 800)
    ctx.font = `${fontSize}px ${settings.fontFamily}`
    ctx.fillStyle = ensureColor(settings.textColor)
    ctx.textAlign = "center"

    const { position } = parsePlacement(settings.textPlacement)
    const pos = computeTextPosition(
      settings.textArea,
      position,
      imgX, imgY, drawW, drawH,
      cw, ch, bt, bb
    )
    ctx.textBaseline = pos.baseline
    ctx.fillText(text, pos.x, pos.y)
  }
}

/**
 * 导出用：在全分辨率 Canvas 上渲染图片 + 边框 + 文字，然后下载为 PNG。
 * 仅作为开发辅助工具保留，正式导出走引擎 render-jobs 端点。
 */
export const exportPreviewAsPng = (
  image: HTMLImageElement,
  settings: RenderSettings,
  fileName: string
): void => {
  const canvas = document.createElement("canvas")
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight

  drawPreviewToCanvas(canvas, image, settings)

  canvas.toBlob((blob) => {
    if (blob === null) {
      return
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }, "image/png")
}
