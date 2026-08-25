/**
 * 应用根组件：顶层装配层。
 *
 * 职责：
 * - 读取桌面运行时信息
 * - 渲染 WorkspacePage
 */

import { WorkspacePage } from "../pages/WorkspacePage"
import type { DesktopRuntime } from "../types/runtime"

const FALLBACK_RUNTIME: DesktopRuntime = {
  appName: "Camera Border",
  platform: "unknown",
  engine: {
    managed: false,
    baseUrl: "http://127.0.0.1:8099"
  }
}

const getRuntime = (): DesktopRuntime => {
  return window.desktopRuntime ?? FALLBACK_RUNTIME
}

export const App = (): JSX.Element => {
  const runtime = getRuntime()
  return <WorkspacePage runtime={runtime} />
}
