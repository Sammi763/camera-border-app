/**
 * 引擎诊断 Hook（托管模式专用）。
 *
 * 在桌面壳管理引擎生命周期时，若健康检查持续失败，
 * 通过 IPC 读取主进程生成的失败分类（jar 缺失 / 运行时损坏 /
 * 启动失败 / 端口占用 / 探测超时），供故障页面展示。
 *
 * 非托管模式（开发）或 window.desktop 不存在时不启用。
 *
 * retry() 语义（重试竞态防护）：在「retryStart（终止旧进程 + 等待新进程 spawn）+
 * 重新同步引擎地址 + 等待启动 + 刷新诊断」全部完成前不 resolve；
 * 期间 retrying 保持 true，UI 据此锁定「重试」按钮，快速重复点击不会
 * 终止刚启动的新引擎并再次重启。
 */

import { useCallback, useEffect, useState } from "react"
import { syncEngineBaseUrl } from "../../services/engine/engineClient"
import type { EngineDiagnostics } from "../../types/runtime"

/** 重试后等待新引擎启动再刷新诊断的默认时长（毫秒）。 */
const RETRY_REFRESH_DELAY_MS = 1500

export type EngineDiagnosticsState = {
  readonly diagnostics: EngineDiagnostics | null
  readonly loading: boolean
  readonly lastError: string | null
  readonly retrying: boolean
}

export const useEngineDiagnostics = (
  enabled: boolean,
  refreshDelayMs: number = RETRY_REFRESH_DELAY_MS
): {
  readonly state: EngineDiagnosticsState
  readonly refresh: () => Promise<void>
  readonly retry: () => Promise<void>
} => {
  const [diagnostics, setDiagnostics] = useState<EngineDiagnostics | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    const getDiagnostics = window.desktop?.getEngineDiagnostics
    if (!enabled || getDiagnostics === undefined) {
      return
    }
    setLoading(true)
    try {
      const result = await getDiagnostics()
      setDiagnostics(result)
      setLastError(null)
    } catch {
      setLastError("读取引擎诊断信息失败。")
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const retry = useCallback(async (): Promise<void> => {
    const bridge = window.desktop
    const retryStart = bridge?.retryEngineStart
    if (retryStart === undefined) {
      return
    }
    setRetrying(true)
    try {
      // 主进程 retryEngineStart 会等待旧进程退出 + 新进程 spawn 完成后返回
      await retryStart()
      // 重试后引擎可能换了端口（默认端口仍被占用时），重新同步实际 baseUrl
      await syncEngineBaseUrl()
      // 等待新引擎启动，再刷新诊断；期间保持 retrying（按钮锁定），
      // 避免用户快速重复点击终止刚启动的新引擎
      await new Promise((resolve) => setTimeout(resolve, refreshDelayMs))
      await refresh()
    } catch {
      setLastError("重试启动引擎失败。")
    } finally {
      setRetrying(false)
    }
  }, [refresh, refreshDelayMs])

  return { state: { diagnostics, loading, lastError, retrying }, refresh, retry }
}
