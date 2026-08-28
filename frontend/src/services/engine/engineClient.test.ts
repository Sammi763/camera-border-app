import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 动态端口同步测试：
 * - getResolvedBaseUrl 反映 setBaseUrl 写入的实际地址（含 JavaBridge 自动选择的端口）；
 * - syncEngineBaseUrl 通过 window.desktop.getEngineBaseUrl 拉取实际地址并写入；
 * - 非法地址 / 同步失败 / 无桥接时安全降级，不影响现有地址。
 *
 * 每个用例用 vi.resetModules + 动态 import 拿到全新模块状态，避免 currentBaseUrl 跨用例残留。
 */

const loadClient = async (): Promise<typeof import("./engineClient")> => {
  vi.resetModules()
  return await import("./engineClient")
}

describe("engineClient 动态端口同步", () => {
  beforeEach(() => {
    delete (window as unknown as { desktop?: unknown }).desktop
    delete (window as unknown as { desktopRuntime?: unknown }).desktopRuntime
  })

  afterEach(() => {
    delete (window as unknown as { desktop?: unknown }).desktop
    delete (window as unknown as { desktopRuntime?: unknown }).desktopRuntime
  })

  it("默认地址：desktopRuntime.engine.baseUrl 优先，否则回退 8099", async () => {
    ;(window as unknown as { desktopRuntime?: unknown }).desktopRuntime = {
      appName: "t", platform: "darwin",
      engine: { managed: true, baseUrl: "http://127.0.0.1:8123" }
    }
    const client = await loadClient()
    expect(client.getResolvedBaseUrl()).toBe("http://127.0.0.1:8123")

    delete (window as unknown as { desktopRuntime?: unknown }).desktopRuntime
    const client2 = await loadClient()
    expect(client2.getResolvedBaseUrl()).toBe("http://127.0.0.1:8099")
  })

  it("setBaseUrl 写入实际地址（动态端口同步结果）", async () => {
    const client = await loadClient()
    client.setBaseUrl("http://127.0.0.1:8765")
    expect(client.getResolvedBaseUrl()).toBe("http://127.0.0.1:8765")
  })

  it("setBaseUrl 非法地址被忽略（保留现有值）", async () => {
    const client = await loadClient()
    client.setBaseUrl("http://127.0.0.1:8765")
    client.setBaseUrl("not-a-url")
    client.setBaseUrl("")
    client.setBaseUrl("ftp://127.0.0.1:21")
    expect(client.getResolvedBaseUrl()).toBe("http://127.0.0.1:8765")
  })

  it("syncEngineBaseUrl 通过 bridge 拉取实际端口并写入", async () => {
    const client = await loadClient()
    ;(window as unknown as { desktop?: unknown }).desktop = {
      getEngineBaseUrl: vi.fn(async () => "http://127.0.0.1:8822")
    }
    await expect(client.syncEngineBaseUrl()).resolves.toBe("http://127.0.0.1:8822")
    expect(client.getResolvedBaseUrl()).toBe("http://127.0.0.1:8822")
  })

  it("syncEngineBaseUrl 无桥接时为 no-op（保留现有地址）", async () => {
    const client = await loadClient()
    client.setBaseUrl("http://127.0.0.1:8901")
    await expect(client.syncEngineBaseUrl()).resolves.toBeNull()
    expect(client.getResolvedBaseUrl()).toBe("http://127.0.0.1:8901")
  })

  it("syncEngineBaseUrl 桥接报错时静默保留现有地址", async () => {
    const client = await loadClient()
    client.setBaseUrl("http://127.0.0.1:8902")
    ;(window as unknown as { desktop?: unknown }).desktop = {
      getEngineBaseUrl: vi.fn(async () => { throw new Error("ipc failed") })
    }
    await expect(client.syncEngineBaseUrl()).resolves.toBeNull()
    expect(client.getResolvedBaseUrl()).toBe("http://127.0.0.1:8902")
  })

  it("syncEngineBaseUrl 返回非法地址时忽略", async () => {
    const client = await loadClient()
    client.setBaseUrl("http://127.0.0.1:8903")
    ;(window as unknown as { desktop?: unknown }).desktop = {
      getEngineBaseUrl: vi.fn(async () => "not-a-url")
    }
    await expect(client.syncEngineBaseUrl()).resolves.toBeNull()
    expect(client.getResolvedBaseUrl()).toBe("http://127.0.0.1:8903")
  })
})
