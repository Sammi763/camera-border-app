/**
 * 根级导出控制器。
 *
 * 导出状态不能放在 PreviewPanel：工作台页签切换会卸载部分内容，而任务仍在引擎中执行。
 * 因此本 Hook 由 WorkspacePage 持有，只向面板暴露状态和命令；提交前会冻结目标图片、
 * RenderRecipe 与 ExportSettings，保证排队任务不受之后编辑影响。
 */

import { useCallback, useRef, useState } from "react"
import { cancelRenderJob, submitAndWaitForRenderJob } from "../../../services/engine/renderJobsApi"
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
  readonly prepareExifForExport: (paths: readonly string[]) => Promise<void>
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
  readonly startSingleExport: () => Promise<void>
  readonly startBatchExport: () => Promise<void>
  readonly retryFailed: () => Promise<void>
  readonly cancelActiveExport: () => Promise<void>
  readonly openExportDirectory: (dirPath: string) => void
}

/** 从设置构建导出设置；尺寸预设在提交前收敛为引擎使用的像素上限。 */
const buildExportSettings = (settings: RenderSettings, outputPath: string): ExportSettings => {
  const size = resolveOutputSizeFromSettings(settings)
  return {
    format: settings.exportFormat,
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
    bitDepthPolicy: settings.bitDepthPolicy ?? "8"
  }
}

/** 设置仅包含可序列化的界面值；JSON 复制能断开所有嵌套数组/对象引用。 */
const freezeSettings = (settings: RenderSettings): RenderSettings =>
  JSON.parse(JSON.stringify(settings)) as RenderSettings

/** 图片项字段全为值类型或只读数据；复制对象和身份覆盖，避免范围引用随队列编辑变化。 */
const freezeQueueItem = (item: QueueItem): QueueItem => ({
  ...item,
  identityOverride: item.identityOverride === null ? null : { ...item.identityOverride }
})

/** 文件名冲突时追加序号；同一冻结批次内的映射保持确定性。 */
const buildUniqueExportPath = (dirPath: string, baseName: string, ext: string, usedNames: Set<string>): string => {
  let candidate = `${baseName}-border.${ext}`
  let counter = 1
  while (usedNames.has(candidate)) {
    candidate = `${baseName}-border-${counter}.${ext}`
    counter++
  }
  usedNames.add(candidate)
  return `${dirPath}/${candidate}`
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
  const activeJobRef = useRef<{ readonly kind: "single" | "batch"; readonly jobId: string } | null>(null)
  const frozenBatchRef = useRef<FrozenBatch | null>(null)

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
    setLastPreflight(null)
    setBatch({ kind: "idle" })
    setSingle({ kind: "preparing" })

    try {
      await prepareExifForExport([frozenItem?.filePath ?? state.filePath])
      const resolved = frozenItem === null
        ? { textOverride: null, resolvedLayers: [], brand: null }
        : resolveQueueItem(frozenItem, frozenSettings)
      const recipe = buildRecipeFromSettings(
        state.filePath,
        frozenSettings,
        resolved.textOverride ?? undefined,
        resolved.resolvedLayers,
        resolved.brand
      )
      const exportFileName = toExportFileName(state.fileName, frozenSettings.exportFormat)
      const outputPath = window.desktop !== undefined
        ? await window.desktop.selectExportPath(exportFileName)
        : deriveBrowserExportPath(state.filePath, exportFileName)
      if (outputPath === null) {
        setSingle(window.desktop === undefined
          ? { kind: "error", message: "浏览器降级模式无法选择保存位置，请启动桌面应用导出。" }
          : { kind: "idle" })
        return
      }

      const request: RenderJobRequest = {
        items: [{ recipe, export: buildExportSettings(frozenSettings, outputPath) }]
      }
      await ensurePreflightReady(request)
      setSingle({ kind: "submitting" })
      const terminal = await submitAndWaitForRenderJob(request, undefined, applySingleStatus)
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
    } catch (error: unknown) {
      activeJobRef.current = null
      const message = toErrorMessage(error, "导出请求失败")
      setSingle({ kind: "error", message })
      notifySystem("导出失败", `${state.fileName}（${message}）`)
    }
  }, [applySingleStatus, batch, capabilities, engineAvailable, ensurePreflightReady, notifySystem, prepareExifForExport, queueItems, resolveQueueItem, settings, single, state])

  const buildBatchRequest = useCallback((items: readonly QueueItem[], frozenSettings: RenderSettings, dirPath: string): RenderJobRequest => {
    const usedNames = new Set<string>()
    const extension = extensionFor(frozenSettings.exportFormat)
    const snapshots: RenderJobSnapshot[] = items.map((item) => {
      const dotIndex = item.fileName.lastIndexOf(".")
      const baseName = dotIndex > 0 ? item.fileName.slice(0, dotIndex) : item.fileName
      const outputPath = buildUniqueExportPath(dirPath, baseName, extension, usedNames)
      const resolved = resolveQueueItem(item, frozenSettings)
      return {
        recipe: buildRecipeFromSettings(
          item.filePath,
          frozenSettings,
          resolved.textOverride ?? undefined,
          resolved.resolvedLayers,
          resolved.brand
        ),
        export: buildExportSettings(frozenSettings, outputPath)
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
    setLastPreflight(null)
    setSingle({ kind: "idle" })
    setBatch({ kind: "preparing", total: frozenItems.length })
    try {
      const dirPath = await window.desktop.selectExportDirectory()
      if (dirPath === null) {
        setBatch({ kind: "idle" })
        return
      }
      await prepareExifForExport(frozenItems.map((item) => item.filePath))
      const request = buildBatchRequest(frozenItems, frozenSettings, dirPath)
      await ensurePreflightReady(request)
      const frozen: FrozenBatch = { request, items: frozenItems, dirPath, results: [] }
      frozenBatchRef.current = frozen
      const terminal = await submitAndWaitForRenderJob(
        request,
        undefined,
        (status) => applyBatchStatus(status, frozenItems.length)
      )
      finishBatch(terminal, frozen)
    } catch (error: unknown) {
      activeJobRef.current = null
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
    if (active === null) return
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
      const message = toErrorMessage(error, "取消导出失败")
      if (active.kind === "single") {
        setSingle({ kind: "error", message })
      } else {
        setBatch({ kind: "error", message })
      }
    }
  }, [applyBatchStatus, applySingleStatus, finishBatch])

  return {
    single,
    batch,
    isExporting: isBusy(single),
    isBatchExporting: isBusy(batch),
    lastPreflight,
    startSingleExport,
    startBatchExport,
    retryFailed,
    cancelActiveExport,
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
