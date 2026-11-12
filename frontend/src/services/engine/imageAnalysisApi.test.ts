import { afterEach, describe, expect, it, vi } from "vitest"
import { analyzeImage } from "./imageAnalysisApi"
import type { ImageAnalysisRequest, ImageAnalysisResponse } from "../../types/imageProcessing"

const request: ImageAnalysisRequest = {
  recipe: {
    imagePath: "/photos/film.tif",
    border: null,
    gradient: null,
    texts: [],
    imagePlacement: { mode: "fit", focalX: 0.5, focalY: 0.5, rotation: 0, targetAspectRatio: null },
    imageProcessing: {
      schemaVersion: 1,
      algorithmVersion: "film-digitization-v1",
      inputMode: "linear-tiff",
      linearInput: {
        transferFunction: "linear",
        colorSpace: "linear-rec2020",
        bitDepth: 16
      }
    }
  },
  stage: "current-positive"
}

const response: ImageAnalysisResponse = {
  status: "ok",
  recipeSignature: "a".repeat(64),
  sourceVersion: "sha256:test",
  stage: "current-positive",
  analyzedWidth: 4,
  analyzedHeight: 2,
  sampling: "full",
  bucketCount: 256,
  histogram: { red: [], green: [], blue: [], luma: [], underflow: 0, overflow: 0 },
  stats: {
    pixelCount: 8,
    mean: [0.5, 0.5, 0.5],
    min: [0, 0, 0],
    max: [1, 1, 1],
    clippedLow: [0, 0, 0],
    clippedHigh: [0, 0, 0]
  },
  clipping: { stages: {} }
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

afterEach(() => vi.unstubAllGlobals())

describe("analyzeImage 图像分析客户端", () => {
  it("提交同一份 recipe 并映射响应", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(response))
    vi.stubGlobal("fetch", fetchMock)

    const result = await analyzeImage(request)

    expect(result.recipeSignature).toBe(response.recipeSignature)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/image-analysis")
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe("POST")
    expect(JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string).stage)
      .toBe("current-positive")
  })

  it("保留引擎错误码", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({
      error: "分析阶段非法",
      code: "IMAGE_ANALYSIS_INVALID_STAGE"
    }, 400))

    await expect(analyzeImage(request)).rejects.toMatchObject({
      status: 400,
      code: "IMAGE_ANALYSIS_INVALID_STAGE"
    })
  })

  it("引擎无响应时在有限时间失败", async () => {
    vi.stubGlobal("fetch", (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "TimeoutError")))
      }))

    await expect(analyzeImage(request, 30)).rejects.toThrow("引擎不可达")
  })
})
