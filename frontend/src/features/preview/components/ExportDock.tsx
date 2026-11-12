import { toDirPath } from "../../../utils/fileName"
import type { ExportController } from "../hooks/useExportController"
import type { PreviewState } from "../types"
import type { OperationScope } from "../../queue/types"
import type { FidelityReport } from "../../../types/preview"

type ExportDockProps = {
  readonly state: PreviewState
  readonly hasSelectedImage: boolean
  readonly batchExportLabel: string
  readonly exportController: ExportController
  readonly engineAvailable?: boolean
  readonly engineUnavailableReason?: string | null
  readonly operationScope?: OperationScope
  readonly onOperationScopeChange?: (scope: OperationScope) => void
  readonly checkedCount?: number
  readonly queueCount?: number
  /** 从实际设置与预检生成的输出摘要（档位/格式/尺寸/位置策略）；缺省时保留旧提示。 */
  readonly exportSummary?: string | null
  /** 当前档位不可用的具体原因（U07）：非空时在选择保存位置之前禁用提交并解释。 */
  readonly tierUnavailableReason?: string | null
  readonly compact?: boolean
}

const scopeLabel = (scope: OperationScope, checkedCount: number, queueCount: number): string => {
  switch (scope) {
    case "active":
      return "当前图片"
    case "checked":
      return `已选 ${checkedCount} 张`
    case "all":
      return `全部 ${queueCount} 张`
  }
}

const displayFileName = (filePath: string): string => {
  const normalized = filePath.replaceAll("\\", "/")
  return normalized.slice(normalized.lastIndexOf("/") + 1) || "输出文件"
}

const formatFidelityReport = (report: FidelityReport): string => {
  const output = report.output
  const facts = output === null || output === undefined
    ? []
    : [`${output.width}×${output.height}`, `${output.bitDepth}-bit`, output.colorSpace ?? "色彩空间未标注"]
  const source = report.pixelSource === null || report.pixelSource === undefined
    ? null
    : `像素来源：${report.pixelSource}`
  const scope = report.fidelityScope === "limited" ? "受限保真" : "已核验"
  return [`${scope}${facts.length > 0 ? `；输出 ${facts.join("，")}` : ""}`, ...(source === null ? [] : [source])].join("；")
}

/**
 * 统一导出 Dock。
 * 导出状态仍由页面根级控制器持有，Dock 只负责展示命令与结果，避免切换页签丢失任务。
 *
 * 命令契约（U04）：工作台模式下每个范围只有一个主要导出动作，名称随范围与
 * 数量变化；鼠标点击与 `E` / ⌘Enter 调用同一条命令（快捷键按同一范围路由）。
 * 独立挂载 PreviewPanel（未传范围）时保留旧的双按钮契约，供单图场景与测试使用。
 */
export const ExportDock = ({
  state,
  hasSelectedImage,
  batchExportLabel,
  exportController,
  engineAvailable = true,
  engineUnavailableReason = null,
  operationScope,
  onOperationScopeChange,
  checkedCount = 0,
  queueCount = 0,
  exportSummary = null,
  tierUnavailableReason = null,
  compact = false
}: ExportDockProps): JSX.Element => {
  const {
    single: exportJob,
    batch: batchExport,
    isExporting,
    isBatchExporting,
    startSingleExport,
    startBatchExport,
    retryFailed,
    cancelActiveExport,
    requeryUnconfirmed,
    openExportDirectory,
    notice,
    lastPreflight = null
  } = exportController
  const canExport = state.kind === "active" && (state.filmMode === true
    ? state.engineSyncStatus === "synced" && state.engineDisplayUrl !== null
    : state.currentImage !== null)
  const workspaceMode = operationScope !== undefined && onOperationScopeChange !== undefined
  // 工作台模式下按范围只保留一个主命令；独立模式（operationScope 未传）保持旧契约。
  const showSingleButton = !workspaceMode || operationScope === "active"
  const showBatchButton = !workspaceMode
    ? batchExportLabel.length > 0
    : operationScope !== "active"
  const primaryBatchLabel = workspaceMode
    ? operationScope === "checked"
      ? `导出已选 ${checkedCount} 张`
      : `导出全部 ${queueCount} 张`
    : batchExportLabel
  // 空选集不静默导出（U04）：已选为空或全部为空时禁用并解释，不允许点击后无反馈。
  const batchDisabledByEmptySelection = workspaceMode
    && ((operationScope === "checked" && checkedCount === 0)
      || (operationScope === "all" && queueCount === 0))
  const exportDisabledReason = !engineAvailable
    ? (engineUnavailableReason ?? "Java 引擎不可用，恢复后高保真导出自动恢复")
    : tierUnavailableReason
  const batchIsTerminal = batchExport.kind === "completed" || batchExport.kind === "cancelled"
  // 「状态待确认」：单图与批量共用同一组恢复动作（重新查询 / 打开输出目录核对）。
  // 单图待确认只有输出文件路径：openDirectory IPC 只接受目录，这里取其父目录。
  const unconfirmed = exportJob.kind === "unconfirmed"
    ? {
      jobId: exportJob.jobId,
      dirPath: exportJob.outputPath === null || exportJob.outputPath === "" ? null : toDirPath(exportJob.outputPath),
      message: exportJob.message
    }
    : batchExport.kind === "unconfirmed"
      ? { jobId: batchExport.jobId, dirPath: batchExport.dirPath, message: batchExport.message }
      : null

  return (
    <div className={`exportDock${compact ? " exportDockCompact" : ""}`} role="group" aria-label="导出" data-testid="export-dock">
      {operationScope !== undefined && onOperationScopeChange !== undefined && (
        <div className="exportScope" role="group" aria-label="导出范围">
          {(["active", "checked", "all"] as const).map((scope) => (
            <button
              key={scope}
              type="button"
              className={`exportScopeButton${operationScope === scope ? " exportScopeButtonActive" : ""}`}
              data-testid={`export-scope-${scope}`}
              disabled={scope === "checked" && checkedCount === 0}
              aria-pressed={operationScope === scope}
              title="版式与样式为整组共用；此范围决定导出和预设应用包含哪些图片"
              onClick={() => onOperationScopeChange(scope)}
            >
              {scopeLabel(scope, checkedCount, queueCount)}
            </button>
          ))}
        </div>
      )}

      {showSingleButton && (
        <button
          type="button"
          className="primaryButton exportDockButton"
          data-testid="export-single"
          disabled={!canExport || isExporting || isBatchExporting || !engineAvailable || tierUnavailableReason !== null}
          title={exportDisabledReason ?? undefined}
          onClick={() => void startSingleExport()}
        >
          {workspaceMode
            ? exportJob.kind === "preparing" ? "准备中…" : isExporting ? "渲染中…" : "导出当前图片"
            : exportJob.kind === "preparing" ? "准备中…" : isExporting ? "渲染中…" : "导出原图"}
        </button>
      )}
      {showBatchButton && (
        <button
          type="button"
          className={`exportDockButton ${workspaceMode ? "primaryButton" : "ghostButton"}`}
          data-testid="export-batch"
          disabled={isBatchExporting || isExporting || !engineAvailable || batchDisabledByEmptySelection || tierUnavailableReason !== null}
          title={batchDisabledByEmptySelection
            ? operationScope === "checked"
              ? "没有勾选的图片：在队列中按空格键勾选后可批量导出"
              : "队列为空：请先导入照片"
            : exportDisabledReason ?? undefined}
          onClick={() => void startBatchExport()}
        >
          {batchExport.kind === "preparing" ? "读取 EXIF…" : isBatchExporting && batchExport.kind === "running"
            ? `批量导出中 ${batchExport.current}/${batchExport.total}…`
            : primaryBatchLabel}
        </button>
      )}
      {(isExporting || isBatchExporting) && (
        <button type="button" className="ghostButton exportDockButton" data-testid="export-cancel" onClick={() => void cancelActiveExport()}>
          取消导出
        </button>
      )}

      <span className="exportDockStatus" aria-live="polite" data-testid="export-status">
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
        {hasSelectedImage && exportJob.kind === "idle" && batchExport.kind === "idle" && tierUnavailableReason !== null && (
          <span className="previewExportError" data-testid="export-tier-unavailable">{tierUnavailableReason}</span>
        )}
        {hasSelectedImage && exportJob.kind === "idle" && batchExport.kind === "idle" && engineAvailable && tierUnavailableReason === null && (
          exportSummary !== null
            ? <span className="previewExportHint" data-testid="export-summary">{exportSummary}</span>
            : window.desktop === undefined
              ? "浏览器降级模式：导出能力受限，建议启动桌面应用。"
              : "导出使用原图尺寸，由引擎渲染。"
        )}
        {lastPreflight !== null && (
          <span className={lastPreflight.status === "ready" ? "previewExportHint" : "previewExportError"}>
            预检：{lastPreflight.status === "ready" ? "已通过" : "已阻止"}
            {lastPreflight.items[0]?.report?.source !== undefined && lastPreflight.items[0].report.source !== null
              ? `；源图 ${lastPreflight.items[0].report.source.width}×${lastPreflight.items[0].report.source.height}，${lastPreflight.items[0].report.source.bitDepth}-bit`
              : ""}
          </span>
        )}
        {notice !== null && <span className="previewExportHint" data-testid="export-notice">⚠ {notice}</span>}
        {exportJob.kind === "completed" && (
          <span className="previewExportSuccess">导出完成（{exportJob.actualFormat.toUpperCase()}）：{displayFileName(exportJob.outputPath)}
            {exportJob.summary.length > 0 && <span className="previewExportWarnings">　⚠ {exportJob.summary.join("；")}</span>}
            {exportJob.report !== undefined && exportJob.report !== null && (
              <span className="previewExportHint" data-testid="fidelity-report">　保真报告：{formatFidelityReport(exportJob.report)}</span>
            )}
          </span>
        )}
        {exportJob.kind === "cancelled" && <span className="previewExportError">{exportJob.message}</span>}
        {exportJob.kind === "error" && <span className="previewExportError">{exportJob.message}</span>}
        {batchExport.kind === "running" && (
          <span className="previewBatchProgress" role="progressbar" aria-label="批量导出进度" aria-valuemin={0} aria-valuemax={batchExport.total} aria-valuenow={batchExport.current} aria-valuetext={`已完成 ${batchExport.current}/${batchExport.total}，成功 ${batchExport.success} 张，失败 ${batchExport.failed} 张`} aria-live="polite">
            <span className="previewBatchProgressTrack" aria-hidden="true"><span className="previewBatchProgressFill" style={{ transform: `scaleX(${batchExport.total > 0 ? batchExport.current / batchExport.total : 0})` }} /></span>
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
            {/* U13：逐文件详情放可展开列表，Dock 只保留紧凑摘要 */}
            {batchExport.results.some((result) => !result.success) && (
              <details className="previewBatchDetails">
                <summary>失败文件（{batchExport.results.filter((result) => !result.success).length}）</summary>
                <span className="previewBatchFailures">
                  {batchExport.results.filter((result) => !result.success).map((result, index) => (
                    <span key={`${result.fileName}-${index}`}>{index > 0 && "；"}{result.fileName}{result.error === null ? "" : `（${result.error}）`}</span>
                  ))}
                </span>
              </details>
            )}
            {batchExport.results.some((result) => result.summary.length > 0) && (
              <details className="previewBatchDetails">
                <summary>导出摘要（{batchExport.results.filter((result) => result.summary.length > 0).length}）</summary>
                <span className="previewBatchSummaries">
                  {batchExport.results.filter((result) => result.summary.length > 0).map((result, index) => (
                    <span key={`${result.fileName}-summary`}>{index > 0 && "；"}{result.fileName}：{result.summary.join("；")}</span>
                  ))}
                </span>
              </details>
            )}
            <span className="previewBatchActions">
              {window.desktop?.openDirectory !== undefined && <button type="button" className="ghostButton previewBatchActionBtn" onClick={() => openExportDirectory(batchExport.dirPath)}>打开目录</button>}
              {batchExport.results.some((result) => !result.success) && <button type="button" className="ghostButton previewBatchActionBtn" onClick={() => void retryFailed()}>重试失败项</button>}
            </span>
          </>
        )}
        {batchExport.kind === "error" && <span className="previewExportError">{batchExport.message}</span>}
        {unconfirmed !== null && (
          <span className="previewExportUnconfirmed" data-testid="export-unconfirmed">
            <span className="previewExportError">{unconfirmed.message}</span>
            <span className="previewBatchActions">
              {unconfirmed.jobId !== null && (
                <button type="button" className="ghostButton previewBatchActionBtn" onClick={() => void requeryUnconfirmed()}>
                  重新查询任务状态
                </button>
              )}
              {unconfirmed.dirPath !== null && unconfirmed.dirPath !== "" && window.desktop?.openDirectory !== undefined && (
                <button type="button" className="ghostButton previewBatchActionBtn" onClick={() => openExportDirectory(unconfirmed.dirPath!)}>
                  打开输出目录核对
                </button>
              )}
            </span>
          </span>
        )}
      </span>
    </div>
  )
}
