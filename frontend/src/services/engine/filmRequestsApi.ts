import { fetchWithTimeout, getBaseUrl, readEngineHttpError } from "./engineClient"

/** 取消请求超时（毫秒）；取消是尽力而为，不应阻塞切图或卸载。 */
export const FILM_CANCEL_TIMEOUT_MS = 3000

/**
 * 取消指定工作台视图不高于给定代次的底片交互任务。
 * DELETE /api/film-requests/{clientId}?generation=n，引擎幂等返回 204。
 */
export const cancelFilmRequests = async (
  clientId: string,
  generation: number,
  timeoutMs: number = FILM_CANCEL_TIMEOUT_MS
): Promise<void> => {
  let response: Response
  try {
    response = await fetchWithTimeout(
      `${getBaseUrl()}/api/film-requests/${encodeURIComponent(clientId)}?generation=${generation}`,
      { method: "DELETE" },
      timeoutMs
    )
  } catch {
    throw new Error("取消底片请求失败：引擎不可达")
  }
  if (!response.ok && response.status !== 204) {
    throw await readEngineHttpError(response, `取消底片请求失败：${response.status}`)
  }
}

/** 取消及被替代属于正常状态，不展示“引擎不可达”。 */
export const isFilmCancellation = (error: unknown, status?: number): boolean => {
  if (status === 408) return true
  if (error === null || typeof error !== "object") return false
  const typed = error as { readonly status?: unknown; readonly code?: unknown; readonly name?: unknown }
  return typed.status === 408
    || typed.code === "FILM_REQUEST_CANCELLED"
    || typed.name === "AbortError"
}
