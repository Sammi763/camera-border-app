/**
 * 引擎诊断 Hook（托管模式专用）。
 *
 * 在桌面壳管理引擎生命周期时，若健康检查持续失败，
 * 通过 IPC 读取主进程生成的失败分类（jar 缺失 / 运行时损坏 /
 * 启动失败 / 端口占用 / 探测超时），供故障页面展示。
 *
 * 非托管模式（开发）或 window.desktop 不存在时不启用。
 */

import { useCallback, useEffect, useState } from "react"
import type { EngineDiagnostics } from "../../types/runtime"

export type EngineDiagnosticsState = {
  readonly diagnostics: EngineDiagnostics | null
  readonly loading: boolean
  readonly lastError: string | null
  readonly retrying: boolean
}

export const useEngineDiagnostics = (enabled: boolean): {
  readonly state: EngineDiagnosticsState
  readonly refresh: () => void
  readonly retry: () => Promise<void>
} => {
  const [diagnostics, setDiagnostics] = useState<EngineDiagnostics | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  const refresh = useCallback((): void => {
    const getDiagnostics = window.desktop?.getEngineDiagnostics
    if (!enabled || getDiagnostics === undefined) {
      return
    }
    setLoading(true)
    void getDiagnostics()
      .then((result) => {
        setDiagnostics(result)
        setLastError(null)
      })
      .catch(() => {
        setLastError("读取引擎诊断信息失败。")
      })
      .finally(() => {
        setLoading(false)
      })
  }, [enabled])

  useEffect(() => {
    refresh()
  }, [refresh])

  const retry = useCallback(async (): Promise<void> => {
    const bridge = window.desktop
    const retryStart = bridge?.retryEngineStart
    if (retryStart === undefined) {
      return
    }
    setRetrying(true)
    try {
      await retryStart()
      // 重试后稍等片刻再刷新诊断（引擎启动需要时间）
      setTimeout(() => {
        refresh()
        setRetrying(false)
      }, 1500)
    } catch {
      setLastError("重试启动引擎失败。")
      setRetrying(false)
    }
  }, [refresh])

  return { state: { diagnostics, loading, lastError, retrying }, refresh, retry }
}
