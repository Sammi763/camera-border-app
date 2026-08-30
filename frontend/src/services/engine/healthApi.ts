import type { EngineHealth } from "../../types/health"
import { fetchWithTimeout, getBaseUrl, getEngineHealthTimeoutMs, readEngineHttpError } from "./engineClient"

/**
 * 健康检查：连接本机引擎。带超时（fetchWithTimeout），
 * 引擎无响应时在有限时间失败，不会永久 pending。
 *
 * @param timeoutMs 超时毫秒（测试可注入短超时）
 */
export const fetchEngineHealth = async (
  timeoutMs: number = getEngineHealthTimeoutMs()
): Promise<EngineHealth> => {
  const response = await fetchWithTimeout(`${getBaseUrl()}/api/health`, undefined, timeoutMs)

  if (!response.ok) {
    throw await readEngineHttpError(response, `引擎健康检查失败：${response.status}`)
  }

  const data = (await response.json()) as EngineHealth
  return data
}
