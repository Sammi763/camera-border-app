import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react"
import { Panel } from "../../../components/layout/Panel"
import { calculatePreviewImageLayout, drawPreviewToCanvas } from "../canvas/canvasRenderer"
import { usePreviewViewport } from "../hooks/usePreviewViewport"
import { buildResolvedRenderSettings } from "../../settings/utils/buildTexts"
import { sourceDecodeLabel } from "../hooks/useExportController"
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
  /** 根级控制器持有任务状态，快速/高级面板切换不会中断导出。 */
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
}

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
    settings.borderRight
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
  settings
}: {
  readonly state: Extract<PreviewState, { kind: "active" }>
  readonly settings: RenderSettings
}): JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawFnRef = useRef<(() => void) | null>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const settingsRef = useRef(settings)
  const [isPreviewAreaInsufficient, setIsPreviewAreaInsufficient] = useState(false)
  settingsRef.current = settings
  imageRef.current = state.currentImage

  const viewport = usePreviewViewport(state.filePath)

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
      drawPreviewToCanvas(canvas, currentImage, settingsRef.current)
    }
  })

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (container === null || canvas === null) return

    const updateAll = (): void => {
      const rect = container.getBoundingClientRect()
      const image = imageRef.current
      const currentSettings = settingsRef.current
      const naturalWidth = image === null ? 0 : image.naturalWidth + currentSettings.borderLeft + currentSettings.borderRight
      const naturalHeight = image === null ? 0 : image.naturalHeight + currentSettings.borderTop + currentSettings.borderBottom
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
  }, [viewport])

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
      image.naturalWidth + settings.borderLeft + settings.borderRight,
      image.naturalHeight + settings.borderTop + settings.borderBottom
    )
  }, [settings.borderBottom, settings.borderLeft, settings.borderRight, settings.borderTop, state.currentImage, viewport])

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
        className="previewCanvasWrapper"
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
            <span>请扩大窗口或收起模板画廊后再查看照片。</span>
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
  engineUnavailableReason = null
}: PreviewPanelProps): JSX.Element => {
  const resolvedSettings = buildResolvedRenderSettings(settings, resolvedTextOverride, resolvedTextLayers, resolvedBrand)
  const {
    single: exportJob,
    batch: batchExport,
    isExporting,
    isBatchExporting,
    startSingleExport,
    startBatchExport,
    retryFailed,
    cancelActiveExport,
    openExportDirectory
  } = exportController
  const canExport = state.kind === "active" && state.currentImage !== null
  const hasBatchItems = batchExportLabel.length > 0
  const exportDisabledReason = engineAvailable ? null : (engineUnavailableReason ?? "Java 引擎不可用，恢复后高保真导出自动恢复")
  const batchIsTerminal = batchExport.kind === "completed" || batchExport.kind === "cancelled"

  return (
    <Panel label="预览" title="预览区域" className="previewPanel">
      <div className="previewFrame">
        {state.kind === "idle" && <IdleView />}
        {state.kind === "active" && state.currentImage === null && <LoadingView filePath={state.filePath} />}
        {state.kind === "active" && state.currentImage !== null && <CanvasPreview state={state} settings={resolvedSettings} />}
      </div>
      <div className="previewExportBar">
        <button
          type="button"
          className="ghostButton previewExportButton"
          disabled={!canExport || isExporting || isBatchExporting || !engineAvailable}
          title={exportDisabledReason ?? undefined}
          onClick={() => void startSingleExport()}
        >
          {exportJob.kind === "preparing" ? "准备中…" : isExporting ? "渲染中…" : "导出原图"}
        </button>
        {hasBatchItems && (
          <button
            type="button"
            className="ghostButton previewExportButton"
            disabled={isBatchExporting || isExporting || !engineAvailable}
            title={exportDisabledReason ?? undefined}
            onClick={() => void startBatchExport()}
          >
            {batchExport.kind === "preparing" ? "读取 EXIF…" : isBatchExporting && batchExport.kind === "running"
              ? `批量导出中 ${batchExport.current}/${batchExport.total}…`
              : batchExportLabel}
          </button>
        )}
        {(isExporting || isBatchExporting) && (
          <button type="button" className="ghostButton previewExportButton" onClick={() => void cancelActiveExport()}>
            取消导出
          </button>
        )}

        <span className="previewExportStatus" aria-live="polite">
          {!hasSelectedImage && "请先选择一张图片"}
          {(exportJob.kind === "preparing" || exportJob.kind === "submitting") && (
            <span className="previewExportPhase" role="progressbar" aria-label="单图导出进度" aria-valuetext={exportJob.kind === "preparing" ? "正在读取 EXIF…" : "正在渲染…"}>
              <span className="previewExportProgressTrack" aria-hidden="true"><span className="previewExportProgressFill previewExportProgressFillIndeterminate" /></span>
              <span role="status" aria-label="单图导出进度">{exportJob.kind === "preparing" ? "正在读取 EXIF…" : "正在渲染…"}</span>
            </span>
          )}
          {hasSelectedImage && exportJob.kind === "idle" && batchExport.kind === "idle" && !engineAvailable && (
            <span className="previewExportHint">引擎不可用，导出已禁用。可继续本地预览与模板编辑。</span>
          )}
          {hasSelectedImage && exportJob.kind === "idle" && batchExport.kind === "idle" && engineAvailable && (
            window.desktop === undefined ? "浏览器降级模式：导出能力受限，建议启动桌面应用。" : "导出使用原图尺寸，由引擎渲染。"
          )}
          {exportJob.kind === "completed" && (
            <span className="previewExportSuccess">导出完成（{exportJob.actualFormat.toUpperCase()}）：{exportJob.outputPath}
              {exportJob.summary.length > 0 && <span className="previewExportWarnings">　⚠ {exportJob.summary.join("；")}</span>}
            </span>
          )}
          {exportJob.kind === "cancelled" && <span className="previewExportError">{exportJob.message}</span>}
          {exportJob.kind === "error" && <span className="previewExportError">{exportJob.message}</span>}
          {batchExport.kind === "running" && (
            <span className="previewBatchProgress" role="progressbar" aria-label="批量导出进度" aria-valuemin={0} aria-valuemax={batchExport.total} aria-valuenow={batchExport.current} aria-valuetext={`已完成 ${batchExport.current}/${batchExport.total}，成功 ${batchExport.success} 张，失败 ${batchExport.failed} 张`} aria-live="polite">
              <span className="previewBatchProgressTrack" aria-hidden="true"><span className="previewBatchProgressFill" style={{ width: `${batchExport.total > 0 ? (batchExport.current / batchExport.total) * 100 : 0}%` }} /></span>
              <span className="previewBatchProgressLabel">进度 {batchExport.current}/{batchExport.total}　成功 {batchExport.success}　失败 {batchExport.failed}</span>
            </span>
          )}
          {batchExport.kind === "preparing" && "正在读取 EXIF…"}
          {batchIsTerminal && (
            <>
              <span className={batchExport.failed > 0 ? "previewExportError" : "previewExportSuccess"}>
                {batchExport.kind === "cancelled" ? "批量导出已取消" : "批量导出完成"}：共 {batchExport.total} 张，成功 {batchExport.success}，失败 {batchExport.failed}
                {batchExport.kind === "cancelled" ? `，未执行 ${batchExport.cancelled}` : ""}
              </span>
              {batchExport.results.some((result) => !result.success) && (
                <span className="previewBatchFailures">
                  <span className="previewBatchFailureTitle">失败文件：</span>
                  {batchExport.results.filter((result) => !result.success).map((result, index) => (
                    <span key={`${result.fileName}-${index}`}>{index > 0 && "；"}{result.fileName}{result.error === null ? "" : `（${result.error}）`}</span>
                  ))}
                </span>
              )}
              {batchExport.results.some((result) => result.summary.length > 0) && (
                <span className="previewBatchSummaries">
                  <span className="previewBatchSummaryTitle">导出摘要：</span>
                  {batchExport.results.filter((result) => result.summary.length > 0).map((result, index) => (
                    <span key={`${result.fileName}-summary`}>{index > 0 && "；"}{result.fileName}：{result.summary.join("；")}</span>
                  ))}
                </span>
              )}
              <span className="previewBatchActions">
                {window.desktop?.openDirectory !== undefined && <button type="button" className="ghostButton previewBatchActionBtn" onClick={() => openExportDirectory(batchExport.dirPath)}>打开目录</button>}
                {batchExport.results.some((result) => !result.success) && <button type="button" className="ghostButton previewBatchActionBtn" onClick={() => void retryFailed()}>重试失败项</button>}
              </span>
            </>
          )}
          {batchExport.kind === "error" && <span className="previewExportError">{batchExport.message}</span>}
        </span>
      </div>
    </Panel>
  )
}
