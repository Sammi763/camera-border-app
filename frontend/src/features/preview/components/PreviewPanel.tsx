import { useCallback, useEffect, useRef, useState } from "react"
import { Panel } from "../../../components/layout/Panel"
import { drawPreviewToCanvas } from "../canvas/canvasRenderer"
import { usePreviewViewport } from "../hooks/usePreviewViewport"
import { submitAndWaitForRenderJob } from "../../../services/engine/renderJobsApi"
import { toExportFileName } from "../../../utils/fileName"
import { buildRecipeFromSettings } from "../../settings/utils/buildRecipe"
import { resolveOutputSizeFromSettings } from "../../settings/utils/outputSizePresets"
import type { RenderSettings } from "../../settings/types"
import type { EngineSyncStatus, PreviewState } from "../types"
import type { ExportSettings, FeatureResult, RenderJobRequest, RenderJobStatusResponse } from "../../../types/preview"
import { buildResolvedRenderSettings } from "../../settings/utils/buildTexts"
import type { QueueItem } from "../../queue/types"

type PreviewPanelProps = {
  readonly state: PreviewState
  readonly settings: RenderSettings
  readonly hasSelectedImage: boolean
  /** 队列图片（批量导出数据源，逐项惰性解析）。 */
  readonly queueItems: readonly QueueItem[]
  /** 单张图片的批量导出解析器：文字覆盖 + 多段文字变量 + 品牌。 */
  readonly resolveQueueItem: (item: QueueItem) => ResolvedQueueItem
  /** 当前选中图片识别到的品牌文字。 */
  readonly resolvedBrand?: string | null
  /** 当前选中图片的已解析快捷单段文字覆盖。 */
  readonly resolvedTextOverride?: string | null
  /** 当前选中图片的已解析多段文字图层内容数组。 */
  readonly resolvedTextLayers?: readonly (string | null)[] | null
}

/** 单张图片的批量导出解析结果（与 WorkspacePage.resolveQueueItem 对齐）。 */
export type ResolvedQueueItem = {
  readonly textOverride: string | null
  readonly resolvedLayers: readonly (string | null)[]
  readonly brand: string | null
}

/** 单项专业能力的摘要文案。 */
const featureResultLabel = (result: FeatureResult | undefined): string | null => {
  if (result === undefined) return null
  switch (result.status) {
    case "NOT_REQUESTED":
      return null
    case "APPLIED":
      return result.message ?? "已应用"
    case "SKIPPED":
      return result.message ?? "已跳过（当前版本不支持）"
    case "DOWNGRADED":
      return result.message ?? "已降级"
  }
}

/** 从 RenderJobStatusResponse 构建导出摘要。 */
const buildExportSummary = (result: RenderJobStatusResponse): readonly string[] => {
  const lines: string[] = []
  const metadata = featureResultLabel(result.metadataPreservation)
  if (metadata !== null) lines.push(`EXIF：${metadata}`)
  const icc = featureResultLabel(result.colorProfilePreservation)
  if (icc !== null) lines.push(`ICC：${icc}`)
  const bitDepth = featureResultLabel(result.highBitDepth)
  if (bitDepth !== null) lines.push(`高位深：${bitDepth}`)
  return lines
}

/** 单图导出任务状态。 */
type ExportJobState =
  | { readonly kind: "idle" }
  | { readonly kind: "submitting" }
  | { readonly kind: "running"; readonly jobId: string }
  | { readonly kind: "completed"; readonly outputPath: string; readonly actualFormat: string; readonly summary: readonly string[] }
  | { readonly kind: "error"; readonly message: string }

/** 批量导出单项结果。 */
type BatchExportItemResult = {
  readonly fileName: string
  readonly success: boolean
  readonly actualFormat: string | null
  readonly summary: readonly string[]
  readonly error: string | null
}

/** 批量导出状态。 */
type BatchExportState =
  | { readonly kind: "idle" }
  | { readonly kind: "running"; readonly total: number; readonly current: number; readonly success: number; readonly failed: number }
  | { readonly kind: "completed"; readonly total: number; readonly success: number; readonly failed: number; readonly results: readonly BatchExportItemResult[] }
  | { readonly kind: "error"; readonly message: string }

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

/**
 * 推导浏览器模式下的导出输出路径。
 * 仅当图片来自 /photos/ 目录时可推导，返回 null 表示无法推导。
 */
const deriveBrowserExportPath = (filePath: string, exportFileName: string): string | null => {
  if (filePath.includes("/photos/") || filePath.includes("\\photos\\")) {
    const photosIndex = filePath.lastIndexOf("/photos/")
    const photosIndexWin = filePath.lastIndexOf("\\photos\\")
    const idx = Math.max(photosIndex, photosIndexWin)
    if (idx >= 0) {
      const root = filePath.slice(0, idx)
      return `${root}/exports/${exportFileName}`
    }
  }
  return null
}

/** 空态视图 */
const IdleView = (): JSX.Element => (
  <div className="previewEmpty">
    <span className="previewEmptyLabel">暂无图片</span>
    <span className="previewEmptyHint">请从队列中选择一张图片。</span>
  </div>
)

/** 加载中视图 */
const LoadingView = ({ filePath }: { readonly filePath: string }): JSX.Element => (
  <div className="previewEmpty">
    <span className="previewEmptyLabel">正在加载图片…</span>
    <span className="previewEmptyHint">{filePath}</span>
  </div>
)

/**
 * 从设置构建导出请求的 ExportSettings。
 * 输出尺寸预设在此解析为引擎的 maxWidth/maxHeight（原图 = 0/0）。
 */
const buildExportSettings = (
  settings: RenderSettings,
  outputPath: string
): ExportSettings => {
  const size = resolveOutputSizeFromSettings(settings)
  return {
    format: settings.exportFormat,
    outputPath,
    jpegQuality: settings.jpegQuality,
    maxWidth: size.maxWidth,
    maxHeight: size.maxHeight,
    preserveMetadata: settings.preserveMetadata,
    preserveColorProfile: settings.preserveColorProfile,
    preferHighBitDepth: settings.preferHighBitDepth
  }
}

/** 批量导出并发数（本地 CPU 渲染，适度并行即可）。 */
const BATCH_EXPORT_CONCURRENCY = 3

/** Canvas 即时预览组件 */
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
      drawPreviewToCanvas(canvas, image, settings)
    }
  })

  /**
   * 单一 ResizeObserver：容器 resize 时同步更新视口尺寸 + 画布尺寸 + 重绘。
   * 图片或边框变化时也重新设置视口尺寸。
   */
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (container === null || canvas === null) return

    const updateAll = (): void => {
      const rect = container.getBoundingClientRect()
      const image = imageRef.current
      const s = settingsRef.current
      // 自然尺寸 = 图片尺寸 + 边框
      const naturalW = image !== null ? image.naturalWidth + s.borderLeft + s.borderRight : 0
      const naturalH = image !== null ? image.naturalHeight + s.borderTop + s.borderBottom : 0
      // 更新视口尺寸（actual 模式会自动重新计算 scale）
      viewport.setDimensions(rect.width, rect.height, naturalW, naturalH)
    }

    const updateCanvas = (): void => {
      const rect = container.getBoundingClientRect()
      const w = Math.round(rect.width * viewport.state.scale)
      const h = Math.round(rect.height * viewport.state.scale)
      canvas.width = Math.max(1, w)
      canvas.height = Math.max(1, h)
      canvas.style.width = `${Math.max(1, w)}px`
      canvas.style.height = `${Math.max(1, h)}px`
      drawFnRef.current?.()
    }

    updateAll()
    updateCanvas()

    const observer = new ResizeObserver(() => {
      updateAll()
      updateCanvas()
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [viewport])

  // 视口 scale 变化时更新画布尺寸
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (container === null || canvas === null) return
    const rect = container.getBoundingClientRect()
    const w = Math.round(rect.width * viewport.state.scale)
    const h = Math.round(rect.height * viewport.state.scale)
    canvas.width = Math.max(1, w)
    canvas.height = Math.max(1, h)
    canvas.style.width = `${Math.max(1, w)}px`
    canvas.style.height = `${Math.max(1, h)}px`
    drawFnRef.current?.()
  }, [viewport.state.scale])

  // 图片或边框变化时更新视口尺寸
  useEffect(() => {
    const container = containerRef.current
    const image = state.currentImage
    if (container === null || image === null) return
    const rect = container.getBoundingClientRect()
    const naturalW = image.naturalWidth + settings.borderLeft + settings.borderRight
    const naturalH = image.naturalHeight + settings.borderTop + settings.borderBottom
    viewport.setDimensions(rect.width, rect.height, naturalW, naturalH)
  }, [state.currentImage, settings.borderTop, settings.borderBottom, settings.borderLeft, settings.borderRight, viewport])

  useEffect(() => {
    if (state.currentImage !== null) {
      drawFnRef.current?.()
    }
  }, [state.currentImage])

  useEffect(() => {
    drawFnRef.current?.()
  }, [settings])

  const syncLabel = engineSyncLabel(state.engineSyncStatus)
  const syncClassName = engineSyncClassName(state.engineSyncStatus)

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    viewport.startDrag()
  }, [viewport])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>): void => {
    if (dragStartRef.current === null) return
    const deltaX = e.clientX - dragStartRef.current.x
    const deltaY = e.clientY - dragStartRef.current.y
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    viewport.handleDragMove(deltaX, deltaY)
  }, [viewport])

  const handleMouseUp = useCallback((): void => {
    dragStartRef.current = null
    viewport.endDrag()
  }, [viewport])

  const scalePercent = Math.round(viewport.state.scale * 100)
  const cursorStyle = viewport.isDragging ? "grabbing" : "grab"
  const modeLabel = viewport.state.mode === "fit" ? "适应" : viewport.state.mode === "actual" ? "100%" : `${scalePercent}%`

  return (
    <div className="previewCanvasContainer">
      <div
        ref={containerRef}
        className="previewCanvasWrapper"
        style={{ overflow: "hidden", position: "relative", cursor: cursorStyle }}
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
          style={{
            position: "absolute",
            transform: `translate(${viewport.state.offsetX}px, ${viewport.state.offsetY}px)`,
            left: 0,
            top: 0
          }}
        />
      </div>
      <div className="previewMetaBar">
        <span className="previewMetaFileName">{state.fileName}</span>
        {syncLabel.length > 0 && (
          <span className={syncClassName}>{syncLabel}</span>
        )}
        <span className="previewViewportControls">
          <button type="button" className="ghostButton previewViewportBtn" onClick={viewport.resetToFit}>适应</button>
          <span className="previewZoomLabel">{modeLabel}</span>
          <button type="button" className="ghostButton previewViewportBtn" onClick={viewport.resetToActual}>100%</button>
        </span>
      </div>
    </div>
  )
}

/**
 * 为文件名生成带冲突解决的输出路径。
 * 如果文件已存在，追加 -1、-2 等后缀。
 */
const buildUniqueExportPath = (
  dirPath: string,
  baseName: string,
  ext: string,
  usedNames: Set<string>
): string => {
  let candidate = `${baseName}-border.${ext}`
  let counter = 1
  while (usedNames.has(candidate)) {
    candidate = `${baseName}-border-${counter}.${ext}`
    counter++
  }
  usedNames.add(candidate)
  return `${dirPath}/${candidate}`
}

export const PreviewPanel = ({
  state,
  settings,
  hasSelectedImage,
  queueItems,
  resolveQueueItem,
  resolvedBrand,
  resolvedTextOverride,
  resolvedTextLayers
}: PreviewPanelProps): JSX.Element => {
  const [exportJob, setExportJob] = useState<ExportJobState>({ kind: "idle" })
  const [batchExport, setBatchExport] = useState<BatchExportState>({ kind: "idle" })

  // 构建已解析的渲染态 settings，供 Canvas 和单图导出共用。
  // 确保文字变量、textOverride、auto-brand 品牌在同一处合并。
  const resolvedSettings = buildResolvedRenderSettings(
    settings, resolvedTextOverride, resolvedTextLayers, resolvedBrand
  )

  const handleHighQualityExport = useCallback(async () => {
    if (state.kind !== "active") {
      return
    }

    const exportFileName = toExportFileName(state.fileName, settings.exportFormat)

    let outputPath: string | null = null

    if (window.desktop !== undefined) {
      outputPath = await window.desktop.selectExportPath(exportFileName)
      if (outputPath === null) {
        return
      }
    } else {
      outputPath = deriveBrowserExportPath(state.filePath, exportFileName)
      if (outputPath === null) {
        setExportJob({
          kind: "error",
          message: "浏览器降级模式无法选择保存位置，请启动桌面应用导出。"
        })
        return
      }
    }

    const request: RenderJobRequest = {
      recipe: buildRecipeFromSettings(state.filePath, resolvedSettings),
      export: buildExportSettings(settings, outputPath)
    }

    setExportJob({ kind: "submitting" })

    try {
      const result = await submitAndWaitForRenderJob(request)

      if (result.status === "completed") {
        setExportJob({
          kind: "completed",
          outputPath: result.outputPath ?? outputPath,
          actualFormat: result.actualFormat ?? settings.exportFormat,
          summary: buildExportSummary(result)
        })
      } else {
        setExportJob({
          kind: "error",
          message: result.error ?? "导出失败，未知错误。"
        })
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "导出请求失败"
      setExportJob({ kind: "error", message })
    }
  }, [state, resolvedSettings])

  const handleBatchExport = useCallback(async () => {
    if (queueItems.length === 0) {
      return
    }

    // 批量导出仅在 Electron 模式下可用（需要目录选择能力）
    if (window.desktop === undefined) {
      setBatchExport({
        kind: "error",
        message: "批量导出需要桌面模式。浏览器模式暂不支持。"
      })
      return
    }

    const ext = settings.exportFormat === "jpeg" ? "jpg" : settings.exportFormat === "tiff" ? "tif" : "png"

    // 使用目录选择 API，不再复用单文件保存对话框
    const dirPath = await window.desktop.selectExportDirectory()
    if (dirPath === null) {
      return
    }

    const total = queueItems.length
    let success = 0
    let failed = 0
    let done = 0
    const usedNames = new Set<string>()
    // 保持结果与队列顺序一致（并发完成顺序不定）
    const itemResults: BatchExportItemResult[] = new Array(total)

    setBatchExport({ kind: "running", total, current: 0, success: 0, failed: 0 })

    /**
     * 导出单张图片：惰性解析文字/品牌（EXIF 已并入身份链），
     * 提交同步渲染任务并写回结果。
     */
    const exportOne = async (index: number): Promise<void> => {
      const item = queueItems[index]!
      const fileName = item.fileName
      const dotIndex = fileName.lastIndexOf(".")
      const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName
      const outputPath = buildUniqueExportPath(dirPath, baseName, ext, usedNames)

      const { textOverride, resolvedLayers, brand } = resolveQueueItem(item)

      try {
        const request: RenderJobRequest = {
          recipe: buildRecipeFromSettings(
            item.filePath,
            settings,
            textOverride ?? undefined,
            resolvedLayers,
            brand
          ),
          export: buildExportSettings(settings, outputPath)
        }

        const result = await submitAndWaitForRenderJob(request)
        if (result.status === "completed") {
          success++
          itemResults[index] = {
            fileName,
            success: true,
            actualFormat: result.actualFormat ?? settings.exportFormat,
            summary: buildExportSummary(result),
            error: null
          }
        } else {
          failed++
          itemResults[index] = {
            fileName,
            success: false,
            actualFormat: null,
            summary: [],
            error: result.error ?? "导出失败"
          }
        }
      } catch (error: unknown) {
        failed++
        const message = error instanceof Error ? error.message : "导出请求失败"
        itemResults[index] = {
          fileName,
          success: false,
          actualFormat: null,
          summary: [],
          error: message
        }
      } finally {
        done++
        setBatchExport({ kind: "running", total, current: done, success, failed })
      }
    }

    // 有限并发：本地 CPU 渲染，适度并行避免资源争抢
    const workers: Promise<void>[] = []
    let next = 0
    const workerCount = Math.min(BATCH_EXPORT_CONCURRENCY, total)
    for (let w = 0; w < workerCount; w++) {
      workers.push((async () => {
        while (true) {
          const index = next++
          if (index >= total) {
            return
          }
          await exportOne(index)
        }
      })())
    }
    await Promise.all(workers)

    setBatchExport({ kind: "completed", total, success, failed, results: itemResults })
  }, [queueItems, resolveQueueItem, settings])

  const canExport = state.kind === "active" && state.currentImage !== null
  const isExporting = exportJob.kind === "submitting" || exportJob.kind === "running"
  const isBatchExporting = batchExport.kind === "running"
  const hasBatchItems = queueItems.length > 1

  return (
    <Panel label="预览" title="预览区域" className="previewPanel">
      <div className="previewFrame">
        {state.kind === "idle" && <IdleView />}
        {state.kind === "active" && state.currentImage === null && (
          <LoadingView filePath={state.filePath} />
        )}
        {state.kind === "active" && state.currentImage !== null && (
          <CanvasPreview state={state} settings={resolvedSettings} />
        )}
      </div>
      <div className="previewExportBar">
        <button
          type="button"
          className="ghostButton previewExportButton"
          disabled={!canExport || isExporting}
          onClick={() => void handleHighQualityExport()}
        >
          {isExporting ? "导出中…" : "导出原图"}
        </button>
        {hasBatchItems && (
          <button
            type="button"
            className="ghostButton previewExportButton"
            disabled={isBatchExporting}
            onClick={() => void handleBatchExport()}
          >
            {isBatchExporting
              ? `批量导出中 ${batchExport.current}/${batchExport.total}…`
              : `批量导出 ${queueItems.length} 张`}
          </button>
        )}

        <span className="previewExportStatus">
          {!hasSelectedImage && "请先选择一张图片"}
          {hasSelectedImage && exportJob.kind === "idle" && batchExport.kind === "idle" && (
            window.desktop === undefined
              ? "浏览器降级模式：导出能力受限，建议启动桌面应用。"
              : "导出使用原图尺寸，由引擎渲染。"
          )}
          {exportJob.kind === "completed" && (
            <span className="previewExportSuccess">
              导出完成（{exportJob.actualFormat.toUpperCase()}）：{exportJob.outputPath}
              {exportJob.summary.length > 0 && (
                <span className="previewExportWarnings">　⚠ {exportJob.summary.join("；")}</span>
              )}
            </span>
          )}
          {exportJob.kind === "error" && (
            <span className="previewExportError">{exportJob.message}</span>
          )}
          {batchExport.kind === "running" && (
            `进度 ${batchExport.current}/${batchExport.total}　成功 ${batchExport.success}　失败 ${batchExport.failed}`
          )}
          {batchExport.kind === "completed" && (
            <span className={batchExport.failed > 0 ? "previewExportError" : "previewExportSuccess"}>
              批量导出完成：共 {batchExport.total} 张，成功 {batchExport.success}，失败 {batchExport.failed}
              {batchExport.results.some((r) => r.summary.length > 0 || !r.success) && (
                <span className="previewBatchDetails">
                  {"（"}
                  {batchExport.results.filter((r) => !r.success || r.summary.length > 0).map((r, idx) => (
                    <span key={idx}>
                      {idx > 0 && "；"}
                      {r.fileName}：{r.success ? r.actualFormat?.toUpperCase() ?? "?" : "失败"}
                      {!r.success && r.error !== null ? `（${r.error}）` : ""}
                      {r.summary.length > 0 ? ` [${r.summary.join("，")}]` : ""}
                    </span>
                  ))}
                  {"）"}
                </span>
              )}
            </span>
          )}
          {batchExport.kind === "error" && (
            <span className="previewExportError">{batchExport.message}</span>
          )}
        </span>
      </div>
    </Panel>
  )
}
