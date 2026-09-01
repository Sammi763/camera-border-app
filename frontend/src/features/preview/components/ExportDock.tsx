import type { ExportController } from "../hooks/useExportController"
import type { PreviewState } from "../types"
import type { OperationScope } from "../../queue/types"

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

/**
 * 统一导出 Dock。
 * 导出状态仍由页面根级控制器持有，Dock 只负责展示命令与结果，避免切换页签丢失任务。
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
    openExportDirectory
  } = exportController
  const canExport = state.kind === "active" && state.currentImage !== null
  // 工作台的 active 范围由单图按钮负责；独立挂载 PreviewPanel 时未传范围，
  // 仍按旧契约显示传入的批量按钮，保持组件兼容性。
  const hasBatchItems = batchExportLabel.length > 0 && (operationScope === undefined || operationScope !== "active")
  const exportDisabledReason = engineAvailable
    ? null
    : (engineUnavailableReason ?? "Java 引擎不可用，恢复后高保真导出自动恢复")
  const batchIsTerminal = batchExport.kind === "completed" || batchExport.kind === "cancelled"

  return (
    <div className={`exportDock${compact ? " exportDockCompact" : ""}`} role="group" aria-label="导出">
      {operationScope !== undefined && onOperationScopeChange !== undefined && (
        <div className="exportScope" role="group" aria-label="导出范围">
          {(["active", "checked", "all"] as const).map((scope) => (
            <button
              key={scope}
              type="button"
              className={`exportScopeButton${operationScope === scope ? " exportScopeButtonActive" : ""}`}
              disabled={scope === "checked" && checkedCount === 0}
              aria-pressed={operationScope === scope}
              onClick={() => onOperationScopeChange(scope)}
            >
              {scopeLabel(scope, checkedCount, queueCount)}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        className="primaryButton exportDockButton"
        disabled={!canExport || isExporting || isBatchExporting || !engineAvailable}
        title={exportDisabledReason ?? undefined}
        onClick={() => void startSingleExport()}
      >
        {exportJob.kind === "preparing" ? "准备中…" : isExporting ? "渲染中…" : "导出原图"}
      </button>
      {hasBatchItems && (
        <button
          type="button"
          className="ghostButton exportDockButton"
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
        <button type="button" className="ghostButton exportDockButton" onClick={() => void cancelActiveExport()}>
          取消导出
        </button>
      )}

      <span className="exportDockStatus" aria-live="polite">
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
  )
}
