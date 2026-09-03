import { afterEach, describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { usePreview } from "./usePreview"
import type { RenderSettings } from "../../settings/types"

/**
 * 本地预览超时兜底测试：
 * - 引擎 /api/preview 无响应超时后，降级到主进程 nativeImage 本地预览（JPEG/PNG/WebP）；
 * - RAW/HEIC 超时后不伪装成正常预览（currentImage 保持 null，等待引擎恢复）；
 * - 正常引擎响应不受超时影响。
 *
 * 通过 vi.mock 把 engineClient 的超时 getter 改为短超时，避免每个用例等默认 8s。
 * jsdom 不加载真实图片，用 FakeImage 桩模拟 dataURL 的 onload。
 */

vi.mock("../../../services/engine/engineClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../services/engine/engineClient")>()
  return {
    ...actual,
    getPreviewRequestTimeoutMs: () => 40,
    getEngineHealthTimeoutMs: () => 40
  }
})

const makeSettings = (): RenderSettings => ({
  borderColor: "#fff",
  borderTop: 10,
  borderBottom: 20,
  borderLeft: 10,
  borderRight: 10,
  borderStyle: null,
  textContent: "",
  textFontSize: 20,
  textColor: "#222",
  textPlacement: "bottom-center",
  textArea: "border",
  fontFamily: "sans-serif",
  textLayers: [
    { id: "l1", enabled: true, content: "{Camera}", fontFamily: "sans-serif", fontSize: 20, color: "#222", placement: "bottom-center", textArea: "border", marginX: 0, marginY: 20, backgroundEnabled: false, backgroundColor: "#000", backgroundPaddingX: 6, backgroundPaddingY: 3, shadowEnabled: false, shadowColor: "#000", shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, strokeEnabled: false, strokeColor: "#000", strokeWidth: 1 }
  ],
  gradient: { enabled: false, type: "linear", angle: 0, stops: [] },
  exportFormat: "jpeg",
  jpegQuality: 90,
  outputSizePreset: "original",
  customOutputLongEdge: 0,
  preserveMetadata: true,
  preserveColorProfile: true,
  preferHighBitDepth: false,
  logo: { enabled: false, mode: "auto-brand", brand: null, placement: "border-bottom-right", size: 48, colorMode: "auto-contrast" }
})

/** 永不 resolve 但尊重 abort 信号的 fetch 替身：引擎无响应场景。 */
const hangingFetch = (): void => {
  vi.stubGlobal("fetch", (_input: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("aborted", "TimeoutError"))
      })
    })
  )
}

/** jsdom 图片桩：dataURL 设置后触发 onload，供本地预览 dataURL 加载。 */
class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 0
  naturalHeight = 0
  private _src = ""
  set src(value: string) {
    this._src = value
    if (value.startsWith("data:")) {
      this.naturalWidth = 100
      this.naturalHeight = 80
      queueMicrotask(() => this.onload?.())
    } else {
      queueMicrotask(() => this.onerror?.())
    }
  }
  get src(): string {
    return this._src
  }
}

const installDesktopBridge = (loadLocal: () => unknown): void => {
  ;(window as unknown as { desktop?: unknown }).desktop = {
    loadLocalImagePreview: vi.fn(loadLocal)
  }
}

afterEach(() => {
  delete (window as unknown as { desktop?: unknown }).desktop
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("usePreview 超时降级到本地预览", () => {
  it("JPEG：引擎预览超时后降级到 nativeImage 本地预览（currentImage 被设置）", async () => {
    vi.stubGlobal("Image", FakeImage)
    hangingFetch()
    installDesktopBridge(() => ({
      dataUrl: "data:image/jpeg;base64,L0FBQUE=",
      width: 100,
      height: 80
    }))

    // settings 必须在 render 回调外创建：保持引用稳定，避免同步 effect 反复重跑
    const settings = makeSettings()
    const { result } = renderHook(() => usePreview("/photos/a.jpg", settings, 1))

    await waitFor(() => {
      const s = result.current
      expect(s.kind).toBe("active")
      if (s.kind === "active") {
        expect(s.currentImage).not.toBeNull()
      }
    }, { timeout: 4000 })
  })

  it("PNG/WebP 同样降级到本地预览", async () => {
    vi.stubGlobal("Image", FakeImage)
    hangingFetch()
    installDesktopBridge(() => ({
      dataUrl: "data:image/png;base64,aGVsbG8=",
      width: 80,
      height: 100
    }))

    const settings = makeSettings()
    const { result } = renderHook(() => usePreview("/photos/b.png", settings, 1))

    await waitFor(() => {
      const s = result.current
      expect(s.kind).toBe("active")
      if (s.kind === "active") {
        expect(s.currentImage).not.toBeNull()
      }
    }, { timeout: 4000 })
  })

  it("RAW：超时后不伪装成正常预览（currentImage 保持 null，等待引擎恢复）", async () => {
    vi.stubGlobal("Image", FakeImage)
    hangingFetch()
    // 即使桥接存在，RAW 也不走本地预览
    installDesktopBridge(() => ({
      dataUrl: "data:image/jpeg;base64,UkFX",
      width: 100,
      height: 80
    }))

    const settings = makeSettings()
    const { result } = renderHook(() => usePreview("/photos/c.NEF", settings, 1))

    // 等待引擎同步效果也超时（engineSyncStatus=error），此时 currentImage 仍为 null
    await waitFor(() => {
      const s = result.current
      if (s.kind === "active") {
        expect(s.engineSyncStatus).toBe("error")
        expect(s.currentImage).toBeNull()
      }
    }, { timeout: 4000 })
  })

  it("HEIC：超时后不伪装成正常预览（currentImage 保持 null）", async () => {
    vi.stubGlobal("Image", FakeImage)
    hangingFetch()
    installDesktopBridge(() => null)

    const settings = makeSettings()
    const { result } = renderHook(() => usePreview("/photos/d.heic", settings, 1))

    await waitFor(() => {
      const s = result.current
      if (s.kind === "active") {
        expect(s.engineSyncStatus).toBe("error")
        expect(s.currentImage).toBeNull()
      }
    }, { timeout: 4000 })
  })

  it("正常引擎响应不受超时影响（previewAvailable=false 时无引擎图）", async () => {
    vi.stubGlobal("Image", FakeImage)
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ status: "ok", message: "", previewAvailable: false, previewUrl: "" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    )
    installDesktopBridge(() => null)

    const settings = makeSettings()
    const { result } = renderHook(() => usePreview("/photos/e.jpg", settings, 1))

    // 引擎正常响应 → engineSyncStatus 为 synced（不超时、不降级本地）
    await waitFor(() => {
      const s = result.current
      if (s.kind === "active") {
        expect(s.engineSyncStatus).toBe("synced")
        expect(s.engineResponse?.previewAvailable).toBe(false)
      }
    }, { timeout: 4000 })
  })

  it("父组件每次重绘生成等值文字数组时不取消正在返回的引擎同步", async () => {
    vi.stubGlobal("Image", FakeImage)
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ status: "ok", message: "", previewAvailable: false, previewUrl: "" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    )
    installDesktopBridge(() => null)

    const settings = makeSettings()
    // 这里故意在每次 hook 重绘时创建新数组，模拟 WorkspacePage 对拍摄信息变量的解析结果。
    const { result } = renderHook(() => usePreview(
      "/photos/re-rendered-text-layers.jpg",
      settings,
      1,
      null,
      ["NIKON Z6"]
    ))

    await waitFor(() => {
      const state = result.current
      expect(state.kind).toBe("active")
      if (state.kind === "active") {
        expect(state.engineSyncStatus).toBe("synced")
      }
    })
  })

  it("引擎预览 URL 只接受同源相对路径，不拼接绝对 Java 地址", async () => {
    vi.stubGlobal("Image", FakeImage)
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ status: "ok", message: "", previewAvailable: false, previewUrl: "" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    )
    vi.stubGlobal("fetch", fetchMock)
    installDesktopBridge(() => null)

    const settings = makeSettings()
    const { result } = renderHook(() => usePreview("/photos/relative.jpg", settings, 1))

    await waitFor(() => {
      const state = result.current
      if (state.kind === "active") {
        expect(state.engineSyncStatus).toBe("synced")
      }
    })
    const calls = fetchMock.mock.calls as unknown[][]
    expect(calls.every((call) => !String(call[0]).startsWith("http://127.0.0.1"))).toBe(true)
  })

  it("切换当前图会主动取消旧的裸图和带配方预览请求，只保留最新请求", async () => {
    const signals: AbortSignal[] = []
    vi.stubGlobal("fetch", (_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        if (signal !== null && signal !== undefined) {
          signals.push(signal)
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true })
        }
      })
    )
    installDesktopBridge(() => null)

    const settings = makeSettings()
    const { rerender } = renderHook(
      ({ filePath }: { readonly filePath: string }) => usePreview(filePath, settings, 1),
      { initialProps: { filePath: "/photos/first.jpg" } }
    )

    await waitFor(() => expect(signals.length).toBeGreaterThanOrEqual(2))
    rerender({ filePath: "/photos/second.jpg" })

    await waitFor(() => {
      expect(signals.slice(0, 2).every((signal) => signal.aborted)).toBe(true)
    })
  })
})
