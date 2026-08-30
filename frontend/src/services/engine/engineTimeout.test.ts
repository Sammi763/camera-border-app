import { afterEach, describe, expect, it, vi } from "vitest"
import { requestPreview } from "./previewApi"
import { fetchEngineHealth } from "./healthApi"
import { fetchPhotoMetadata } from "./photoMetadataApi"
import { fetchRenderJobStatus } from "./renderJobsApi"
import type { PreviewRequest } from "../../types/preview"

/**
 * 引擎请求超时兜底测试：
 * - requestPreview 连接后无响应时在有限时间失败（触发本地预览兜底）；
 * - fetchEngineHealth 不会永久 pending；
 * - fetchPhotoMetadata（导出前 EXIF 读取）不会永久挂在「正在读取 EXIF…」；
 * - fetchRenderJobStatus（异步状态轮询）不会永久挂起；
 * - 正常引擎响应不受影响。
 */

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const previewRequest: PreviewRequest = {
  recipe: {
    imagePath: "/photos/a.jpg",
    border: { top: 0, bottom: 0, left: 0, right: 0, color: "#fff" },
    gradient: null,
    texts: [],
    filmFormat: null,
    autoCrop: false
  },
  maxWidth: 100,
  maxHeight: 100
}

/** 永不 resolve 但尊重 abort 信号的 fetch 替身：引擎无响应场景。 */
const hangingFetch = (): void => {
  vi.stubGlobal("fetch", (_input: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"))
      })
    })
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("requestPreview 超时兜底", () => {
  it("引擎无响应时在有限时间失败（不永久挂起）", async () => {
    hangingFetch()
    const startedAt = Date.now()
    await expect(requestPreview(previewRequest, 30)).rejects.toThrow("引擎不可达")
    // 远小于默认 8s，说明超时生效
    expect(Date.now() - startedAt).toBeLessThan(2000)
  })

  it("正常引擎响应不受影响", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({
      status: "ok",
      message: "",
      previewAvailable: false,
      previewUrl: ""
    }))
    const result = await requestPreview(previewRequest, 30)
    expect(result.previewAvailable).toBe(false)
  })

  it("引擎返回 4xx 时抛出可读错误（不影响超时逻辑）", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({ error: "invalid recipe" }, 400))
    await expect(requestPreview(previewRequest, 30)).rejects.toThrow("invalid recipe")
  })
})

describe("fetchEngineHealth 超时", () => {
  it("引擎无响应时在有限时间失败（不永久 pending）", async () => {
    hangingFetch()
    const startedAt = Date.now()
    await expect(fetchEngineHealth(30)).rejects.toThrow()
    expect(Date.now() - startedAt).toBeLessThan(2000)
  })

  it("正常健康响应不受影响", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({ status: "ok", app: "test", version: "0" }))
    const health = await fetchEngineHealth(30)
    expect(health.status).toBe("ok")
  })

  it("非 2xx 健康响应抛错", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({ error: "bad" }, 503))
    await expect(fetchEngineHealth(30)).rejects.toMatchObject({ status: 503, message: "bad" })
  })
})

describe("fetchPhotoMetadata（导出前 EXIF 读取）超时", () => {
  it("引擎卡住时在有限时间失败（不会永久停在「正在读取 EXIF…」）", async () => {
    hangingFetch()
    const startedAt = Date.now()
    await expect(fetchPhotoMetadata("/photos/a.jpg", 30)).rejects.toThrow("引擎不可达")
    expect(Date.now() - startedAt).toBeLessThan(2000)
  })

  it("正常 EXIF 响应不受影响", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({ cameraModel: "NIKON Z6" }))
    const meta = await fetchPhotoMetadata("/photos/a.jpg", 30)
    expect(meta.cameraModel).toBe("NIKON Z6")
  })
})

describe("fetchRenderJobStatus（异步状态轮询）超时", () => {
  it("引擎卡住时每次轮询请求在有限时间失败（不永久挂起）", async () => {
    hangingFetch()
    const startedAt = Date.now()
    await expect(fetchRenderJobStatus("job-1", 30)).rejects.toThrow("导出超时")
    expect(Date.now() - startedAt).toBeLessThan(2000)
  })

  it("正常状态响应不受影响", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({ jobId: "job-1", status: "completed", outputPath: "/tmp/o.jpg", actualFormat: "jpeg" }))
    const status = await fetchRenderJobStatus("job-1", 30)
    expect(status.status).toBe("completed")
  })
})
