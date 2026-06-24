import type { PreviewRequest, PreviewResponse } from "../../types/preview"
import { getBaseUrl, toErrorMessage } from "./engineClient"

/**
 * 将渲染配方提交至预览端点并映射响应。
 *
 * 依据 ARCHITECTURE.md §5.2，4xx 表示请求无效；引擎响应体包含
 * `{ error }`。网络故障与非 JSON 响应体会被转换为可读消息，
 * 以便预览状态机能够展示清晰的错误信息。
 */
export const requestPreview = async (request: PreviewRequest): Promise<PreviewResponse> => {
  let response: Response

  try {
    response = await fetch(`${getBaseUrl()}/api/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    })
  } catch {
    throw new Error("预览请求失败：引擎不可达")
  }

  if (!response.ok) {
    const fallback = `预览请求失败：${response.status}`
    let parsed: unknown = null
    try {
      parsed = await response.json()
    } catch {
      parsed = null
    }
    throw new Error(toErrorMessage(fallback, parsed))
  }

  const data = (await response.json()) as PreviewResponse
  return data
}
