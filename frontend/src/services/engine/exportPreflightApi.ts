import type { ExportPreflightResponse, RenderJobRequest } from "../../types/preview"
import { fetchWithTimeout, getBaseUrl, readEngineHttpError } from "./engineClient"

export const EXPORT_PREFLIGHT_TIMEOUT_MS = 30_000

/** 导出前读取实际源图、档位、能力和输出路径事实；blocked 时调用方不得提交任务。 */
export const preflightExport = async (
  request: RenderJobRequest,
  timeoutMs: number = EXPORT_PREFLIGHT_TIMEOUT_MS
): Promise<ExportPreflightResponse> => {
  let response: Response
  try {
    response = await fetchWithTimeout(
      `${getBaseUrl()}/api/export-preflight`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      },
      timeoutMs
    )
  } catch {
    throw new Error("导出预检失败：本地引擎不可达")
  }
  if (!response.ok) throw await readEngineHttpError(response, `导出预检失败：${response.status}`)
  const body = (await response.json()) as ExportPreflightResponse
  if (body.status !== "ready" && body.status !== "blocked") {
    throw new Error("导出预检失败：引擎返回的状态无效")
  }
  return body
}
