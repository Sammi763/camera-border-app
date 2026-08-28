/**
 * Java 引擎 HTTP 客户端基础模块。
 *
 * 统一管理 API 基础路径和错误消息提取，避免各 API 文件重复定义。
 * 开发模式使用相对路径（由 Vite 代理转发），生产模式使用引擎绝对 URL。
 *
 * 动态端口支持（问题 1）：
 * - 生产模式引擎默认端口被占用时，主进程 JavaBridge 会自动选择空闲回环端口，
 *   并通过 `window.desktop.getEngineBaseUrl()`（IPC GET_ENGINE_BASE_URL）暴露；
 * - 前端启动与引擎重试后调用 `syncEngineBaseUrl()`，把实际地址写入本模块，
 *   此后健康检查、预览、EXIF、导出全部指向实际端口。
 */

const DEFAULT_ENGINE_BASE_URL = "http://127.0.0.1:8099"

/**
 * 当前已解析的引擎地址（生产模式）。启动时经 syncEngineBaseUrl() 同步
 * 动态端口；未同步时为 null，回退到 desktopRuntime.engine.baseUrl / 默认地址。
 */
let currentBaseUrl: string | null = null

/** 是否合法的引擎 http(s) 地址。 */
const isHttpUrl = (url: string): boolean =>
  typeof url === "string" && /^https?:\/\/\S+$/i.test(url)

/**
 * 生产模式的引擎地址（含动态端口同步结果）。
 * 测试通过 setBaseUrl() 驱动本函数；getBaseUrl() 在 DEV 下返回相对路径。
 */
export const getResolvedBaseUrl = (): string =>
  currentBaseUrl ?? window.desktopRuntime?.engine.baseUrl ?? DEFAULT_ENGINE_BASE_URL

/** 写入引擎实际地址（动态端口同步）。非法地址忽略，保留现有值。 */
export const setBaseUrl = (url: string): void => {
  if (isHttpUrl(url)) {
    currentBaseUrl = url
  }
}

/** 重置已解析地址（测试用）：回到 desktopRuntime.engine.baseUrl / 默认地址。 */
export const resetResolvedBaseUrl = (): void => {
  currentBaseUrl = null
}

/**
 * 从主进程同步引擎实际 baseUrl（含 JavaBridge 自动选择的端口）。
 * 仅在 window.desktop.getEngineBaseUrl 存在时生效（Electron 模式）；
 * 失败或非法地址时静默保留现有值，不阻塞调用方。
 */
export const syncEngineBaseUrl = async (): Promise<string | null> => {
  const bridge = window.desktop
  if (bridge === undefined || bridge.getEngineBaseUrl === undefined) {
    return null
  }
  try {
    const url = await bridge.getEngineBaseUrl()
    if (!isHttpUrl(url)) {
      return null
    }
    setBaseUrl(url)
    return url
  } catch {
    // 同步失败不影响功能：保留 desktopRuntime.engine.baseUrl / 默认地址
    return null
  }
}

export const getBaseUrl = (): string => {
  if (import.meta.env.DEV) {
    return ""
  }
  return getResolvedBaseUrl()
}

/** 健康检查请求超时（毫秒）：防止引擎无响应时前端轮询永久 pending。 */
export const ENGINE_HEALTH_TIMEOUT_MS = 3000
/** 预览请求超时（毫秒）：超过后失败并触发本地 nativeImage 预览兜底。 */
export const PREVIEW_REQUEST_TIMEOUT_MS = 8000

/**
 * 读取当前预览请求超时（毫秒）。
 * 用函数间接取值，便于测试注入短超时（vi.mock engineClient 覆盖本函数）。
 */
export const getPreviewRequestTimeoutMs = (): number => PREVIEW_REQUEST_TIMEOUT_MS

/** 读取当前健康检查超时（毫秒），同上便于测试注入。 */
export const getEngineHealthTimeoutMs = (): number => ENGINE_HEALTH_TIMEOUT_MS

/**
 * 带超时的 fetch：本地引擎连接后无响应时在有限时间失败。
 * 通过 AbortSignal.timeout 实现，正常引擎响应不受影响。
 */
export const fetchWithTimeout = (
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<Response> =>
  fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) })

type EngineErrorBody = {
  readonly error?: unknown
}

export const toErrorMessage = (fallback: string, body: unknown): string => {
  if (body !== null && typeof body === "object") {
    const error = (body as EngineErrorBody).error
    if (typeof error === "string" && error.length > 0) {
      return error
    }
  }
  return fallback
}
