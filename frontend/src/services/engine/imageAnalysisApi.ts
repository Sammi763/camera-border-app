import type {
  ImageAnalysisRequest,
  ImageAnalysisResponse
} from "../../types/imageProcessing"
import {
  fetchWithTimeout,
  getBaseUrl,
  readEngineHttpError
} from "./engineClient"

/** 分析请求超时（毫秒）；真实 RAW/大图分析可能比预览慢，但必须有界。 */
export const IMAGE_ANALYSIS_TIMEOUT_MS = 15000

/**
 * 提交图像分析请求（POST /api/image-analysis）。
 *
 * 与预览/导出共享同一份 RenderRecipe；返回直方图、区域统计和分阶段剪裁事实。
 * 4xx/5xx 通过 EngineHttpError 暴露稳定 code，调用方按状态区分输入/组件/超时。
 */
export const analyzeImage = async (
  request: ImageAnalysisRequest,
  timeoutMs: number = IMAGE_ANALYSIS_TIMEOUT_MS,
  signal?: AbortSignal
): Promise<ImageAnalysisResponse> => {
  let response: Response
  try {
    response = await fetchWithTimeout(
      `${getBaseUrl()}/api/image-analysis`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        ...(signal === undefined ? {} : { signal })
      },
      timeoutMs
    )
  } catch {
    throw new Error("图像分析请求失败：引擎不可达")
  }
  if (!response.ok) {
    throw await readEngineHttpError(response, `图像分析请求失败：${response.status}`)
  }
  return (await response.json()) as ImageAnalysisResponse
}
