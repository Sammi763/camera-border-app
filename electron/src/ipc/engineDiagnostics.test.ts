import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { JavaBridge } from "../engine/JavaBridge"

/**
 * 引擎诊断 IPC 测试：
 * - GET_ENGINE_BASE_URL：托管模式返回 JavaBridge 实际 baseUrl（含动态端口）；
 *   未托管返回配置端口；
 * - OPEN_LOG_FILE：只允许打开 userData/logs 下的常规文件；目录外路径返回 false。
 *
 * 通过 vi.mock 模拟 electron（ipcMain / shell / app）与 managedEngine 单例。
 */

const { ipcHandleMock, shellOpenPathMock, appGetPathMock } = vi.hoisted(() => ({
  ipcHandleMock: vi.fn(),
  shellOpenPathMock: vi.fn(),
  appGetPathMock: vi.fn()
}))

let handlers: Map<string, (...args: unknown[]) => unknown>

vi.mock("electron", () => {
  return {
    ipcMain: {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
        ipcHandleMock(channel, handler)
      }
    },
    shell: {
      openPath: (path: string) => shellOpenPathMock(path)
    },
    app: {
      getPath: (name: string) => appGetPathMock(name)
    }
  }
})

import { registerEngineDiagnosticsIpc } from "./engineDiagnostics"
import { setManagedEngine } from "../engine/managedEngine"
import { IPC_CHANNELS } from "../types/desktopApi"

/** 构造一个只实现了 getActualBaseUrl 的最小 bridge 替身。 */
const makeFakeBridge = (baseUrl: string): Pick<JavaBridge, "getActualBaseUrl"> & Record<string, unknown> => ({
  getActualBaseUrl: () => baseUrl
})

let workDir: string

beforeEach(() => {
  handlers = new Map()
  ipcHandleMock.mockClear()
  shellOpenPathMock.mockReset()
  appGetPathMock.mockReset()
  ipcHandleMock.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
    handlers.set(channel, handler)
  })
  workDir = mkdtempSync(join(tmpdir(), "engine-diagnostics-test-"))
})

afterEach(() => {
  vi.clearAllMocks()
  rmSync(workDir, { recursive: true, force: true })
})

describe("引擎诊断 IPC", () => {
  it("GET_ENGINE_BASE_URL：托管模式返回 JavaBridge 实际 baseUrl（含动态端口）", async () => {
    // 托管：bridge 已把默认端口换成空闲端口
    setManagedEngine(
      makeFakeBridge("http://127.0.0.1:8457") as unknown as JavaBridge,
      { baseUrl: "http://127.0.0.1:8099" } as never
    )
    registerEngineDiagnosticsIpc()
    const handler = handlers.get(IPC_CHANNELS.GET_ENGINE_BASE_URL)!
    const result = await handler()
    expect(result).toBe("http://127.0.0.1:8457")
  })

  it("GET_ENGINE_BASE_URL：未托管返回配置端口（engineBaseUrl）", async () => {
    registerEngineDiagnosticsIpc()
    const handler = handlers.get(IPC_CHANNELS.GET_ENGINE_BASE_URL)!
    const result = await handler() as string
    expect(result).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
  })

  it("OPEN_LOG_FILE：允许打开 userData/logs 下的常规文件", async () => {
    const logsRoot = join(workDir, "logs")
    mkdirSync(logsRoot, { recursive: true })
    const logPath = join(logsRoot, "engine.log")
    writeFileSync(logPath, "log content")
    appGetPathMock.mockReturnValue(workDir) // userData = workDir → logs = workDir/logs
    shellOpenPathMock.mockResolvedValue("")

    registerEngineDiagnosticsIpc()
    const handler = handlers.get(IPC_CHANNELS.OPEN_LOG_FILE)!
    expect(await handler({}, logPath)).toBe(true)
    expect(shellOpenPathMock).toHaveBeenCalledWith(logPath)
  })

  it("OPEN_LOG_FILE：日志目录外的文件拒绝打开", async () => {
    const logsRoot = join(workDir, "logs")
    mkdirSync(logsRoot, { recursive: true })
    const outside = join(workDir, "secret.txt")
    writeFileSync(outside, "secret")
    appGetPathMock.mockReturnValue(workDir)

    registerEngineDiagnosticsIpc()
    const handler = handlers.get(IPC_CHANNELS.OPEN_LOG_FILE)!
    expect(await handler({}, outside)).toBe(false)
    expect(shellOpenPathMock).not.toHaveBeenCalled()
  })

  it("OPEN_LOG_FILE：路径穿越（../）拒绝打开", async () => {
    const logsRoot = join(workDir, "logs")
    mkdirSync(logsRoot, { recursive: true })
    writeFileSync(join(workDir, "secret.txt"), "secret")
    appGetPathMock.mockReturnValue(workDir)

    registerEngineDiagnosticsIpc()
    const handler = handlers.get(IPC_CHANNELS.OPEN_LOG_FILE)!
    // logs/../secret.txt 经 resolve 后在 logs 外
    expect(await handler({}, join(logsRoot, "..", "secret.txt"))).toBe(false)
    expect(shellOpenPathMock).not.toHaveBeenCalled()
  })

  it("OPEN_LOG_FILE：非字符串参数拒绝", async () => {
    appGetPathMock.mockReturnValue(workDir)
    registerEngineDiagnosticsIpc()
    const handler = handlers.get(IPC_CHANNELS.OPEN_LOG_FILE)!
    expect(await handler({}, undefined)).toBe(false)
    expect(await handler({}, 123)).toBe(false)
    expect(shellOpenPathMock).not.toHaveBeenCalled()
  })
})
