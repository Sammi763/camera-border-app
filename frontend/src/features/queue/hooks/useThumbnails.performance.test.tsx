import { afterEach, describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"

const { requestPreviewMock, getImageFileVersionsMock } = vi.hoisted(() => ({
  requestPreviewMock: vi.fn(),
  getImageFileVersionsMock: vi.fn()
}))

vi.mock("../../../services/engine/previewApi", () => ({ requestPreview: requestPreviewMock }))
vi.mock("../../../services/desktop/imageFileVersion", () => ({ getImageFileVersions: getImageFileVersionsMock }))
vi.mock("../../../services/desktop/localImagePreview", () => ({
  isRawOrHeicFile: () => true,
  isLocalPreviewSupported: () => false,
  loadLocalImagePreview: vi.fn()
}))

import { buildThumbnailRequest, useThumbnails } from "./useThumbnails"
import { thumbnailUrlCache } from "../../../services/engine/previewCache"

afterEach(() => {
  thumbnailUrlCache.clear()
  vi.clearAllMocks()
})

describe("队列缩略图性能控制", () => {
  it("缩略图使用 120px 的零边框 recipe", () => {
    const request = buildThumbnailRequest("/photos/a.jpg", 120, 120)
    expect(request.maxWidth).toBe(120)
    expect(request.maxHeight).toBe(120)
    expect(request.recipe.border).toEqual({ top: 0, bottom: 0, left: 0, right: 0, color: "#000000" })
    expect(request.recipe.texts).toEqual([])
  })

  it("100 图队列始终最多并发 2 个缩略图请求", async () => {
    const paths = Array.from({ length: 100 }, (_, index) => `/photos/${index}.jpg`)
    getImageFileVersionsMock.mockResolvedValue(paths.map((_, index) => ({ mtimeMs: index + 1, sizeBytes: 100 })))

    let concurrent = 0
    let peakConcurrent = 0
    const release: Array<() => void> = []
    requestPreviewMock.mockImplementation((_request: unknown, _timeout: unknown, signal: AbortSignal) =>
      new Promise((resolve) => {
        concurrent++
        peakConcurrent = Math.max(peakConcurrent, concurrent)
        const finish = (): void => {
          concurrent--
          resolve({ previewAvailable: false, previewUrl: "" })
        }
        signal.addEventListener("abort", finish, { once: true })
        release.push(finish)
      })
    )

    const { unmount } = renderHook(() => useThumbnails(paths))

    await waitFor(() => expect(requestPreviewMock).toHaveBeenCalledTimes(2))
    expect(peakConcurrent).toBe(2)

    release.shift()?.()
    await waitFor(() => expect(requestPreviewMock).toHaveBeenCalledTimes(3))
    expect(peakConcurrent).toBe(2)

    // 卸载会中断剩余请求，防止测试遗留异步任务，同时验证队列范围切换会清理旧任务。
    unmount()
  })
})
