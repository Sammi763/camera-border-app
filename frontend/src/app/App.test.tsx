import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, screen, waitFor } from "@testing-library/react"
import { App } from "./App"
import { getResolvedBaseUrl, resetResolvedBaseUrl } from "../services/engine/engineClient"

/**
 * App 首屏时序测试：
 * - 动态引擎地址同步（getEngineBaseUrl IPC）完成前不渲染工作台（返回 null），
 *   避免首屏健康检查/预览/EXIF/导出命中旧 8099；
 * - 同步完成后渲染工作台，且 engineClient 已指向实际端口；
 * - 浏览器模式（无 window.desktop / 无 getEngineBaseUrl）立即渲染不阻塞。
 */

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const setRuntime = (baseUrl: string): void => {
  ;(window as unknown as { desktopRuntime?: unknown }).desktopRuntime = {
    appName: "Camera Border",
    platform: "darwin",
    engine: { managed: true, baseUrl }
  }
}

/** 最小的 window.desktop 替身（WorkspacePage 渲染需要的白名单方法）。 */
const setDesktop = (overrides: Record<string, unknown> = {}): void => {
  ;(window as unknown as { desktop?: unknown }).desktop = {
    selectImages: vi.fn(async () => []),
    selectImageSources: vi.fn(async () => null),
    selectImageFiles: vi.fn(async () => []),
    selectImageFolder: vi.fn(async () => null),
    selectExportPath: vi.fn(async () => null),
    selectExportDirectory: vi.fn(async () => null),
    readTemplates: vi.fn(async () => "[]"),
    writeTemplates: vi.fn(async () => {}),
    readAssets: vi.fn(async () => "[]"),
    writeAssets: vi.fn(async () => {}),
    readRolls: vi.fn(async () => "[]"),
    writeRolls: vi.fn(async () => {}),
    readPresets: vi.fn(async () => "[]"),
    writePresets: vi.fn(async () => {}),
    exportTemplateJson: vi.fn(async () => null),
    importTemplateJson: vi.fn(async () => null),
    convertHeicFiles: vi.fn(async (paths: readonly string[]) => paths),
    listSystemFonts: vi.fn(async () => []),
    openDirectory: vi.fn(async () => true),
    getEngineDiagnostics: vi.fn(async () => null),
    retryEngineStart: vi.fn(async () => true),
    showNotification: vi.fn(async () => true),
    loadLocalImagePreview: vi.fn(async () => null),
    openLogFile: vi.fn(async () => true),
    ...overrides
  }
}

/** WorkspacePage 挂载后触发的引擎/资产请求桩。 */
const stubFetch = (): void => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    if (url.endsWith("/api/health")) {
      return jsonResponse({ status: "ok", app: "test", version: "0" })
    }
    if (url.endsWith("/api/assets/film-stocks") || url.endsWith("/api/film-formats")) {
      return jsonResponse([])
    }
    if (url.endsWith("/api/dev/photos")) {
      return jsonResponse({ photos: [] })
    }
    if (url.endsWith("/api/preview")) {
      return jsonResponse({ status: "ok", message: "", previewAvailable: false, previewUrl: "" })
    }
    if (url.endsWith("/api/photo-metadata")) {
      return jsonResponse({ error: "no metadata" }, 404)
    }
    return jsonResponse({ error: `unexpected ${url}` }, 404)
  })
}

beforeEach(() => {
  resetResolvedBaseUrl()
  ;(window as unknown as { desktopRuntime?: unknown }).desktopRuntime = undefined
  ;(window as unknown as { desktop?: unknown }).desktop = undefined
  vi.stubGlobal("URL.createObjectURL", () => "blob:fake")
  vi.stubGlobal("URL.revokeObjectURL", () => {})
})

afterEach(() => {
  vi.useRealTimers()
  delete (window as unknown as { desktopRuntime?: unknown }).desktopRuntime
  delete (window as unknown as { desktop?: unknown }).desktop
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("App 首屏引擎地址同步", () => {
  it("同步完成前不渲染工作台，完成后渲染且 engineClient 指向实际端口", async () => {
    setRuntime("http://127.0.0.1:8099")
    let releaseGate: ((url: string) => void) | undefined
    const gate = new Promise<string>((resolve) => {
      releaseGate = resolve
    })
    setDesktop({ getEngineBaseUrl: vi.fn(() => gate) })
    stubFetch()

    const { container } = render(<App />)
    // 同步完成前：不渲染工作台（首屏请求不会命中旧端口）
    expect(container.firstChild).toBeNull()

    // 完成动态端口同步 → 渲染工作台
    releaseGate!("http://127.0.0.1:8123")
    await waitFor(() => {
      expect(container.querySelector(".workspaceShell")).toBeTruthy()
    })
    // engineClient 已指向实际端口
    expect(getResolvedBaseUrl()).toBe("http://127.0.0.1:8123")
  })

  it("浏览器模式（无 getEngineBaseUrl）立即渲染不阻塞首屏", async () => {
    setRuntime("http://127.0.0.1:8099")
    // 不提供 getEngineBaseUrl（旧 preload / 浏览器降级）
    setDesktop({})
    stubFetch()

    const { container } = render(<App />)
    await waitFor(() => {
      expect(container.querySelector(".workspaceShell")).toBeTruthy()
    })
    expect(container.firstChild).not.toBeNull()
    // 无桥接时保留默认地址
    expect(getResolvedBaseUrl()).toBe("http://127.0.0.1:8099")
  })

  it("同步超过兜底后才返回真实地址时，会重新触发首屏引擎请求", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setRuntime("http://127.0.0.1:8099")
    let releaseGate: ((url: string) => void) | undefined
    const gate = new Promise<string>((resolve) => {
      releaseGate = resolve
    })
    setDesktop({ getEngineBaseUrl: vi.fn(() => gate) })

    const healthRequests: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input)
      if (url.endsWith("/api/health")) {
        healthRequests.push(url)
        return jsonResponse({ status: "ok", app: "test", version: "0" })
      }
      if (url.endsWith("/api/assets/film-stocks")) {
        return jsonResponse([])
      }
      return jsonResponse({ error: `unexpected ${url}` }, 404)
    }))

    const { container } = render(<App />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    await waitFor(() => {
      expect(container.querySelector(".workspaceShell")).toBeTruthy()
    })
    const requestsBeforeSync = healthRequests.length
    expect(requestsBeforeSync).toBeGreaterThan(0)

    releaseGate!("http://127.0.0.1:8123")
    await waitFor(() => {
      expect(getResolvedBaseUrl()).toBe("http://127.0.0.1:8123")
      expect(healthRequests.length).toBeGreaterThan(requestsBeforeSync)
    })
  })
})
