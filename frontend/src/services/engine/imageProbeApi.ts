import type { ImageProbeRequest, ImageProbeResponse } from "../../types/imageProbe"
import { fetchWithTimeout, getBaseUrl, readEngineHttpError } from "./engineClient"

export const IMAGE_PROBE_TIMEOUT_MS = 15000

/**
 * 只读图像探针（POST /api/image-probe）。
 *
 * 导入、会话恢复、重新定位和预检共用；只报告头部/来源事实，不产生预览。
 */
export const probeImage = async (
  request: ImageProbeRequest,
  timeoutMs: number = IMAGE_PROBE_TIMEOUT_MS,
  signal?: AbortSignal
): Promise<ImageProbeResponse> => {
  let response: Response
  try {
    response = await fetchWithTimeout(
      `${getBaseUrl()}/api/image-probe`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        ...(signal === undefined ? {} : { signal })
      },
      timeoutMs
    )
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error
    throw new Error("图像探测失败：引擎不可达")
  }
  if (!response.ok) {
    throw await readEngineHttpError(response, `图像探测失败：${response.status}`)
  }
  return (await response.json()) as ImageProbeResponse
}
