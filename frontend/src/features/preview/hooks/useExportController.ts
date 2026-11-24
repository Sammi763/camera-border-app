/**
 * 根级导出控制器。
 *
 * 导出状态不能放在 PreviewPanel：工作台页签切换会卸载部分内容，而任务仍在引擎中执行。
 * 因此本 Hook 由 WorkspacePage 持有，只向面板暴露状态和命令；提交前会冻结目标图片、
 * RenderRecipe 与 ExportSettings，保证排队任务不受之后编辑影响。
 */

import { useCallback, useRef, useState } from "react"
import { cancelRenderJob, fetchRenderJobStatus, submitAndWaitForRenderJob, waitForRenderJob } from "../../../services/engine/renderJobsApi"
import { EngineHttpError } from "../../../services/engine/engineClient"
import { preflightExport } from "../../../services/engine/exportPreflightApi"
import { toExportFileName } from "../../../utils/fileName"
import type {
  ExportSettings,
  FeatureResult,
  RenderJobItemStatus,
  RenderJobRequest,
  RenderJobSnapshot,
  RenderJobStatusResponse,
  SourceDecode,
  CapabilitiesResponse,
  FidelityReport,
  ExportPreflightResponse
} from "../../../types/preview"
import type { FilmOutput, ImageProcessingConfig } from "../../../types/imageProcessing"
import { buildRecipeFromSettings } from "../../settings/utils/buildRecipe"
import { resolveOutputSizeFromSettings } from "../../settings/utils/outputSizePresets"
import type { RenderSettings } from "../../settings/types"
import { isFilmBasePending } from "../../editing/defaults"
import type { QueueItem } from "../../queue/types"
import type { PreviewState } from "../types"

/** 单张图片的变量解析结果，与 WorkspacePage.resolveQueueItem 对齐。 */
export type ResolvedQueueItem = {
  readonly textOverride: string | null
  readonly resolvedLayers: readonly (string | null)[]
  readonly brand: string | null
}

export type ExportJobState =
  | { readonly kind: "idle" }
  | { readonly kind: "preparing" }
  | { readonly kind: "submitting" }
  | { readonly kind: "running"; readonly jobId: string; readonly total: number; readonly processed: number; readonly currentItem: number | null }
  | { readonly kind: "completed"; readonly outputPath: string; readonly actualFormat: string; readonly summary: readonly string[]; readonly report?: FidelityReport | null }
  | { readonly kind: "cancelled"; readonly message: string }
  | { readonly kind: "error"; readonly message: string }
  /**
   * 状态待确认（U06）：提交/查询链路断线或超时后结果未知。jobId 非空时可重新
   * 查询原任务；为空表示连提交响应都没有拿到，应用绝不自动重复提交，由用户
   * 核对输出目录后决定。引擎重启后内存任务记录失效，同样落入本状态并如实解释。
   */
  | { readonly kind: "unconfirmed"; readonly message: string; readonly jobId: string | null; readonly outputPath: string | null }

export type BatchExportItemResult = {
  readonly fileName: string
  readonly success: boolean
  readonly actualFormat: string | null
  readonly summary: readonly string[]
  readonly error: string | null
  readonly report?: FidelityReport | null
}

export type BatchExportState =
  | { readonly kind: "idle" }
  | { readonly kind: "preparing"; readonly total: number }
  | { readonly kind: "running"; readonly jobId: string; readonly total: number; readonly current: number; readonly success: number; readonly failed: number; readonly cancelled: number }
  | { readonly kind: "completed"; readonly total: number; readonly success: number; readonly failed: number; readonly results: readonly BatchExportItemResult[]; readonly dirPath: string }
  | { readonly kind: "cancelled"; readonly total: number; readonly success: number; readonly failed: number; readonly cancelled: number; readonly results: readonly BatchExportItemResult[]; readonly dirPath: string }
  | { readonly kind: "error"; readonly message: string }
  /** 批量任务状态待确认：保留冻结批次与目录，支持重新查询原任务或核对输出目录。 */
  | { readonly kind: "unconfirmed"; readonly message: string; readonly jobId: string | null; readonly total: number; readonly dirPath: string; readonly results: readonly BatchExportItemResult[] }

/** 每次单图提交持有自己的状态，轮询与取消响应只能更新所属任务。 */
type SingleRun = {
  readonly fileName: string
  readonly format: RenderSettings["exportFormat"]
  readonly cancellation: AbortController
  outputPath: string | null
  jobId: string | null
  busy: boolean
  cancelRequest: "idle" | "sent" | "failed"
}

type FrozenBatch = {
  readonly request: RenderJobRequest
  readonly settings: RenderSettings
  readonly items: readonly QueueItem[]
  readonly dirPath: string
  readonly results: (BatchExportItemResult | undefined)[]
}

export type BatchReviewRow = {
  readonly index: number
  readonly itemId: string
  readonly sourcePath: string
  readonly outputPath: string
  readonly format: string
  readonly dimensions: string | null
  readonly reasons: readonly string[]
  readonly canRepair: boolean
  readonly canRename: boolean
  readonly canExportPlain: boolean
}
export type BatchReviewAction = "export" | "skip" | "rename" | "plain"

type BatchReview = {
  readonly frozen: FrozenBatch
  readonly rows: readonly BatchReviewRow[]
}

const recipeIssue = (item: QueueItem | null): string | null =>
  item?.imageProcessingError ?? (isFilmBasePending(item?.imageProcessing) ? "请先完成片基校准" : null)

const MISSING_SOURCE = "源照片缺失，请在队列中重新定位文件"
export const BATCH_SKIPPED = "已按选择跳过"

type BatchRun = {
  readonly frozen: FrozenBatch
  readonly chunks: readonly (readonly number[])[]
  cursor: number
}

// 与引擎 RenderJobController.MAX_SNAPSHOTS_PER_JOB 一致。
const MAX_BATCH_CHUNK_SIZE = 100
const BATCH_CANCELLED = "任务已取消，未执行"

const isTerminalJob = (status: RenderJobStatusResponse): boolean =>
  status.status === "completed" || status.status === "failed" || status.status === "cancelled"

const batchCounts = (results: readonly (BatchExportItemResult | undefined)[]) => {
  let success = 0
  let failed = 0
  let cancelled = 0
  let skipped = 0
  for (const result of results) {
    if (result === undefined) continue
    if (result.success) success++
    else if (result.error === BATCH_CANCELLED) cancelled++
    else if (result.error === BATCH_SKIPPED) skipped++
    else failed++
  }
  return { success, failed, cancelled, skipped }
}

type UseExportControllerArgs = {
  readonly state: PreviewState
  readonly settings: RenderSettings
  readonly queueItems: readonly QueueItem[]
  readonly activeItemId?: string | null
  /** 根级 operationScope 已解析后的图片范围。 */
  readonly batchExportItems: readonly QueueItem[]
  /** 解析时显式传入冻结设置，避免 EXIF 等待期间的编辑污染已启动的导出。 */
  readonly resolveQueueItem: (item: QueueItem, frozenSettings: RenderSettings) => ResolvedQueueItem
  /** 支持取消等待：signal 中止后批量 EXIF 读取立即返回（useExifIndex.ensureExifForExport）。 */
  readonly prepareExifForExport: (paths: readonly string[], signal?: AbortSignal) => Promise<void>
  readonly autoOpenExportDirectory: boolean
  readonly engineAvailable: boolean
  /** 传入 null 表示能力探测失败，生产导出仍必须先走 fail-closed 预检；省略仅供旧单测兼容。 */
  readonly capabilities?: CapabilitiesResponse | null
}

export type ExportController = {
  readonly single: ExportJobState
  readonly batch: BatchExportState
  readonly isExporting: boolean
  readonly isBatchExporting: boolean
  readonly lastPreflight?: ExportPreflightResponse | null
  /** 非致命提示（如取消请求失败）：任务仍在执行，不覆盖运行中的任务状态。 */
  readonly notice: string | null
  readonly startSingleExport: () => Promise<void>
  readonly startBatchExport: () => Promise<void>
  readonly inspectBatch?: () => Promise<void>
  readonly batchReview?: readonly BatchReviewRow[] | null
  readonly resolveBatchReview?: (actions: Readonly<Record<number, BatchReviewAction>>) => Promise<void>
  readonly dismissBatchReview?: () => void
  readonly retryFailed: () => Promise<void>
  readonly cancelActiveExport: () => Promise<void>
  /** 重新查询「状态待确认」任务的原 jobId；引擎记录已失效时如实解释。 */
  readonly requeryUnconfirmed: () => Promise<void>
  readonly openExportDirectory: (dirPath: string) => void
}

/** 底片组合决定真实扩展名，避免旧会话的普通格式字段与输出内容冲突。 */
export const effectiveFilmOutput = (settings: RenderSettings): FilmOutput =>
  settings.filmOutput ?? (settings.exportFormat === "tiff" ? "tiff16-srgb" : "srgb-jpeg")

export const effectiveExportFormat = (settings: RenderSettings, processing: ImageProcessingConfig | null | undefined): RenderSettings["exportFormat"] =>
  processing == null ? settings.exportFormat
    : effectiveFilmOutput(settings) === "srgb-jpeg" ? "jpeg" : "tiff"

/** 从设置构建导出设置；尺寸预设在提交前收敛为引擎使用的像素上限。 */
const buildExportSettings = (
  settings: RenderSettings,
  outputPath: string,
  imageProcessing: ImageProcessingConfig | null | undefined
): ExportSettings => {
  const size = resolveOutputSizeFromSettings(settings)
  const filmMode = imageProcessing !== null && imageProcessing !== undefined
  return {
    format: effectiveExportFormat(settings, imageProcessing),
    outputPath,
    jpegQuality: settings.jpegQuality,
    maxWidth: size.maxWidth,
    maxHeight: size.maxHeight,
    preserveMetadata: settings.preserveMetadata,
    preserveColorProfile: settings.preserveColorProfile,
    preferHighBitDepth: settings.preferHighBitDepth,
    tier: settings.tier ?? "standard-delivery",
    colorProfilePolicy: settings.colorProfilePolicy ?? "source",
    metadataPolicy: settings.metadataPolicy ?? "preserve",
    bitDepthPolicy: settings.bitDepthPolicy ?? "8",
    ...(filmMode
      ? {
        tier: "custom" as const,
        filmOutput: effectiveFilmOutput(settings)
      }
      : {})
  }
}

/** 设置仅包含可序列化的界面值；JSON 复制能断开所有嵌套数组/对象引用。 */
const freezeSettings = (settings: RenderSettings): RenderSettings =>
  JSON.parse(JSON.stringify(settings)) as RenderSettings

/** 图片项字段全为值类型或只读数据；深复制身份覆盖与底片曲线，避免范围引用随队列编辑变化。 */
const freezeQueueItem = (item: QueueItem): QueueItem => ({
  ...item,
  identityOverride: item.identityOverride === null ? null : { ...item.identityOverride },
  ...(item.imageProcessing === undefined
    ? {}
    : { imageProcessing: item.imageProcessing === null
      ? null
      : JSON.parse(JSON.stringify(item.imageProcessing)) as NonNullable<QueueItem["imageProcessing"]> })
})

/**
 * 文件名冲突时追加序号；同一冻结批次内的映射保持确定性。
 * withSuffix=false 用于「前缀+序号」命名（文件名已自带语义，不追加 -border）。
 */
const buildUniqueExportPath = (
  dirPath: string,
  baseName: string,
  ext: string,
  usedNames: Set<string>,
  withSuffix = true
): string => {
  const stem = withSuffix ? `${baseName}-border` : baseName
  let candidate = `${stem}.${ext}`
  let counter = 1
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${stem}-${counter}.${ext}`
    counter++
  }
  usedNames.add(candidate.toLowerCase())
  return `${dirPath}/${candidate}`
}

/** 文件名中的路径/保留字符：用户输入的前缀必须清洗，避免生成跨目录或非法路径。 */
const ILLEGAL_FILENAME_CHARS = /[/\\:*?"<>|]/g

/** 批量命名的输出文件名（不含扩展名）。original-suffix=原文件名+后缀；prefix-index=前缀-三位序号。 */
export const buildBatchOutputName = (
  item: Pick<QueueItem, "fileName">,
  index: number,
  naming: { readonly mode: "original-suffix" | "prefix-index"; readonly prefix: string }
): string => {
  if (naming.mode === "prefix-index") {
    // 前缀清洗后为空时回退 export；保证输出路径始终是单段合法文件名。
    const sanitized = naming.prefix.replace(ILLEGAL_FILENAME_CHARS, "").trim()
    const prefix = sanitized.length > 0 ? sanitized : "export"
    return `${prefix}-${String(index + 1).padStart(3, "0")}`
  }
  const dotIndex = item.fileName.lastIndexOf(".")
  return dotIndex > 0 ? item.fileName.slice(0, dotIndex) : item.fileName
}

/** 生成命名样例（U13 预览）：展示前 3 个实际输出文件名。 */
export const buildNamingPreview = (
  items: readonly Pick<QueueItem, "fileName">[],
  naming: { readonly mode: "original-suffix" | "prefix-index"; readonly prefix: string },
  extension: string | ((item: Pick<QueueItem, "fileName">, index: number) => string)
): readonly string[] => {
  const usedNames = new Set<string>()
  return items.slice(0, 3).map((item, index) => buildUniqueExportPath(
    "", buildBatchOutputName(item, index, naming),
    typeof extension === "function" ? extension(item, index) : extension,
    usedNames, naming.mode === "original-suffix"
  ).slice(1))
}

const extensionFor = (format: RenderSettings["exportFormat"]): string =>
  format === "jpeg" ? "jpg" : format === "tiff" ? "tif" : "png"

const featureResultLabel = (result: FeatureResult | null | undefined): string | null => {
  if (result === null || result === undefined || result.status === "NOT_REQUESTED") {
    return null
  }
  if (result.status === "APPLIED") return result.message ?? "已应用"
  if (result.status === "SOURCE_ABSENT") return result.message ?? "源文件没有该能力的事实"
  if (result.status === "UNSUPPORTED") return result.message ?? "当前档位不支持该能力"
  if (result.status === "FAILED") return result.message ?? "该能力校验失败"
  return result.message ?? "已降级"
}

export const sourceDecodeLabel = (sourceDecode: SourceDecode): string | null => {
  if (sourceDecode.mode === "embedded-jpeg") return sourceDecode.warning ?? "RAW 仅使用内嵌 JPEG 像素"
  return null
}

export const buildExportSummary = (result: Pick<RenderJobItemStatus,
  "metadataPreservation" | "colorProfilePreservation" | "highBitDepth" | "sourceDecode">): readonly string[] => {
  const lines: string[] = []
  const metadata = featureResultLabel(result.metadataPreservation)
  if (metadata !== null) lines.push(`EXIF：${metadata}`)
  const icc = featureResultLabel(result.colorProfilePreservation)
  if (icc !== null) lines.push(`ICC：${icc}`)
  const bitDepth = featureResultLabel(result.highBitDepth)
  if (bitDepth !== null) lines.push(`高位深：${bitDepth}`)
  const sourceDecode = result.sourceDecode ?? null
  if (sourceDecode !== null) {
    const decode = sourceDecodeLabel(sourceDecode)
    if (decode !== null) lines.push(decode)
  }
  return lines
}

const sanitizeNotificationBody = (body: string): string => {
  const absolutePathPattern = /(?:file:\/\/)?(?:\/|[A-Za-z]:[\\/])[^()\n\r]*?(?=[）)\n\r]|$)/g
  return body.replace(absolutePathPattern, "相关文件")
}

const toErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback

const asItemStatus = (status: RenderJobStatusResponse, index: number): RenderJobItemStatus => {
  const item = status.items?.[index]
  if (item !== undefined) {
    return item
  }
  const fallbackStatus = status.status === "pending" ? "queued" : status.status
  return {
    index,
    status: fallbackStatus,
    ...(status.outputPath === undefined ? {} : { outputPath: status.outputPath }),
    ...(status.actualFormat === undefined ? {} : { actualFormat: status.actualFormat }),
    ...(status.error === undefined ? {} : { error: status.error }),
    ...(status.metadataPreservation === undefined ? {} : { metadataPreservation: status.metadataPreservation }),
    ...(status.colorProfilePreservation === undefined ? {} : { colorProfilePreservation: status.colorProfilePreservation }),
    ...(status.highBitDepth === undefined ? {} : { highBitDepth: status.highBitDepth }),
    ...(status.sourceDecode === undefined ? {} : { sourceDecode: status.sourceDecode }),
    ...(status.fidelityReport === undefined ? {} : { fidelityReport: status.fidelityReport })
  }
}

const isBusy = (state: ExportJobState | BatchExportState): boolean =>
  state.kind === "preparing" || state.kind === "submitting" || state.kind === "running"

export const useExportController = ({
  state,
  settings,
  queueItems,
  activeItemId,
  batchExportItems,
  resolveQueueItem,
  prepareExifForExport,
  autoOpenExportDirectory,
  engineAvailable,
  capabilities
}: UseExportControllerArgs): ExportController => {
  const [single, setSingle] = useState<ExportJobState>({ kind: "idle" })
  const [batch, setBatch] = useState<BatchExportState>({ kind: "idle" })
  const [lastPreflight, setLastPreflight] = useState<ExportPreflightResponse | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [batchReview, setBatchReview] = useState<BatchReview | null>(null)
  const reviewRef = useRef<BatchReview | null>(null)
  const setReview = useCallback((value: BatchReview | null) => {
    reviewRef.current = value
    setBatchReview(value)
  }, [])
  const activeBatchJobIdRef = useRef<string | null>(null)
  const frozenBatchRef = useRef<FrozenBatch | null>(null)
  const batchRunRef = useRef<BatchRun | null>(null)
  const requeryingBatchRef = useRef(false)
  // 准备阶段（尚未取得 jobId）的本地取消令牌：置位后，EXIF/选择器/预检等异步
  // 结果返回时不得再提交任务；jobId 产生后改走引擎 DELETE 取消。
  const singleRunRef = useRef<SingleRun | null>(null)
  const batchCancelRequestedRef = useRef(false)
  // 准备阶段 EXIF 等待的中止器：取消时立即中断批量读取，不等到自然结束。
  const batchExifAbortRef = useRef<AbortController | null>(null)

  const openExportDirectory = useCallback((dirPath: string): void => {
    const openDirectory = window.desktop?.openDirectory
    if (openDirectory === undefined) return
    void openDirectory(dirPath).catch(() => {
      // 打开目录失败不影响已经完成的导出结果。
    })
  }, [])

  const notifySystem = useCallback((title: string, body: string): void => {
    const showNotification = window.desktop?.showNotification
    if (showNotification === undefined) return
    void showNotification(title, sanitizeNotificationBody(body)).catch(() => {
      // 通知为增强反馈，失败时工作台内状态仍然可见。
    })
  }, [])

  const applySingleStatus = useCallback((run: SingleRun, status: RenderJobStatusResponse): void => {
    if (singleRunRef.current !== run) return
    run.jobId = status.jobId
    if (isTerminalJob(status)) {
      singleRunRef.current = null
      const result = asItemStatus(status, 0)
      if (status.status === "completed" && result.status === "completed") {
        setSingle({
          kind: "completed",
          outputPath: result.outputPath ?? run.outputPath ?? "",
          actualFormat: result.actualFormat ?? run.format,
          summary: buildExportSummary(result),
          report: result.fidelityReport ?? null
        })
        notifySystem("导出完成", run.fileName)
      } else if (status.status === "cancelled") {
        setSingle({ kind: "cancelled", message: result.error ?? "导出任务已取消。" })
      } else {
        const message = result.error ?? status.error ?? "导出失败，未知错误。"
        setSingle({ kind: "error", message })
        notifySystem("导出失败", `${run.fileName}（${message}）`)
      }
      return
    }
    if (status.status === "queued" || status.status === "pending" || status.status === "running") {
      setSingle({
        kind: "running",
        jobId: status.jobId,
        total: status.total ?? 1,
        processed: status.processed ?? 0,
        currentItem: status.currentItem ?? null
      })
    }
  }, [notifySystem])

  const sendSingleCancel = useCallback(async (run: SingleRun, retry = false): Promise<void> => {
    if (singleRunRef.current !== run || run.jobId === null || run.cancelRequest === "sent"
      || (run.cancelRequest === "failed" && !retry)) return
    run.cancelRequest = "sent"
    if (retry) setNotice(null)
    try {
      const status = await cancelRenderJob(run.jobId)
      // 已开始写盘时 DELETE 可能返回运行中，继续以轮询结果为准。
      if (isTerminalJob(status)) applySingleStatus(run, status)
    } catch (error: unknown) {
      if (singleRunRef.current === run) {
        run.cancelRequest = "failed"
        setNotice(`取消请求失败：${toErrorMessage(error, "引擎不可达")}。任务可能仍在执行，可稍后在结果中确认。`)
      }
    }
  }, [applySingleStatus])

  const observeSingleStatus = useCallback((run: SingleRun, status: RenderJobStatusResponse): void => {
    applySingleStatus(run, status)
    if (run.cancellation.signal.aborted && !isTerminalJob(status)) void sendSingleCancel(run)
  }, [applySingleStatus, sendSingleCancel])

  const ensurePreflightReady = useCallback(async (request: RenderJobRequest): Promise<void> => {
    // production WorkspacePage always passes capabilities (including null on failure).
    // Omitted only preserves the old hook unit-test contract; actual desktop export is fail closed.
    if (capabilities === undefined) return
    if (capabilities === null) throw new Error("专业能力探测未完成，已阻止导出")
    const response = await preflightExport(request)
    setLastPreflight(response)
    if (response.status === "ready") return
    const reasons = response.items.flatMap((item) => item.blockingReasons)
    throw new Error(`导出预检未通过：${reasons.length > 0 ? reasons.join("；") : "当前档位不可用"}`)
  }, [capabilities])

  const applyBatchStatus = useCallback((status: RenderJobStatusResponse, run: BatchRun): void => {
    activeBatchJobIdRef.current = status.jobId
    if (status.status === "queued" || status.status === "pending" || status.status === "running") {
      const counts = batchCounts(run.frozen.results)
      setBatch({
        kind: "running",
        jobId: status.jobId,
        total: run.frozen.items.length,
        current: counts.success + counts.failed + counts.cancelled + counts.skipped + (status.processed ?? 0),
        success: counts.success + (status.completed ?? 0),
        failed: counts.failed + (status.failed ?? 0),
        cancelled: counts.cancelled + (status.cancelled ?? 0)
      })
    }
  }, [])

  const startSingleExport = useCallback(async (): Promise<void> => {
    if (singleRunRef.current?.busy || reviewRef.current !== null || isBusy(single) || isBusy(batch) || requeryingBatchRef.current) return
    if (state.kind !== "active") return
    if (!engineAvailable) {
      setSingle({ kind: "error", message: "Java 引擎不可用，恢复后再导出。" })
      return
    }

    const frozenSettings = freezeSettings(settings)
    const selectedItem = queueItems.find((item) => activeItemId === undefined ? item.filePath === state.filePath : item.id === activeItemId)
    if (activeItemId != null && selectedItem?.filePath !== state.filePath) return
    const frozenItem = selectedItem === undefined ? null : freezeQueueItem(selectedItem)
    const issue = recipeIssue(frozenItem)
    if (issue !== null) {
      setSingle({ kind: "error", message: `${state.fileName}：${issue}。请在底片页处理后再导出。` })
      return
    }
    // 每次新任务都从当前请求重新生成预检摘要，避免把上一次路径冲突或失败原因
    // 留在 Dock 中，误导用户以为它属于当前导出。
    const run: SingleRun = {
      fileName: state.fileName,
      format: effectiveExportFormat(frozenSettings, frozenItem?.imageProcessing),
      cancellation: new AbortController(),
      outputPath: null,
      jobId: null,
      busy: true,
      cancelRequest: "idle"
    }
    singleRunRef.current = run
    batchRunRef.current = null
    setNotice(null)
    setLastPreflight(null)
    setBatch({ kind: "idle" })
    setSingle({ kind: "preparing" })

    /** 准备阶段取消：不再提交，也不把取消伪装成失败。 */
    const abortIfCancelled = (): boolean => {
      if (!run.cancellation.signal.aborted) return false
      singleRunRef.current = null
      setSingle({ kind: "cancelled", message: "导出已在准备阶段取消。" })
      return true
    }

    try {
      await prepareExifForExport([frozenItem?.filePath ?? state.filePath], run.cancellation.signal)
      if (abortIfCancelled()) return
      const resolved = frozenItem === null
        ? { textOverride: null, resolvedLayers: [], brand: null }
        : resolveQueueItem(frozenItem, frozenSettings)
      const recipe = buildRecipeFromSettings(
        state.filePath,
        frozenSettings,
        resolved.textOverride ?? undefined,
        resolved.resolvedLayers,
        resolved.brand,
        frozenItem?.imageProcessing ?? null
      )
      const exportFileName = toExportFileName(state.fileName, run.format)
      const outputPath = window.desktop !== undefined
        ? await window.desktop.selectExportPath(exportFileName)
        : deriveBrowserExportPath(state.filePath, exportFileName)
      if (abortIfCancelled()) return
      if (outputPath === null) {
        singleRunRef.current = null
        setSingle(window.desktop === undefined
          ? { kind: "error", message: "浏览器降级模式无法选择保存位置，请启动桌面应用导出。" }
          : { kind: "idle" })
        return
      }
      run.outputPath = outputPath

      const request: RenderJobRequest = {
        items: [{ recipe, sourceVersion: frozenItem?.sourceVersion ?? null,
          export: buildExportSettings(frozenSettings, outputPath, frozenItem?.imageProcessing ?? null) }]
      }
      await ensurePreflightReady(request)
      if (abortIfCancelled()) return
      setSingle({ kind: "submitting" })
      // 提交一旦发出，结果即未知：断线/超时进入「状态待确认」，绝不自动重发。
      try {
        await submitAndWaitForRenderJob(request, undefined, status => observeSingleStatus(run, status))
      } catch (submitError: unknown) {
        if (singleRunRef.current !== run) return
        run.busy = false
        const message = toErrorMessage(submitError, "导出请求失败")
        if (run.jobId !== null) {
          // 已取得 jobId 后查询断线/超时：结果未知，优先重新查询原任务。
          setSingle({
            kind: "unconfirmed",
            message: `查询中断，结果未知：${message}。可重新查询原任务确认状态。`,
            jobId: run.jobId,
            outputPath
          })
          notifySystem("导出状态待确认", `${state.fileName}（${message}）`)
        } else if (submitError instanceof EngineHttpError) {
          // 引擎给出了确定的拒绝响应（未接受任务）：按普通失败处理。
          singleRunRef.current = null
          setSingle({ kind: "error", message })
          notifySystem("导出失败", `${state.fileName}（${message}）`)
        } else {
          // 提交响应丢失（网络断开/超时）：任务是否被接受未知，绝不自动重发。
          setSingle({
            kind: "unconfirmed",
            message: `提交结果未知：${message}。应用不会自动重复提交，请核对输出目录后决定是否重试。`,
            jobId: null,
            outputPath
          })
          notifySystem("导出状态待确认", `${state.fileName}（${message}）`)
        }
      }
    } catch (error: unknown) {
      // 准备阶段被本地取消令牌中止（AbortError）：视为已取消而非失败。
      if (abortIfCancelled()) return
      singleRunRef.current = null
      const message = toErrorMessage(error, "导出请求失败")
      setSingle({ kind: "error", message })
      notifySystem("导出失败", `${state.fileName}（${message}）`)
    }
  }, [activeItemId, batch, engineAvailable, ensurePreflightReady, notifySystem, observeSingleStatus, prepareExifForExport, queueItems, resolveQueueItem, settings, single, state])

  const buildBatchRequest = useCallback((items: readonly QueueItem[], frozenSettings: RenderSettings, dirPath: string): RenderJobRequest => {
    const usedNames = new Set<string>()
    // U13：命名方式从冻结设置读取；缺省保持原文件名+后缀的历史行为。
    const naming = frozenSettings.exportNaming ?? { mode: "original-suffix" as const, prefix: "" }
    const snapshots: RenderJobSnapshot[] = items.map((item, index) => {
      const extension = extensionFor(effectiveExportFormat(frozenSettings, item.imageProcessing))
      const baseName = buildBatchOutputName(item, index, naming)
      const outputPath = buildUniqueExportPath(dirPath, baseName, extension, usedNames, naming.mode === "original-suffix")
      const resolved = resolveQueueItem(item, frozenSettings)
      return {
        recipe: buildRecipeFromSettings(
          item.filePath,
          frozenSettings,
          resolved.textOverride ?? undefined,
          resolved.resolvedLayers,
          resolved.brand,
          item.imageProcessing ?? null
        ),
        sourceVersion: item.sourceVersion ?? null,
        export: buildExportSettings(frozenSettings, outputPath, item.imageProcessing ?? null)
      }
    })
    return { items: snapshots }
  }, [resolveQueueItem])

  const finishBatch = useCallback((run: BatchRun, tailError?: string): void => {
    if (batchRunRef.current !== run) return
    batchRunRef.current = null
    activeBatchJobIdRef.current = null
    const { items, dirPath } = run.frozen
    const results = items.map((item, index): BatchExportItemResult =>
      run.frozen.results[index] ?? {
        fileName: item.fileName, success: false, actualFormat: null, summary: [],
        error: tailError ?? BATCH_CANCELLED
      })
    frozenBatchRef.current = { ...run.frozen, results }
    const { success, failed, cancelled, skipped } = batchCounts(results)
    if (cancelled > 0) {
      setBatch({ kind: "cancelled", total: results.length, success, failed, cancelled, results, dirPath })
      return
    }
    setBatch({ kind: "completed", total: results.length, success, failed, results, dirPath })
    const skippedSummary = skipped > 0 ? `，跳过 ${skipped} 张` : ""
    if (failed === 0) {
      notifySystem("批量导出完成", `成功导出 ${success} 张${skippedSummary}`)
    } else {
      notifySystem("批量导出部分失败", `成功 ${success} 张，失败 ${failed} 张${skippedSummary}`)
    }
    if (autoOpenExportDirectory && success > 0) openExportDirectory(dirPath)
  }, [autoOpenExportDirectory, notifySystem, openExportDirectory])

  const acceptBatchChunk = useCallback((run: BatchRun, terminal: RenderJobStatusResponse): void => {
    const indexes = run.chunks[run.cursor]!
    indexes.forEach((index, localIndex) => {
      const status = asItemStatus(terminal, localIndex)
      run.frozen.results[index] = {
        fileName: run.frozen.items[index]!.fileName,
        success: status.status === "completed",
        actualFormat: status.actualFormat ?? null,
        summary: buildExportSummary(status),
        error: status.status === "completed" ? null
          : status.status === "cancelled" ? BATCH_CANCELLED
            : (status.error ?? terminal.error ?? "导出失败"),
        report: status.fidelityReport ?? null
      }
    })
    run.cursor++
    activeBatchJobIdRef.current = null
    if (terminal.status === "cancelled" || batchCancelRequestedRef.current || run.cursor === run.chunks.length) {
      finishBatch(run)
    }
  }, [finishBatch])

  const cancelBatchJob = useCallback(async (run: BatchRun, jobId: string): Promise<void> => {
    const cursor = run.cursor
    try {
      const status = await cancelRenderJob(jobId)
      if (batchRunRef.current !== run || cursor !== run.cursor) return
      if (isTerminalJob(status)) acceptBatchChunk(run, status)
      else applyBatchStatus(status, run)
    } catch (error: unknown) {
      if (batchRunRef.current !== run || cursor !== run.cursor) return
      setNotice(`取消请求失败：${toErrorMessage(error, "引擎不可达")}。任务可能仍在执行，可稍后在结果中确认。`)
    }
  }, [acceptBatchChunk, applyBatchStatus])

  const runBatchChunks = useCallback(async (run: BatchRun, existingJob?: RenderJobStatusResponse): Promise<void> => {
    while (batchRunRef.current === run) {
      // 取消后仍须查清已提交的任务，剩余分组不会继续提交。
      if (batchCancelRequestedRef.current && existingJob === undefined) {
        finishBatch(run)
        return
      }
      const cursor = run.cursor
      const indexes = run.chunks[cursor]!
      let jobId = existingJob?.jobId ?? null
      const onStatus = (status: RenderJobStatusResponse): void => {
        if (batchRunRef.current !== run || cursor !== run.cursor) return
        const justSubmitted = jobId === null
        jobId = status.jobId
        applyBatchStatus(status, run)
        if (justSubmitted && batchCancelRequestedRef.current && !isTerminalJob(status)) {
          void cancelBatchJob(run, status.jobId)
        }
      }
      try {
        const terminal = existingJob === undefined
          ? await submitAndWaitForRenderJob({ items: indexes.map(index => run.frozen.request.items[index]!) }, undefined, onStatus)
          : await waitForRenderJob(existingJob, undefined, onStatus)
        if (batchRunRef.current !== run || cursor !== run.cursor) return
        acceptBatchChunk(run, terminal)
        existingJob = undefined
      } catch (error: unknown) {
        if (batchRunRef.current !== run || cursor !== run.cursor) return
        activeBatchJobIdRef.current = null
        const message = toErrorMessage(error, "批量导出失败")
        if (jobId === null && error instanceof EngineHttpError) {
          if (batchCancelRequestedRef.current) finishBatch(run)
          else if (run.cursor > 0) finishBatch(run, `导出分组提交被拒绝，剩余文件未执行：${message}`)
          else {
            batchRunRef.current = null
            setBatch({ kind: "error", message })
          }
          return
        }
        setBatch({
          kind: "unconfirmed",
          message: jobId !== null
            ? `查询中断，结果未知：${message}。可重新查询原任务确认状态。`
            : `提交结果未知：${message}。应用不会自动重复提交，请核对输出目录后决定是否重试。`,
          jobId,
          total: run.frozen.items.length,
          dirPath: run.frozen.dirPath,
          results: run.frozen.results.filter((result): result is BatchExportItemResult => result !== undefined)
        })
        return
      }
    }
  }, [acceptBatchChunk, applyBatchStatus, cancelBatchJob, finishBatch])

  const startFrozenBatch = useCallback(async (frozen: FrozenBatch, indexes: readonly number[], inspect = false): Promise<void> => {
    const chunks = []
    for (let offset = 0; offset < indexes.length; offset += MAX_BATCH_CHUNK_SIZE) {
      chunks.push(indexes.slice(offset, offset + MAX_BATCH_CHUNK_SIZE))
    }
    const run: BatchRun = { frozen, chunks, cursor: 0 }
    // 先检查全部分组，再提交第一个任务。
    const rows: BatchReviewRow[] = []
    for (const chunk of chunks) {
      if (batchCancelRequestedRef.current) break
      const valid = chunk.filter((index) => {
        const item = frozen.items[index]!
        return item.missing !== true && recipeIssue(item) === null
      })
      if (valid.length > 0 && capabilities === null) throw new Error("专业能力探测未完成，已阻止导出")
      const response = valid.length === 0 || capabilities === undefined ? null
        : await preflightExport({ items: valid.map((index) => frozen.request.items[index]!) })
      const reports = new Map(response?.items.map(item => [valid[item.index], item]))
      for (const index of chunk) {
        const item = frozen.items[index]!
        const snapshot = frozen.request.items[index]!
        const missing = item.missing === true
        const issue = missing ? null : recipeIssue(item)
        const entry = reports.get(index)
        const reasons = missing ? [MISSING_SOURCE] : issue !== null ? [issue] : entry?.blockingReasons ?? []
        const output = entry?.report?.output
        rows.push({
          index, itemId: item.id, sourcePath: item.sourcePath, outputPath: snapshot.export.outputPath,
          format: snapshot.export.format,
          dimensions: output == null ? null : `${output.width} × ${output.height} px`,
          reasons: reasons.length === 0 && (entry?.status === "blocked" || (response !== null && entry === undefined))
            ? ["引擎未确认该项可导出"] : reasons,
          canRepair: issue !== null,
          canRename: issue === null && reasons.includes("输出路径已存在"),
          canExportPlain: !missing && item.imageProcessingError != null
        })
      }
      if (response?.status === "blocked" && !rows.slice(-chunk.length).some(row => row.reasons.length > 0)) {
        throw new Error("导出预检未通过")
      }
    }
    if (!batchCancelRequestedRef.current && (inspect || rows.some(row => row.reasons.length > 0))) {
      setReview({ frozen, rows })
      // 保留 Dock 的失败摘要及逐张解决入口。
      setBatch(rows.some(row => row.reasons.length > 0)
        ? { kind: "error", message: "部分照片需要在交付清单中处理后才能导出。" }
        : { kind: "idle" })
      return
    }
    batchRunRef.current = run
    await runBatchChunks(run)
  }, [capabilities, runBatchChunks, setReview])

  const prepareBatch = useCallback(async (inspect = false): Promise<void> => {
    if (!engineAvailable) {
      setBatch({ kind: "error", message: "Java 引擎不可用，恢复后再导出。" })
      return
    }
    if (batchExportItems.length === 0 || reviewRef.current !== null || singleRunRef.current?.busy || isBusy(single) || isBusy(batch) || requeryingBatchRef.current) return
    if (window.desktop === undefined) {
      setBatch({ kind: "error", message: "批量导出需要桌面模式。浏览器模式暂不支持。" })
      return
    }

    batchRunRef.current = null
    frozenBatchRef.current = null
    singleRunRef.current = null
    const frozenItems = batchExportItems.map(freezeQueueItem)
    const frozenSettings = freezeSettings(settings)
    // 批量任务可能切换了输出目录或档位；旧摘要不能代表这次冻结的请求。
    batchCancelRequestedRef.current = false
    batchExifAbortRef.current = new AbortController()
    setNotice(null)
    setLastPreflight(null)
    setSingle({ kind: "idle" })
    setBatch({ kind: "preparing", total: frozenItems.length })
    const abortIfCancelled = (): boolean => {
      if (!batchCancelRequestedRef.current) return false
      // 用户主动取消不是错误：进入 cancelled 终态（未产生任务，数量为零）。
      setBatch({ kind: "cancelled", total: 0, success: 0, failed: 0, cancelled: 0, results: [], dirPath: "" })
      return true
    }
    try {
      const dirPath = await window.desktop.selectExportDirectory()
      if (dirPath === null) {
        setBatch({ kind: "idle" })
        return
      }
      if (abortIfCancelled()) return
      const exifPaths = frozenItems.filter(item => item.missing !== true).map(item => item.filePath)
      if (exifPaths.length > 0) await prepareExifForExport(exifPaths, batchExifAbortRef.current.signal)
      if (abortIfCancelled()) return
      const request = buildBatchRequest(frozenItems, frozenSettings, dirPath)
      await startFrozenBatch(
        { request, settings: frozenSettings, items: frozenItems, dirPath, results: Array.from({ length: frozenItems.length }) },
        frozenItems.map((_, index) => index), inspect
      )
    } catch (error: unknown) {
      activeBatchJobIdRef.current = null
      if (batchCancelRequestedRef.current) {
        setBatch({ kind: "cancelled", total: 0, success: 0, failed: 0, cancelled: 0, results: [], dirPath: "" })
        return
      }
      setBatch({ kind: "error", message: toErrorMessage(error, "批量导出失败") })
    }
  }, [batch, batchExportItems, buildBatchRequest, engineAvailable, prepareExifForExport, settings, single, startFrozenBatch])

  const startBatchExport = useCallback(() => prepareBatch(), [prepareBatch])
  const inspectBatch = useCallback(() => prepareBatch(true), [prepareBatch])
  const dismissBatchReview = useCallback(() => {
    setReview(null)
    setBatch({ kind: "idle" })
  }, [setReview])

  const resolveBatchReview = useCallback(async (actions: Readonly<Record<number, BatchReviewAction>>): Promise<void> => {
    const pending = reviewRef.current
    if (pending === null) return
    const choice = (row: BatchReviewRow) => actions[row.index] ?? "export"
    if (pending.rows.every(row => choice(row) === "skip")) return
    if (pending.rows.some(row => row.reasons.length > 0 && !(choice(row) === "skip"
      || (choice(row) === "rename" && row.canRename) || (choice(row) === "plain" && row.canExportPlain)))) return
    const frozen = pending.frozen
    const items = [...frozen.items]
    const snapshots = [...frozen.request.items]
    const results = [...frozen.results]
    const usedNames = new Set(snapshots.map(snapshot => snapshot.export.outputPath.split("/").at(-1)!.toLowerCase()))
    const indexes: number[] = []
    for (const row of pending.rows) {
      const { index } = row
      const action = choice(row)
      if (action === "skip") {
        results[index] = { fileName: items[index]!.fileName, success: false, actualFormat: null, summary: [], error: BATCH_SKIPPED }
        continue
      }
      indexes.push(index)
      if (action !== "rename" && action !== "plain") continue
      const snapshot = snapshots[index]!
      const item = items[index]!
      const extension = extensionFor(snapshot.export.format)
      const stem = snapshot.export.outputPath.split("/").at(-1)!.slice(0, -extension.length - 1)
      if (action === "rename") {
        const outputPath = buildUniqueExportPath(frozen.dirPath, stem, extension, usedNames, false)
        snapshots[index] = { ...snapshot, export: { ...snapshot.export, outputPath } }
      } else {
        const plainExtension = extensionFor(frozen.settings.exportFormat)
        const outputPath = extension === plainExtension ? snapshot.export.outputPath
          : buildUniqueExportPath(frozen.dirPath, stem, plainExtension, usedNames, false)
        items[index] = { ...item, imageProcessing: null, imageProcessingError: null }
        snapshots[index] = { ...snapshot, recipe: { ...snapshot.recipe, imageProcessing: null, borderlessMaster: false },
          sourceVersion: null, export: buildExportSettings(frozen.settings, outputPath, null) }
      }
    }
    setReview(null)
    batchCancelRequestedRef.current = false
    setBatch({ kind: "preparing", total: indexes.length })
    try {
      await startFrozenBatch({ ...frozen, items, request: { items: snapshots }, results }, indexes, indexes.length > 0
        && pending.rows.some(row => choice(row) === "rename" || choice(row) === "plain"))
    } catch (error) {
      setBatch({ kind: "error", message: toErrorMessage(error, "批量导出失败") })
    }
  }, [setReview, startFrozenBatch])

  const retryFailed = useCallback(async (): Promise<void> => {
    const frozen = frozenBatchRef.current
    if (!engineAvailable || frozen === null || (batch.kind !== "completed" && batch.kind !== "cancelled")) return
    const indexes = frozen.results.flatMap((result, index) => result?.success === false && result.error !== BATCH_SKIPPED ? [index] : [])
    if (indexes.length === 0) return
    batchCancelRequestedRef.current = false
    batchExifAbortRef.current = null
    setNotice(null)
    setLastPreflight(null)
    setBatch({ kind: "preparing", total: indexes.length })
    const results = frozen.results.slice()
    for (const index of indexes) results[index] = undefined
    try {
      await startFrozenBatch({ ...frozen, results }, indexes)
    } catch (error: unknown) {
      setBatch(batch)
      if (!batchCancelRequestedRef.current) setNotice(toErrorMessage(error, "重试导出失败"))
    }
  }, [batch, engineAvailable, startFrozenBatch])

  const cancelActiveExport = useCallback(async (): Promise<void> => {
    if (isBusy(batch)) {
      batchCancelRequestedRef.current = true
      batchExifAbortRef.current?.abort()
      const run = batchRunRef.current
      const jobId = activeBatchJobIdRef.current
      if (run !== null && jobId !== null) await cancelBatchJob(run, jobId)
      return
    }
    const run = singleRunRef.current
    if (!run?.busy) return
    run.cancellation.abort()
    await sendSingleCancel(run, run.cancelRequest === "failed")
  }, [batch, cancelBatchJob, sendSingleCancel])

  const requeryUnconfirmed = useCallback(async (): Promise<void> => {
    const singleUnconfirmed = single.kind === "unconfirmed" ? single : null
    const batchUnconfirmed = batch.kind === "unconfirmed" ? batch : null
    const jobId = singleUnconfirmed?.jobId ?? batchUnconfirmed?.jobId ?? null
    const run = batchRunRef.current
    const singleRun = singleRunRef.current
    if (jobId === null || requeryingBatchRef.current) return
    if (singleUnconfirmed !== null) {
      if (singleRun === null || singleRun.busy || singleRun.jobId !== jobId) return
      singleRun.busy = true
    }
    if (batchUnconfirmed !== null) requeryingBatchRef.current = true
    try {
      const status = await fetchRenderJobStatus(jobId)
      if (singleUnconfirmed !== null && singleRun !== null) {
        if (singleRunRef.current !== singleRun) return
        setNotice(null)
        await waitForRenderJob(status, undefined, next => observeSingleStatus(singleRun, next))
        return
      }
      setNotice(null)
      if (run !== null && batchRunRef.current === run) await runBatchChunks(run, status)
    } catch (error: unknown) {
      // 引擎重启后内存任务记录失效（404）：如实解释，不伪装成可以续跑。
      const notFound = error instanceof EngineHttpError && error.status === 404
      const explanation = notFound
        ? "引擎中没有该任务记录（可能已重启）。任务记录仅保存在引擎内存中，请打开输出目录核对已生成的文件。"
        : `查询失败：${toErrorMessage(error, "引擎不可达")}。任务状态仍未知，可稍后重试查询。`
      if (singleUnconfirmed !== null && singleRun !== null && singleRunRef.current === singleRun) {
        singleRun.busy = false
        setSingle({ ...singleUnconfirmed, message: explanation })
      } else if (batchUnconfirmed !== null && batchRunRef.current === run) {
        setBatch({ ...batchUnconfirmed, message: explanation })
      }
    } finally {
      if (batchUnconfirmed !== null) requeryingBatchRef.current = false
    }
  }, [batch, observeSingleStatus, runBatchChunks, single])

  return {
    single,
    batch,
    isExporting: isBusy(single),
    isBatchExporting: isBusy(batch),
    lastPreflight,
    notice,
    startSingleExport,
    startBatchExport,
    inspectBatch,
    batchReview: batchReview?.rows ?? null,
    resolveBatchReview,
    dismissBatchReview,
    retryFailed,
    cancelActiveExport,
    requeryUnconfirmed,
    openExportDirectory
  }
}

/** 浏览器开发降级模式仅可为内置 /photos/ 样片推导测试输出目录。 */
const deriveBrowserExportPath = (filePath: string, exportFileName: string): string | null => {
  const unixIndex = filePath.lastIndexOf("/photos/")
  const windowsIndex = filePath.lastIndexOf("\\photos\\")
  const index = Math.max(unixIndex, windowsIndex)
  if (index < 0) return null
  return `${filePath.slice(0, index)}/exports/${exportFileName}`
}
