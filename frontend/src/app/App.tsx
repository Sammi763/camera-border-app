/**
 * 应用根组件：顶层装配层。
 *
 * 职责：读取桌面运行时信息并渲染 WorkspacePage。
 * JavaBridge 的真实端口只由主进程 app:// 安全代理使用，首屏无需向渲染进程
 * 同步或暴露任何绝对引擎地址。
 */

import { WorkspacePage } from "../pages/WorkspacePage"
import type { DesktopRuntime } from "../types/runtime"

const FALLBACK_RUNTIME: DesktopRuntime = {
  appName: "Camera Border",
  platform: "unknown",
  engine: {
    managed: false
  }
}

/** 引擎地址同步兜底超时（毫秒）：IPC 异常时也不阻塞首屏渲染。 */
const ENGINE_BASE_URL_SYNC_TIMEOUT_MS = 3000

const getRuntime = (): DesktopRuntime => {
  return window.desktopRuntime ?? FALLBACK_RUNTIME
}

export const App = (): JSX.Element => <WorkspacePage runtime={getRuntime()} />
