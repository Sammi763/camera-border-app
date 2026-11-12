/**
 * 根级导出控制器。
 *
 * 导出状态不能放在 PreviewPanel：工作台页签切换会卸载部分内容，而任务仍在引擎中执行。
 * 因此本 Hook 由 WorkspacePage 持有，只向面板暴露状态和命令；提交前会冻结目标图片、
 * RenderRecipe 与 ExportSettings，保证排队任务不受之后编辑影响。
 */

import { useCallback, useRef, useState } from "react"
import { cancelRenderJob, fetchRenderJobStatus, submitAndWaitForRenderJob } from "../../../services/engine/renderJobsApi"
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
import type { ImageProcessingConfig } from "../../../types/imageProcessing"
import { buildRecipeFromSettings } from "../../settings/utils/buildRecipe"
import { resolveOutputSizeFromSettings } from "../../settings/utils/outputSizePresets"
import type { RenderSettings } from "../../settings/types"
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

type FrozenBatch = {
  readonly request: RenderJobRequest
  readonly items: readonly QueueItem[]
  readonly dirPath: string
  readonly results: readonly BatchExportItemResult[]
}

type UseExportControllerArgs = {
  readonly state: PreviewState
  readonly settings: RenderSettings
  readonly queueItems: readonly QueueItem[]
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
  readonly retryFailed: () => Promise<void>
  readonly cancelActiveExport: () => Promise<void>
  /** 重新查询「状态待确认」任务的原 jobId；引擎记录已失效时如实解释。 */
  readonly requeryUnconfirmed: () => Promise<void>
  readonly openExportDirectory: (dirPath: string) => void
}

/** 底片组合决定真实扩展名，避免旧会话的普通格式字段与输出内容冲突。 */
export const effectiveExportFormat = (settings: RenderSettings, processing: ImageProcessingConfig | null | undefined): RenderSettings["exportFormat"] =>
  processing == null ? settings.exportFormat
    : (settings.filmOutput ?? (settings.exportFormat === "tiff" ? "tiff16-srgb" : "srgb-jpeg")) === "srgb-jpeg" ? "jpeg" : "tiff"

/** 从设置构建导出设置；尺寸预设在提交前收敛为引擎使用的像素上限。 */
const buildExportSettings = (
  settings: RenderSettings,
  outputPath: string,
  imageProcessing: ImageProcessingConfig | null | undefined
): ExportSettings => {
  const size = resolveOutputSizeFromSettings(settings)
  const filmMode = imageProcessing !== null && imageProcessing !== undefined
  const resolvedFilmOutput = settings.filmOutput
    ?? (settings.exportFormat === "tiff" ? "tiff16-srgb" : "srgb-jpeg")
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
        filmOutput: resolvedFilmOutput as import("../../../types/imageProcessing").FilmOutput,
        borderlessMaster: settings.borderlessMaster ?? false
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
  while (usedNames.has(candidate)) {
    candidate = `${stem}-${counter}.${ext}`
    counter++
  }
  usedNames.add(candidate)
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
): readonly string[] =>
  items.slice(0, 3).map((item, index) =>
    `${buildBatchOutputName(item, index, naming)}${naming.mode === "original-suffix" ? "-border" : ""}.${typeof extension === "function" ? extension(item, index) : extension}`)

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
  const activeJobRef = useRef<{ readonly kind: "single" | "batch"; readonly jobId: string } | null>(null)
  const frozenBatchRef = useRef<FrozenBatch | null>(null)
  // 准备阶段（尚未取得 jobId）的本地取消令牌：置位后，EXIF/选择器/预检等异步
  // 结果返回时不得再提交任务；jobId 产生后改走引擎 DELETE 取消。
  const singleCancelRequestedRef = useRef(false)
  const batchCancelRequestedRef = useRef(false)
  // 准备阶段 EXIF 等待的中止器：取消时立即中断批量读取，不等到自然结束。
  const singleExifAbortRef = useRef<AbortController | null>(null)
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

  const applySingleStatus = useCallback((status: RenderJobStatusResponse): void => {
    activeJobRef.current = { kind: "single", jobId: status.jobId }
    if (status.status === "completed" || status.status === "failed" || status.status === "cancelled") {
      activeJobRef.current = null
      const result = asItemStatus(status, 0)
      if (status.status === "completed" && result.status === "completed") {
        setSingle({
          kind: "completed",
          outputPath: result.outputPath ?? "",
          actualFormat: result.actualFormat ?? "",
          summary: buildExportSummary(result),
          report: result.fidelityReport ?? null
        })
      } else if (status.status === "cancelled") {
        setSingle({ kind: "cancelled", message: result.error ?? "导出任务已取消。" })
      } else {
        setSingle({ kind: "error", message: result.error ?? status.error ?? "导出失败，未知错误。" })
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
  }, [])

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

  const applyBatchStatus = useCallback((status: RenderJobStatusResponse, total: number): void => {
    activeJobRef.current = { kind: "batch", jobId: status.jobId }
    if (status.status === "queued" || status.status === "pending" || status.status === "running") {
      setBatch({
        kind: "running",
        jobId: status.jobId,
        total: status.total ?? total,
        current: status.processed ?? 0,
        success: status.completed ?? 0,
        failed: status.failed ?? 0,
        cancelled: status.cancelled ?? 0
      })
    }
  }, [])

  const startSingleExport = useCallback(async (): Promise<void> => {
    if (!engineAvailable) {
      setSingle({ kind: "error", message: "Java 引擎不可用，恢复后再导出。" })
      return
    }
    if (state.kind !== "active" || isBusy(single) || isBusy(batch)) return

    const frozenSettings = freezeSettings(settings)
    const selectedItem = queueItems.find((item) => item.filePath === state.filePath)
    const frozenItem = selectedItem === undefined ? null : freezeQueueItem(selectedItem)
    // 每次新任务都从当前请求重新生成预检摘要，避免把上一次路径冲突或失败原因
    // 留在 Dock 中，误导用户以为它属于当前导出。
    singleCancelRequestedRef.current = false
    singleExifAbortRef.current = new AbortController()
    setNotice(null)
    setLastPreflight(null)
    setBatch({ kind: "idle" })
    setSingle({ kind: "preparing" })

    /** 准备阶段取消：不再提交，也不把取消伪装成失败。 */
    const abortIfCancelled = (): boolean => {
      if (!singleCancelRequestedRef.current) return false
      setSingle({ kind: "cancelled", message: "导出已在准备阶段取消。" })
      return true
    }

    try {
      await prepareExifForExport([frozenItem?.filePath ?? state.filePath], singleExifAbortRef.current.signal)
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
      const exportFileName = toExportFileName(state.fileName, effectiveExportFormat(frozenSettings, frozenItem?.imageProcessing))
      const outputPath = window.desktop !== undefined
        ? await window.desktop.selectExportPath(exportFileName)
        : deriveBrowserExportPath(state.filePath, exportFileName)
      if (outputPath === null) {
        setSingle(window.desktop === undefined
          ? { kind: "error", message: "浏览器降级模式无法选择保存位置，请启动桌面应用导出。" }
          : { kind: "idle" })
        return
      }
      if (abortIfCancelled()) return

      const request: RenderJobRequest = {
        items: [{ recipe, sourceVersion: frozenItem?.sourceVersion ?? null,
          export: buildExportSettings(frozenSettings, outputPath, frozenItem?.imageProcessing ?? null) }]
      }
      await ensurePreflightReady(request)
      if (abortIfCancelled()) return
      setSingle({ kind: "submitting" })
      // 提交一旦发出，结果即未知：断线/超时进入「状态待确认」，绝不自动重发。
      let submittedJobId: string | null = null
      try {
        const terminal = await submitAndWaitForRenderJob(request, undefined, (status) => {
          submittedJobId = status.jobId
          applySingleStatus(status)
          // 提交竞速期间用户已请求取消：此时 jobId 已产生，走引擎取消，
          // 轮询会自然返回 cancelled 终态。
          if (singleCancelRequestedRef.current && !activeJobRef.current) {
            void cancelRenderJob(status.jobId).catch(() => {
              setNotice("取消请求失败：引擎不可达。任务可能仍在执行，可稍后重新查询。")
            })
          }
        })
        const result = asItemStatus(terminal, 0)
        activeJobRef.current = null
        if (terminal.status === "completed" && result.status === "completed") {
          setSingle({
            kind: "completed",
            outputPath: result.outputPath ?? outputPath,
            actualFormat: result.actualFormat ?? frozenSettings.exportFormat,
            summary: buildExportSummary(result),
            report: result.fidelityReport ?? null
          })
          notifySystem("导出完成", state.fileName)
        } else if (terminal.status === "cancelled") {
          setSingle({ kind: "cancelled", message: result.error ?? "导出任务已取消。" })
        } else {
          const message = result.error ?? terminal.error ?? "导出失败，未知错误。"
          setSingle({ kind: "error", message })
          notifySystem("导出失败", `${state.fileName}（${message}）`)
        }
      } catch (submitError: unknown) {
        activeJobRef.current = null
        const message = toErrorMessage(submitError, "导出请求失败")
        if (submittedJobId !== null) {
          // 已取得 jobId 后查询断线/超时：结果未知，优先重新查询原任务。
          setSingle({
            kind: "unconfirmed",
            message: `查询中断，结果未知：${message}。可重新查询原任务确认状态。`,
            jobId: submittedJobId,
            outputPath
          })
          notifySystem("导出状态待确认", `${state.fileName}（${message}）`)
        } else if (submitError instanceof EngineHttpError) {
          // 引擎给出了确定的拒绝响应（未接受任务）：按普通失败处理。
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
      activeJobRef.current = null
      // 准备阶段被本地取消令牌中止（AbortError）：视为已取消而非失败。
      if (singleCancelRequestedRef.current) {
        setSingle({ kind: "cancelled", message: "导出已在准备阶段取消。" })
        return
      }
      const message = toErrorMessage(error, "导出请求失败")
      setSingle({ kind: "error", message })
      notifySystem("导出失败", `${state.fileName}（${message}）`)
    }
  }, [applySingleStatus, batch, capabilities, engineAvailable, ensurePreflightReady, notifySystem, prepareExifForExport, queueItems, resolveQueueItem, settings, single, state])

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

  const finishBatch = useCallback((
    terminal: RenderJobStatusResponse,
    frozen: FrozenBatch,
    targetIndexes: readonly number[] = frozen.items.map((_, index) => index)
  ): void => {
    activeJobRef.current = null
    const results = frozen.items.map((item, index): BatchExportItemResult => {
      const localIndex = targetIndexes.indexOf(index)
      if (localIndex < 0) {
        const prior = frozen.results[index]
        if (prior !== undefined) {
          return prior
        }
        return { fileName: item.fileName, success: false, actualFormat: null, summary: [], error: "任务未执行" }
      }
      const status = asItemStatus(terminal, localIndex)
      return {
        fileName: item.fileName,
        success: status.status === "completed",
        actualFormat: status.actualFormat ?? null,
        summary: buildExportSummary(status),
        error: status.status === "completed" ? null : (status.error ?? terminal.error ?? "导出失败"),
        report: status.fidelityReport ?? null
      }
    })
    const success = results.filter((result) => result.success).length
    const failed = results.filter((result) => !result.success && result.error !== "任务已取消，未执行").length
    const cancelled = results.length - success - failed
    const nextFrozen: FrozenBatch = { ...frozen, results }
    frozenBatchRef.current = nextFrozen

    if (terminal.status === "cancelled") {
      setBatch({ kind: "cancelled", total: results.length, success, failed, cancelled, results, dirPath: frozen.dirPath })
      return
    }
    setBatch({ kind: "completed", total: results.length, success, failed, results, dirPath: frozen.dirPath })
    if (failed === 0) {
      notifySystem("批量导出完成", `成功导出 ${success} 张`)
    } else {
      notifySystem("批量导出部分失败", `成功 ${success} 张，失败 ${failed} 张`)
    }
    if (autoOpenExportDirectory && success > 0) openExportDirectory(frozen.dirPath)
  }, [autoOpenExportDirectory, notifySystem, openExportDirectory])

  const startBatchExport = useCallback(async (): Promise<void> => {
    if (!engineAvailable) {
      setBatch({ kind: "error", message: "Java 引擎不可用，恢复后再导出。" })
      return
    }
    if (batchExportItems.length === 0 || isBusy(single) || isBusy(batch)) return
    if (window.desktop === undefined) {
      setBatch({ kind: "error", message: "批量导出需要桌面模式。浏览器模式暂不支持。" })
      return
    }

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
      await prepareExifForExport(frozenItems.map((item) => item.filePath), batchExifAbortRef.current.signal)
      if (abortIfCancelled()) return
      const request = buildBatchRequest(frozenItems, frozenSettings, dirPath)
      await ensurePreflightReady(request)
      if (abortIfCancelled()) return
      const frozen: FrozenBatch = { request, items: frozenItems, dirPath, results: [] }
      frozenBatchRef.current = frozen
      let submittedJobId: string | null = null
      try {
        const terminal = await submitAndWaitForRenderJob(
          request,
          undefined,
          (status) => {
            submittedJobId = status.jobId
            applyBatchStatus(status, frozenItems.length)
            if (batchCancelRequestedRef.current && !activeJobRef.current) {
              void cancelRenderJob(status.jobId).catch(() => {
                setNotice("取消请求失败：引擎不可达。任务可能仍在执行，可稍后重新查询。")
              })
            }
          }
        )
        finishBatch(terminal, frozen)
      } catch (submitError: unknown) {
        activeJobRef.current = null
        const message = toErrorMessage(submitError, "批量导出失败")
        if (submittedJobId !== null) {
          setBatch({
            kind: "unconfirmed",
            message: `查询中断，结果未知：${message}。可重新查询原任务确认状态。`,
            jobId: submittedJobId,
            total: frozenItems.length,
            dirPath,
            results: []
          })
        } else if (submitError instanceof EngineHttpError) {
          setBatch({ kind: "error", message })
        } else {
          setBatch({
            kind: "unconfirmed",
            message: `提交结果未知：${message}。应用不会自动重复提交，请核对输出目录后决定是否重试。`,
            jobId: null,
            total: frozenItems.length,
            dirPath,
            results: []
          })
        }
      }
    } catch (error: unknown) {
      activeJobRef.current = null
      if (batchCancelRequestedRef.current) {
        setBatch({ kind: "cancelled", total: 0, success: 0, failed: 0, cancelled: 0, results: [], dirPath: "" })
        return
      }
      setBatch({ kind: "error", message: toErrorMessage(error, "批量导出失败") })
    }
  }, [applyBatchStatus, batch, batchExportItems, buildBatchRequest, engineAvailable, ensurePreflightReady, finishBatch, prepareExifForExport, settings, single])

  const retryFailed = useCallback(async (): Promise<void> => {
    const frozen = frozenBatchRef.current
    if (frozen === null || (batch.kind !== "completed" && batch.kind !== "cancelled")) return
    const failedIndexes = frozen.results
      .map((result, index) => ({ result, index }))
      .filter(({ result }) => !result.success)
      .map(({ index }) => index)
    if (failedIndexes.length === 0) return

    const retryRequest: RenderJobRequest = { items: failedIndexes.map((index) => frozen.request.items[index]!) }
    setBatch({ kind: "preparing", total: failedIndexes.length })
    try {
      const terminal = await submitAndWaitForRenderJob(retryRequest, undefined, (status) => applyBatchStatus(status, failedIndexes.length))
      finishBatch(terminal, frozen, failedIndexes)
    } catch (error: unknown) {
      activeJobRef.current = null
      setBatch({ kind: "error", message: toErrorMessage(error, "重试导出失败") })
    }
  }, [applyBatchStatus, batch, finishBatch])

  const cancelActiveExport = useCallback(async (): Promise<void> => {
    const active = activeJobRef.current
    if (active === null) {
      // 尚未取得 jobId：置本地取消令牌，阻止准备阶段的后续异步结果提交任务，
      // 并立即中止进行中的批量 EXIF 等待。
      if (isBusy(single)) {
        singleCancelRequestedRef.current = true
        singleExifAbortRef.current?.abort()
      }
      if (isBusy(batch)) {
        batchCancelRequestedRef.current = true
        batchExifAbortRef.current?.abort()
      }
      return
    }
    try {
      const status = await cancelRenderJob(active.jobId)
      if (active.kind === "single") {
        applySingleStatus(status)
      } else {
        const total = frozenBatchRef.current?.items.length ?? status.total ?? 0
        if (status.status === "completed" || status.status === "failed" || status.status === "cancelled") {
          const frozen = frozenBatchRef.current
          if (frozen !== null) {
            finishBatch(status, frozen)
          } else if (status.status === "cancelled") {
            activeJobRef.current = null
            setBatch({
              kind: "cancelled",
              total,
              success: status.completed ?? 0,
              failed: status.failed ?? 0,
              cancelled: status.cancelled ?? total,
              results: [],
              dirPath: ""
            })
          }
        } else {
          applyBatchStatus(status, total)
        }
      }
    } catch (error: unknown) {
      // 取消请求失败 ≠ 任务结束：轮询仍在进行，保留任务状态并给出可解释提示。
      setNotice(`取消请求失败：${toErrorMessage(error, "引擎不可达")}。任务可能仍在执行，可稍后在结果中确认。`)
    }
  }, [applyBatchStatus, applySingleStatus, batch, finishBatch, single])

  const requeryUnconfirmed = useCallback(async (): Promise<void> => {
    const singleUnconfirmed = single.kind === "unconfirmed" ? single : null
    const batchUnconfirmed = batch.kind === "unconfirmed" ? batch : null
    const jobId = singleUnconfirmed?.jobId ?? batchUnconfirmed?.jobId ?? null
    if (jobId === null) return
    try {
      const status = await fetchRenderJobStatus(jobId)
      setNotice(null)
      if (singleUnconfirmed !== null) {
        applySingleStatus(status)
        return
      }
      const frozen = frozenBatchRef.current
      if (frozen !== null && (status.status === "completed" || status.status === "failed" || status.status === "cancelled")) {
        finishBatch(status, frozen)
      } else {
        applyBatchStatus(status, frozen?.items.length ?? batchUnconfirmed?.total ?? 0)
      }
    } catch (error: unknown) {
      // 引擎重启后内存任务记录失效（404）：如实解释，不伪装成可以续跑。
      const notFound = error instanceof EngineHttpError && error.status === 404
      const explanation = notFound
        ? "引擎中没有该任务记录（可能已重启）。任务记录仅保存在引擎内存中，请打开输出目录核对已生成的文件。"
        : `查询失败：${toErrorMessage(error, "引擎不可达")}。任务状态仍未知，可稍后重试查询。`
      if (singleUnconfirmed !== null) {
        setSingle({ ...singleUnconfirmed, message: explanation })
      } else if (batchUnconfirmed !== null) {
        setBatch({ ...batchUnconfirmed, message: explanation })
      }
    }
  }, [applyBatchStatus, applySingleStatus, batch, finishBatch, single])

  return {
    single,
    batch,
    isExporting: isBusy(single),
    isBatchExporting: isBusy(batch),
    lastPreflight,
    notice,
    startSingleExport,
    startBatchExport,
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
