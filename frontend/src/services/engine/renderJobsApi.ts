/**
 * 高质量导出 API：调用 Java 引擎的 render-jobs 端点。
 *
 * 与预览 API 共享 RenderRecipe（ARCHITECTURE.md §4.1），
 * 但不指定 maxWidth/maxHeight，引擎按原图尺寸渲染。
 */

import type {
  RenderJobRequest,
  RenderJobStatusResponse
} from "../../types/preview"
import { getBaseUrl, toErrorMessage } from "./engineClient"

/**
 * 提交导出任务至引擎。
 * POST /api/render-jobs → RenderJobStatusResponse
 *
 * 当前引擎为同步渲染：POST 直接返回最终状态（completed + outputPath），
 * 一次 HTTP 往返即可拿到结果，无需轮询。
 */
export const submitRenderJob = async (request: RenderJobRequest): Promise<RenderJobStatusResponse> => {
  let response: Response

  try {
    response = await fetch(`${getBaseUrl()}/api/render-jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    })
  } catch {
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
 */
export const fetchRenderJobStatus = async (jobId: string): Promise<RenderJobStatusResponse> => {
  let response: Response

  try {
    response = await fetch(`${getBaseUrl()}/api/render-jobs/${encodeURIComponent(jobId)}`)
  } catch {
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
  request: RenderJobRequest
): Promise<RenderJobStatusResponse> => {
  const result = await submitRenderJob(request)

  // 同步引擎：POST 响应即最终状态，直接返回
  if (result.status === "completed" || result.status === "failed") {
    return result
  }

  // 兜底：旧版异步引擎（先 accepted 后轮询）
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))

    const status = await fetchRenderJobStatus(result.jobId)

    if (status.status === "completed" || status.status === "failed") {
      return status
    }
  }

  throw new Error("导出超时：任务未在 60 秒内完成")
}
