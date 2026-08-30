/**
 * Java 引擎 HTTP 客户端基础模块。
 *
 * 渲染进程永远只生成同源相对路径：开发时由 Vite 代理转发，生产时由
 * app://app 的 Electron 安全代理转发。JavaBridge 的实际端口只存在于主进程，
 * 不通过 preload、IPC 或运行时对象进入渲染进程。
 */

/** 引擎 API 的同源前缀；保持为空，调用方得到 `/api/**` 或 `/previews/**`。 */
export const getBaseUrl = (): "" => ""

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

export type EngineErrorBody = {
  readonly code?: unknown
  readonly error?: unknown
  readonly message?: unknown
  readonly state?: unknown
}

/** 引擎 HTTP 错误，保留结构化 code 供 UI 区分启动中与真正失败。 */
export class EngineHttpError extends Error {
  readonly status: number
  readonly code: string | null
  readonly state: string | null

  public constructor(message: string, status: number, body: EngineErrorBody | null = null) {
    super(message)
    this.name = "EngineHttpError"
    this.status = status
    this.code = typeof body?.code === "string" ? body.code : null
    this.state = typeof body?.state === "string" ? body.state : null
  }
}

export const toErrorMessage = (fallback: string, body: unknown): string => {
  if (body !== null && typeof body === "object") {
    const typedBody = body as EngineErrorBody
    const message = typedBody.message
    if (typeof message === "string" && message.length > 0) {
      return message
    }
    const error = typedBody.error
    if (typeof error === "string" && error.length > 0) {
      return error
    }
  }
  return fallback
}

/** 读取引擎错误响应；JSON 不合法时仍返回带 HTTP 状态的结构化错误。 */
export const readEngineHttpError = async (
  response: Response,
  fallback: string
): Promise<EngineHttpError> => {
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  const typedBody = body !== null && typeof body === "object"
    ? body as EngineErrorBody
    : null
  return new EngineHttpError(toErrorMessage(fallback, body), response.status, typedBody)
}
