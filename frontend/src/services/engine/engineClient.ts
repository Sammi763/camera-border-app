/**
 * Java 引擎 HTTP 客户端基础模块。
 *
 * 统一管理 API 基础路径和错误消息提取，避免各 API 文件重复定义。
 * 开发模式使用相对路径（由 Vite 代理转发），生产模式使用引擎绝对 URL。
 */

const DEFAULT_ENGINE_BASE_URL = "http://127.0.0.1:8080"

export const getBaseUrl = (): string => {
  if (import.meta.env.DEV) {
    return ""
  }
  return window.desktopRuntime?.engine.baseUrl ?? DEFAULT_ENGINE_BASE_URL
}

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
