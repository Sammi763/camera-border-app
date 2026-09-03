import { afterEach, describe, expect, it, vi } from "vitest"
import { cancelRenderJob, submitAndWaitForRenderJob, submitRenderJob } from "./renderJobsApi"
import type { RenderJobRequest } from "../../types/preview"

/**
 * 导出请求超时兜底测试：
 * - 引擎卡死（POST 连接后无响应）时在有限时间失败，抛出可读「导出超时」；
 * - 正常引擎响应不受影响；
 * - 4xx 错误返回可读消息。
 */

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const request: RenderJobRequest = {
  items: [{
    recipe: {
      imagePath: "/photos/a.jpg",
      border: { top: 0, bottom: 0, left: 0, right: 0, color: "#fff" },
      gradient: null,
      texts: [],
      imagePlacement: { mode: "fit", focalX: 0.5, focalY: 0.5, rotation: 0, targetAspectRatio: null }
    },
    export: { format: "jpeg", outputPath: "/tmp/out/a.jpg", jpegQuality: 90 }
  }]
}

/** 永不 resolve 但尊重 abort 信号的 fetch 替身：引擎卡死场景。 */
const hangingFetch = (): void => {
  vi.stubGlobal("fetch", (_input: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("aborted", "TimeoutError"))
      })
    })
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("submitRenderJob 导出请求超时兜底", () => {
  it("引擎卡死（无响应）时在有限时间失败并抛出「导出超时」", async () => {
    hangingFetch()
    const startedAt = Date.now()
    await expect(submitRenderJob(request, 30)).rejects.toThrow("导出超时")
    // 远小于默认 10 分钟，说明超时生效
    expect(Date.now() - startedAt).toBeLessThan(2000)
  })

  it("异步任务状态接口卡住时遵守轮询总超时", async () => {
    vi.stubGlobal("fetch", (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(jsonResponse({ jobId: "job-async", status: "queued", total: 1 }, 202))
      }
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "TimeoutError"))
        })
      })
    })

    const startedAt = Date.now()
    await expect(submitAndWaitForRenderJob(request, 550)).rejects.toThrow("导出超时")
    expect(Date.now() - startedAt).toBeLessThan(2000)
  })

  it("异步任务在轮询中完成时返回最终状态", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return jsonResponse({ jobId: "job-async", status: "queued", total: 1 }, 202)
      }
      return jsonResponse({
        jobId: "job-async",
        status: "completed",
        outputPath: "/tmp/out/a.jpg",
        actualFormat: "jpeg"
      })
    })

    const result = await submitAndWaitForRenderJob(request, 550)
    expect(result.status).toBe("completed")
    expect(result.outputPath).toBe("/tmp/out/a.jpg")
  })

  it("提交批量快照只返回 202 + jobId，正文保留冻结的 items 数组", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => jsonResponse({
      jobId: "job-1",
      status: "queued",
      total: 1,
      items: [{ index: 0, status: "queued", imagePath: "/photos/a.jpg" }]
    }, 202))
    vi.stubGlobal("fetch", fetchMock)
    const result = await submitRenderJob(request, 30)
    expect(result.status).toBe("queued")
    expect(result.total).toBe(1)
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(requestInit.body))).toEqual(request)
  })

  it("取消任务使用 DELETE 并返回取消后的逐项状态", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({
      jobId: "job-1",
      status: "cancelled",
      total: 2,
      cancelled: 2,
      items: [
        { index: 0, status: "cancelled", error: "任务已取消，未执行" },
        { index: 1, status: "cancelled", error: "任务已取消，未执行" }
      ]
    }))
    vi.stubGlobal("fetch", fetchMock)
    const result = await cancelRenderJob("job-1", 30)
    expect(result.status).toBe("cancelled")
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" })
  })

  it("引擎返回 4xx 时抛出可读错误（不影响超时逻辑）", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({ error: "invalid export path" }, 400))
    await expect(submitRenderJob(request, 30)).rejects.toThrow("invalid export path")
  })
})
