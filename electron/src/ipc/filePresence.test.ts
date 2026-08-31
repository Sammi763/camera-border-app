import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const { ipcHandleMock } = vi.hoisted(() => ({ ipcHandleMock: vi.fn() }))

vi.mock("electron", () => ({
  ipcMain: { handle: (channel: string, handler: (...args: unknown[]) => unknown) => ipcHandleMock(channel, handler) }
}))

import {
  registerFilePresenceIpc,
  registerImageFileVersionIpc,
  IPC_FILE_PRESENCE_CHANNEL,
  IPC_FILE_VERSION_CHANNEL
} from "./filePresence"
import { IPC_CHANNELS } from "../types/desktopApi"

let handlers: Map<string, (...args: unknown[]) => unknown>
let workDir: string

beforeEach(() => {
  handlers = new Map()
  workDir = mkdtempSync(join(tmpdir(), "camborder-file-presence-"))
  ipcHandleMock.mockReset()
  ipcHandleMock.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler))
})

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
  vi.clearAllMocks()
})

describe("工作会话文件存在性 IPC", () => {
  it("只返回受支持绝对图片路径的常规文件存在性", async () => {
    const imagePath = join(workDir, "known.jpg")
    writeFileSync(imagePath, "sample")
    registerFilePresenceIpc()
    const handler = handlers.get(IPC_FILE_PRESENCE_CHANNEL)!
    await expect(handler({}, [imagePath, join(workDir, "missing.jpg"), "relative.jpg", join(workDir, "secret.txt")]))
      .resolves.toEqual([true, false, false, false])
  })

  it("拒绝超出上限或非数组输入，不执行任意路径检查", async () => {
    registerFilePresenceIpc()
    const handler = handlers.get(IPC_CHANNELS.CHECK_IMAGE_PATHS)!
    await expect(handler({}, "not-an-array")).resolves.toEqual([])
    await expect(handler({}, Array.from({ length: 201 }, () => "/tmp/a.jpg"))).resolves.toEqual([])
  })

  it("只返回受支持图片的 mtime 与字节数，非法路径对应 null", async () => {
    const imagePath = join(workDir, "versioned.jpg")
    writeFileSync(imagePath, "sample-version")
    registerImageFileVersionIpc()
    const handler = handlers.get(IPC_FILE_VERSION_CHANNEL)!

    const result = await handler({}, [imagePath, "relative.jpg", join(workDir, "secret.txt")]) as Array<{
      mtimeMs: number
      sizeBytes: number
    } | null>

    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({ sizeBytes: "sample-version".length })
    expect(result[0]?.mtimeMs).toEqual(expect.any(Number))
    expect(result.slice(1)).toEqual([null, null])
  })

  it("版本查询拒绝超出上限或非数组输入", async () => {
    registerImageFileVersionIpc()
    const handler = handlers.get(IPC_CHANNELS.GET_IMAGE_FILE_VERSIONS)!
    await expect(handler({}, "not-an-array")).resolves.toEqual([])
    await expect(handler({}, Array.from({ length: 201 }, () => "/tmp/a.jpg"))).resolves.toEqual([])
  })
})
