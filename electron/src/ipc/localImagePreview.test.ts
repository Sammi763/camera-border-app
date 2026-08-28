import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

/**
 * 本地图片预览 IPC 测试：
 * - 使用 Electron `nativeImage` 读取本地图片、缩放并返回 dataUrl + 尺寸；
 * - 严格参数校验：绝对路径、普通文件、支持栅格格式、maxWidth/maxHeight 限制；
 * - 缩放同时遵守 maxWidth/maxHeight、保持纵横比、不放大、最大边长封顶 2048；
 * - 主路径使用原生缩略图器（低内存），失败回退 createFromPath + 纯函数目标尺寸；
 * - 任何错误统一返回 null（不抛异常到渲染进程）。
 *
 * 通过 vi.mock 模拟 electron 模块（nativeImage + ipcMain）。
 */

const { ipcHandleMock, nativeImageCreateFromPath, nativeImageCreateThumbnail } = vi.hoisted(() => ({
  ipcHandleMock: vi.fn(),
  nativeImageCreateFromPath: vi.fn(),
  nativeImageCreateThumbnail: vi.fn()
}))

type MockImage = {
  isEmpty: () => boolean
  getSize: () => { width: number; height: number }
  resize: (opts: { width?: number; quality?: "good" | "better" | "best" }) => MockImage
  toDataURL: () => string
}

const makeMockImage = (width: number, height: number, dataUrl: string): MockImage => ({
  isEmpty: () => false,
  getSize: () => ({ width, height }),
  resize: () => makeMockImage(width, height, dataUrl),
  toDataURL: () => dataUrl
})

let workDir: string
let handlers: Map<string, (...args: unknown[]) => unknown>

vi.mock("electron", () => {
  return {
    ipcMain: {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
        ipcHandleMock(channel, handler)
      }
    },
    nativeImage: {
      createFromPath: (filePath: string) => nativeImageCreateFromPath(filePath),
      createThumbnailFromPath: (filePath: string, size: { width: number; height: number }) =>
        nativeImageCreateThumbnail(filePath, size)
    }
  }
})

// 静态 import（hoisted 模块已被 mock）
import { registerLocalImagePreviewIpc, IPC_LOCAL_IMAGE_PREVIEW_CHANNEL } from "./localImagePreview"
import { IPC_CHANNELS } from "../types/desktopApi"

/** 写入一个最小合法 JPEG 头（仅用于文件存在性 + 扩展名校验，不代表真实图片） */
const writeFakeJpeg = (path: string): void => {
  writeFileSync(path, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]))
}

/** 写入一个最小合法 PNG 头 */
const writeFakePng = (path: string): void => {
  writeFileSync(
    path,
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52])
  )
}

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "localimage-preview-test-"))
})

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true })
})

beforeEach(() => {
  handlers = new Map()
  ipcHandleMock.mockClear()
  nativeImageCreateFromPath.mockReset()
  nativeImageCreateThumbnail.mockReset()
  // 默认：原生缩略图器不可用（reject），让多数用例走 createFromPath 兜底路径
  nativeImageCreateThumbnail.mockRejectedValue(new Error("thumbnailer unavailable"))
  ipcHandleMock.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
    handlers.set(channel, handler)
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("本地图片预览 IPC（LOAD_LOCAL_IMAGE_PREVIEW）", () => {
  it("成功：返回 dataUrl + 原始尺寸（参数校验通过）", async () => {
    const jpegPath = join(workDir, "ok.jpg")
    writeFakeJpeg(jpegPath)
    const mockImg = makeMockImage(800, 600, "data:image/jpeg;base64,ZmFrZQ==")
    nativeImageCreateFromPath.mockReturnValue(mockImg)

    registerLocalImagePreviewIpc()
    const handler = handlers.get(IPC_CHANNELS.LOAD_LOCAL_IMAGE_PREVIEW)!
    const result = await handler({}, jpegPath, 800, 600)
    expect(result).toEqual({
      dataUrl: "data:image/jpeg;base64,ZmFrZQ==",
      width: 800,
      height: 600
    })
  })

  // ── 主路径：原生缩略图器（低内存） ────────────────────────────
  it("主路径：原生缩略图器按目标盒（两约束封顶）生成预览", async () => {
    const jpegPath = join(workDir, "thumb.jpg")
    writeFakeJpeg(jpegPath)
    nativeImageCreateThumbnail.mockResolvedValue(makeMockImage(400, 300, "data:image/jpeg;base64,dGh1bWI="))

    registerLocalImagePreviewIpc()
    const handler = handlers.get(IPC_CHANNELS.LOAD_LOCAL_IMAGE_PREVIEW)!
    const result = await handler({}, jpegPath, 400, 400)
    expect(nativeImageCreateThumbnail).toHaveBeenCalledWith(jpegPath, { width: 400, height: 400 })
    expect(nativeImageCreateFromPath).not.toHaveBeenCalled()
    expect(result).toEqual({
      dataUrl: "data:image/jpeg;base64,dGh1bWI=",
      width: 400,
      height: 300
    })
  })

  it("主路径：请求超过上限时缩略图器收到封顶后的目标盒（≤2048）", async () => {
    const jpegPath = join(workDir, "thumb-huge.jpg")
    writeFakeJpeg(jpegPath)
    nativeImageCreateThumbnail.mockResolvedValue(makeMockImage(2048, 1536, "data:image/jpeg;base64,Y2Fw"))

    registerLocalImagePreviewIpc()
    const handler = handlers.get(IPC_CHANNELS.LOAD_LOCAL_IMAGE_PREVIEW)!
    const result = await handler({}, jpegPath, 99999, 99999) as { width: number; height: number } | null
    expect(nativeImageCreateThumbnail).toHaveBeenCalledWith(jpegPath, { width: 2048, height: 2048 })
    expect(result!.width).toBeLessThanOrEqual(2048)
    expect(result!.height).toBeLessThanOrEqual(2048)
  })

  it("主路径：缩略图器返回空图时回退 createFromPath", async () => {
    const jpegPath = join(workDir, "thumb-empty.jpg")
    writeFakeJpeg(jpegPath)
    nativeImageCreateThumbnail.mockResolvedValue({
      isEmpty: () => true,
      getSize: () => ({ width: 0, height: 0 }),
      toDataURL: () => ""
    } as MockImage)
    nativeImageCreateFromPath.mockReturnValue(makeMockImage(200, 200, "data:image/jpeg;base64,Zg=="))

    registerLocalImagePreviewIpc()
    const handler = handlers.get(IPC_CHANNELS.LOAD_LOCAL_IMAGE_PREVIEW)!
    const result = await handler({}, jpegPath, 100, 100)
    expect(result).not.toBeNull()
    expect(nativeImageCreateFromPath).toHaveBeenCalled()
  })

  // ── 兜底路径：createFromPath + 纯函数目标尺寸 ─────────────────
  it("兜底：maxWidth/maxHeight 同时约束，保持纵横比（横图）", async () => {
    const jpegPath = join(workDir, "big.jpg")
    writeFakeJpeg(jpegPath)
    const scaled = makeMockImage(400, 300, "data:image/jpeg;base64,c2NhbGVk")
    const original = {
      isEmpty: () => false,
      getSize: () => ({ width: 1600, height: 1200 }),
      resize: vi.fn(() => scaled),
      toDataURL: () => ""
    }
    nativeImageCreateFromPath.mockReturnValue(original)

    registerLocalImagePreviewIpc()
    const handler = handlers.get(IPC_CHANNELS.LOAD_LOCAL_IMAGE_PREVIEW)!
    const result = await handler({}, jpegPath, 400, 400)
    const resizeArg = (original.resize.mock.calls[0] as Array<{ width?: number }>)[0]
    expect(resizeArg?.width).toBe(400)
    expect(result).toEqual({
      dataUrl: "data:image/jpeg;base64,c2NhbGVk",
      width: 400,
      height: 300
    })
  })

  it("兜底：竖图高度是约束时按 maxHeight 缩放（不越过高度）", async () => {
    const jpegPath = join(workDir, "portrait.jpg")
    writeFakeJpeg(jpegPath)
    const scaled = makeMockImage(300, 400, "data:image/jpeg;base64,cG9ydHJhaXQ=")
    const original = {
      isEmpty: () => false,
      getSize: () => ({ width: 1200, height: 1600 }),
      resize: vi.fn(() => scaled),
      toDataURL: () => ""
    }
    nativeImageCreateFromPath.mockReturnValue(original)

    registerLocalImagePreviewIpc()
    const handler = handlers.get(IPC_CHANNELS.LOAD_LOCAL_IMAGE_PREVIEW)!
    await handler({}, jpegPath, 400, 400)
    const resizeArg = (original.resize.mock.calls[0] as Array<{ width?: number }>)[0]
    // 目标宽 = round(1200 * 0.25) = 300；height 由 nativeImage 按同比例跟随 400
    expect(resizeArg?.width).toBe(300)
  })

  it("兜底：maxWidth/maxHeight 超过上限时被强制封顶（防 OOM）", async () => {
    const jpegPath = join(workDir, "huge.jpg")
    writeFakeJpeg(jpegPath)
    const mockImg = makeMockImage(1024, 768, "data:image/jpeg;base64,Y2FwcGVk")
    const original = {
      isEmpty: () => false,
      getSize: () => ({ width: 8000, height: 6000 }),
      resize: vi.fn(() => mockImg),
      toDataURL: () => ""
    }
    nativeImageCreateFromPath.mockReturnValue(original)

    registerLocalImagePreviewIpc()
    const handler = handlers.get(IPC_CHANNELS.LOAD_LOCAL_IMAGE_PREVIEW)!
    await handler({}, jpegPath, 99999, 99999)
    const resizeArg = (original.resize.mock.calls[0] as Array<{ width?: number }>)[0]
    expect(resizeArg?.width).toBeLessThanOrEqual(2048)
  })

  it("兜底：原图小于请求时不放大（不调用 resize）", async () => {
    const jpegPath = join(workDir, "small.jpg")
    writeFakeJpeg(jpegPath)
    const original = {
      isEmpty: () => false,
      getSize: () => ({ width: 100, height: 80 }),
      resize: vi.fn(() => original),
      toDataURL: () => "data:image/jpeg;base64,c21hbGw="
    }
    nativeImageCreateFromPath.mockReturnValue(original)

    registerLocalImagePreviewIpc()
    const handler = handlers.get(IPC_CHANNELS.LOAD_LOCAL_IMAGE_PREVIEW)!
    const result = await handler({}, jpegPath, 1000, 1000)
    expect(original.resize).not.toHaveBeenCalled()
    expect(result).toEqual({ dataUrl: "data:image/jpeg;base64,c21hbGw=", width: 100, height: 80 })
  })

  it("文件不存在：返回 null", async () => {
    const missing = join(workDir, "does-not-exist.jpg")
    registerLocalImagePreviewIpc()
    const handler = handlers.get(IPC_CHANNELS.LOAD_LOCAL_IMAGE_PREVIEW)!
    const result = await handler({}, missing, 800, 600)
    expect(result).toBeNull()
    expect(nativeImageCreateFromPath).not.toHaveBeenCalled()
    expect(nativeImageCreateThumbnail).not.toHaveBeenCalled()
  })

  it("非绝对路径：返回 null（不开放相对路径以防越权）", async () => {
    registerLocalImagePreviewIpc()
    const handler = handlers.get(IPC_CHANNELS.LOAD_LOCAL_IMAGE_PREVIEW)!
    const result = await handler({}, "relative/path.jpg", 800, 600)
    expect(result).toBeNull()
  })

  it("非字符串路径：返回 null（参数校验）", async () => {
    registerLocalImagePreviewIpc()
    const handler = handlers.get(IPC_CHANNELS.LOAD_LOCAL_IMAGE_PREVIEW)!
    expect(await handler({}, null, 800, 600)).toBeNull()
    expect(await handler({}, undefined, 800, 600)).toBeNull()
    expect(await handler({}, 123, 800, 600)).toBeNull()
  })

  it("不支持的扩展名（RAW/HEIC 等由系统缩略图无法解码）：返回 null", async () => {
    const rafPath = join(workDir, "img.NEF")
    writeFileSync(rafPath, "fake-raw")
    registerLocalImagePreviewIpc()
    const handler = handlers.get(IPC_CHANNELS.LOAD_LOCAL_IMAGE_PREVIEW)!
    const result = await handler({}, rafPath, 800, 600)
    expect(result).toBeNull()
    expect(nativeImageCreateFromPath).not.toHaveBeenCalled()
    expect(nativeImageCreateThumbnail).not.toHaveBeenCalled()
  })

  it("目录而非普通文件：返回 null", async () => {
    const dirPath = join(workDir, "is-a-dir.jpg")
    // 故意建一个目录但扩展名是 .jpg
    mkdirSync(dirPath)
    registerLocalImagePreviewIpc()
    const handler = handlers.get(IPC_CHANNELS.LOAD_LOCAL_IMAGE_PREVIEW)!
    const result = await handler({}, dirPath, 800, 600)
    expect(result).toBeNull()
  })

  it("nativeImage 解码失败（isEmpty）→ 返回 null（不抛异常）", async () => {
    const jpegPath = join(workDir, "corrupt.jpg")
    writeFakeJpeg(jpegPath)
    nativeImageCreateFromPath.mockReturnValue({
      isEmpty: () => true,
      getSize: () => ({ width: 0, height: 0 }),
      resize: () => null,
      toDataURL: () => ""
    } as unknown as MockImage)

    registerLocalImagePreviewIpc()
    const handler = handlers.get(IPC_CHANNELS.LOAD_LOCAL_IMAGE_PREVIEW)!
    const result = await handler({}, jpegPath, 800, 600)
    expect(result).toBeNull()
  })

  it("nativeImage 抛错：返回 null（不向渲染进程抛出异常）", async () => {
    const jpegPath = join(workDir, "throw.jpg")
    writeFakeJpeg(jpegPath)
    nativeImageCreateFromPath.mockImplementation(() => {
      throw new Error("decode failure")
    })

    registerLocalImagePreviewIpc()
    const handler = handlers.get(IPC_CHANNELS.LOAD_LOCAL_IMAGE_PREVIEW)!
    const result = await handler({}, jpegPath, 800, 600)
    expect(result).toBeNull()
  })

  it("支持 png/webp/jpeg/bmp/tiff 扩展名（白名单）", async () => {
    const png = join(workDir, "p.png")
    const webp = join(workDir, "p.webp")
    const bmp = join(workDir, "p.bmp")
    const tif = join(workDir, "p.tif")
    const jpg = join(workDir, "p.jpg")
    writeFakePng(png)
    writeFakeJpeg(webp)
    writeFileSync(bmp, "BM")
    writeFakeJpeg(tif)
    writeFakeJpeg(jpg)
    nativeImageCreateFromPath.mockReturnValue(makeMockImage(100, 100, "data:,"))

    registerLocalImagePreviewIpc()
    const handler = handlers.get(IPC_CHANNELS.LOAD_LOCAL_IMAGE_PREVIEW)!
    for (const p of [png, webp, bmp, tif, jpg]) {
      const result = await handler({}, p, 100, 100)
      expect(result, `期望 ${p} 可解码`).not.toBeNull()
    }
  })

  it("channel 名称与 desktopApi 常量一致", () => {
    registerLocalImagePreviewIpc()
    expect(IPC_LOCAL_IMAGE_PREVIEW_CHANNEL).toBe(IPC_CHANNELS.LOAD_LOCAL_IMAGE_PREVIEW)
    expect(IPC_CHANNELS.LOAD_LOCAL_IMAGE_PREVIEW).toBe("desktop:load-local-image-preview")
  })

  it("maxWidth/maxHeight 必须为正整数（否则返回 null）", async () => {
    const jpegPath = join(workDir, "ok2.jpg")
    writeFakeJpeg(jpegPath)
    nativeImageCreateFromPath.mockReturnValue(makeMockImage(10, 10, "data:,"))
    registerLocalImagePreviewIpc()
    const handler = handlers.get(IPC_CHANNELS.LOAD_LOCAL_IMAGE_PREVIEW)!
    expect(await handler({}, jpegPath, 0, 0)).toBeNull()
    expect(await handler({}, jpegPath, -1, 100)).toBeNull()
    expect(await handler({}, jpegPath, 100, 1.5)).toBeNull() // 非整数
    expect(nativeImageCreateFromPath).not.toHaveBeenCalled()
  })
})
