/**
 * 高质量导出 API：调用 Java 引擎的异步 render-jobs 端点。
 *
 * 与预览 API 共享 RenderRecipe（ARCHITECTURE.md §4.1），
 * 但不指定 maxWidth/maxHeight，引擎按原图尺寸渲染。
 *
 * POST 仅负责接受冻结快照并返回 202 + jobId；GET 负责进度与逐项结果。
 * 所有请求均保持同源相对地址，不暴露 JavaBridge 的绝对地址。
 */

import type {
  RenderJobRequest,
  RenderJobStatusResponse
} from "../../types/preview"
import { fetchWithTimeout, getBaseUrl, readEngineHttpError } from "./engineClient"

/** 导出请求默认超时（毫秒）：原图尺寸大图渲染较慢，取宽松值但仍保证不会永久挂起。 */
export const RENDER_JOB_TIMEOUT_MS = 600_000

/** 读取当前导出请求超时（毫秒），测试可注入短超时。 */
export const getRenderJobTimeoutMs = (): number => RENDER_JOB_TIMEOUT_MS

/** 是否为 abort（超时/取消）错误。 */
const isAbortError = (err: unknown): boolean =>
  err !== null && typeof err === "object" && ("name" in err)
    && ((err as { name?: unknown }).name === "AbortError" || (err as { name?: unknown }).name === "TimeoutError")

/**
 * 提交一张或多张已冻结导出快照。
 * POST /api/render-jobs → 202 + RenderJobStatusResponse（queued/running）。
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
    throw await readEngineHttpError(response, fallback)
  }

  return (await response.json()) as RenderJobStatusResponse
}

/** 查询导出任务的聚合进度与逐项状态。 */
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
    throw await readEngineHttpError(response, fallback)
  }

  return (await response.json()) as RenderJobStatusResponse
}

/** 取消尚未开始的图片；当前正在写盘的一项由引擎自然收尾。 */
export const cancelRenderJob = async (
  jobId: string,
  timeoutMs: number = RENDER_JOB_TIMEOUT_MS
): Promise<RenderJobStatusResponse> => {
  let response: Response

  try {
    response = await fetchWithTimeout(
      `${getBaseUrl()}/api/render-jobs/${encodeURIComponent(jobId)}`,
      { method: "DELETE" },
      timeoutMs
    )
  } catch (err: unknown) {
    if (isAbortError(err)) {
      throw new Error("取消导出超时：引擎长时间无响应，请重试。")
    }
    throw new Error("取消导出失败：引擎不可达")
  }

  if (!response.ok) {
    throw await readEngineHttpError(response, `取消导出失败：${response.status}`)
  }

  return (await response.json()) as RenderJobStatusResponse
}

/** 轮询间隔（毫秒）。 */
const POLL_INTERVAL_MS = 500

/** 异步导出状态轮询总超时：与导出请求上限一致，允许大批次完成。 */
export const RENDER_JOB_POLL_TIMEOUT_MS = RENDER_JOB_TIMEOUT_MS

const isTerminalStatus = (status: RenderJobStatusResponse["status"]): boolean =>
  status === "completed" || status === "failed" || status === "cancelled"

/**
 * 提交导出任务并轮询到终态。onStatus 可让根级控制器展示真实总进度与逐项结果。
 */
export const submitAndWaitForRenderJob = async (
  request: RenderJobRequest,
  pollTimeoutMs: number = RENDER_JOB_POLL_TIMEOUT_MS,
  onStatus?: (status: RenderJobStatusResponse) => void
): Promise<RenderJobStatusResponse> => {
  const result = await submitRenderJob(request)
  onStatus?.(result)

  if (isTerminalStatus(result.status)) {
    return result
  }

  // 每次状态请求都受同一个总截止时间约束，避免某次 GET 卡住后无限等待。
  const deadline = Date.now() + Math.max(0, pollTimeoutMs)
  while (true) {
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
    onStatus?.(status)

    if (isTerminalStatus(status.status)) {
      return status
    }
  }

  throw new Error("导出超时：任务未在 10 分钟内完成")
}
