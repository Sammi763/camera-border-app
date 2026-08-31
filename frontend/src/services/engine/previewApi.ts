import type { PreviewRequest, PreviewResponse } from "../../types/preview"
import {
  fetchWithTimeout,
  getBaseUrl,
  getPreviewRequestTimeoutMs,
  readEngineHttpError
} from "./engineClient"

/**
 * 将渲染配方提交至预览端点并映射响应。
 *
 * 依据 ARCHITECTURE.md §5.2，4xx 表示请求无效；引擎响应体包含
 * `{ error }`。网络故障与非 JSON 响应体会被转换为可读消息，
 * 以便预览状态机能够展示清晰的错误信息。
 *
 * 超时兜底：连接本机后引擎无响应时，在 PREVIEW_REQUEST_TIMEOUT_MS 内失败
 * （抛出「引擎不可达」），usePreview 捕获后触发本地 nativeImage 预览。
 *
 * @param request 渲染配方
 * @param timeoutMs 超时毫秒（测试可注入短超时）
 * @param signal 当前预览被新请求替代时的取消信号
 */
export const requestPreview = async (
  request: PreviewRequest,
  timeoutMs: number = getPreviewRequestTimeoutMs(),
  signal?: AbortSignal
): Promise<PreviewResponse> => {
  let response: Response

  try {
    response = await fetchWithTimeout(
      `${getBaseUrl()}/api/preview`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        ...(signal === undefined ? {} : { signal })
      },
      timeoutMs
    )
  } catch {
    throw new Error("预览请求失败：引擎不可达")
  }

  if (!response.ok) {
    const fallback = `预览请求失败：${response.status}`
    throw await readEngineHttpError(response, fallback)
  }

  const data = (await response.json()) as PreviewResponse
  return data
}
