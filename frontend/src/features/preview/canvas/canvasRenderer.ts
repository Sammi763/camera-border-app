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

import type { BorderStyleSettings, RenderSettings, TextArea, TextLayerSettings } from "../../settings/types"
import { autoContrastColor } from "../../settings/utils/colorContrast"

/** 将 CSS 颜色字符串解析为 Canvas 可用的颜色值。 */
const ensureColor = (color: string): string => {
  return color.trim().length > 0 ? color : "#000000"
}

const clampNumber = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

/**
 * 边框风格绘制（Canvas 端）。
 *
 * 与 java-engine util/BorderStyleRenderer 使用同一套风格 ID、参数语义与几何规则
 * （几何规格的唯一权威定义见该类的类注释，本实现逐条对应）。
 * 未识别的 id / intensity=0 时不绘制任何内容（回退原行为）。
 */
export const drawBorderStyle = (
  ctx: CanvasRenderingContext2D,
  style: BorderStyleSettings,
  ix: number,
  iy: number,
  iw: number,
  ih: number,
  cw: number,
  ch: number,
  borderTop: number,
  borderBottom: number
): void => {
  if (!style || style.id.trim().length === 0) {
    return
  }
  const fi = clampNumber(style.intensity, 0, 100) / 100
  if (fi <= 0) {
    return
  }
  const ew = Math.max(0, Math.round(style.edgeWidth))
  const tone = ensureColor(style.paperTone)

  switch (style.id) {
    case "exhibition-line": {
      // 外扩 g=max(1,ew)，线宽 lw=max(1,round(ew*fi)) 的居中描边矩形
      const gap = Math.max(1, ew)
      const lw = Math.max(1, Math.round(ew * fi))
      ctx.strokeStyle = tone
      ctx.lineWidth = lw
      ctx.strokeRect(ix - gap, iy - gap, iw + 2 * gap, ih + 2 * gap)
      break
    }
    case "polaroid-shadow": {
      // 图片底边向下的线性渐变阴影带：高 max(2,ew*2)，rgba(0,0,0,0.35*fi)→透明
      const bandH = Math.max(2, ew * 2)
      const extend = Math.max(1, ew)
      const gradient = ctx.createLinearGradient(ix, iy + ih, ix, iy + ih + bandH)
      gradient.addColorStop(0, `rgba(0,0,0,${0.35 * fi})`)
      gradient.addColorStop(1, "rgba(0,0,0,0)")
      ctx.fillStyle = gradient
      ctx.fillRect(ix - extend, iy + ih, iw + 2 * extend, bandH)
      break
    }
    case "film-perforation": {
      // 齿孔：孔高 clamp(strip*0.45,3,60)，孔宽 ×1.4，圆角 r=孔宽*0.18，
      // n=clamp(holeCount,2,80)，spacing=cw/n，中心 x=spacing*(i+0.5)
      drawPerforationRows(ctx, tone, cw, ch, borderTop, borderBottom,
        clampNumber(style.holeCount, 2, 80), 0.45, 60, 1.4)
      break
    }
    case "mat-double-line": {
      // 双细线：内线外扩 max(2,ew*2)，间距 max(2,ew)，线宽 max(1,round(ew/3))
      const g1 = Math.max(2, ew * 2)
      const gap = Math.max(2, ew)
      const lw = Math.max(1, Math.round(ew / 3))
      ctx.strokeStyle = tone
      ctx.lineWidth = lw
      ctx.strokeRect(ix - g1, iy - g1, iw + 2 * g1, ih + 2 * g1)
      const g2 = g1 + gap
      ctx.strokeRect(ix - g2, iy - g2, iw + 2 * g2, ih + 2 * g2)
      break
    }
    case "torn-edge": {
      // 撕边：带宽 w=max(2,ew)，幅度 amp=max(1,w*fi)，步长 step=max(4,w)；
      // 锯齿顶点按序号奇偶交替收放（无随机数）
      const w = Math.max(2, ew)
      const amp = Math.max(1, w * fi)
      const step = Math.max(4, w)
      ctx.fillStyle = tone
      for (let x = ix, i = 0; x < ix + iw; x += step, i++) {
        const x2 = Math.min(x + step, ix + iw)
        const tipY = iy - Math.round(w * 0.35 + amp * (i % 2 === 0 ? 1 : 0.2))
        fillTriangle(ctx, x, iy, x2, iy, (x + x2) / 2, tipY)
      }
      for (let x = ix, i = 0; x < ix + iw; x += step, i++) {
        const x2 = Math.min(x + step, ix + iw)
        const tipY = iy + ih + Math.round(w * 0.35 + amp * (i % 2 === 0 ? 1 : 0.2))
        fillTriangle(ctx, x, iy + ih, x2, iy + ih, (x + x2) / 2, tipY)
      }
      for (let y = iy, i = 0; y < iy + ih; y += step, i++) {
        const y2 = Math.min(y + step, iy + ih)
        const tipX = ix - Math.round(w * 0.35 + amp * (i % 2 === 0 ? 1 : 0.2))
        fillTriangle(ctx, ix, y, ix, y2, tipX, (y + y2) / 2)
      }
      for (let y = iy, i = 0; y < iy + ih; y += step, i++) {
        const y2 = Math.min(y + step, iy + ih)
        const tipX = ix + iw + Math.round(w * 0.35 + amp * (i % 2 === 0 ? 1 : 0.2))
        fillTriangle(ctx, ix + iw, y, ix + iw, y2, tipX, (y + y2) / 2)
      }
      break
    }
    case "negative-band": {
      // 黑色条带覆盖：alpha=255*min(1,0.6+0.4fi)，再打小孔行（孔高 strip*0.32 clamp 2..40，×1.6）
      const alpha = Math.round(255 * Math.min(1, 0.6 + 0.4 * fi))
      ctx.fillStyle = `rgba(10,10,10,${alpha / 255})`
      if (borderTop > 0) {
        ctx.fillRect(0, 0, cw, borderTop)
      }
      if (borderBottom > 0) {
        ctx.fillRect(0, ch - borderBottom, cw, borderBottom)
      }
      // 小孔行（比 135 齿孔更小更密）
      drawPerforationRows(ctx, tone, cw, ch, borderTop, borderBottom,
        clampNumber(style.holeCount, 4, 100), 0.32, 40, 1.6)
      break
    }
    case "magazine-keyline": {
      // 双键线：粗线外扩 max(1,ew/4)、线宽 max(1,round(ew/2))；细线再外扩 ew+粗线宽、1px、40% 不透明
      const o = Math.max(1, Math.floor(ew / 4))
      const lwThick = Math.max(1, Math.round(ew / 2))
      ctx.strokeStyle = tone
      ctx.lineWidth = lwThick
      ctx.strokeRect(ix - o, iy - o, iw + 2 * o, ih + 2 * o)
      const o2 = o + ew + lwThick
      ctx.save()
      ctx.globalAlpha = 0.4
      ctx.lineWidth = 1
      ctx.strokeRect(ix - o2, iy - o2, iw + 2 * o2, ih + 2 * o2)
      ctx.restore()
      break
    }
    case "archive-label-box": {
      // 标签盒：仅下条带 ≥14px 绘制；盒高 clamp(bottom*0.5,8,26+ew)、右边距 max(6,ew*2)、
      // 盒宽 clamp(iw*0.28,60,cw-2m)；1px 描边 + 盒内 70%/45% 两条占位横线
      if (borderBottom < 14) {
        break
      }
      const boxH = clampNumber(Math.round(borderBottom * 0.5), 8, 26 + ew)
      const margin = Math.max(6, ew * 2)
      const boxW = clampNumber(Math.round(iw * 0.28), 60, cw - 2 * margin)
      const x2 = ix + iw - margin
      const x1 = x2 - boxW
      const cy = ch - borderBottom / 2
      const y1 = cy - boxH / 2

      ctx.strokeStyle = tone
      ctx.lineWidth = 1
      ctx.strokeRect(x1, y1, boxW, boxH)
      const line1W = Math.round(boxW * 0.7)
      const line2W = Math.round(boxW * 0.45)
      const line1X = x1 + (boxW - line1W) / 2
      const line2X = x1 + (boxW - line2W) / 2
      ctx.beginPath()
      ctx.moveTo(line1X, cy - Math.round(boxH * 0.15))
      ctx.lineTo(line1X + line1W, cy - Math.round(boxH * 0.15))
      ctx.moveTo(line2X, cy + Math.round(boxH * 0.15))
      ctx.lineTo(line2X + line2W, cy + Math.round(boxH * 0.15))
      ctx.stroke()
      break
    }
    default:
      // 未识别的风格 id：静默忽略
      break
  }
}

/** 在上/下边框条带各画一排圆角齿孔（几何与 Java drawPerforationRow 一致）。 */
const drawPerforationRows = (
  ctx: CanvasRenderingContext2D,
  color: string,
  cw: number,
  ch: number,
  borderTop: number,
  borderBottom: number,
  n: number,
  heightRatio: number,
  maxHeight: number,
  widthRatio: number
): void => {
  const strip = Math.min(borderTop, borderBottom)
  if (strip <= 0) {
    return
  }
  const holeH = clampNumber(strip * heightRatio, 3, maxHeight)
  const holeW = holeH * widthRatio
  const r = holeW * 0.18
  const spacing = cw / n
  ctx.fillStyle = color
  for (const centerY of [borderTop / 2, ch - borderBottom / 2]) {
    for (let i = 0; i < n; i++) {
      const cx = spacing * (i + 0.5)
      const x = cx - holeW / 2
      const y = centerY - holeH / 2
      ctx.beginPath()
      ctx.roundRect(x, y, holeW, holeH, r)
      ctx.fill()
    }
  }
}

const fillTriangle = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tx: number,
  ty: number
): void => {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.lineTo(tx, ty)
  ctx.closePath()
  ctx.fill()
}

/**
 * 根据文字放置区域、位置和图片/边框尺寸计算文字绘制坐标。
 *
 * 角落 placement（border-*-left / border-*-right）返回对应水平对齐方式，
 * x 为文字锚点（左对齐=左边缘，右对齐=右边缘，居中=中心）。
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
  borderLeft: number,
  borderRight: number,
  marginX: number,
  marginY: number
): { x: number; y: number; baseline: CanvasTextBaseline; align: CanvasTextAlign } => {
  const imageCenterX = imgX + imgW / 2
  const canvasCenterX = canvasW / 2
  const mX = Math.max(0, marginX)
  const mY = Math.max(0, marginY)

  if (textArea === "border") {
    switch (placement) {
      case "border-top-center":
      case "top-center":
        return { x: canvasCenterX, y: borderTop / 2 + mY, baseline: "middle", align: "center" }
      case "border-top-left":
        return { x: borderLeft + mX, y: borderTop / 2 + mY, baseline: "middle", align: "left" }
      case "border-top-right":
        return { x: canvasW - borderRight - mX, y: borderTop / 2 + mY, baseline: "middle", align: "right" }
      case "border-bottom-left":
        return { x: borderLeft + mX, y: canvasH - borderBottom / 2 + mY, baseline: "middle", align: "left" }
      case "border-bottom-right":
        return { x: canvasW - borderRight - mX, y: canvasH - borderBottom / 2 + mY, baseline: "middle", align: "right" }
      case "border-bottom-center":
      case "bottom-center":
      default:
        return { x: canvasCenterX, y: canvasH - borderBottom / 2 + mY, baseline: "middle", align: "center" }
    }
  }

  switch (placement) {
    case "image-top-center":
    case "top-center":
      return { x: imageCenterX, y: imgY + 16 + mY, baseline: "top", align: "center" }
    case "image-center":
    case "center":
      return { x: imageCenterX, y: imgY + imgH / 2 + mY, baseline: "middle", align: "center" }
    case "image-bottom-center":
    case "bottom-center":
    default:
      return { x: imageCenterX, y: imgY + imgH - 16 - mY, baseline: "alphabetic", align: "center" }
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
  bl: number,
  br: number,
  scale: number
): void => {
  const fontSize = Math.max(8, layer.fontSize) * scale
  ctx.font = `${fontSize}px ${layer.fontFamily}`
  const align: CanvasTextAlign = "center"

  const { position } = parsePlacement(layer.placement)
  const pos = computeTextPosition(
    layer.textArea, position,
    imgX, imgY, imgW, imgH,
    cw, ch, bt, bb, bl, br,
    layer.marginX,
    layer.marginY
  )

  ctx.textAlign = pos.align ?? align
  ctx.textBaseline = pos.baseline

  // 测量文字尺寸
  const metrics = ctx.measureText(content)
  const textWidth = metrics.width
  const textHeight = fontSize
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.75
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.25

  // 文字区域左上角：按对齐方式推导左边缘
  const textAlign = pos.align ?? align
  const textLeft = textAlign === "left"
    ? pos.x
    : textAlign === "right"
    ? pos.x - textWidth
    : pos.x - textWidth / 2
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
 * 渲染器接受的「可绘制来源」：图片或画布。
 *
 * 设计动机：实时模板缩略图会先把大图压到离屏画布再交给本渲染器，
 * 因此渲染器需要同时接受 HTMLImageElement 与 HTMLCanvasElement。
 * 二者都是合法的 CanvasImageSource，可直接传给 ctx.drawImage。
 */
export type CanvasDrawableSource = HTMLImageElement | HTMLCanvasElement

/** 读取来源的原始尺寸：图片用 natural*，画布用 width/height。 */
const getSourceSize = (image: CanvasDrawableSource): { width: number; height: number } =>
  image instanceof HTMLImageElement
    ? { width: image.naturalWidth, height: image.naturalHeight }
    : { width: image.width, height: image.height }

/**
 * 在 Canvas 上绘制图片 + 边框（纯色或渐变） + 多段文字。
 *
 * 渲染顺序：边框底色/渐变 -> 图片居中绘制 -> 多段文字依次叠加
 *
 * 注意：image 必须是真正的 HTMLImageElement 或 HTMLCanvasElement，
 * 传给 ctx.drawImage 时浏览器会按 CanvasImageSource 规则解析；
 * 用只有 naturalWidth/naturalHeight 的纯对象会导致绘制失败或抛异常。
 */
export const drawPreviewToCanvas = (
  canvas: HTMLCanvasElement,
  image: CanvasDrawableSource,
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
  const sourceSize = getSourceSize(image)
  const imgAspect = sourceSize.width / sourceSize.height
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

  // 边框风格装饰：绘制在边框背景与图片之上、文字与品牌标识之下。
  // 未识别的风格 id / null / intensity=0 时保持原始行为（与引擎语义一致）。
  if (settings.borderStyle !== null && settings.borderStyle !== undefined) {
    drawBorderStyle(ctx, settings.borderStyle, imgX, imgY, drawW, drawH, cw, ch, bt, bb)
  }

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
    drawTextLayer(ctx, layer, content, imgX, imgY, drawW, drawH, cw, ch, bt, bb, bl, br, scale)
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
