/**
 * 应用根组件：顶层装配层。
 *
 * 职责：
 * - 读取桌面运行时信息
 * - **首屏请求前完成动态引擎地址同步**：默认端口被占用时主进程 JavaBridge 自动换端口，
 *   前端在渲染 WorkspacePage 之前先经 `window.desktop.getEngineBaseUrl()` 拉取实际地址，
 *   确保首屏健康检查 / 预览 / EXIF / 导出不再命中旧 8099。
 *   同步带兜底超时：浏览器模式 / 无桥接立即通过，同步异常也不阻塞首屏。
 * - 渲染 WorkspacePage
 */

import { useEffect, useState } from "react"
import { WorkspacePage } from "../pages/WorkspacePage"
import { syncEngineBaseUrl } from "../services/engine/engineClient"
import type { DesktopRuntime } from "../types/runtime"

const FALLBACK_RUNTIME: DesktopRuntime = {
  appName: "Camera Border",
  platform: "unknown",
  engine: {
    managed: false,
    baseUrl: "http://127.0.0.1:8099"
  }
}

/** 引擎地址同步兜底超时（毫秒）：IPC 异常时也不阻塞首屏渲染。 */
const ENGINE_BASE_URL_SYNC_TIMEOUT_MS = 3000

const getRuntime = (): DesktopRuntime => {
  return window.desktopRuntime ?? FALLBACK_RUNTIME
}

export const App = (): JSX.Element | null => {
  const runtime = getRuntime()
  const [engineBaseUrlReady, setEngineBaseUrlReady] = useState(false)
  const [engineBaseUrlRevision, setEngineBaseUrlRevision] = useState(0)

  // 生产/托管模式：先同步主进程 JavaBridge 的最终 baseUrl（含自动选择端口），
  // 完成后才渲染工作台，保证首屏所有引擎请求指向实际端口。
  useEffect(() => {
    let active = true
    const timeout = setTimeout(() => {
      if (active) {
        setEngineBaseUrlReady(true)
      }
    }, ENGINE_BASE_URL_SYNC_TIMEOUT_MS)

    void syncEngineBaseUrl()
      .then((syncedBaseUrl) => {
        if (active && syncedBaseUrl !== null) {
          // 兜底超时后才收到 IPC 响应时，通知工作台重新执行首屏引擎请求。
          setEngineBaseUrlRevision((revision) => revision + 1)
        }
      })
      .finally(() => {
        clearTimeout(timeout)
        if (active) {
          setEngineBaseUrlReady(true)
        }
      })

    return () => {
      active = false
      clearTimeout(timeout)
    }
  }, [])

  // 未完成地址同步前不渲染工作台，避免首屏请求命中旧端口
  if (!engineBaseUrlReady) {
    return null
  }

  return <WorkspacePage runtime={runtime} engineBaseUrlRevision={engineBaseUrlRevision} />
}
