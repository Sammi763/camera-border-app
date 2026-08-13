/**
 * Canvas 渲染器：在前端即时叠加边框和文字效果。
 *
 * 设计目标：
 * - 用户修改设置时，画面应立即变化，不等待后端
 * - 后端预览用于校验真实引擎输出，Canvas 用于即时反馈
 * - 同一套渲染逻辑同时服务于预览展示和导出下载
 *
 * 阶段 2 升级：
 * - 支持多段文字图层（textLayers[]），不再只画单段
 * - 每段支持背景条、阴影、描边样式
 * - textLayers 是唯一的文字来源（normalizeTemplateSettings 已确保旧设置迁移）
 */

import type { RenderSettings, TextArea, TextLayerSettings } from "../../settings/types"
import { autoContrastColor } from "../../settings/utils/colorContrast"

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
  borderBottom: number,
  marginY: number
): { x: number; y: number; baseline: CanvasTextBaseline } => {
  const imageCenterX = imgX + imgW / 2
  const canvasCenterX = canvasW / 2
  const mY = Math.max(0, marginY)

  if (textArea === "border") {
    switch (placement) {
      case "border-top-center":
      case "top-center":
        return { x: canvasCenterX, y: borderTop / 2 + mY, baseline: "middle" }
      case "border-bottom-center":
      case "bottom-center":
      default:
        return { x: canvasCenterX, y: canvasH - borderBottom / 2 + mY, baseline: "middle" }
    }
  }

  switch (placement) {
    case "image-top-center":
    case "top-center":
      return { x: imageCenterX, y: imgY + 16 + mY, baseline: "top" }
    case "image-center":
    case "center":
      return { x: imageCenterX, y: imgY + imgH / 2 + mY, baseline: "middle" }
    case "image-bottom-center":
    case "bottom-center":
    default:
      return { x: imageCenterX, y: imgY + imgH - 16 - mY, baseline: "alphabetic" }
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
 * 绘制单个文字图层（含背景条 / 阴影 / 描边 / 正文）。
 */
const drawTextLayer = (
  ctx: CanvasRenderingContext2D,
  layer: TextLayerSettings,
  content: string,
  imgX: number,
  imgY: number,
  imgW: number,
  imgH: number,
  cw: number,
  ch: number,
  bt: number,
  bb: number,
  scale: number
): void => {
  const fontSize = Math.max(8, layer.fontSize) * scale
  ctx.font = `${fontSize}px ${layer.fontFamily}`
  ctx.textAlign = "center"

  const { position } = parsePlacement(layer.placement)
  const pos = computeTextPosition(
    layer.textArea, position,
    imgX, imgY, imgW, imgH,
    cw, ch, bt, bb,
    layer.marginY
  )

  ctx.textBaseline = pos.baseline

  // 测量文字尺寸
  const metrics = ctx.measureText(content)
  const textWidth = metrics.width
  const textHeight = fontSize
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.75
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.25

  // 文字区域左上角
  const textLeft = pos.x - textWidth / 2
  const textTop = pos.y - ascent

  // 1. 背景条
  if (layer.backgroundEnabled) {
    const padX = (layer.backgroundPaddingX || 4) * scale
    const padY = (layer.backgroundPaddingY || 3) * scale
    ctx.fillStyle = ensureColor(layer.backgroundColor)
    ctx.fillRect(
      textLeft - padX,
      textTop - padY,
      textWidth + padX * 2,
      textHeight + padY * 2
    )
  }

  // 2. 阴影
  if (layer.shadowEnabled) {
    ctx.save()
    ctx.shadowColor = ensureColor(layer.shadowColor)
    ctx.shadowBlur = (layer.shadowBlur || 0) * scale
    ctx.shadowOffsetX = (layer.shadowOffsetX || 0) * scale
    ctx.shadowOffsetY = (layer.shadowOffsetY || 0) * scale
    ctx.fillStyle = ensureColor(layer.color)
    ctx.fillText(content, pos.x, pos.y)
    ctx.restore()
  }

  // 3. 描边
  if (layer.strokeEnabled && (layer.strokeWidth || 0) > 0) {
    ctx.save()
    ctx.strokeStyle = ensureColor(layer.strokeColor)
    ctx.lineWidth = (layer.strokeWidth || 1) * scale
    ctx.lineJoin = "round"
    ctx.strokeText(content, pos.x, pos.y)
    ctx.restore()
  }

  // 4. 正文（阴影已在上面的 save/restore 块内处理，这里正常绘制）
  if (!layer.shadowEnabled) {
    ctx.fillStyle = ensureColor(layer.color)
    ctx.fillText(content, pos.x, pos.y)
  }
}

/**
 * 在 Canvas 上绘制图片 + 边框（纯色或渐变） + 多段文字。
 *
 * 渲染顺序：边框底色/渐变 → 图片居中绘制 → 多段文字依次叠加
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

  // 缩放比例：Canvas 宽度 / 800（基准宽度）
  const scale = cw / 800

  // 遍历 textLayers，每段独立绘制。
  // textLayers 是唯一的文字来源（normalizeTemplateSettings 已确保旧设置迁移）。
  // 如果 textLayers 为空数组，则不绘制任何文字。
  for (const layer of settings.textLayers) {
    if (!layer.enabled) {
      continue
    }
    const content = layer.content.trim()
    if (content.length === 0) {
      continue
    }
    drawTextLayer(ctx, layer, content, imgX, imgY, drawW, drawH, cw, ch, bt, bb, scale)
  }

  // 绘制品牌标识（Logo）
  if (settings.logo?.enabled) {
    let logoText: string
    if (settings.logo.mode === "brand-text") {
      logoText = (settings.logo.brand ?? "")
    } else {
      // auto-brand 模式：brand 已由 buildResolvedRenderSettings 解析后填入
      logoText = (settings.logo.brand ?? "")
    }
    if (logoText.trim().length > 0) {
      drawLogo(ctx, logoText.trim(), settings, cw, ch, bt, bb, bl, br, scale)
    }
  }
}

/**
 * 绘制品牌标识文字到边框区域。
 * 仅支持 6 种 border-* placement，未知 placement 跳过不绘制。
 */
const drawLogo = (
  ctx: CanvasRenderingContext2D,
  text: string,
  settings: RenderSettings,
  cw: number,
  ch: number,
  bt: number,
  bb: number,
  bl: number,
  br: number,
  scale: number
): void => {
  const placement = settings.logo.placement
  // 校验 placement 是否为已识别的 6 种边框位置之一
  const validPlacements = [
    "border-top-left", "border-top-center", "border-top-right",
    "border-bottom-left", "border-bottom-center", "border-bottom-right"
  ]
  if (!validPlacements.includes(placement)) {
    return
  }

  const fontSize = Math.max(8, settings.logo.size) * scale
  ctx.font = `bold ${fontSize}px sans-serif`
  ctx.textAlign = "left"
  ctx.textBaseline = "middle"

  // 确定颜色
  let color: string
  if (settings.logo.colorMode === "auto-contrast") {
    color = autoContrastColor(settings.borderColor)
  } else if (settings.logo.colorMode === "light") {
    color = "#f0f0f0"
  } else {
    color = "#222222"
  }

  // 计算 x 坐标（left / center / right）
  const margin = 12 * scale
  const metrics = ctx.measureText(text)
  const textWidth = metrics.width

  let x: number
  let y: number

  if (placement.includes("left")) {
    x = bl + margin
  } else if (placement.includes("right")) {
    x = cw - br - margin - textWidth
  } else {
    x = (cw - textWidth) / 2
  }

  // 计算 y 坐标（top / bottom）
  if (placement.includes("top")) {
    y = bt / 2
  } else {
    y = ch - bb / 2
  }

  ctx.fillStyle = ensureColor(color)
  ctx.fillText(text, x, y)
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
