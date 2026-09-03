import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react"
import { Panel } from "../../../components/layout/Panel"
import { calculatePreviewImageLayout, drawPreviewToCanvas, type CanvasDrawableSource } from "../canvas/canvasRenderer"
import { calculateImagePlacementGeometry, normalizeImagePlacement } from "../canvas/imagePlacementGeometry"
import { usePreviewViewport } from "../hooks/usePreviewViewport"
import { buildResolvedRenderSettings } from "../../settings/utils/buildTexts"
import { sourceDecodeLabel } from "../hooks/useExportController"
import { ExportDock } from "./ExportDock"
import type { ExportController } from "../hooks/useExportController"
import type { RenderSettings } from "../../settings/types"
import type { EngineSyncStatus, PreviewState } from "../types"
import type { SourceDecode } from "../../../types/preview"

export { sourceDecodeLabel } from "../hooks/useExportController"
export type { ResolvedQueueItem } from "../hooks/useExportController"

type PreviewPanelProps = {
  readonly state: PreviewState
  readonly settings: RenderSettings
  readonly hasSelectedImage: boolean
  /** 批量导出按钮文案；空字符串表示当前范围没有可批量导出的图片。 */
  readonly batchExportLabel: string
  /** 根级控制器持有任务状态，工作台页签切换不会中断导出。 */
  readonly exportController: ExportController
  /** 当前选中图片识别到的品牌文字。 */
  readonly resolvedBrand?: string | null
  /** 当前选中图片的已解析快捷单段文字覆盖。 */
  readonly resolvedTextOverride?: string | null
  /** 当前选中图片的已解析多段文字图层内容数组。 */
  readonly resolvedTextLayers?: readonly (string | null)[] | null
  /** 当前 Java 引擎是否可用。 */
  readonly engineAvailable?: boolean
  /** 引擎不可用时的说明。 */
  readonly engineUnavailableReason?: string | null
  /** 由统一工作台快捷键发出的视口命令。 */
  readonly viewportCommand?: PreviewViewportCommand | null
  /** 预览工作区背景，不参与 RenderRecipe。 */
  readonly previewBackground?: PreviewBackground
  /** 实际工作台把导出控件放入底部 Dock；单独使用 PreviewPanel 时默认保留。 */
  readonly showExportControls?: boolean
}

export type PreviewViewportCommand = {
  readonly type: "fit" | "actual"
  readonly sequence: number
}

export type PreviewBackground = "black" | "gray" | "white"

/** 引擎同步状态对应的中文文案。 */
const engineSyncLabel = (status: EngineSyncStatus): string => {
  switch (status) {
    case "idle":
      return ""
    case "syncing":
      return "正在同步引擎预览"
    case "synced":
      return "引擎预览已同步"
    case "error":
      return "引擎预览失败，当前显示即时预览"
  }
}

const engineSyncClassName = (status: EngineSyncStatus): string => {
  switch (status) {
    case "idle":
      return "previewSyncBadge previewSyncIdle"
    case "syncing":
      return "previewSyncBadge previewSyncSyncing"
    case "synced":
      return "previewSyncBadge previewSyncSynced"
    case "error":
      return "previewSyncBadge previewSyncError"
  }
}

/** 解码来源徽标。 */
const DecodeSourceBadge = ({ sourceDecode }: { readonly sourceDecode: SourceDecode | null }): JSX.Element | null => {
  if (sourceDecode === null || sourceDecode === undefined) {
    return null
  }
  const label = sourceDecodeLabel(sourceDecode)
  if (label === null) {
    return null
  }
  return (
    <span
      className={sourceDecode.mode === "embedded-preview-fallback" ? "decodeBadge decodeBadgeFallback" : "decodeBadge decodeBadgeDeveloped"}
      title={label}
    >
      {label}
    </span>
  )
}

/** 空态视图。 */
const IdleView = (): JSX.Element => (
  <div className="previewEmpty">
    <span className="previewEmptyLabel">暂无图片</span>
    <span className="previewEmptyHint">请从队列中选择一张图片。</span>
  </div>
)

/** 加载中视图。 */
const LoadingView = ({ filePath }: { readonly filePath: string }): JSX.Element => (
  <div className="previewEmpty">
    <span className="previewEmptyLabel">正在加载图片…</span>
    <span className="previewEmptyHint">{filePath}</span>
  </div>
)

/** 将图片区域和边框信息暴露给可访问性提示与打包回归。 */
const writeCanvasPreviewDiagnostics = (
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  settings: RenderSettings
): boolean => {
  const layout = calculatePreviewImageLayout(
    canvas.width,
    canvas.height,
    image.naturalWidth,
    image.naturalHeight,
    settings.borderTop,
    settings.borderBottom,
    settings.borderLeft,
    settings.borderRight,
    settings.imagePlacement
  )
  canvas.dataset["previewBorderColor"] = settings.borderColor
  canvas.dataset["previewBorderTop"] = String(settings.borderTop)
  canvas.dataset["previewBorderBottom"] = String(settings.borderBottom)
  canvas.dataset["previewBorderLeft"] = String(settings.borderLeft)
  canvas.dataset["previewBorderRight"] = String(settings.borderRight)
  canvas.dataset["previewImageX"] = layout === null ? "" : String(layout.x)
  canvas.dataset["previewImageY"] = layout === null ? "" : String(layout.y)
  canvas.dataset["previewImageWidth"] = layout === null ? "" : String(layout.width)
  canvas.dataset["previewImageHeight"] = layout === null ? "" : String(layout.height)
  return layout !== null
}

/** Canvas 即时预览组件。 */
const CanvasPreview = ({
  state,
  settings,
  viewportCommand,
  previewBackground = "gray"
}: {
  readonly state: Extract<PreviewState, { kind: "active" }>
  readonly settings: RenderSettings
  readonly viewportCommand?: PreviewViewportCommand | null
  readonly previewBackground?: PreviewBackground
}): JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawFnRef = useRef<(() => void) | null>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const logoImageRef = useRef<CanvasDrawableSource | null>(null)
  const [logoImage, setLogoImage] = useState<HTMLImageElement | null>(null)
  const settingsRef = useRef(settings)
  const [isPreviewAreaInsufficient, setIsPreviewAreaInsufficient] = useState(false)
  settingsRef.current = settings
  imageRef.current = state.currentImage
  logoImageRef.current = logoImage

  const viewport = usePreviewViewport(state.filePath)

  useEffect(() => {
    const logoPath = settings.logo.imagePath ?? null
    const loader = window.desktop?.loadLocalImagePreview
    if (logoPath === null || logoPath.length === 0 || loader === undefined) {
      setLogoImage(null)
      return
    }
    let active = true
    setLogoImage(null)
    void loader(logoPath, 512, 512).then((preview) => {
      if (!active || preview === null) return
      const image = new Image()
      image.onload = () => {
        if (active) setLogoImage(image)
      }
      image.src = preview.dataUrl
    }).catch(() => {
      if (active) setLogoImage(null)
    })
    return () => { active = false }
  }, [settings.logo.imagePath])

  const naturalCanvasDimensions = useCallback((image: HTMLImageElement, currentSettings: RenderSettings): { width: number; height: number } => {
    const geometry = calculateImagePlacementGeometry(
      image.naturalWidth,
      image.naturalHeight,
      normalizeImagePlacement(currentSettings.imagePlacement)
    )
    if (geometry === null) {
      return { width: 0, height: 0 }
    }
    return {
      width: Math.max(1, Math.round(geometry.targetWidth + currentSettings.borderLeft + currentSettings.borderRight)),
      height: Math.max(1, Math.round(geometry.targetHeight + currentSettings.borderTop + currentSettings.borderBottom))
    }
  }, [])

  useEffect(() => {
    if (viewportCommand?.type === "fit") {
      viewport.resetToFit()
    } else if (viewportCommand?.type === "actual") {
      viewport.resetToActual()
    }
  }, [viewport.resetToActual, viewport.resetToFit, viewportCommand?.sequence, viewportCommand?.type])

  useEffect(() => {
    const canvas = canvasRef.current
    const image = state.currentImage
    if (canvas === null || image === null) {
      drawFnRef.current = null
      return
    }
    drawFnRef.current = () => {
      const currentImage = imageRef.current
      if (currentImage === null) return
      const canDrawPhoto = writeCanvasPreviewDiagnostics(canvas, currentImage, settingsRef.current)
      setIsPreviewAreaInsufficient((previous) => previous === !canDrawPhoto ? previous : !canDrawPhoto)
      if (!canDrawPhoto) {
        // 尺寸不足时清空旧帧，不能把上一次的纯边框误认为本次成功预览。
        canvas.width = canvas.width
        return
      }
      drawPreviewToCanvas(canvas, currentImage, settingsRef.current, logoImageRef.current)
    }
  })

  useEffect(() => {
    drawFnRef.current?.()
  }, [logoImage])

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (container === null || canvas === null) return

    const updateAll = (): void => {
      const rect = container.getBoundingClientRect()
      const image = imageRef.current
      const currentSettings = settingsRef.current
      const natural = image === null ? { width: 0, height: 0 } : naturalCanvasDimensions(image, currentSettings)
      const naturalWidth = natural.width
      const naturalHeight = natural.height
      viewport.setDimensions(rect.width, rect.height, naturalWidth, naturalHeight)
    }
    const updateCanvas = (): void => {
      const rect = container.getBoundingClientRect()
      const width = Math.max(1, Math.round(rect.width * viewport.state.scale))
      const height = Math.max(1, Math.round(rect.height * viewport.state.scale))
      canvas.width = width
      canvas.height = height
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      drawFnRef.current?.()
    }

    updateAll()
    updateCanvas()
    const observer = new ResizeObserver(() => {
      updateAll()
      updateCanvas()
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [naturalCanvasDimensions, viewport])

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (container === null || canvas === null) return
    const rect = container.getBoundingClientRect()
    const width = Math.max(1, Math.round(rect.width * viewport.state.scale))
    const height = Math.max(1, Math.round(rect.height * viewport.state.scale))
    canvas.width = width
    canvas.height = height
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    drawFnRef.current?.()
  }, [viewport.state.scale])

  useEffect(() => {
    const container = containerRef.current
    const image = state.currentImage
    if (container === null || image === null) return
    const rect = container.getBoundingClientRect()
    viewport.setDimensions(
      rect.width,
      rect.height,
      naturalCanvasDimensions(image, settings).width,
      naturalCanvasDimensions(image, settings).height
    )
  }, [naturalCanvasDimensions, settings, state.currentImage, viewport])

  useEffect(() => {
    drawFnRef.current?.()
  }, [settings, state.currentImage])

  const handleMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    dragStartRef.current = { x: event.clientX, y: event.clientY }
    viewport.startDrag()
  }, [viewport])

  const handleMouseMove = useCallback((event: ReactMouseEvent<HTMLDivElement>): void => {
    if (dragStartRef.current === null) return
    const deltaX = event.clientX - dragStartRef.current.x
    const deltaY = event.clientY - dragStartRef.current.y
    dragStartRef.current = { x: event.clientX, y: event.clientY }
    viewport.handleDragMove(deltaX, deltaY)
  }, [viewport])

  const handleMouseUp = useCallback((): void => {
    dragStartRef.current = null
    viewport.endDrag()
  }, [viewport])

  const scalePercent = Math.round(viewport.state.scale * 100)
  const modeLabel = viewport.state.mode === "fit" ? "适应" : viewport.state.mode === "actual" ? "100%" : `${scalePercent}%`

  return (
    <div className="previewCanvasContainer">
      <div
        ref={containerRef}
        className={`previewCanvasWrapper previewBackground${previewBackground.charAt(0).toUpperCase()}${previewBackground.slice(1)}`}
        style={{ overflow: "hidden", position: "relative", cursor: viewport.isDragging ? "grabbing" : "grab" }}
        onWheel={viewport.handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={viewport.handleDoubleClick}
      >
        <canvas
          ref={canvasRef}
          className="previewCanvas"
          style={{ position: "absolute", transform: `translate(${viewport.state.offsetX}px, ${viewport.state.offsetY}px)`, left: 0, top: 0 }}
        />
        {isPreviewAreaInsufficient && (
          <div className="previewAreaInsufficient" role="status">
            <strong>预览区域不足</strong>
            <span>请扩大窗口或调整右侧面板后再查看照片。</span>
          </div>
        )}
      </div>
      <div className="previewMetaBar">
        <span className="previewMetaFileName">{state.fileName}</span>
        {engineSyncLabel(state.engineSyncStatus).length > 0 && (
          <span className={engineSyncClassName(state.engineSyncStatus)}>{engineSyncLabel(state.engineSyncStatus)}</span>
        )}
        <DecodeSourceBadge sourceDecode={state.engineResponse?.sourceDecode ?? null} />
        <span className="previewViewportControls">
          <button type="button" className="ghostButton previewViewportBtn" onClick={viewport.resetToFit}>适应</button>
          <span className="previewZoomLabel">{modeLabel}</span>
          <button type="button" className="ghostButton previewViewportBtn" onClick={viewport.resetToActual}>100%</button>
        </span>
      </div>
    </div>
  )
}

export const PreviewPanel = ({
  state,
  settings,
  hasSelectedImage,
  batchExportLabel,
  exportController,
  resolvedBrand,
  resolvedTextOverride,
  resolvedTextLayers,
  engineAvailable = true,
  engineUnavailableReason = null,
  viewportCommand = null,
  previewBackground = "gray",
  showExportControls = true
}: PreviewPanelProps): JSX.Element => {
  const resolvedSettings = buildResolvedRenderSettings(settings, resolvedTextOverride, resolvedTextLayers, resolvedBrand)

  return (
    <Panel label="预览" title="预览区域" className="previewPanel">
      <div className={`previewFrame previewBackground${previewBackground.charAt(0).toUpperCase()}${previewBackground.slice(1)}`}>
        {state.kind === "idle" && <IdleView />}
        {state.kind === "active" && state.currentImage === null && <LoadingView filePath={state.filePath} />}
        {state.kind === "active" && state.currentImage !== null && (
          <CanvasPreview
            state={state}
            settings={resolvedSettings}
            viewportCommand={viewportCommand}
            previewBackground={previewBackground}
          />
        )}
      </div>
      {showExportControls && (
        <div className="previewExportBar">
          <ExportDock
            state={state}
            hasSelectedImage={hasSelectedImage}
            batchExportLabel={batchExportLabel}
            exportController={exportController}
            engineAvailable={engineAvailable}
            engineUnavailableReason={engineUnavailableReason}
            compact
          />
        </div>
      )}
    </Panel>
  )
}
