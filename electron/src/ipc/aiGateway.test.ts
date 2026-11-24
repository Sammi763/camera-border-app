import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ipcRenderer } from "electron"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AI_GATEWAY_ENV_KEY } from "../config/aiGatewayConfig.js"
import { exposeDesktopApi } from "../preload/exposeDesktopApi.js"
import { IPC_CHANNELS, type DesktopApi } from "../types/desktopApi.js"
import { registerAllIpc } from "./index.js"

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
  globals: new Map<string, unknown>(),
  getAppPath: vi.fn<() => string>(),
  getPath: vi.fn<(name: string) => string>()
}))

vi.mock("electron", () => ({
  app: { isPackaged: false, getAppPath: mocks.getAppPath, getPath: mocks.getPath },
  contextBridge: {
    exposeInMainWorld: (name: string, value: unknown) => mocks.globals.set(name, value)
  },
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) =>
      mocks.handlers.set(channel, handler)
  },
  ipcRenderer: {
    invoke: async (channel: string, ...args: unknown[]) => {
      const handler = mocks.handlers.get(channel)
      if (!handler) {
        throw new Error(`未注册 IPC 通道：${channel}`)
      }
      return handler({}, ...args)
    }
  }
}))

let workDir: string
let desktop: DesktopApi

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "camborder-ai-credentials-"))
  vi.stubEnv(AI_GATEWAY_ENV_KEY, undefined)
  mocks.getAppPath.mockReturnValue(join(workDir, "app"))
  mocks.getPath.mockReturnValue(join(workDir, "user-data"))
  registerAllIpc()
  exposeDesktopApi()
  desktop = mocks.globals.get("desktop") as DesktopApi
})

afterEach(() => {
  mocks.handlers.clear()
  mocks.globals.clear()
  vi.unstubAllEnvs()
  rmSync(workDir, { recursive: true, force: true })
})

describe("AI 网关凭据桥接", () => {
  it("渲染进程与主进程只保留凭据配置入口", () => {
    expect(desktop).not.toHaveProperty("aiGatewayRequest")
    expect(Object.values(IPC_CHANNELS)).not.toContain("ai-gateway:request")
    const gatewayChannels = [...mocks.handlers.keys()].filter((channel) => channel.startsWith("ai-gateway:"))
    expect(gatewayChannels.sort()).toEqual([
      "ai-gateway:delete-api-key",
      "ai-gateway:get-status",
      "ai-gateway:save-api-key"
    ])
  })

  it("可保存、读取脱敏状态并删除本地密钥", async () => {
    await expect(desktop.getAiGatewayStatus()).resolves.toMatchObject({
      configured: false, source: "none", maskedKey: null
    })

    await expect(desktop.saveAiGatewayApiKey(" abcd-test-credential-wxyz ")).resolves.toEqual({ ok: true })
    const status = await desktop.getAiGatewayStatus()
    expect(status).toMatchObject({ configured: true, source: "user-data", maskedKey: "abcd…wxyz" })
    expect(status).not.toHaveProperty("apiKey")

    await expect(desktop.deleteAiGatewayApiKey()).resolves.toEqual({ ok: true })
    await expect(desktop.getAiGatewayStatus()).resolves.toMatchObject({
      configured: false, source: "none", maskedKey: null
    })
  })

  it.each([undefined, null, "", " \t ", 42, {}])("拒绝无效密钥输入 %j", async (input) => {
    await expect(ipcRenderer.invoke(IPC_CHANNELS.AI_GATEWAY_SAVE_API_KEY, input)).resolves.toEqual({ ok: false })
    await expect(desktop.getAiGatewayStatus()).resolves.toMatchObject({
      configured: false, source: "none", maskedKey: null
    })
  })
})
