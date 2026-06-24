/** 健康探测轮询间隔（毫秒）。 */
const READY_POLL_INTERVAL_MS = 250

/**
 * 轮询引擎健康端点，直到成功响应或超时。
 *
 * 如果引擎已崩溃则立即返回 false。
 * 仅用于启动诊断——渲染进程会独立轮询健康端点。
 *
 * @param healthUrl 健康端点完整 URL，例如 http://127.0.0.1:8080/api/health
 * @param readyTimeoutMs 超时时间（毫秒）
 * @param isCrashed 判断引擎是否已崩溃的回调
 */
export const pollEngineHealth = async (
  healthUrl: string,
  readyTimeoutMs: number,
  isCrashed: () => boolean
): Promise<boolean> => {
  const deadline = Date.now() + readyTimeoutMs

  while (Date.now() < deadline) {
    if (isCrashed()) {
      return false
    }

    try {
      const response = await fetch(healthUrl, { method: "GET" })
      if (response.ok) {
        return true
      }
    } catch {
      // 引擎尚未接受连接，继续轮询
    }

    await new Promise((resolve) => setTimeout(resolve, READY_POLL_INTERVAL_MS))
  }

  return false
}
