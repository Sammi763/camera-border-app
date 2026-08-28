/**
 * 高质量导出 API：调用 Java 引擎的 render-jobs 端点。
 *
 * 与预览 API 共享 RenderRecipe（ARCHITECTURE.md §4.1），
 * 但不指定 maxWidth/maxHeight，引擎按原图尺寸渲染。
 *
 * 超时兜底：导出 POST 连接后引擎卡死时，在有限时间（默认 10 分钟）内失败，
 * 抛出可读的「导出超时」错误并触发失败通知，单图/批量不会永久停在「渲染中」。
 */

import type {
  RenderJobRequest,
  RenderJobStatusResponse
} from "../../types/preview"
import { fetchWithTimeout, getBaseUrl, toErrorMessage } from "./engineClient"

/** 导出请求默认超时（毫秒）：原图尺寸大图渲染较慢，取宽松值但仍保证不会永久挂起。 */
export const RENDER_JOB_TIMEOUT_MS = 600_000

/** 读取当前导出请求超时（毫秒），测试可注入短超时。 */
export const getRenderJobTimeoutMs = (): number => RENDER_JOB_TIMEOUT_MS

/** 是否为 abort（超时/取消）错误。 */
const isAbortError = (err: unknown): boolean =>
  err !== null && typeof err === "object" && ("name" in err)
    && ((err as { name?: unknown }).name === "AbortError" || (err as { name?: unknown }).name === "TimeoutError")

/**
 * 提交导出任务至引擎。
 * POST /api/render-jobs → RenderJobStatusResponse
 *
 * 当前引擎为同步渲染：POST 直接返回最终状态（completed + outputPath），
 * 一次 HTTP 往返即可拿到结果，无需轮询。
 *
 * @param request 渲染配方 + 导出设置
 * @param timeoutMs 请求超时毫秒（测试可注入短超时）
 */
export const submitRenderJob = async (
  request: RenderJobRequest,
  timeoutMs: number = getRenderJobTimeoutMs()
): Promise<RenderJobStatusResponse> => {
  let response: Response

  try {
    response = await fetchWithTimeout(
      `${getBaseUrl()}/api/render-jobs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      },
      timeoutMs
    )
  } catch (err: unknown) {
    if (isAbortError(err)) {
      throw new Error("导出超时：引擎长时间无响应，请重试。")
    }
    throw new Error("导出请求失败：引擎不可达")
  }

  if (!response.ok) {
    const fallback = `导出请求失败：${response.status}`
    let parsed: unknown = null
    try {
      parsed = await response.json()
    } catch {
      parsed = null
    }
    throw new Error(toErrorMessage(fallback, parsed))
  }

  return (await response.json()) as RenderJobStatusResponse
}

/**
 * 查询导出任务状态。
 * GET /api/render-jobs/{jobId} → RenderJobStatusResponse
 * 保留用于兼容旧版异步引擎；当前同步实现下仅在兜底分支触发。
 *
 * 带可取消超时：异步状态轮询的每次请求也不会因引擎卡住而永久挂起，
 * 轮询循环按 MAX_POLL_ATTEMPTS 正常推进并最终超时。
 */
export const fetchRenderJobStatus = async (
  jobId: string,
  timeoutMs: number = RENDER_JOB_TIMEOUT_MS
): Promise<RenderJobStatusResponse> => {
  let response: Response

  try {
    response = await fetchWithTimeout(
      `${getBaseUrl()}/api/render-jobs/${encodeURIComponent(jobId)}`,
      undefined,
      timeoutMs
    )
  } catch (err: unknown) {
    if (isAbortError(err)) {
      throw new Error("导出超时：引擎长时间无响应，请重试。")
    }
    throw new Error("查询导出状态失败：引擎不可达")
  }

  if (!response.ok) {
    const fallback = `查询导出状态失败：${response.status}`
    let parsed: unknown = null
    try {
      parsed = await response.json()
    } catch {
      parsed = null
    }
    throw new Error(toErrorMessage(fallback, parsed))
  }

  return (await response.json()) as RenderJobStatusResponse
}

/** 轮询间隔（毫秒）。 */
const POLL_INTERVAL_MS = 500

/** 最大轮询次数（60 秒超时），仅兼容旧版异步引擎时使用。 */
const MAX_POLL_ATTEMPTS = 120

/** 异步导出状态轮询的总超时（毫秒），避免单次请求超时覆盖整个轮询窗口。 */
export const RENDER_JOB_POLL_TIMEOUT_MS = POLL_INTERVAL_MS * MAX_POLL_ATTEMPTS

/**
 * 提交导出任务并等待完成。
 *
 * 流程：
 * 1. POST /api/render-jobs —— 当前引擎同步渲染，响应即最终状态，直接返回
 * 2. 若响应不是终态（兼容旧版真异步引擎），轮询 GET 直到 completed/failed
 *
 * 同步路径下零轮询开销，批量导出不再被 60s 超时误判。
 */
export const submitAndWaitForRenderJob = async (
  request: RenderJobRequest,
  pollTimeoutMs: number = RENDER_JOB_POLL_TIMEOUT_MS
): Promise<RenderJobStatusResponse> => {
  const result = await submitRenderJob(request)

  // 同步引擎：POST 响应即最终状态，直接返回
  if (result.status === "completed" || result.status === "failed") {
    return result
  }

  // 兜底：旧版异步引擎（先 accepted 后轮询）。每次状态请求的超时
  // 都受同一个总截止时间约束，不能因为某一次 GET 卡住而额外等待 10 分钟。
  const deadline = Date.now() + Math.max(0, pollTimeoutMs)
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const remainingBeforeDelay = deadline - Date.now()
    if (remainingBeforeDelay <= 0) {
      break
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(POLL_INTERVAL_MS, remainingBeforeDelay)))

    const remainingForStatus = deadline - Date.now()
    if (remainingForStatus <= 0) {
      break
    }
    const status = await fetchRenderJobStatus(result.jobId, remainingForStatus)

    if (status.status === "completed" || status.status === "failed") {
      return status
    }
  }

  throw new Error("导出超时：任务未在 60 秒内完成")
}
