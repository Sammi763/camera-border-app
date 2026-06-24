/**
 * 高质量导出 API：调用 Java 引擎的 render-jobs 端点。
 *
 * 与预览 API 共享 RenderRecipe（ARCHITECTURE.md §4.1），
 * 但不指定 maxWidth/maxHeight，引擎按原图尺寸渲染。
 */

import type {
  RenderJobRequest,
  RenderJobCreatedResponse,
  RenderJobStatusResponse
} from "../../types/preview"
import { getBaseUrl, toErrorMessage } from "./engineClient"

/**
 * 提交导出任务至引擎。
 * POST /api/render-jobs → { jobId }
 */
export const submitRenderJob = async (request: RenderJobRequest): Promise<RenderJobCreatedResponse> => {
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

  return (await response.json()) as RenderJobCreatedResponse
}

/**
 * 查询导出任务状态。
 * GET /api/render-jobs/{jobId} → RenderJobStatusResponse
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

/** 最大轮询次数（60 秒超时）。 */
const MAX_POLL_ATTEMPTS = 120

/**
 * 提交导出任务并轮询至完成。
 *
 * 流程：
 * 1. POST /api/render-jobs 获取 jobId
 * 2. 轮询 GET /api/render-jobs/{jobId} 直到 status 为 completed 或 failed
 * 3. 返回最终状态
 *
 * 如果任务在 60 秒内未完成，抛出超时错误。
 */
export const submitAndWaitForRenderJob = async (
  request: RenderJobRequest
): Promise<RenderJobStatusResponse> => {
  const created = await submitRenderJob(request)

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))

    const status = await fetchRenderJobStatus(created.jobId)

    if (status.status === "completed" || status.status === "failed") {
      return status
    }
  }

  throw new Error("导出超时：任务未在 60 秒内完成")
}
