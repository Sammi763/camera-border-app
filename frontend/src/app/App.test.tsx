import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, waitFor } from "@testing-library/react"
import { App } from "./App"

/**
 * App 只负责装配运行时信息；JavaBridge 的绝对地址不再经过 preload/IPC 进入前端。
 * 所有引擎请求都应保持为同源相对路径，由 Vite 或 app:// 代理接管。
 */

const setRuntime = (): void => {
  ;(window as unknown as { desktopRuntime?: unknown }).desktopRuntime = {
    appName: "Camera Border",
    platform: "darwin",
    engine: { managed: true }
  }
}

/** 最小的 window.desktop 替身（WorkspacePage 渲染需要的白名单方法）。 */
const setDesktop = (): void => {
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
    openLogFile: vi.fn(async () => true)
  }
}

const stubFetch = (seenUrls: string[]): void => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    seenUrls.push(url)
    if (url.endsWith("/api/health")) {
      return new Response(JSON.stringify({ status: "ok", app: "test", version: "0" }), { status: 200 })
    }
    if (url.endsWith("/api/assets/film-stocks") || url.endsWith("/api/film-formats")) {
      return new Response("[]", { status: 200 })
    }
    if (url.endsWith("/api/dev/photos")) {
      return new Response(JSON.stringify({ photos: [] }), { status: 200 })
    }
    if (url.endsWith("/api/preview")) {
      return new Response(JSON.stringify({ status: "ok", message: "", previewAvailable: false, previewUrl: "" }), { status: 200 })
    }
    if (url.endsWith("/api/photo-metadata")) {
      return new Response(JSON.stringify({ error: "no metadata" }), { status: 404 })
    }
    return new Response(JSON.stringify({ error: `unexpected ${url}` }), { status: 404 })
  })
}

beforeEach(() => {
  ;(window as unknown as { desktopRuntime?: unknown }).desktopRuntime = undefined
  ;(window as unknown as { desktop?: unknown }).desktop = undefined
  vi.stubGlobal("URL.createObjectURL", () => "blob:fake")
  vi.stubGlobal("URL.revokeObjectURL", () => {})
})

afterEach(() => {
  delete (window as unknown as { desktopRuntime?: unknown }).desktopRuntime
  delete (window as unknown as { desktop?: unknown }).desktop
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("App 同源引擎代理装配", () => {
  it("不等待或同步 JavaBridge 地址，首屏直接装配工作台", async () => {
    setRuntime()
    setDesktop()
    const seenUrls: string[] = []
    stubFetch(seenUrls)

    const { container } = render(<App />)

    await waitFor(() => {
      expect(container.querySelector(".workspaceShell")).toBeTruthy()
    })
    expect(seenUrls.length).toBeGreaterThan(0)
    expect(seenUrls.every((url) => url.startsWith("/"))).toBe(true)
  })

  it("托管运行时也只通过同源请求访问引擎", async () => {
    setRuntime()
    setDesktop()
    const seenUrls: string[] = []
    stubFetch(seenUrls)

    const { container } = render(<App />)

    await waitFor(() => {
      expect(container.querySelector(".workspaceShell")).toBeTruthy()
    })
    expect(seenUrls.every((url) => url.startsWith("/"))).toBe(true)
  })
})
