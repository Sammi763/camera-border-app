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
import type { ExportSettings, FeatureResult, RenderJobRequest, RenderJobStatusResponse, SourceDecode } from "../../../types/preview"
import { buildResolvedRenderSettings } from "../../settings/utils/buildTexts"
import type { QueueItem } from "../../queue/types"

type PreviewPanelProps = {
  readonly state: PreviewState
  readonly settings: RenderSettings
  readonly hasSelectedImage: boolean
  /** 队列图片（单图导出数据源，逐项惰性解析）。 */
  readonly queueItems: readonly QueueItem[]
  /** 批量导出目标图片（由父层按作用范围计算：勾选图片或全部图片）。 */
  readonly batchExportItems: readonly QueueItem[]
  /** 批量导出按钮文案（含作用范围说明，例如「批量导出已选 2 张」）。 */
  readonly batchExportLabel: string
  /** 单张图片的批量导出解析器：文字覆盖 + 多段文字变量 + 品牌。 */
  readonly resolveQueueItem: (item: QueueItem) => ResolvedQueueItem
  /**
   * 导出前等待指定路径的 EXIF 读取完成（失败降级为空，不阻塞导出）。
   * 保证批量导出时队列中每一张图片都先读 EXIF，再构建 RenderRecipe。
   */
  readonly prepareExifForExport: (paths: readonly string[]) => Promise<void>
  /** 当前选中图片识别到的品牌文字。 */
  readonly resolvedBrand?: string | null
  /** 当前选中图片的已解析快捷单段文字覆盖。 */
  readonly resolvedTextOverride?: string | null
  /** 当前选中图片的已解析多段文字图层内容数组。 */
  readonly resolvedTextLayers?: readonly (string | null)[] | null
  /** 批量导出完成后是否自动打开输出目录（桌面模式，失败静默）。 */
  readonly autoOpenExportDirectory?: boolean
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

/** 解码来源状态的展示文案。 */
export const sourceDecodeLabel = (sourceDecode: SourceDecode): string | null => {
  switch (sourceDecode.mode) {
    case "raw-developed":
      return "RAW 已真实显影（LibRaw）"
    case "embedded-preview-fallback":
      return sourceDecode.warning ?? "RAW 已降级为嵌入预览"
    default:
      return null
  }
}

/** 系统通知不展示本机绝对路径，避免把用户目录泄露到通知正文。 */
const sanitizeNotificationBody = (body: string): string => {
  const absolutePathPattern = /(?:file:\/\/)?(?:\/|[A-Za-z]:[\\/])[^()\n\r]*?(?=[）)\n\r]|$)/g
  return body.replace(absolutePathPattern, "相关文件")
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
  const decode = result.sourceDecode !== undefined && result.sourceDecode !== null
    ? sourceDecodeLabel(result.sourceDecode)
    : null
  if (decode !== null) lines.push(decode)
  return lines
}

/** 单图导出任务状态。 */
type ExportJobState =
  | { readonly kind: "idle" }
  | { readonly kind: "preparing" }
  | { readonly kind: "submitting" }
  | { readonly kind: "running"; readonly jobId: string }
  | { readonly kind: "completed"; readonly outputPath: string; readonly actualFormat: string; readonly summary: readonly string[] }
  | { readonly kind: "error"; readonly message: string }

/** 批量导出单项结果。 */
export type BatchExportItemResult = {
  readonly fileName: string
  readonly success: boolean
  readonly actualFormat: string | null
  readonly summary: readonly string[]
  readonly error: string | null
}

/** 批量导出状态。 */
type BatchExportState =
  | { readonly kind: "idle" }
  | { readonly kind: "preparing"; readonly total: number }
  | { readonly kind: "running"; readonly total: number; readonly current: number; readonly success: number; readonly failed: number }
  | { readonly kind: "completed"; readonly total: number; readonly success: number; readonly failed: number; readonly results: readonly BatchExportItemResult[]; readonly dirPath: string }
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

/** 解码来源徽标：真实显影为绿色，降级为警示色并显示原因。 */
const DecodeSourceBadge = ({ sourceDecode }: { readonly sourceDecode: SourceDecode | null }): JSX.Element | null => {
  if (sourceDecode === null || sourceDecode === undefined) {
    return null
  }
  if (sourceDecode.mode === "raw-developed") {
    return <span className="decodeBadge decodeBadgeDeveloped">RAW 已真实显影</span>
  }
  if (sourceDecode.mode === "embedded-preview-fallback") {
    return (
      <span
        className="decodeBadge decodeBadgeFallback"
        title={sourceDecode.warning ?? "RAW 已降级为嵌入预览"}
      >
        RAW 已降级为嵌入预览
      </span>
    )
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
        {/* RAW 解码来源徽标：真实显影 / 显式降级说明 */}
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
  batchExportItems,
  batchExportLabel,
  resolveQueueItem,
  prepareExifForExport,
  resolvedBrand,
  resolvedTextOverride,
  resolvedTextLayers,
  autoOpenExportDirectory = false
}: PreviewPanelProps): JSX.Element => {
  const [exportJob, setExportJob] = useState<ExportJobState>({ kind: "idle" })
  const [batchExport, setBatchExport] = useState<BatchExportState>({ kind: "idle" })

  // 批量导出跨轮（含失败重试）持久状态：输出目录、已用文件名集合、结果数组、
  // 以及「首次导出时的目标批次快照」——用户之后改变勾选范围，
  // 重试仍然只针对原批次的失败项，结果与统计对应同一批次。
  const dirPathRef = useRef<string | null>(null)
  const usedNamesRef = useRef<Set<string>>(new Set())
  const resultsRef = useRef<BatchExportItemResult[]>([])
  const batchSnapshotRef = useRef<readonly QueueItem[]>([])

  // 构建已解析的渲染态 settings，供 Canvas 和单图导出共用。
  // 确保文字变量、textOverride、auto-brand 品牌在同一处合并。
  const resolvedSettings = buildResolvedRenderSettings(
    settings, resolvedTextOverride, resolvedTextLayers, resolvedBrand
  )

  /** 桌面模式在输出目录中打开系统文件管理器（失败静默，不打断导出流程）。 */
  const openExportDirectory = useCallback((dirPath: string): void => {
    const openDirectory = window.desktop?.openDirectory
    if (openDirectory === undefined) {
      return
    }
    void openDirectory(dirPath).catch(() => {
      // 打开目录失败静默
    })
  }, [])

  /**
   * 发送系统通知（桌面模式）。浏览器模式或旧版 Electron 无此能力时静默跳过，
   * 工作台内状态始终保留作为持续可见反馈；通知失败不影响导出结果。
   */
  const notifySystem = useCallback((title: string, body: string): void => {
    const showNotification = window.desktop?.showNotification
    if (showNotification === undefined) {
      return
    }
    void showNotification(title, sanitizeNotificationBody(body)).catch(() => {
      // 通知失败静默降级
    })
  }, [])

  /** 批量结束后按最终统计发送对应系统通知（全部成功 / 部分失败）。 */
  const notifyBatchResult = useCallback((success: number, failed: number): void => {
    if (failed === 0) {
      notifySystem("批量导出完成", `成功导出 ${success} 张`)
    } else {
      notifySystem("批量导出部分失败", `成功 ${success} 张，失败 ${failed} 张`)
    }
  }, [notifySystem])

  const handleHighQualityExport = useCallback(async () => {
    if (state.kind !== "active") {
      return
    }

    // 先锁定导出操作，避免读取 EXIF 或等待系统对话框时重复点击。
    setExportJob({ kind: "preparing" })
    let outputPath: string | null = null

    try {
      const exportFileName = toExportFileName(state.fileName, settings.exportFormat)
      if (window.desktop !== undefined) {
        outputPath = await window.desktop.selectExportPath(exportFileName)
      } else {
        outputPath = deriveBrowserExportPath(state.filePath, exportFileName)
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "无法选择导出位置"
      setExportJob({ kind: "error", message })
      notifySystem("导出失败", `${state.fileName}（${message}）`)
      return
    }

    if (outputPath === null) {
      // 用户取消保存路径：不发送通知，静默回到空闲态
      if (window.desktop !== undefined) {
        setExportJob({ kind: "idle" })
      } else {
        setExportJob({
          kind: "error",
          message: "浏览器降级模式无法选择保存位置，请启动桌面应用导出。"
        })
      }
      return
    }

    // 单图导出与批量导出一致：先等待 EXIF 读取完成，再解析变量、构建 RenderRecipe。
    try {
      await prepareExifForExport([state.filePath])
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "读取照片 EXIF 失败"
      setExportJob({ kind: "error", message })
      notifySystem("导出失败", `${state.fileName}（${message}）`)
      return
    }

    // 用与批量导出相同的 resolveQueueItem 解析当前图（getExifByPath 读取最新 EXIF），
    // 保证单图导出与批量导出、预览使用同一套有效摄影信息。
    const item = queueItems.find((i) => i.filePath === state.filePath)
    const resolved = item !== undefined
      ? resolveQueueItem(item)
      : { textOverride: null, resolvedLayers: null, brand: null }

    const request: RenderJobRequest = {
      recipe: buildRecipeFromSettings(
        state.filePath,
        settings,
        resolved.textOverride ?? undefined,
        resolved.resolvedLayers,
        resolved.brand
      ),
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
        notifySystem("导出完成", state.fileName)
      } else {
        const message = result.error ?? "导出失败，未知错误。"
        setExportJob({ kind: "error", message })
        notifySystem("导出失败", `${state.fileName}（${message}）`)
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "导出请求失败"
      setExportJob({ kind: "error", message })
      notifySystem("导出失败", `${state.fileName}（${message}）`)
    }
  }, [state, queueItems, resolveQueueItem, prepareExifForExport, settings, notifySystem])

  const handleBatchExport = useCallback(async () => {
    const items = batchExportItems
    if (items.length === 0) {
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
    const total = items.length

    // 先锁定批量导出，再选择目录和读取 EXIF，避免用户重复点击造成并行批量任务。
    setBatchExport({ kind: "preparing", total })

    let dirPath: string | null
    try {
      dirPath = await window.desktop.selectExportDirectory()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "无法选择导出目录"
      setBatchExport({ kind: "error", message })
      return
    }

    if (dirPath === null) {
      setBatchExport({ kind: "idle" })
      return
    }

    // 批量导出关键修复：先逐张读取队列中全部图片的 EXIF（含失败降级），
    // 全部完成后才开始构建 RenderRecipe，保证每张图都能用上自己的 EXIF。
    try {
      await prepareExifForExport(items.map((item) => item.filePath))
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "读取照片 EXIF 失败"
      setBatchExport({ kind: "error", message })
      return
    }

    // 重置跨轮持久状态：输出目录、已用文件名、结果数组（结果数组保持与目标图片下标对齐）、
    // 目标批次快照（重试以本批次为准，不受后续勾选变化影响）。
    dirPathRef.current = dirPath
    usedNamesRef.current = new Set()
    resultsRef.current = new Array(total)
    batchSnapshotRef.current = items

    // 逐个导出；完成后自动打开输出目录（桌面模式）。
    const completed = await runBatchExport(items, Array.from({ length: total }, (_, i) => i))
    setBatchExport({ kind: "completed", total, success: completed.success, failed: completed.failed, results: completed.results, dirPath })
    notifyBatchResult(completed.success, completed.failed)
    if (autoOpenExportDirectory) {
      openExportDirectory(dirPath)
    }
  }, [batchExportItems, resolveQueueItem, settings, prepareExifForExport, autoOpenExportDirectory, openExportDirectory, notifyBatchResult])

  /**
   * 并发导出指定范围的图片（第 0 轮为全部目标图片，重试轮为失败项）。
   * indexes 与 items 一一对应：items[i] 的结果写入 resultsRef.current[indexes[i]]，
   * 保证重试轮（失败下标不连续）仍能写回与目标图片对齐的位置。
   * 返回本轮成功/失败数与最新结果数组。
   */
  const runBatchExport = useCallback(async (
    items: readonly QueueItem[],
    indexes: readonly number[]
  ): Promise<{ success: number; failed: number; results: readonly BatchExportItemResult[] }> => {
    const dirPath = dirPathRef.current
    if (dirPath === null) {
      return { success: 0, failed: items.length, results: resultsRef.current }
    }

    const ext = settings.exportFormat === "jpeg" ? "jpg" : settings.exportFormat === "tiff" ? "tif" : "png"
    const total = items.length
    let success = 0
    let failed = 0
    let done = 0

    setBatchExport({ kind: "running", total, current: 0, success: 0, failed: 0 })

    /**
     * 导出单张图片：惰性解析文字/品牌（EXIF 已并入身份链），
     * 提交同步渲染任务并写回结果（写入与队列顺序一致的原始下标）。
     */
    const exportOne = async (index: number): Promise<void> => {
      const item = items[index]!
      const resultIndex = indexes[index]!
      const fileName = item.fileName
      const dotIndex = fileName.lastIndexOf(".")
      const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName
      const outputPath = buildUniqueExportPath(dirPath, baseName, ext, usedNamesRef.current)

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
          resultsRef.current[resultIndex] = {
            fileName,
            success: true,
            actualFormat: result.actualFormat ?? settings.exportFormat,
            summary: buildExportSummary(result),
            error: null
          }
        } else {
          failed++
          resultsRef.current[resultIndex] = {
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
        resultsRef.current[resultIndex] = {
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

    return { success, failed, results: resultsRef.current }
  }, [resolveQueueItem, settings])

  /**
   * 批量导出完成后，仅重试「首次导出批次」的失败项。
   * 使用 batchSnapshotRef 快照而非当前 props：用户之后改变勾选范围，
   * 重试的对象、结果数组与统计仍然对应原批次。
   */
  const handleRetryFailed = useCallback(async () => {
    if (batchExport.kind !== "completed" || batchExport.failed === 0) {
      return
    }
    const snapshot = batchSnapshotRef.current
    if (snapshot.length !== resultsRef.current.length) {
      // 防御：快照与结果数组不一致时不重试，避免写错位置
      return
    }
    const failedIndexes = snapshot
      .map((_, index) => index)
      .filter((index) => {
        const result = resultsRef.current[index]
        return result === undefined || !result.success
      })
    if (failedIndexes.length === 0) {
      return
    }
    const failedItems = failedIndexes.map((index) => snapshot[index]!)
    await runBatchExport(failedItems, failedIndexes)

    // 重试后从快照批次的结果数组重新统计（resultsRef 已包含重试成功项，不能叠加轮次计数）
    const finalResults = resultsRef.current
    const successCount = finalResults.filter((r) => r !== undefined && r.success).length
    const failedCount = snapshot.length - successCount
    setBatchExport({
      kind: "completed",
      total: snapshot.length,
      success: successCount,
      failed: failedCount,
      results: finalResults,
      dirPath: dirPathRef.current ?? ""
    })
    notifyBatchResult(successCount, failedCount)
  }, [batchExport, runBatchExport, notifyBatchResult])

  const canExport = state.kind === "active" && state.currentImage !== null
  const isExporting = exportJob.kind === "preparing" || exportJob.kind === "submitting" || exportJob.kind === "running"
  const isBatchExporting = batchExport.kind === "preparing" || batchExport.kind === "running"
  const hasBatchItems = batchExportItems.length > 0

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
          disabled={!canExport || isExporting || isBatchExporting}
          onClick={() => void handleHighQualityExport()}
        >
          {exportJob.kind === "preparing" ? "准备中…" : isExporting ? "渲染中…" : "导出原图"}
        </button>
        {hasBatchItems && (
          <button
            type="button"
            className="ghostButton previewExportButton"
            disabled={isBatchExporting || isExporting}
            onClick={() => void handleBatchExport()}
          >
            {batchExport.kind === "preparing"
              ? "读取 EXIF…"
              : isBatchExporting
              ? `批量导出中 ${batchExport.current}/${batchExport.total}…`
              : batchExportLabel}
          </button>
        )}

        <span className="previewExportStatus" aria-live="polite">
          {!hasSelectedImage && "请先选择一张图片"}
          {/* 单图导出阶段进度：准备（选路径 + 读 EXIF）→ 渲染（引擎渲染写盘）。
              不伪造引擎内部百分比，仅展示阶段语义。 */}
          {(exportJob.kind === "preparing" || exportJob.kind === "submitting") && (
            <span
              className="previewExportPhase"
              role="progressbar"
              aria-label="单图导出进度"
              aria-valuemin={0}
              aria-valuemax={3}
              aria-valuenow={exportJob.kind === "preparing" ? 1 : 2}
              aria-valuetext={exportJob.kind === "preparing" ? "准备阶段（1/3）" : "引擎渲染阶段（2/3）"}
            >
              <span className="previewExportProgressTrack" aria-hidden="true">
                <span
                  className="previewExportProgressFill"
                  style={{ width: exportJob.kind === "preparing" ? "33%" : "66%" }}
                />
              </span>
              <span role="status" aria-label="单图导出进度">
                {exportJob.kind === "preparing" ? "正在读取 EXIF…" : "正在渲染…"}
              </span>
            </span>
          )}
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
            // determinate 进度条：current/total + 成功/失败计数，辅助技术可读
            <span
              className="previewBatchProgress"
              role="progressbar"
              aria-label="批量导出进度"
              aria-valuemin={0}
              aria-valuemax={batchExport.total}
              aria-valuenow={batchExport.current}
              aria-valuetext={`已完成 ${batchExport.current}/${batchExport.total}，成功 ${batchExport.success} 张，失败 ${batchExport.failed} 张`}
              aria-live="polite"
            >
              <span className="previewBatchProgressTrack" aria-hidden="true">
                <span
                  className="previewBatchProgressFill"
                  style={{ width: `${batchExport.total > 0 ? (batchExport.current / batchExport.total) * 100 : 0}%` }}
                />
              </span>
              <span className="previewBatchProgressLabel">
                进度 {batchExport.current}/{batchExport.total}　成功 {batchExport.success}　失败 {batchExport.failed}
              </span>
            </span>
          )}
          {batchExport.kind === "preparing" && "正在读取 EXIF…"}
          {batchExport.kind === "completed" && (
            <>
              <span className={batchExport.failed > 0 ? "previewExportError" : "previewExportSuccess"}>
                批量导出完成：共 {batchExport.total} 张，成功 {batchExport.success}，失败 {batchExport.failed}
              </span>
              {/* 失败文件明细 + 操作 */}
              {batchExport.failed > 0 && (
                <span className="previewBatchFailures">
                  <span className="previewBatchFailureTitle">失败文件：</span>
                  {batchExport.results.filter((r) => !r.success).map((r, idx) => (
                    <span key={idx}>
                      {idx > 0 && "；"}
                      {r.fileName}
                      {r.error !== null ? `（${r.error}）` : ""}
                    </span>
                  ))}
                </span>
              )}
              {/* 引擎返回的 EXIF/ICC/高位深/RAW 摘要仍需在批量终态保留，便于用户发现降级。 */}
              {batchExport.results.filter((result) => result.summary.length > 0).length > 0 && (
                <span className="previewBatchSummaries">
                  <span className="previewBatchSummaryTitle">导出摘要：</span>
                  {batchExport.results.filter((result) => result.summary.length > 0).map((result, idx) => (
                    <span key={`${result.fileName}-summary`}>
                      {idx > 0 && "；"}
                      {result.fileName}：{result.summary.join("；")}
                    </span>
                  ))}
                </span>
              )}
              {/* 操作：打开目录 / 重试失败项 */}
              <span className="previewBatchActions">
                {window.desktop?.openDirectory !== undefined && (
                  <button
                    type="button"
                    className="ghostButton previewBatchActionBtn"
                    onClick={() => openExportDirectory(batchExport.dirPath)}
                  >
                    打开目录
                  </button>
                )}
                {batchExport.failed > 0 && (
                  <button
                    type="button"
                    className="ghostButton previewBatchActionBtn"
                    onClick={() => void handleRetryFailed()}
                  >
                    重试失败项（{batchExport.failed}）
                  </button>
                )}
              </span>
            </>
          )}
          {batchExport.kind === "error" && (
            <span className="previewExportError">{batchExport.message}</span>
          )}
        </span>
      </div>
    </Panel>
  )
}
