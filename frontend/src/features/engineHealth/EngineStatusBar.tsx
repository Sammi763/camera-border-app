/**
 * 引擎状态条（顶部非阻塞提示）。
 *
 * 替代旧的「全屏 EngineFailureView」：
 * - 引擎启动中（loading）：显示「本地引擎启动中…」+ 提示「工作台仍可使用」；
 * - 引擎不可用（error）：显示「引擎暂不可用，当前使用本地预览」+ 原因 +
 *   「恢复引擎后可进行高保真导出」，并保留「重试」「查看日志」入口；
 * - 引擎运行正常（ready）：不渲染（自动消失）。
 *
 * 设计要点：
 * - 非阻塞：不覆盖工作台；用户可继续编辑模板、查看本地预览；
 * - role=status（启动中，aria-live=polite） / role=alert（错误，aria-live=assertive）
 *   区分提醒级别；
 * - 错误态的「查看日志」通过 openLogFile IPC 直接打开日志文件本身
 *   （旧版是打开所在目录）；重试期间禁用重复点击。
 */

import { useCallback, useState } from "react"
import type { EngineHealthState } from "../preview/hooks/useEngineHealth"
import { useEngineDiagnostics } from "./useEngineDiagnostics"

type EngineStatusBarProps = {
  readonly health: EngineHealthState
}

export const EngineStatusBar = ({ health }: EngineStatusBarProps): JSX.Element | null => {
  // 仅桌面托管模式启用诊断/重试能力（浏览器模式无 window.desktop）
  const enabled = health.kind === "error" && window.desktop !== undefined
  // retry() 完成「重启 + 同步地址 + 等待启动 + 刷新诊断」全程后才 resolve，
  // 期间 diagState.retrying 为 true，用于锁定重试按钮。
  const { state: diagState, retry } = useEngineDiagnostics(enabled)

  /** 打开日志文件本身（主进程校验路径必须位于 userData/logs 下）。 */
  const [openingLog, setOpeningLog] = useState(false)
  const handleOpenLog = useCallback((): void => {
    const openLogFile = window.desktop?.openLogFile
    const logPath = diagState.diagnostics?.logPath ?? null
    if (openLogFile === undefined || logPath === null || openingLog) {
      return
    }
    setOpeningLog(true)
    void openLogFile(logPath)
      .catch(() => {})
      .finally(() => setOpeningLog(false))
  }, [diagState.diagnostics, openingLog])

  /**
   * 重试启动引擎。按钮锁定沿用 hook 的 diagState.retrying——它覆盖
   * 「retryStart（等待旧进程退出 + 新进程 spawn）+ 同步地址 + 等待启动 + 刷新诊断」
   * 全程，避免用户快速重复点击终止刚启动的新引擎（重试竞态）。
   */
  const handleRetry = useCallback((): void => {
    if (diagState.retrying) {
      return
    }
    void retry().catch(() => {})
  }, [retry, diagState.retrying])

  if (health.kind === "ready") {
    return null
  }
  if (health.kind === "loading" || health.kind === "idle") {
    return (
      <div
        className="engineStatusBar engineStatusBarStarting"
        role="status"
        aria-live="polite"
      >
        <span className="engineStatusBarDot" aria-hidden="true" />
        <span className="engineStatusBarText">本地引擎启动中…</span>
        <span className="engineStatusBarHint">工作台仍可使用本地预览</span>
      </div>
    )
  }

  // error（引擎不可用）
  const canRetry = window.desktop?.retryEngineStart !== undefined
  const canOpenLog = window.desktop?.openLogFile !== undefined
    && diagState.diagnostics !== null
    && diagState.diagnostics.logPath !== null
  // 展示诊断 IPC 返回的具体失败原因（runtime-blocked/start-failed 等），
  // 优先于健康检查的通用「引擎不可达」，让用户看到白名单等处理指引。
  const reason = diagState.diagnostics?.message ?? health.message

  return (
    <div
      className="engineStatusBar engineStatusBarUnavailable"
      role="alert"
      aria-live="assertive"
    >
      <span className="engineStatusBarDot" aria-hidden="true" />
      <div className="engineStatusBarTextGroup">
        <span className="engineStatusBarText">引擎暂不可用，当前使用本地预览</span>
        <span className="engineStatusBarHint">恢复引擎后可进行高保真导出</span>
        {reason.length > 0 && (
          <span className="engineStatusBarReason">{reason}</span>
        )}
      </div>
      {(canRetry || canOpenLog) && (
        <div className="engineStatusBarActions">
          {canRetry && (
            <button
              type="button"
              className="ghostButton engineStatusBarBtn"
              disabled={diagState.retrying}
              onClick={handleRetry}
            >
              {diagState.retrying ? "重试中…" : "重试"}
            </button>
          )}
          {canOpenLog && (
            <button
              type="button"
              className="ghostButton engineStatusBarBtn"
              disabled={openingLog}
              onClick={handleOpenLog}
            >
              {openingLog ? "打开中…" : "查看日志"}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
