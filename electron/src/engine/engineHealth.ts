/** 健康探测轮询间隔（毫秒）。 */
const READY_POLL_INTERVAL_MS = 250

/** 单次健康请求超时（毫秒）：连接已建立但长期不响应时也能终止（AbortSignal.timeout）。 */
const READY_REQUEST_TIMEOUT_MS = 2000

/**
 * 轮询引擎健康端点，直到成功响应或超时。
 *
 * 如果引擎已崩溃则立即返回 false。
 * 仅用于启动诊断——渲染进程会独立轮询健康端点。
 *
 * 可取消超时：每次请求带 AbortSignal.timeout(requestTimeoutMs)，连接后无响应
 * 的 fetch 会在有限时间被终止，不会卡住轮询循环（readyTimeoutMs 才能真正生效）。
 *
 * @param healthUrl 健康端点完整 URL，例如 http://127.0.0.1:8099/api/health
 * @param readyTimeoutMs 总超时时间（毫秒）
 * @param isCrashed 判断引擎是否已崩溃/已失效的回调（返回 true 立即中止）
 * @param requestTimeoutMs 单次请求超时（毫秒，测试可注入短值）
 */
export const pollEngineHealth = async (
  healthUrl: string,
  readyTimeoutMs: number,
  isCrashed: () => boolean,
  requestTimeoutMs: number = READY_REQUEST_TIMEOUT_MS
): Promise<boolean> => {
  const deadline = Date.now() + readyTimeoutMs

  while (Date.now() < deadline) {
    if (isCrashed()) {
      return false
    }

    try {
      const response = await fetch(healthUrl, {
        method: "GET",
        signal: AbortSignal.timeout(requestTimeoutMs)
      })
      if (response.ok) {
        return true
      }
    } catch {
      // 引擎尚未接受连接 / 单次请求超时：继续轮询
    }

    await new Promise((resolve) => setTimeout(resolve, READY_POLL_INTERVAL_MS))
  }

  return false
}
