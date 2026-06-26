import { useCallback, useEffect, useRef, useState } from "react"
import { Panel } from "../../../components/layout/Panel"
import { drawPreviewToCanvas } from "../canvas/canvasRenderer"
import { submitAndWaitForRenderJob } from "../../../services/engine/renderJobsApi"
import { toExportFileName } from "../../../utils/fileName"
import type { RenderSettings } from "../../settings/types"
import type { EngineSyncStatus, PreviewState } from "../types"
import type { ExportSettings, GradientConfig, RenderJobRequest } from "../../../types/preview"

type PreviewPanelProps = {
  readonly state: PreviewState
  readonly settings: RenderSettings
  readonly hasSelectedImage: boolean
  readonly queueFilePaths: readonly string[]
  readonly queueFileNames: readonly string[]
  /** 每张图的文字覆盖，与 queueFilePaths 下标对齐。null 表示使用全局默认。 */
  readonly queueTextOverrides: readonly (string | null)[]
}

/** 单图导出任务状态。 */
type ExportJobState =
  | { readonly kind: "idle" }
  | { readonly kind: "submitting" }
  | { readonly kind: "running"; readonly jobId: string }
  | { readonly kind: "completed"; readonly outputPath: string }
  | { readonly kind: "error"; readonly message: string }

/** 批量导出状态。 */
type BatchExportState =
  | { readonly kind: "idle" }
  | { readonly kind: "running"; readonly total: number; readonly current: number; readonly success: number; readonly failed: number }
  | { readonly kind: "completed"; readonly total: number; readonly success: number; readonly failed: number }
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
 * 将 UI 渐变设置转换为 API 渐变配置。
 */
const toGradientConfig = (s: RenderSettings): GradientConfig | null => {
  if (!s.gradient.enabled || s.gradient.stops.length < 2) {
    return null
  }
  return {
    enabled: true,
    type: s.gradient.type,
    angle: s.gradient.angle,
    stops: s.gradient.stops
  }
}

/**
 * 从设置构建 RenderRecipe 中与渲染相关的部分。
 */
const buildRecipeFromSettings = (
  filePath: string,
  settings: RenderSettings,
  textOverride?: string
) => {
  const textContent = textOverride ?? settings.textContent
  return {
    imagePath: filePath,
    border: {
      top: settings.borderTop,
      bottom: settings.borderBottom,
      left: settings.borderLeft,
      right: settings.borderRight,
      color: settings.borderColor
    },
    gradient: toGradientConfig(settings),
    texts: textContent.trim().length > 0
      ? [{
          content: textContent.trim(),
          fontFamily: settings.fontFamily,
          fontSize: settings.textFontSize,
          color: settings.textColor,
          placement: settings.textArea === "border"
            ? `border-${settings.textPlacement}`
            : `image-${settings.textPlacement}`,
          marginX: 0,
          marginY: 20
        }]
      : [],
    filmFormat: settings.filmFormat,
    autoCrop: settings.autoCrop
  }
}

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
  const observerRef = useRef<ResizeObserver | null>(null)

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

  useEffect(() => {
    const container = containerRef.current
    if (container === null) {
      return
    }

    const updateSize = (): void => {
      const canvas = canvasRef.current
      if (canvas === null) {
        return
      }
      const rect = container.getBoundingClientRect()
      canvas.width = Math.round(rect.width)
      canvas.height = Math.round(rect.height)
      drawFnRef.current?.()
    }

    updateSize()

    const observer = new ResizeObserver(updateSize)
    observer.observe(container)
    observerRef.current = observer

    return () => {
      observer.disconnect()
      observerRef.current = null
    }
  }, [])

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

  return (
    <div className="previewCanvasContainer">
      <div ref={containerRef} className="previewCanvasWrapper">
        <canvas ref={canvasRef} className="previewCanvas" />
      </div>
      <div className="previewMetaBar">
        <span className="previewMetaFileName">{state.fileName}</span>
        {syncLabel.length > 0 && (
          <span className={syncClassName}>{syncLabel}</span>
        )}
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
  queueFilePaths,
  queueFileNames,
  queueTextOverrides
}: PreviewPanelProps): JSX.Element => {
  const [exportJob, setExportJob] = useState<ExportJobState>({ kind: "idle" })
  const [batchExport, setBatchExport] = useState<BatchExportState>({ kind: "idle" })

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

    const exportSettings: ExportSettings = {
      format: settings.exportFormat,
      outputPath,
      jpegQuality: settings.jpegQuality
    }

    const request: RenderJobRequest = {
      recipe: buildRecipeFromSettings(state.filePath, settings),
      export: exportSettings
    }

    setExportJob({ kind: "submitting" })

    try {
      const result = await submitAndWaitForRenderJob(request)

      if (result.status === "completed") {
        setExportJob({
          kind: "completed",
          outputPath: result.outputPath ?? outputPath
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
  }, [state, settings])

  const handleBatchExport = useCallback(async () => {
    if (queueFilePaths.length === 0) {
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

    const ext = settings.exportFormat === "jpeg" ? "jpg" : "png"

    // 使用目录选择 API，不再复用单文件保存对话框
    const dirPath = await window.desktop.selectExportDirectory()
    if (dirPath === null) {
      return
    }

    const total = queueFilePaths.length
    let success = 0
    let failed = 0
    const usedNames = new Set<string>()

    setBatchExport({ kind: "running", total, current: 0, success: 0, failed: 0 })

    for (let i = 0; i < total; i++) {
      const filePath = queueFilePaths[i]!
      const fileName = queueFileNames[i] ?? "unknown"
      const dotIndex = fileName.lastIndexOf(".")
      const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName
      const outputPath = buildUniqueExportPath(dirPath, baseName, ext, usedNames)

      // 每张图优先使用独立文字覆盖，否则回退全局默认
      const textOverride = queueTextOverrides[i] ?? null

      setBatchExport({ kind: "running", total, current: i + 1, success, failed })

      try {
        const request: RenderJobRequest = {
          recipe: buildRecipeFromSettings(filePath, settings, textOverride ?? undefined),
          export: {
            format: settings.exportFormat,
            outputPath,
            jpegQuality: settings.jpegQuality
          }
        }

        const result = await submitAndWaitForRenderJob(request)
        if (result.status === "completed") {
          success++
        } else {
          failed++
        }
      } catch {
        failed++
      }
    }

    setBatchExport({ kind: "completed", total, success, failed })
  }, [queueFilePaths, queueFileNames, queueTextOverrides, settings])

  const canExport = state.kind === "active" && state.currentImage !== null
  const isExporting = exportJob.kind === "submitting" || exportJob.kind === "running"
  const isBatchExporting = batchExport.kind === "running"
  const hasBatchItems = queueFilePaths.length > 1

  return (
    <Panel label="预览" title="预览区域" className="previewPanel">
      <div className="previewFrame">
        {state.kind === "idle" && <IdleView />}
        {state.kind === "active" && state.currentImage === null && (
          <LoadingView filePath={state.filePath} />
        )}
        {state.kind === "active" && state.currentImage !== null && (
          <CanvasPreview state={state} settings={settings} />
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
              : `批量导出 ${queueFilePaths.length} 张`}
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
            <span className="previewExportSuccess">导出完成：{exportJob.outputPath}</span>
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
