import { afterEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import { usePreview } from "./usePreview"
import type { RenderSettings } from "../../settings/types"
import type { ImageProcessingConfig } from "../../../types/imageProcessing"
import type { PreviewResponse } from "../../../types/preview"

vi.mock("../../../services/engine/previewApi", () => ({
  requestPreview: vi.fn()
}))
vi.mock("../../../services/desktop/imageFileVersion", () => ({
  getImageFileVersions: vi.fn(async () => [null])
}))
vi.mock("../../../services/engine/filmRequestsApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../services/engine/filmRequestsApi")>()),
  cancelFilmRequests: vi.fn(async () => undefined)
}))

const { requestPreview } = await import("../../../services/engine/previewApi")
const { cancelFilmRequests } = await import("../../../services/engine/filmRequestsApi")
const requestPreviewMock = vi.mocked(requestPreview)
const cancelFilmRequestsMock = vi.mocked(cancelFilmRequests)

const settings: RenderSettings = {
  borderColor: "#fff",
  borderTop: 0,
  borderBottom: 0,
  borderLeft: 0,
  borderRight: 0,
  borderStyle: null,
  textContent: "",
  textFontSize: 20,
  textColor: "#222",
  textPlacement: "bottom-center",
  textArea: "border",
  fontFamily: "sans-serif",
  textLayers: [],
  gradient: { enabled: false, type: "linear", angle: 0, stops: [] },
  exportFormat: "jpeg",
  jpegQuality: 90,
  outputSizePreset: "original",
  customOutputLongEdge: 0,
  preserveMetadata: true,
  preserveColorProfile: true,
  preferHighBitDepth: false,
  logo: { enabled: false, mode: "auto-brand", brand: null, placement: "border-bottom-right", size: 48, colorMode: "auto-contrast" }
}

const processing: ImageProcessingConfig = {
  schemaVersion: 1,
  algorithmVersion: "film-digitization-v1",
  inputMode: "linear-tiff",
  linearInput: { transferFunction: "linear", colorSpace: "linear-rec2020", bitDepth: 16 },
  negative: {
    enabled: true,
    lightSource: { kind: "camera-white-balance" },
    filmBase: { kind: "manual", rgb: [0.5, 0.5, 0.5], stage: "linear-working" },
    density: { min: 0, max: 3 },
    profile: "generic-color-negative-v1"
  }
}

class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 0
  naturalHeight = 0
  private _src = ""
  set src(value: string) {
    this._src = value
    this.naturalWidth = 400
    this.naturalHeight = 300
    queueMicrotask(() => this.onload?.())
  }
  get src(): string {
    return this._src
  }
}

afterEach(() => {
  delete (window as unknown as { desktop?: unknown }).desktop
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe("usePreview 底片模式（T10）", () => {
  it("只展示引擎校色结果，不用普通 Canvas 源图冒充", async () => {
    vi.stubGlobal("Image", FakeImage)
    requestPreviewMock.mockResolvedValue({
      status: "ok",
      message: "ok",
      previewAvailable: true,
      previewUrl: "data:image/png;base64,film-result",
      sourceDecode: { mode: "linear-tiff", format: "tif", warning: null }
    } satisfies PreviewResponse)

    const { result } = renderHook(() => usePreview("/photos/film.tif", settings, 1, null, null, null, processing))

    await waitFor(() => {
      expect(result.current.kind === "active" ? result.current.engineDisplayUrl : null)
        .toBe("data:image/png;base64,film-result")
    })
    const state = result.current
    expect(state.kind).toBe("active")
    if (state.kind === "active") {
      expect(state.filmMode).toBe(true)
      // 普通源图像素在底片模式绝不进入 currentImage。
      expect(state.currentImage).toBeNull()
    }
  })

  it("引擎失败时保持空图并给出错误状态，不降级到本地未处理预览", async () => {
    ;(window as unknown as { desktop?: unknown }).desktop = {
      loadLocalImagePreview: vi.fn(async () => ({ dataUrl: "data:image/png;base64,plain", width: 10, height: 10 }))
    }
    requestPreviewMock.mockRejectedValue(new Error("engine down"))

    const { result } = renderHook(() => usePreview("/photos/film2.tif", settings, 1, null, null, null, processing))

    await waitFor(() => {
      expect(result.current.kind === "active" ? result.current.engineSyncStatus : null).toBe("error")
    })
    const state = result.current
    if (state.kind === "active") {
      expect(state.currentImage).toBeNull()
      expect(window.desktop?.loadLocalImagePreview).not.toHaveBeenCalled()
    }
  })

  it("连续调参只提交最新快照，主预览暴露同一份稳定配方与代次", async () => {
    let releaseFirst!: (value: PreviewResponse) => void
    requestPreviewMock
      .mockImplementationOnce(() => new Promise<PreviewResponse>((resolve) => {
        releaseFirst = resolve
      }))
      .mockResolvedValue({
        status: "ok",
        message: "ok",
        previewAvailable: true,
        previewUrl: "data:image/png;base64,latest",
        sourceDecode: { mode: "linear-tiff", format: "tif", warning: null }
      } satisfies PreviewResponse)

    const { result, rerender, unmount } = renderHook(
      ({ current }) => usePreview("/photos/film-merge.tif", current, 1, null, null, null, processing),
      { initialProps: { current: settings } }
    )
    await waitFor(() => expect(requestPreviewMock).toHaveBeenCalledTimes(1))
    const firstState = result.current
    expect(firstState.kind).toBe("active")
    if (firstState.kind === "active") {
      expect(firstState.engineRecipe?.imageProcessing).toEqual(processing)
      expect(firstState.engineGeneration).toBe(1)
      expect(firstState.engineClientId).toMatch(/^preview_/)
    }

    for (const border of [1, 2, 3, 4, 5]) {
      await act(async () => {
        rerender({ current: { ...settings, borderTop: border } })
      })
    }
    await act(async () => {
      releaseFirst({
        status: "ok",
        message: "ok",
        previewAvailable: true,
        previewUrl: "data:image/png;base64,first",
        sourceDecode: { mode: "linear-tiff", format: "tif", warning: null }
      })
    })

    await waitFor(() => expect(requestPreviewMock).toHaveBeenCalledTimes(2), { timeout: 2000 })
    const lastRequest = requestPreviewMock.mock.calls.at(-1)?.[0]
    expect(lastRequest?.recipe.border?.top).toBe(5)
    expect(cancelFilmRequestsMock).toHaveBeenCalled()

    const latest = result.current
    if (latest.kind === "active") {
      expect(latest.engineGeneration).toBeGreaterThan(1)
      expect(latest.engineRecipe?.border?.top).toBe(5)
    }
    unmount()
    expect(cancelFilmRequestsMock).toHaveBeenCalledWith(
      expect.stringMatching(/^preview_/),
      expect.any(Number)
    )
  })

  it("正片调整先快显，松手以相同配方精算，再发布可供分析的快照", async () => {
    requestPreviewMock.mockImplementation(async (request) => ({
      status: "ok", message: "ok", previewAvailable: true,
      previewUrl: "data:image/png;base64,film",
      previewQuality: request.previewQuality ?? "exact"
    }))
    const { result, rerender } = renderHook(
      ({ config }) => usePreview("/photos/quality.tif", settings, 1, null, null, null, config),
      { initialProps: { config: processing } }
    )
    await waitFor(() => expect(requestPreviewMock).toHaveBeenCalledTimes(1))
    rerender({ config: { ...processing, positive: { exposureEv: 0.6 } } })
    await waitFor(() => {
      expect(result.current.kind === "active" && result.current.engineResponse?.previewQuality).toBe("interactive")
    })
    expect(result.current.kind === "active" && result.current.engineGeneration).toBeNull()
    await act(async () => window.dispatchEvent(new Event("pointerup")))
    await waitFor(() => expect(requestPreviewMock.mock.calls.map(([req]) => req.previewQuality))
      .toEqual(["exact", "interactive", "exact"]))
    await waitFor(() => expect(result.current.kind === "active" && result.current.engineSyncStatus).toBe("synced"))
    expect(requestPreviewMock.mock.calls.at(-1)?.[0].recipe.imageProcessing?.positive?.exposureEv).toBe(0.6)
  })

  it("取消或被替代不展示引擎不可达", async () => {
    requestPreviewMock.mockRejectedValue({ status: 408, code: "FILM_REQUEST_CANCELLED" })
    const { result } = renderHook(() => usePreview("/photos/film3.tif", settings, 1, null, null, null, processing))
    await waitFor(() => {
      expect(result.current.kind === "active" ? result.current.engineSyncStatus : null).toBe("syncing")
    })
    const state = result.current
    if (state.kind === "active") {
      expect(state.engineResponse).toBeNull()
    }
  })
})


it("精算失败保留上一版，手动重试提交同一配方的新代次", async () => {
  const response = (url: string): PreviewResponse => ({ status: "ok", message: "", previewAvailable: true, previewUrl: url })
  requestPreviewMock.mockResolvedValue(response("/previews/old"))
  const { result, rerender } = renderHook(({ exposure }) => usePreview("/photos/film.tif", settings, 1,
    null, null, null, { ...processing, positive: { exposureEv: exposure } }), { initialProps: { exposure: 0 } })
  await waitFor(() => expect(result.current).toMatchObject({ engineSyncStatus: "synced" }))
  requestPreviewMock.mockRejectedValue(new Error("精算预算不足"))
  rerender({ exposure: 0.5 })
  await waitFor(() => expect(result.current).toMatchObject({
    engineSyncStatus: "error", engineDisplayUrl: "/previews/old", engineResponse: { message: "精算预算不足" }
  }))
  const generation = result.current.kind === "active" ? result.current.engineGeneration ?? 0 : 0
  requestPreviewMock.mockResolvedValue(response("/previews/new"))
  act(() => { if (result.current.kind === "active") result.current.retry?.() })
  await waitFor(() => expect(result.current).toMatchObject({
    engineSyncStatus: "synced", engineDisplayUrl: "/previews/new",
    engineGeneration: generation + 1
  }))
})
