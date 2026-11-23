import { afterEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import { useThumbnails } from "./useThumbnails"
import { createDefaultFilmProcessing } from "../../editing/defaults"
import { thumbnailUrlCache } from "../../../services/engine/previewCache"
vi.mock("../../../services/engine/previewApi", () => ({ requestPreview: vi.fn() }))
vi.mock("../../../services/desktop/imageFileVersion", () => ({ getImageFileVersions: vi.fn(async () => [null]) }))
const { requestPreview } = await import("../../../services/engine/previewApi")
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); thumbnailUrlCache.clear() })
describe("底片队列缩略图", () => {
  it("配方改变后重新渲染且缓存不复用旧色彩", async () => {
    vi.mocked(requestPreview).mockImplementation(async (request) => ({ status: "ok", message: "", previewAvailable: true,
      previewUrl: `data:image/png;base64,${request.recipe.imageProcessing?.positive?.exposureEv ?? 0}` }))
    const config = createDefaultFilmProcessing("/a.ARW")!
    const paths = ["/a.ARW"]
    const hook = renderHook(({ processing }) => useThumbnails(paths, processing),
      { initialProps: { processing: new Map([[paths[0]!, config]]) } })
    await waitFor(() => expect(hook.result.current.get("/a.ARW")).toBe("data:image/png;base64,0"))
    vi.useFakeTimers()
    for (const exposureEv of [0.25, 0.5]) {
      hook.rerender({ processing: new Map([[paths[0]!, { ...config, positive: { exposureEv } }]]) })
      await act(async () => vi.advanceTimersByTimeAsync(250))
    }
    expect(requestPreview).toHaveBeenCalledTimes(1)
    expect(hook.result.current.get("/a.ARW")).toBe("data:image/png;base64,0")
    const edited = { ...config, positive: { ...config.positive, exposureEv: 1 } }
    hook.rerender({ processing: new Map([[paths[0]!, edited]]) })
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    expect(hook.result.current.get("/a.ARW")).toBe("data:image/png;base64,1")
    expect(requestPreview).toHaveBeenCalledTimes(2)
    expect(requestPreview).toHaveBeenLastCalledWith(expect.objectContaining({ recipe: expect.objectContaining({ imageProcessing: edited }) }), undefined, expect.any(AbortSignal))
  })
  it("底片渲染失败保留占位，不用普通 TIFF 源图兜底", async () => {
    vi.mocked(requestPreview).mockRejectedValue(new Error("引擎失败"))
    const config = createDefaultFilmProcessing("/a.tif")!
    const paths = ["/a.tif"]
    const processing = new Map([["/a.tif", config]])
    const hook = renderHook(() => useThumbnails(paths, processing))
    await waitFor(() => expect(requestPreview).toHaveBeenCalled())
    expect(hook.result.current.size).toBe(0)
    hook.unmount()
  })
})
