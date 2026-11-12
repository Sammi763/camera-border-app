/**
 * 实时模板缩略图：用「当前照片」经同一套 Canvas 渲染器绘制模板效果。
 *
 * 关键点：
 * - 复用 drawPreviewToCanvas（与主预览/导出链路同一个渲染函数），
 *   保证缩略图、中间预览、单图导出、批量导出使用同一配置与几何；
 * - sourceDimensions 提供方向归一后的原图事实时，缩略图几何与主预览
 *   完全同源（边框/文字按同一比例映射）；缺省时退化为代理图语义；
 * - 内部画布长边 ≤ MAX_RENDER_DIM 控制性能，CSS 负责缩小显示；
 * - 仅在卡片进入可视范围（含少量预载边距）时绘制，屏幕外卡片不建立
 *   像素缓冲（U08）；drawable 由调用方共享，避免每卡重复压缩；
 * - 无当前照片时由调用方回退到纯 CSS 缩略图。
 */

import { useEffect, useRef, useState } from "react"
import type { RenderSettings } from "../../settings/types"
import { drawPreviewToCanvas, type CanvasDrawableSource } from "../../preview/canvas/canvasRenderer"
import { calculateImagePlacementGeometry } from "../../preview/canvas/imagePlacementGeometry"
import { imagePlacementFromSettings } from "../../settings/utils/imageArea"

/** 缩略图内部渲染的最长边上限（性能保护）；画廊共享位图复用同一上限。 */
export const MAX_RENDER_DIM = 900

/** IntersectionObserver 预载边距：提前半个视口开始绘制，滚动时不露白。 */
const VISIBILITY_ROOT_MARGIN = "50%"

type LiveTemplateThumbnailProps = {
  /** 当前预览照片；null 时组件不渲染内容（调用方负责回退）。 */
  readonly image: HTMLImageElement | null
  /** 已合并模板 patch 的完整渲染设置（含有效文字/品牌解析结果）。 */
  readonly settings: RenderSettings
  /**
   * 方向归一后的原图像素事实（与主预览同源）。
   * 提供时缩略图几何按原图空间 × viewScale 计算；缺省时以图片自身尺寸为语义。
   */
  readonly sourceDimensions?: { readonly width: number; readonly height: number } | null
  /** 调用方共享的缩小位图（同一照片的各卡片复用，避免逐卡重复压缩）。 */
  readonly sharedDrawable?: CanvasDrawableSource | null
}

export const LiveTemplateThumbnail = ({
  image,
  settings,
  sourceDimensions = null,
  sharedDrawable = null
}: LiveTemplateThumbnailProps): JSX.Element => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  // 浏览器提供观察器时先不绘制，等 IntersectionObserver 判定可见后再画；
  // 无观察器环境（测试/降级）保持 true，避免空画廊。
  const [isVisible, setIsVisible] = useState(() => typeof IntersectionObserver === "undefined")

  // 仅可视卡片绘制：滚动接近时提前触发（rootMargin 预载），离开后停止重绘。
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (wrapper === null || typeof IntersectionObserver === "undefined") {
      return
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        setIsVisible(entry.isIntersecting)
      }
    }, { rootMargin: VISIBILITY_ROOT_MARGIN })
    observer.observe(wrapper)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null || image === null || !isVisible) {
      return
    }

    // 共享 drawable 优先：调用方已按上限压缩过一次，各卡片不再重复建立离屏画布。
    let drawable: CanvasDrawableSource = sharedDrawable ?? image
    let sourceWidth = sourceDimensions?.width ?? image.naturalWidth
    let sourceHeight = sourceDimensions?.height ?? image.naturalHeight
    if (sharedDrawable === null) {
      // 无共享位图时按旧契约本地压缩（单卡挂载等场景）。
      const proxyLargest = Math.max(image.naturalWidth, image.naturalHeight)
      if (proxyLargest > MAX_RENDER_DIM && proxyLargest > 0) {
        const k = MAX_RENDER_DIM / proxyLargest
        const off = document.createElement("canvas")
        off.width = Math.max(1, Math.round(image.naturalWidth * k))
        off.height = Math.max(1, Math.round(image.naturalHeight * k))
        off.getContext("2d")?.drawImage(image, 0, 0, off.width, off.height)
        drawable = off
      }
    }

    // 内部分辨率 = 完整合成（照片目标区域 + 边框）按上限缩放，CSS 负责显示缩放。
    // 几何以原图事实为语义：代理图只替代像素来源（U01 同源契约）。
    const placement = calculateImagePlacementGeometry(
      sourceWidth,
      sourceHeight,
      imagePlacementFromSettings(settings)
    )
    if (placement === null) {
      return
    }
    const compositionWidth = placement.targetWidth + Math.max(0, settings.borderLeft) + Math.max(0, settings.borderRight)
    const compositionHeight = placement.targetHeight + Math.max(0, settings.borderTop) + Math.max(0, settings.borderBottom)
    const largest = Math.max(compositionWidth, compositionHeight)
    const scale = largest > MAX_RENDER_DIM && largest > 0 ? MAX_RENDER_DIM / largest : 1
    canvas.width = Math.max(1, Math.round(compositionWidth * scale))
    canvas.height = Math.max(1, Math.round(compositionHeight * scale))

    // 把真正的 drawable 传给共享渲染器，与主预览/导出链路同一份渲染逻辑。
    drawPreviewToCanvas(
      canvas,
      drawable,
      settings,
      null,
      undefined,
      { width: sourceWidth, height: sourceHeight }
    )
  }, [image, settings, sourceDimensions, sharedDrawable, isVisible])

  if (image === null) {
    return <div className="liveThumbEmpty" aria-hidden="true" />
  }

  return (
    <div ref={wrapperRef} className="liveThumbWrapper">
      <canvas
        ref={canvasRef}
        className="liveThumbCanvas"
        aria-hidden="true"
      />
    </div>
  )
}
