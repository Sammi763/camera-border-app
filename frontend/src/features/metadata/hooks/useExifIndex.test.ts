import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useExifIndex } from "./useExifIndex"
import type { PhotoMetadata } from "../../../types/preview"

/**
 * EXIF 索引测试（U09）：
 * - 批量读取使用有界并发，不再无上限 Promise.all；
 * - 失败与「确无 EXIF」区分：失败进 exifFailures 可重试，引擎空结果是权威事实；
 * - 导出等待支持 signal 取消，中止后不再发起新读取；
 * - 文件版本（mtime+size）变化后自动重新读取。
 */

vi.mock("../../../services/engine/photoMetadataApi", () => ({
  fetchPhotoMetadata: vi.fn()
}))

vi.mock("../../../services/desktop/imageFileVersion", () => ({
  getImageFileVersions: vi.fn(async (paths: readonly string[]) => paths.map(() => null))
}))

import { fetchPhotoMetadata } from "../../../services/engine/photoMetadataApi"
import { getImageFileVersions } from "../../../services/desktop/imageFileVersion"

const meta = (model: string): PhotoMetadata =>
  ({ model, cameraModel: model } as PhotoMetadata)

afterEach(() => {
  vi.clearAllMocks()
  vi.mocked(getImageFileVersions).mockImplementation(async (paths: readonly string[]) => paths.map(() => null))
})

describe("useExifIndex（U09 有界并发与失败区分）", () => {
  it("批量读取并发不超过上限", async () => {
    let inFlight = 0
    let peak = 0
    vi.mocked(fetchPhotoMetadata).mockImplementation(async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return meta("X")
    })

    const { result } = renderHook(() => useExifIndex())
    const paths = Array.from({ length: 20 }, (_, index) => `/photos/p${index}.jpg`)
    await act(async () => {
      await result.current.ensureExifForExport(paths)
    })

    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThanOrEqual(4)
    expect(vi.mocked(fetchPhotoMetadata)).toHaveBeenCalledTimes(20)
  })

  it("读取失败进入 exifFailures（可重试）；引擎空结果是确无 EXIF 而非失败", async () => {
    vi.mocked(fetchPhotoMetadata).mockImplementation(async (input: RequestInfo | URL) => {
      const path = String(input)
      if (path.endsWith("broken.jpg")) {
        throw new Error("metadata service unavailable")
      }
      return meta("")
    })

    const { result } = renderHook(() => useExifIndex())
    await act(async () => {
      await result.current.ensureExifForExport(["/photos/broken.jpg", "/photos/clean.jpg"])
    })

    expect(result.current.exifFailures.get("/photos/broken.jpg")).toContain("metadata service unavailable")
    expect(result.current.exifFailures.has("/photos/clean.jpg")).toBe(false)
    expect(result.current.exifByPath.has("/photos/clean.jpg")).toBe(true)

    // 重试成功后失败记录清除
    vi.mocked(fetchPhotoMetadata).mockResolvedValue(meta("NIKON"))
    await act(async () => {
      await result.current.ensureExifForExport(["/photos/broken.jpg"])
    })
    expect(result.current.exifFailures.has("/photos/broken.jpg")).toBe(false)
    expect(result.current.exifByPath.get("/photos/broken.jpg")?.cameraModel).toBe("NIKON")
  })

  it("signal 中止后立即返回，不再发起新读取", async () => {
    const controller = new AbortController()
    const requested: string[] = []
    vi.mocked(fetchPhotoMetadata).mockImplementation(async (input: RequestInfo | URL) => {
      requested.push(String(input))
      if (requested.length === 2) {
        // 第二个读取完成后中止：剩余 8 个不得再发起
        controller.abort()
      }
      return meta("X")
    })

    const { result } = renderHook(() => useExifIndex())
    const paths = Array.from({ length: 10 }, (_, index) => `/photos/p${index}.jpg`)
    await act(async () => {
      await result.current.ensureExifForExport(paths, controller.signal)
    })

    expect(requested.length).toBeLessThan(10)
  })

  it("文件版本变化后重新读取，版本未变时使用缓存", async () => {
    vi.mocked(fetchPhotoMetadata).mockResolvedValue(meta("A"))
    let version = { mtimeMs: 100, sizeBytes: 10 }
    vi.mocked(getImageFileVersions).mockImplementation(async (paths: readonly string[]) =>
      paths.map(() => version))

    const { result } = renderHook(() => useExifIndex())
    await act(async () => {
      await result.current.ensureExifForExport(["/photos/a.jpg"])
    })
    expect(vi.mocked(fetchPhotoMetadata)).toHaveBeenCalledTimes(1)

    // 版本未变：使用缓存，不再请求
    await act(async () => {
      await result.current.ensureExifForExport(["/photos/a.jpg"])
    })
    expect(vi.mocked(fetchPhotoMetadata)).toHaveBeenCalledTimes(1)

    // 文件被修改：版本失效，重新读取
    version = { mtimeMs: 200, sizeBytes: 12 }
    await act(async () => {
      await result.current.ensureExifForExport(["/photos/a.jpg"])
    })
    expect(vi.mocked(fetchPhotoMetadata)).toHaveBeenCalledTimes(2)
  })

  it("同一路径在途去重：并发调用只发一次请求", async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    vi.mocked(fetchPhotoMetadata).mockImplementation(() => gate.then(() => meta("A")))

    const { result } = renderHook(() => useExifIndex())
    let first: Promise<void> = Promise.resolve()
    let second: Promise<void> = Promise.resolve()
    act(() => {
      first = result.current.ensureExifForExport(["/photos/a.jpg"])
      second = result.current.ensureExifForExport(["/photos/a.jpg"])
    })
    await waitFor(() => expect(vi.mocked(fetchPhotoMetadata)).toHaveBeenCalledTimes(1))
    await act(async () => {
      release()
      await Promise.all([first, second])
    })
    expect(vi.mocked(fetchPhotoMetadata)).toHaveBeenCalledTimes(1)
  })
})
