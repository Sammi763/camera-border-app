/**
 * 实时模板缩略图：用「当前照片」经同一套 Canvas 渲染器绘制模板效果。
 *
 * 关键点：
 * - 复用 drawPreviewToCanvas（与主预览/导出链路同一个渲染函数），
 *   保证缩略图、中间预览、单图导出、批量导出使用同一配置与几何；
 * - 内部画布按「图片尺寸 + 边框」的真实比例建立（长边压到 ≤900px 保证性能），
 *   通过 CSS 缩放显示，边框/风格装饰保持与真实渲染一致的比例；
 * - 无当前照片时由调用方回退到纯 CSS 缩略图。
 */

import { useEffect, useRef } from "react"
import type { RenderSettings } from "../../settings/types"
import { drawPreviewToCanvas, type CanvasDrawableSource } from "../../preview/canvas/canvasRenderer"
import { calculateImagePlacementGeometry } from "../../preview/canvas/imagePlacementGeometry"
import { imagePlacementFromSettings } from "../../settings/utils/imageArea"

/** 缩略图内部渲染的最长边上限（性能保护）。 */
const MAX_RENDER_DIM = 900

type LiveTemplateThumbnailProps = {
  /** 当前预览照片；null 时组件不渲染内容（调用方负责回退）。 */
  readonly image: HTMLImageElement | null
  /** 已合并模板 patch 的完整渲染设置。 */
  readonly settings: RenderSettings
}

export const LiveTemplateThumbnail = ({ image, settings }: LiveTemplateThumbnailProps): JSX.Element => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null || image === null) {
      return
    }

    // 长边超过上限时先缩到临时位图，避免大图逐卡重绘开销
    let sourceWidth = image.naturalWidth
    let sourceHeight = image.naturalHeight
    // drawable 必须是真正的 HTMLImageElement / HTMLCanvasElement，
    // 因为 drawPreviewToCanvas 内部会调用 ctx.drawImage(image, ...)，
    // 普通对象（只有 naturalWidth/naturalHeight）不是合法的 CanvasImageSource，
    // 浏览器会抛异常或直接跳过绘制，导致模板缩略图空白。
    let drawable: CanvasDrawableSource = image
    const largest = Math.max(sourceWidth, sourceHeight)
    if (largest > MAX_RENDER_DIM && largest > 0) {
      const k = MAX_RENDER_DIM / largest
      const off = document.createElement("canvas")
      off.width = Math.max(1, Math.round(sourceWidth * k))
      off.height = Math.max(1, Math.round(sourceHeight * k))
      off.getContext("2d")?.drawImage(image, 0, 0, off.width, off.height)
      drawable = off
      sourceWidth = off.width
      sourceHeight = off.height
    }

    // 内部分辨率 = 图片 + 边框的真实比例，CSS 负责缩小显示
    const placement = calculateImagePlacementGeometry(
      sourceWidth,
      sourceHeight,
      imagePlacementFromSettings(settings)
    )
    if (placement === null) {
      return
    }
    canvas.width = Math.max(1, Math.round(placement.targetWidth + settings.borderLeft + settings.borderRight))
    canvas.height = Math.max(1, Math.round(placement.targetHeight + settings.borderTop + settings.borderBottom))

    // 把真正的 drawable 传给共享渲染器，与主预览/导出链路同一份渲染逻辑。
    drawPreviewToCanvas(canvas, drawable, settings)
  }, [image, settings])

  if (image === null) {
    return <div className="liveThumbEmpty" aria-hidden="true" />
  }

  return (
    <canvas
      ref={canvasRef}
      className="liveThumbCanvas"
      aria-hidden="true"
    />
  )
}
