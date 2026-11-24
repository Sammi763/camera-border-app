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
import {
  calculateImagePlacementGeometry,
  type ImagePlacement
} from "./imagePlacementGeometry"
import { imagePlacementFromSettings } from "../../settings/utils/imageArea"
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
 * scale 为渲染比例：edgeWidth 按其缩放（与 Java renderScale 语义一致），
 * borderTop/borderBottom 由调用方传入已缩放的画布像素值。
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
  borderBottom: number,
  scale = 1
): void => {
  if (!style || style.id.trim().length === 0) {
    return
  }
  const fi = clampNumber(style.intensity, 0, 100) / 100
  if (fi <= 0) {
    return
  }
  const ew = Math.max(0, Math.round(style.edgeWidth * scale))
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
      ctx.save()
      ctx.globalAlpha = fi
      drawPerforationRows(ctx, tone, cw, ch, borderTop, borderBottom,
        clampNumber(style.holeCount, 2, 80), 0.45, 3, 60, 1.4, false)
      ctx.restore()
      break
    }
    case "mat-double-line": {
      // 双细线：内线外扩 max(2,ew*2)，间距 max(2,ew)，线宽 max(1,round(ew/3))
      const g1 = Math.max(2, ew * 2)
      const gap = Math.max(2, ew)
      const lw = Math.max(1, Math.round(ew / 3))
      ctx.save()
      // 保留中画幅卡纸线的可读性；强度仍通过透明度变化，低强度也不能让线条
      // 在深色边框底上完全消失。
      ctx.globalAlpha = 0.2 + 0.8 * fi
      ctx.strokeStyle = tone
      ctx.lineWidth = lw
      ctx.strokeRect(ix - g1, iy - g1, iw + 2 * g1, ih + 2 * g1)
      const g2 = g1 + gap
      ctx.strokeRect(ix - g2, iy - g2, iw + 2 * g2, ih + 2 * g2)
      ctx.restore()
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
        clampNumber(style.holeCount, 4, 100), 0.32, 2, 40, 1.6, true)
      break
    }
    case "magazine-keyline": {
      // 双键线：粗线外扩 max(1,ew/4)、线宽 max(1,round(ew/2))；细线再外扩 ew+粗线宽、1px、40% 不透明
      const o = Math.max(1, Math.floor(ew / 4))
      const lwThick = Math.max(1, Math.round(ew / 2))
      ctx.save()
      ctx.globalAlpha = fi
      ctx.strokeStyle = tone
      ctx.lineWidth = lwThick
      ctx.strokeRect(ix - o, iy - o, iw + 2 * o, ih + 2 * o)
      const o2 = o + ew + lwThick
      ctx.globalAlpha = 0.4 * fi
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

      ctx.save()
      ctx.globalAlpha = fi
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
      ctx.restore()
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
  minHeight: number,
  maxHeight: number,
  widthRatio: number,
  allowSingleSide: boolean
): void => {
  // 135 齿孔要求上下条带同时存在；负片边允许只有一侧条带。
  const strip = Math.min(borderTop, borderBottom)
  const rows = !allowSingleSide && strip > 0
    ? [
        { centerY: borderTop / 2, strip },
        { centerY: ch - borderBottom / 2, strip }
      ]
    : allowSingleSide
      ? [
        ...(borderTop > 0 ? [{ centerY: borderTop / 2, strip: borderTop }] : []),
        ...(borderBottom > 0 ? [{ centerY: ch - borderBottom / 2, strip: borderBottom }] : [])
        ]
      : []
  if (rows.length === 0) return
  const spacing = cw / n
  ctx.fillStyle = color
  for (const row of rows) {
    const holeH = clampNumber(row.strip * heightRatio, minHeight, maxHeight)
    const rowHoleW = holeH * widthRatio
    const rowRadius = rowHoleW * 0.18
    for (let i = 0; i < n; i++) {
      const cx = spacing * (i + 0.5)
      const x = cx - rowHoleW / 2
      const y = row.centerY - holeH / 2
      ctx.beginPath()
      ctx.roundRect(x, y, rowHoleW, holeH, rowRadius)
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
export const computeTextPosition = (
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
      case "top-left":
        return { x: borderLeft + mX, y: borderTop / 2 + mY, baseline: "middle", align: "left" }
      case "border-top-right":
      case "top-right":
        return { x: canvasW - borderRight - mX, y: borderTop / 2 + mY, baseline: "middle", align: "right" }
      case "border-bottom-left":
      case "bottom-left":
        return { x: borderLeft + mX, y: canvasH - borderBottom / 2 + mY, baseline: "middle", align: "left" }
      case "border-bottom-right":
      case "bottom-right":
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
      return { x: imageCenterX, y: imgY + mY, baseline: "top", align: "center" }
    case "image-top-left":
    case "top-left":
      return { x: imgX + mX, y: imgY + mY, baseline: "top", align: "left" }
    case "image-top-right":
    case "top-right":
      return { x: imgX + imgW - mX, y: imgY + mY, baseline: "top", align: "right" }
    case "image-center-left":
    case "center-left":
      return { x: imgX + mX, y: imgY + imgH / 2 + mY, baseline: "middle", align: "left" }
    case "image-center":
    case "center":
      return { x: imageCenterX, y: imgY + imgH / 2 + mY, baseline: "middle", align: "center" }
    case "image-center-right":
    case "center-right":
      return { x: imgX + imgW - mX, y: imgY + imgH / 2 + mY, baseline: "middle", align: "right" }
    case "image-bottom-left":
    case "bottom-left":
      return { x: imgX + mX, y: imgY + imgH - mY, baseline: "alphabetic", align: "left" }
    case "image-bottom-right":
    case "bottom-right":
      return { x: imgX + imgW - mX, y: imgY + imgH - mY, baseline: "alphabetic", align: "right" }
    case "image-bottom-center":
    case "bottom-center":
    default:
      return { x: imageCenterX, y: imgY + imgH - mY, baseline: "alphabetic", align: "center" }
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
): PreviewRect => {
  const fontSize = Math.max(8, layer.fontSize) * scale
  ctx.font = `${fontSize}px ${layer.fontFamily}`
  const align: CanvasTextAlign = "center"
  const letterSpacing = (layer.letterSpacing ?? 0) * scale
  const lineSpacing = (layer.lineSpacing ?? 0) * scale

  const { position } = parsePlacement(layer.placement)
  const pos = computeTextPosition(
    layer.textArea, position,
    imgX, imgY, imgW, imgH,
    cw, ch, bt, bb, bl, br,
    // 边距与字号/字距一样属于原图像素语义，必须按同一渲染比例缩放
    layer.marginX * scale,
    layer.marginY * scale
  )

  ctx.textAlign = pos.align ?? align
  ctx.textBaseline = pos.baseline

  const lines = content.split("\n")
  const lineHeight = fontSize + lineSpacing
  const metrics = ctx.measureText(lines[0] ?? "")
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.75
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.25
  const lineWidths = lines.map((line) => measureSpacedText(ctx, line, letterSpacing))
  const textWidth = Math.max(0, ...lineWidths)
  const textHeight = fontSize * lines.length + Math.max(0, lines.length - 1) * lineSpacing

  // 文字区域左上角：按对齐方式推导左边缘
  const textAlign = pos.align ?? align
  const textLeft = textAlign === "left"
    ? pos.x
    : textAlign === "right"
    ? pos.x - textWidth
    : pos.x - textWidth / 2
  const textTop = pos.baseline === "top"
    ? pos.y
    : pos.baseline === "middle"
    ? pos.y - textHeight / 2
    : pos.y - textHeight + descent
  const firstBaseline = pos.baseline === "top"
    ? textTop
    : textTop + ascent

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
    drawSpacedTextLines(ctx, lines, pos.x, firstBaseline, lineHeight, pos.align, letterSpacing)
    ctx.restore()
  }

  // 3. 描边
  if (layer.strokeEnabled && (layer.strokeWidth || 0) > 0) {
    ctx.save()
    ctx.strokeStyle = ensureColor(layer.strokeColor)
    ctx.lineWidth = (layer.strokeWidth || 1) * scale
    ctx.lineJoin = "round"
    drawSpacedTextLines(ctx, lines, pos.x, firstBaseline, lineHeight, pos.align, letterSpacing, true)
    ctx.restore()
  }

  // 4. 正文（阴影只是额外效果，不能替代正文）
  ctx.fillStyle = ensureColor(layer.color)
  drawSpacedTextLines(ctx, lines, pos.x, firstBaseline, lineHeight, pos.align, letterSpacing)
  return { x: textLeft, y: textTop, width: Math.max(1, textWidth), height: Math.max(1, textHeight) }
}

const measureSpacedText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  letterSpacing: number
): number => {
  if (text.length <= 1) {
    return ctx.measureText(text).width
  }
  return ctx.measureText(text).width + letterSpacing * (text.length - 1)
}

/** Canvas 2D 没有统一的 letterSpacing API，逐字绘制保证预览可见地响应字距。 */
const drawSpacedText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  align: CanvasTextAlign,
  letterSpacing: number,
  stroke: boolean
): void => {
  if (letterSpacing === 0) {
    if (stroke) ctx.strokeText(text, x, y)
    else ctx.fillText(text, x, y)
    return
  }
  const width = measureSpacedText(ctx, text, letterSpacing)
  let cursor = align === "right" ? x - width : align === "center" ? x - width / 2 : x
  const previousAlign = ctx.textAlign
  ctx.textAlign = "left"
  for (const character of text) {
    if (stroke) ctx.strokeText(character, cursor, y)
    else ctx.fillText(character, cursor, y)
    cursor += ctx.measureText(character).width + letterSpacing
  }
  ctx.textAlign = previousAlign
}

const drawSpacedTextLines = (
  ctx: CanvasRenderingContext2D,
  lines: readonly string[],
  x: number,
  firstBaseline: number,
  lineHeight: number,
  align: CanvasTextAlign,
  letterSpacing: number,
  stroke = false
): void => {
  ctx.textAlign = align
  ctx.textBaseline = "alphabetic"
  lines.forEach((line, index) => {
    drawSpacedText(ctx, line, x, firstBaseline + index * lineHeight, align, letterSpacing, stroke)
  })
}

/**
 * 渲染器接受的「可绘制来源」：图片或画布。
 *
 * 设计动机：实时模板缩略图会先把大图压到离屏画布再交给本渲染器，
 * 因此渲染器需要同时接受 HTMLImageElement 与 HTMLCanvasElement。
 * 二者都是合法的 CanvasImageSource，可直接传给 ctx.drawImage。
 */
export type CanvasDrawableSource = HTMLImageElement | HTMLCanvasElement

/** Canvas 的逻辑 CSS 尺寸与 backing store 比例；导出像素不使用这份视口尺寸。 */
export type CanvasRenderDimensions = {
  readonly logicalWidth: number
  readonly logicalHeight: number
  readonly pixelRatio?: number
}

/** 读取来源的原始尺寸：图片用 natural*，画布用 width/height。 */
const getSourceSize = (image: CanvasDrawableSource): { width: number; height: number } =>
  image instanceof HTMLImageElement
    ? { width: image.naturalWidth, height: image.naturalHeight }
    : { width: image.width, height: image.height }

/** 即时预览中仍可辨认照片内容的最小边长。 */
export const MIN_VISIBLE_PREVIEW_IMAGE_EDGE = 24

/** Canvas 中实际照片区域的几何信息。 */
export type PreviewImageLayout = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * 一次合成的完整几何：照片、边框、文字、Logo、装饰全部由同一份结果驱动。
 *
 * 逻辑合成空间以「方向归一后的原图像素」为语义基准（RenderRecipe 的边框、
 * 字号、偏移都是原图像素值）；viewScale 把整个合成空间等比映射到画布逻辑
 * 像素。代理图只替代像素来源，不改变布局语义——这是「预览与导出同源一致」
 * 的核心：任何画布尺寸、DPR、输出档位下，边框:照片、文字:照片比例恒定。
 */
export type CompositionLayout = {
  /** 合成空间 -> 画布逻辑像素缩放系数；actual（100%）模式固定为 1。 */
  readonly viewScale: number
  /** 完整合成（照片+边框）在画布逻辑坐标中的矩形；fit 模式居中留白，actual 模式含视口平移。 */
  readonly compositionRect: PreviewRect
  /** placement 目标区域（裁切框），画布逻辑坐标。 */
  readonly targetRect: PreviewRect
  /** 旋转后实际照片包围盒，画布逻辑坐标。 */
  readonly photoRect: PreviewRect
  /** 缩放后的边框值（画布逻辑像素）。 */
  readonly borders: {
    readonly top: number
    readonly bottom: number
    readonly left: number
    readonly right: number
  }
}

/** 绘制视口输入：fit 适应画布；actual 1:1 原图坐标并按偏移平移。 */
export type CompositionViewport = {
  readonly mode: "fit" | "actual"
  readonly offsetX: number
  readonly offsetY: number
}

const nonNegative = (value: number): number =>
  Number.isFinite(value) && value > 0 ? value : 0

/**
 * 计算当前 Canvas 的完整合成布局。
 *
 * - fit：整个逻辑合成空间（照片目标区域 + 配方边框）等比缩放并居中放进画布，
 *   合成外的画布区域保持留白，不再把边框撑大到占满视口；
 * - actual：viewScale=1（1 原图像素 = 1 CSS px），按视口偏移平移，只绘制可视区域。
 *
 * 返回 null 表示无法构成可辨识的合成（输入非法或 fit 模式下照片小于
 * 最小可见边长），调用方应明确提示而不是绘制纯边框。
 */
export type CompositionLayoutOptions = {
  /**
   * 跳过 fit 模式的最小可见边长保护。交互坐标换算（焦点拖动、引导覆盖层）
   * 需要在极小视口下仍有合法目标矩形；绘制路径不跳过，保持「画不出可辨识
   * 照片就明确提示」的语义。
   */
  readonly skipMinVisibleGuard?: boolean
}

export const decorationScaleFor = (
  settings: Pick<RenderSettings, "layoutScale">,
  width: number,
  height: number
): number => settings.layoutScale === "photo-short-edge" ? Math.min(width, height) / 1000 : 1

export const calculateCompositionLayout = (
  canvasWidth: number,
  canvasHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  border: Pick<RenderSettings, "borderTop" | "borderBottom" | "borderLeft" | "borderRight" | "layoutScale">,
  imagePlacement?: Partial<ImagePlacement> | null,
  viewport?: CompositionViewport | null,
  options?: CompositionLayoutOptions
): CompositionLayout | null => {
  if (
    !Number.isFinite(canvasWidth) || !Number.isFinite(canvasHeight)
    || !Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight)
    || canvasWidth <= 0 || canvasHeight <= 0 || sourceWidth <= 0 || sourceHeight <= 0
  ) {
    return null
  }

  const geometry = calculateImagePlacementGeometry(sourceWidth, sourceHeight, imagePlacement)
  if (geometry === null) {
    return null
  }
  const scale = decorationScaleFor(border, geometry.targetWidth, geometry.targetHeight)
  const top = nonNegative(border.borderTop) * scale
  const bottom = nonNegative(border.borderBottom) * scale
  const left = nonNegative(border.borderLeft) * scale
  const right = nonNegative(border.borderRight) * scale
  // 逻辑合成空间：目标照片区域 + 配方边框（原图像素语义，代理图不参与）
  const compositionWidth = geometry.targetWidth + left + right
  const compositionHeight = geometry.targetHeight + top + bottom
  if (!(compositionWidth > 0) || !(compositionHeight > 0)) {
    return null
  }

  const mode = viewport?.mode === "actual" ? "actual" : "fit"
  let viewScale: number
  let originX: number
  let originY: number
  if (mode === "actual") {
    viewScale = 1
    originX = Number.isFinite(viewport?.offsetX) ? (viewport as CompositionViewport).offsetX : 0
    originY = Number.isFinite(viewport?.offsetY) ? (viewport as CompositionViewport).offsetY : 0
  } else {
    viewScale = Math.min(canvasWidth / compositionWidth, canvasHeight / compositionHeight)
    if (!Number.isFinite(viewScale) || viewScale <= 0) {
      return null
    }
    originX = (canvasWidth - compositionWidth * viewScale) / 2
    originY = (canvasHeight - compositionHeight * viewScale) / 2
  }

  const targetRect: PreviewRect = {
    x: originX + left * viewScale,
    y: originY + top * viewScale,
    width: geometry.targetWidth * viewScale,
    height: geometry.targetHeight * viewScale
  }
  // 诊断/辅助区域记录旋转后的实际照片包围盒；drawWidth/drawHeight 是旋转前
  // 原图尺寸，90° 时若直接使用会让像素取样落在照片外的留白中。
  const photoRect: PreviewRect = {
    x: targetRect.x + geometry.offsetX * viewScale,
    y: targetRect.y + geometry.offsetY * viewScale,
    width: geometry.rotatedWidth * viewScale,
    height: geometry.rotatedHeight * viewScale
  }
  if (
    mode === "fit"
    && options?.skipMinVisibleGuard !== true
    && (photoRect.width < MIN_VISIBLE_PREVIEW_IMAGE_EDGE || photoRect.height < MIN_VISIBLE_PREVIEW_IMAGE_EDGE)
  ) {
    return null
  }

  return {
    viewScale,
    compositionRect: {
      x: originX,
      y: originY,
      width: compositionWidth * viewScale,
      height: compositionHeight * viewScale
    },
    targetRect,
    photoRect,
    borders: {
      top: top * viewScale,
      bottom: bottom * viewScale,
      left: left * viewScale,
      right: right * viewScale
    }
  }
}

/** Canvas 逻辑坐标中的矩形区域。 */
export type PreviewRect = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * 在图片区域上绘制编辑态构图辅助线（三分线 + 中心十字）。
 *
 * 辅助线是编辑态叠加，不属于 RenderRecipe：只有 Canvas 即时预览调用，
 * 引擎渲染与导出结果不含网格。rect 为 Canvas 逻辑坐标中的照片区域；
 * 零尺寸或非法 rect 安全跳过。
 */
export const drawImageGridOverlay = (
  ctx: CanvasRenderingContext2D,
  rect: PreviewRect
): void => {
  if (
    !Number.isFinite(rect.x) || !Number.isFinite(rect.y)
    || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)
    || rect.width <= 0 || rect.height <= 0
  ) {
    return
  }
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height
  ctx.save()
  ctx.strokeStyle = "rgba(255, 255, 255, 0.65)"
  // 细微暗色投影保证亮部照片上仍可辨认
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)"
  ctx.shadowBlur = 1
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const fraction of [1 / 3, 2 / 3]) {
    const gridX = rect.x + rect.width * fraction
    const gridY = rect.y + rect.height * fraction
    ctx.moveTo(gridX, rect.y)
    ctx.lineTo(gridX, bottom)
    ctx.moveTo(rect.x, gridY)
    ctx.lineTo(right, gridY)
  }
  ctx.stroke()
  // 中心十字：短臂长度取区域短边的 5%
  const armLength = Math.min(rect.width, rect.height) * 0.05
  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2
  ctx.beginPath()
  ctx.moveTo(centerX - armLength, centerY)
  ctx.lineTo(centerX + armLength, centerY)
  ctx.moveTo(centerX, centerY - armLength)
  ctx.lineTo(centerX, centerY + armLength)
  ctx.stroke()
  ctx.restore()
}

/**
 * 把图片区域内的指针位置换算为归一化构图焦点（focalX/focalY，clamp 到 [0, 1]）。
 *
 * 指针在区域外、坐标非法或区域为零尺寸时返回 null，调用方应保持当前焦点不变。
 * 该换算只服务 Canvas 预览的编辑态拖动，不参与引擎渲染。
 */
export const calculateFocalFromPointer = (
  pointer: { readonly x: number; readonly y: number },
  rect: PreviewRect
): { focalX: number; focalY: number } | null => {
  if (
    !Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)
    || !Number.isFinite(rect.x) || !Number.isFinite(rect.y)
    || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)
    || rect.width <= 0 || rect.height <= 0
  ) {
    return null
  }
  if (
    pointer.x < rect.x || pointer.x > rect.x + rect.width
    || pointer.y < rect.y || pointer.y > rect.y + rect.height
  ) {
    return null
  }
  return {
    focalX: Math.min(1, Math.max(0, (pointer.x - rect.x) / rect.width)),
    focalY: Math.min(1, Math.max(0, (pointer.y - rect.y) / rect.height))
  }
}

/**
 * 在 Canvas 上绘制图片 + 边框（纯色或渐变） + 多段文字。
 *
 * 渲染顺序：边框背景（仅合成区域内）-> 图片居中绘制 -> 多段文字依次叠加
 *
 * 几何契约：
 * - sourceDimensions 给出方向归一后的原图像素尺寸（RenderRecipe 语义空间）；
 *   缺省时退化为图片自身尺寸（像素来源即语义空间，如导出工具链路）。
 * - 代理图（如最长边 1280 的预览图）只替代像素来源，所有布局按原图空间
 *   × viewScale 计算，保证与引擎渲染、导出构图一致。
 * - fit 模式整个合成居中放进画布，合成外保持透明（工作台背景呈现）；
 *   actual 模式 viewScale=1，按视口偏移平移只绘制可视区域。
 * - 返回本次合成的布局（供诊断/辅助线复用）；无法构成可辨识合成时返回 null。
 *
 * 注意：image 必须是真正的 HTMLImageElement 或 HTMLCanvasElement，
 * 传给 ctx.drawImage 时浏览器会按 CanvasImageSource 规则解析；
 * 用只有 naturalWidth/naturalHeight 的纯对象会导致绘制失败或抛异常。
 */
export const drawPreviewToCanvas = (
  canvas: HTMLCanvasElement,
  image: CanvasDrawableSource,
  settings: RenderSettings,
  logoImage?: CanvasDrawableSource | null,
  renderDimensions?: CanvasRenderDimensions,
  sourceDimensions?: { readonly width: number; readonly height: number } | null,
  viewport?: CompositionViewport | null,
  onTextBounds?: (id: string, index: number, rect: PreviewRect) => void
): CompositionLayout | null => {
  const ctx = canvas.getContext("2d")
  if (ctx === null) {
    return null
  }

  const pixelRatio = renderDimensions?.pixelRatio !== undefined
    && Number.isFinite(renderDimensions.pixelRatio)
    && renderDimensions.pixelRatio > 0
    ? renderDimensions.pixelRatio
    : 1
  const cw = renderDimensions?.logicalWidth ?? canvas.width / pixelRatio
  const ch = renderDimensions?.logicalHeight ?? canvas.height / pixelRatio

  // backing store 可能是 DPR 的倍数，后续所有 RenderRecipe 几何仍使用 CSS/逻辑像素。
  ctx.save()
  // 构图可能缩小或移动；必须在物理像素空间清除上一帧的全部像素，包括合成区域外。
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (pixelRatio !== 1) {
    ctx.scale(pixelRatio, pixelRatio)
  }

  const sourceSize = sourceDimensions ?? getSourceSize(image)
  const imagePlacement = imagePlacementFromSettings(settings)
  const layout = calculateCompositionLayout(
    cw,
    ch,
    sourceSize.width,
    sourceSize.height,
    settings,
    imagePlacement,
    viewport
  )
  if (layout === null) {
    ctx.restore()
    return null
  }

  const geometry = calculateImagePlacementGeometry(
    sourceSize.width,
    sourceSize.height,
    imagePlacement
  )
  if (geometry === null) {
    ctx.restore()
    return null
  }

  // 全部绘制在合成局部空间完成：合成外画布区域保持透明，由工作台背景呈现。
  // 局部尺寸即合成尺寸（画布逻辑像素），渐变坐标与引擎 GradientPainter 的
  // 合成空间坐标一致。
  const bt = layout.borders.top
  const bb = layout.borders.bottom
  const bl = layout.borders.left
  const br = layout.borders.right
  const localWidth = layout.compositionRect.width
  const localHeight = layout.compositionRect.height
  const targetX = layout.targetRect.x - layout.compositionRect.x
  const targetY = layout.targetRect.y - layout.compositionRect.y
  const targetW = layout.targetRect.width
  const targetH = layout.targetRect.height
  const photoX = layout.photoRect.x - layout.compositionRect.x
  const photoY = layout.photoRect.y - layout.compositionRect.y

  ctx.save()
  ctx.translate(layout.compositionRect.x, layout.compositionRect.y)

  // 绘制边框背景（渐变或纯色），只覆盖合成区域
  if (settings.gradient.enabled && settings.gradient.stops.length >= 2) {
    const stops = settings.gradient.stops
    const cx = localWidth / 2
    const cy = localHeight / 2
    const radius = Math.max(localWidth, localHeight) / 2

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
  ctx.fillRect(0, 0, localWidth, localHeight)

  // 照片：clip 到目标图片区域；fit 的留白显示已绘制的边框背景，fill 的溢出不会污染边框。
  ctx.save()
  ctx.beginPath()
  ctx.rect(targetX, targetY, targetW, targetH)
  ctx.clip()
  const drawCenterX = photoX + layout.photoRect.width * 0.5
  const drawCenterY = photoY + layout.photoRect.height * 0.5
  ctx.translate(drawCenterX, drawCenterY)
  ctx.rotate((geometry.rotation * Math.PI) / 180)
  ctx.drawImage(
    image,
    -(geometry.drawWidth * layout.viewScale) / 2,
    -(geometry.drawHeight * layout.viewScale) / 2,
    geometry.drawWidth * layout.viewScale,
    geometry.drawHeight * layout.viewScale
  )
  ctx.restore()

  const decorationScale = layout.viewScale * decorationScaleFor(settings, geometry.targetWidth, geometry.targetHeight)
  // 边框风格装饰：绘制在边框背景与图片之上、文字与品牌标识之下。
  // 未识别的风格 id / null / intensity=0 时保持原始行为（与引擎语义一致）。
  if (settings.borderStyle !== null && settings.borderStyle !== undefined) {
    drawBorderStyle(ctx, settings.borderStyle, targetX, targetY, targetW, targetH, localWidth, localHeight, bt, bb, decorationScale)
  }

  // 遍历 textLayers，每段独立绘制。
  // textLayers 是唯一的文字来源（normalizeTemplateSettings 已确保旧设置迁移）。
  // 如果 textLayers 为空数组，则不绘制任何文字。
  // 文字缩放 = viewScale：与边框/照片共用同一比例映射，替代旧的 cw/800 独立路径。
  for (const [index, layer] of settings.textLayers.entries()) {
    if (!layer.enabled) {
      continue
    }
    const content = layer.content.trim()
    if (content.length === 0) {
      continue
    }
    const bounds = drawTextLayer(ctx, layer, content, targetX, targetY, targetW, targetH, localWidth, localHeight, bt, bb, bl, br, decorationScale)
    onTextBounds?.(layer.id, index, {
      ...bounds, x: bounds.x + layout.compositionRect.x, y: bounds.y + layout.compositionRect.y
    })
  }

  // 绘制品牌标识（Logo）
  if (settings.logo?.enabled) {
    if (settings.logo.imagePath && logoImage) {
      drawLogoImage(ctx, logoImage, settings, localWidth, localHeight, bt, bb, bl, br, decorationScale)
    } else {
      let logoText: string
      if (settings.logo.mode === "brand-text") {
        logoText = (settings.logo.brand ?? "")
      } else {
        // auto-brand 模式：brand 已由 buildResolvedRenderSettings 解析后填入
        logoText = (settings.logo.brand ?? "")
      }
      if (logoText.trim().length > 0) {
        drawLogo(ctx, logoText.trim(), settings, localWidth, localHeight, bt, bb, bl, br, decorationScale)
      }
    }
  }
  ctx.restore()
  ctx.restore()
  return layout
}

/** 绘制自定义 PNG/签名；保持原图比例，size 表示最长边像素。 */
const drawLogoImage = (
  ctx: CanvasRenderingContext2D,
  image: CanvasDrawableSource,
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
  const validPlacements = [
    "border-top-left", "border-top-center", "border-top-right",
    "border-bottom-left", "border-bottom-center", "border-bottom-right"
  ]
  if (!validPlacements.includes(placement)) return

  const sourceWidth = image instanceof HTMLImageElement ? image.naturalWidth : image.width
  const sourceHeight = image instanceof HTMLImageElement ? image.naturalHeight : image.height
  if (sourceWidth <= 0 || sourceHeight <= 0) return
  const maxEdge = Math.max(8, settings.logo.size) * scale
  const imageScale = maxEdge / Math.max(sourceWidth, sourceHeight)
  const width = sourceWidth * imageScale
  const height = sourceHeight * imageScale
  const margin = 12 * scale
  const x = placement.includes("left")
    ? bl + margin
    : placement.includes("right")
      ? cw - br - margin - width
      : (cw - width) / 2
  const y = placement.includes("top")
    ? (bt - height) / 2
    : ch - bb + (bb - height) / 2

  ctx.save()
  ctx.globalAlpha = clampNumber(settings.logo.opacity ?? 1, 0, 1)
  if (settings.logo.autoContrast ?? settings.logo.colorMode === "auto-contrast") {
    // PNG 本身保持原色；细微反差阴影让透明签名在不同纸色上都可辨认。
    ctx.shadowColor = autoContrastColor(settings.borderColor)
    ctx.shadowBlur = Math.max(1, 2 * scale)
  }
  ctx.drawImage(image, x, y, width, height)
  ctx.restore()
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
  ctx.globalAlpha = clampNumber(settings.logo.opacity ?? 1, 0, 1)
  ctx.fillText(text, x, y)
  ctx.globalAlpha = 1
}

/**
 * 导出用：在全分辨率 Canvas 上渲染图片 + 边框 + 文字，然后下载为 PNG。
 * 仅作为开发辅助工具保留，正式导出走引擎 render-jobs 端点。
 *
 * Canvas 尺寸 = 完整合成（照片目标区域 + 边框），按 1:1 原图坐标绘制，
 * 与引擎导出的构图语义一致。
 */
export const exportPreviewAsPng = (
  image: HTMLImageElement,
  settings: RenderSettings,
  fileName: string
): void => {
  const sourceSize = getSourceSize(image)
  const geometry = calculateImagePlacementGeometry(
    sourceSize.width,
    sourceSize.height,
    imagePlacementFromSettings(settings)
  )
  if (geometry === null) {
    return
  }
  const scale = decorationScaleFor(settings, geometry.targetWidth, geometry.targetHeight)
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(
    geometry.targetWidth + Math.max(0, settings.borderLeft) * scale + Math.max(0, settings.borderRight) * scale
  ))
  canvas.height = Math.max(1, Math.round(
    geometry.targetHeight + Math.max(0, settings.borderTop) * scale + Math.max(0, settings.borderBottom) * scale
  ))

  drawPreviewToCanvas(
    canvas,
    image,
    settings,
    null,
    undefined,
    { width: sourceSize.width, height: sourceSize.height },
    { mode: "actual", offsetX: 0, offsetY: 0 }
  )

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
