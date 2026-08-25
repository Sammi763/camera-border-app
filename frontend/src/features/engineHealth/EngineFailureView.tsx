/**
 * 引擎启动失败页面（托管模式）。
 *
 * 健康检查持续失败时展示：失败分类（引擎未找到 / 启动失败 / 端口占用 /
 * 运行时损坏）、「重试」与「查看日志」操作。
 * 引擎恢复就绪后由 WorkspacePage 移除本视图。
 */

import { useCallback } from "react"
import { useEngineDiagnostics } from "./useEngineDiagnostics"

/** 诊断分类对应的中文标题。 */
const CODE_LABELS: Record<string, string> = {
  "jar-missing": "引擎未找到",
  "runtime-missing": "运行时损坏",
  "start-failed": "引擎启动失败",
  "port-conflict": "端口占用",
  "health-timeout": "引擎启动超时",
  unknown: "引擎不可用"
}

/** 从日志文件路径取所在目录（前端无 node:path，做简单字符串处理）。 */
const dirName = (filePath: string): string => {
  const normalized = filePath.replace(/\\/g, "/")
  const idx = normalized.lastIndexOf("/")
  return idx > 0 ? filePath.slice(0, idx) : ""
}

type EngineFailureViewProps = {}

export const EngineFailureView = (_props: EngineFailureViewProps): JSX.Element => {
  const enabled = window.desktop !== undefined
  const { state, refresh, retry } = useEngineDiagnostics(enabled)

  const diagnostics = state.diagnostics
  const codeLabel = diagnostics !== null ? CODE_LABELS[diagnostics.code] ?? CODE_LABELS["unknown"] : null

  /** 打开日志所在目录（桌面模式）。 */
  const handleViewLogs = useCallback((): void => {
    const openDirectory = window.desktop?.openDirectory
    const logPath = diagnostics?.logPath ?? null
    if (openDirectory === undefined || logPath === null) {
      return
    }
    void openDirectory(dirName(logPath)).catch(() => {})
  }, [diagnostics])

  return (
    <div className="engineFailureView">
      <div className="engineFailureCard">
        <span className="engineFailureMark" aria-hidden="true">!</span>
        <h1 className="engineFailureTitle">
          {codeLabel ?? "引擎连接失败"}
        </h1>
        <p className="engineFailureMessage">
          {diagnostics?.message ?? "正在连接本地渲染引擎…如果持续失败，请点击「重试」或「查看日志」。"}
        </p>
        {state.lastError !== null && (
          <p className="panelErrorText">{state.lastError}</p>
        )}
        <div className="engineFailureActions">
          <button
            type="button"
            className="primaryButton"
            disabled={state.retrying}
            onClick={() => {
              void retry().then(refresh)
            }}
          >
            {state.retrying ? "重试中…" : "重试"}
          </button>
          {window.desktop?.openDirectory !== undefined && (
            <button
              type="button"
              className="ghostButton"
              disabled={(diagnostics?.logPath ?? null) === null}
              onClick={handleViewLogs}
            >
              查看日志
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
