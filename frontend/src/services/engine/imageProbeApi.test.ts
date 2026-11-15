import { afterEach, describe, expect, it, vi } from "vitest"
import { probeImage } from "./imageProbeApi"
import type { ImageProbeRequest, ImageProbeResponse } from "../../types/imageProbe"

const request: ImageProbeRequest = { imagePath: "/photos/scan.jpg" }

const response: ImageProbeResponse = {
  status: "ok",
  imagePath: request.imagePath,
  format: "jpg",
  sourceVersion: "sha256:test;size:1;mtime:2",
  orientation: 1,
  width: 6000,
  height: 4000,
  container: {
    width: 6000,
    height: 4000,
    bitDepth: 8,
    bands: 3,
    alpha: false,
    colorModel: "rgb",
    imageCount: 1,
    tiffContainer: false
  },
  icc: { present: false, sha256: null, source: "none" },
  preview: { available: false, width: 0, height: 0, note: null },
  inputSources: ["encoded-raster"],
  recommendedInputSource: "encoded-raster",
  warnings: ["源文件没有嵌入 ICC"],
  pairing: null
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

afterEach(() => vi.unstubAllGlobals())

describe("probeImage 图像探针客户端", () => {
  it("POST 同一路径并映射头部事实", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(response))
    vi.stubGlobal("fetch", fetchMock)

    const result = await probeImage(request)

    expect(result.inputSources).toEqual(["encoded-raster"])
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/image-probe")
    expect(JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string).imagePath)
      .toBe("/photos/scan.jpg")
  })

  it("保留引擎错误码", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({
      error: "imagePath is required",
      code: "IMAGE_PROBE_PATH_REQUIRED"
    }, 400))

    await expect(probeImage({ imagePath: "" })).rejects.toMatchObject({
      status: 400,
      code: "IMAGE_PROBE_PATH_REQUIRED"
    })
  })
})
