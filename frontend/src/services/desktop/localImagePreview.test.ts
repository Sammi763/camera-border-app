import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { loadLocalImagePreview, type LocalPreview } from "./localImagePreview"
import { isRawOrHeicFile, isLocalPreviewSupported } from "./localImagePreview"

/**
 * 前端 localImagePreview 服务测试：
 * - 调用 window.desktop.loadLocalImagePreview 成功时返回 dataUrl + 尺寸；
 * - 桥接不存在（浏览器模式）时返回 null（不抛异常）；
 * - 桥接返回 null（文件不存在 / 解码失败）时返回 null；
 * - 解码失败/桥接抛出时降级为 null（不污染上层状态）；
 * - RAW/HEIC 等系统无法解码的格式 → 标记 unsupported（用于 UI 提示）；
 * - 路径白名单与 supported 标记共同决定是否调用 IPC。
 */

const isLocalPreviewSupportedMock = vi.fn()
const isRawOrHeicFileMock = vi.fn()

vi.mock("../../features/metadata/constants/imageFormats", () => ({
  isRawFile: (p: string) => isRawOrHeicFileMock(p),
  isHeicFile: (p: string) => isRawOrHeicFileMock(p)
}))

const makeDesktop = (loadResult: LocalPreview | null | Promise<LocalPreview | null>): { loadLocalImagePreview: (a: string, b: number, c: number) => Promise<LocalPreview | null> } => ({
  loadLocalImagePreview: vi.fn(async () => loadResult)
})

const setDesktop = (api: unknown): void => {
  ;(window as unknown as { desktop?: unknown }).desktop = api
}

const clearDesktop = (): void => {
  delete (window as unknown as { desktop?: unknown }).desktop
}

beforeEach(() => {
  isLocalPreviewSupportedMock.mockReset()
  isRawOrHeicFileMock.mockReset()
  isLocalPreviewSupportedMock.mockImplementation((p: string) => /\.(jpe?g|png|webp|bmp|tiff?)$/i.test(p))
  isRawOrHeicFileMock.mockImplementation((p: string) => /\.(nef|cr2|cr3|arw|raf|dng|orf|rw2|pef|heic|heif)$/i.test(p))
  clearDesktop()
})

afterEach(() => {
  clearDesktop()
  vi.restoreAllMocks()
})

describe("loadLocalImagePreview（前端桥接封装）", () => {
  it("桥接存在且返回 dataUrl → 直接返回", async () => {
    const result: LocalPreview = { dataUrl: "data:image/jpeg;base64,xxx", width: 800, height: 600 }
    setDesktop(makeDesktop(result))
    const out = await loadLocalImagePreview("/photos/A.jpg", 800, 600)
    expect(out).toEqual(result)
  })

  it("桥接存在但返回 null（文件不存在/解码失败）→ 返回 null，UI 走降级提示", async () => {
    setDesktop(makeDesktop(null))
    const out = await loadLocalImagePreview("/photos/A.jpg", 800, 600)
    expect(out).toBeNull()
  })

  it("桥接不存在（浏览器模式）→ 返回 null（不抛异常）", async () => {
    // 不安装 desktop
    const out = await loadLocalImagePreview("/photos/A.jpg", 800, 600)
    expect(out).toBeNull()
  })

  it("桥接抛错 → 返回 null（不污染上层状态）", async () => {
    setDesktop({
      loadLocalImagePreview: vi.fn(async () => {
        throw new Error("IPC failure")
      })
    })
    const out = await loadLocalImagePreview("/photos/A.jpg", 800, 600)
    expect(out).toBeNull()
  })

  it("桥接 loadLocalImagePreview 不是函数（旧版 Electron）→ 返回 null", async () => {
    setDesktop({})
    const out = await loadLocalImagePreview("/photos/A.jpg", 800, 600)
    expect(out).toBeNull()
  })
})

describe("isLocalPreviewSupported / isRawOrHeicFile（格式判定）", () => {
  it("JPEG/PNG/WebP/BMP/TIFF 受支持", () => {
    expect(isLocalPreviewSupported("/a/A.jpg")).toBe(true)
    expect(isLocalPreviewSupported("/a/A.JPEG")).toBe(true)
    expect(isLocalPreviewSupported("/a/A.png")).toBe(true)
    expect(isLocalPreviewSupported("/a/A.webp")).toBe(true)
    expect(isLocalPreviewSupported("/a/A.bmp")).toBe(true)
    expect(isLocalPreviewSupported("/a/A.tiff")).toBe(true)
  })

  it("RAW/HEIC 不受本地预览支持（系统缩略图无法解码）", () => {
    expect(isLocalPreviewSupported("/a/A.NEF")).toBe(false)
    expect(isLocalPreviewSupported("/a/A.cr3")).toBe(false)
    expect(isLocalPreviewSupported("/a/A.HEIC")).toBe(false)
  })

  it("isRawOrHeicFile 命中 RAW 与 HEIC", () => {
    expect(isRawOrHeicFile("/a/A.NEF")).toBe(true)
    expect(isRawOrHeicFile("/a/A.HEIF")).toBe(true)
    expect(isRawOrHeicFile("/a/A.jpg")).toBe(false)
  })
})
