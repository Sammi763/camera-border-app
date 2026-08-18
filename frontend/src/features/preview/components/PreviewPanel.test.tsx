import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { PreviewPanel } from "./PreviewPanel"
import type { PreviewState } from "../types"
import type { RenderSettings } from "../../settings/types"
import type { QueueItem } from "../../queue/types"

/**
 * 单图导出的集成测试：
 * - 导出前先等待 EXIF（prepareExifForExport 被调用且先于 render-jobs 请求）；
 * - 单图导出与批量导出共用 resolveQueueItem 解析（同一套有效摄影信息）；
 * - RenderRecipe 的 texts 使用解析后的变量值。
 */

const makeSettings = (): RenderSettings => ({
  borderColor: "#ffffff",
  borderTop: 40,
  borderBottom: 80,
  borderLeft: 40,
  borderRight: 40,
  textContent: "",
  textFontSize: 20,
  textColor: "#222222",
  textPlacement: "bottom-center",
  textArea: "border",
  fontFamily: "sans-serif",
  textLayers: [
    { id: "l1", enabled: true, content: "{Camera} · {Lens}", fontFamily: "sans-serif", fontSize: 20, color: "#222", placement: "bottom-center", textArea: "border", marginX: 0, marginY: 20, backgroundEnabled: false, backgroundColor: "#000", backgroundPaddingX: 6, backgroundPaddingY: 3, shadowEnabled: false, shadowColor: "#000", shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, strokeEnabled: false, strokeColor: "#000", strokeWidth: 1 },
    { id: "l2", enabled: true, content: "{CaptureFormat} · {Film}", fontFamily: "sans-serif", fontSize: 16, color: "#666", placement: "bottom-center", textArea: "border", marginX: 0, marginY: 45, backgroundEnabled: false, backgroundColor: "#000", backgroundPaddingX: 6, backgroundPaddingY: 3, shadowEnabled: false, shadowColor: "#000", shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, strokeEnabled: false, strokeColor: "#000", strokeWidth: 1 },
    { id: "l3", enabled: false, content: "", fontFamily: "sans-serif", fontSize: 14, color: "#888", placement: "top-center", textArea: "border", marginX: 0, marginY: 8, backgroundEnabled: false, backgroundColor: "#000", backgroundPaddingX: 6, backgroundPaddingY: 3, shadowEnabled: false, shadowColor: "#000", shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, strokeEnabled: false, strokeColor: "#000", strokeWidth: 1 }
  ],
  autoCrop: false,
  filmFormat: null,
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

const FILE_PATH = "/photos/A.jpg"

const makeActiveState = (): PreviewState => ({
  kind: "active",
  filePath: FILE_PATH,
  fileName: "A.jpg",
  // jsdom 中的真实 img 元素（naturalWidth 为 0，Canvas 渲染有 getContext null 保护）
  currentImage: document.createElement("img"),
  engineDisplayUrl: null,
  engineSyncStatus: "idle",
  engineResponse: null
})

const makeItem = (): QueueItem => ({
  id: "q1",
  filePath: FILE_PATH,
  fileName: "A.jpg",
  isSelected: true,
  sourcePath: FILE_PATH,
  sourceFormat: "jpg",
  converted: false,
  workingFormat: "jpg",
  textOverride: null,
  presetId: null,
  identityOverride: null
})

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

describe("PreviewPanel 单图导出（EXIF 等待 + 解析一致）", () => {
  beforeEach(() => {
    // CanvasPreview 依赖 ResizeObserver / URL.createObjectURL，jsdom 需要桩
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub)
    vi.stubGlobal("URL.createObjectURL", () => "blob:fake")
    vi.stubGlobal("URL.revokeObjectURL", () => {})
  })

  afterEach(() => {
    delete (window as unknown as { desktop?: unknown }).desktop
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("导出前等待 EXIF，并用 resolveQueueItem 的解析结果构建 RenderRecipe", async () => {
    const renderJobBodies: { recipe: { imagePath: string; texts: readonly { content: string }[] } }[] = []
    const callLog: string[] = []

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input)
      if (url.endsWith("/api/render-jobs") && init?.method === "POST") {
        const body = JSON.parse(String(init?.body)) as { recipe: { imagePath: string; texts: readonly { content: string }[] } }
        callLog.push("job")
        renderJobBodies.push(body)
        return jsonResponse({ jobId: "job-1", status: "completed", outputPath: "/tmp/out/single.jpg", actualFormat: "jpeg" })
      }
      if (url.endsWith("/api/preview")) {
        return jsonResponse({ status: "ok", message: "", previewAvailable: false, previewUrl: "" })
      }
      return jsonResponse({ error: `unexpected ${url}` }, 404)
    })
    vi.stubGlobal("fetch", fetchMock)

    ;(window as unknown as { desktop?: unknown }).desktop = {
      selectExportPath: vi.fn(async () => "/tmp/out/single.jpg")
    }

    let releasePrepare: (() => void) | undefined
    const prepareGate = new Promise<void>((resolve) => {
      releasePrepare = resolve
    })
    const prepareExifForExport = vi.fn(async (paths: readonly string[]) => {
      callLog.push(`prepare:${paths.join(",")}`)
      await prepareGate
    })
    const resolveQueueItem = vi.fn(() => ({
      textOverride: null,
      resolvedLayers: ["NIKON Z6 · Nikkor 50mm", "6×10"],
      brand: null
    }))

    render(
      <PreviewPanel
        state={makeActiveState()}
        settings={makeSettings()}
        hasSelectedImage={true}
        queueItems={[makeItem()]}
        resolveQueueItem={resolveQueueItem}
        prepareExifForExport={prepareExifForExport}
      />
    )

    const exportButton = screen.getByRole("button", { name: "导出原图" }) as HTMLButtonElement
    fireEvent.click(exportButton)

    await waitFor(() => {
      expect(exportButton.disabled).toBe(true)
    })
    expect(screen.getByText("正在读取 EXIF…")).toBeTruthy()
    expect(renderJobBodies).toHaveLength(0)
    releasePrepare?.()

    await waitFor(() => {
      expect(renderJobBodies).toHaveLength(1)
    })

    // 1) 先等待 EXIF 再导出
    expect(prepareExifForExport).toHaveBeenCalledWith([FILE_PATH])
    expect(callLog.indexOf("prepare:/photos/A.jpg")).toBeLessThan(callLog.indexOf("job"))

    // 2) 单图导出与批量导出共用 resolveQueueItem 解析
    expect(resolveQueueItem).toHaveBeenCalledWith(expect.objectContaining({ filePath: FILE_PATH }))

    // 3) RenderRecipe 使用解析后的变量值
    const recipe = renderJobBodies[0]!.recipe
    expect(recipe.imagePath).toBe(FILE_PATH)
    expect(recipe.texts.map((t) => t.content)).toEqual(["NIKON Z6 · Nikkor 50mm", "6×10"])
  })

  it("批量导出读取 EXIF 期间禁用批量按钮", async () => {
    let releasePrepare: (() => void) | undefined
    const prepareGate = new Promise<void>((resolve) => {
      releasePrepare = resolve
    })
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input)
      if (url.endsWith("/api/render-jobs") && init?.method === "POST") {
        return jsonResponse({ jobId: "job-1", status: "completed", outputPath: "/tmp/out/batch.jpg", actualFormat: "jpeg" })
      }
      return jsonResponse({ error: `unexpected ${url}` }, 404)
    })
    vi.stubGlobal("fetch", fetchMock)
    ;(window as unknown as { desktop?: unknown }).desktop = {
      selectExportDirectory: vi.fn(async () => "/tmp/out")
    }

    const secondItem = {
      ...makeItem(),
      id: "q2",
      filePath: "/photos/B.jpg",
      fileName: "B.jpg",
      sourcePath: "/photos/B.jpg"
    }
    render(
      <PreviewPanel
        state={makeActiveState()}
        settings={makeSettings()}
        hasSelectedImage={true}
        queueItems={[makeItem(), secondItem]}
        resolveQueueItem={vi.fn(() => ({ textOverride: null, resolvedLayers: [], brand: null }))}
        prepareExifForExport={vi.fn(async () => { await prepareGate })}
      />
    )

    const batchButton = screen.getByRole("button", { name: "批量导出 2 张" }) as HTMLButtonElement
    fireEvent.click(batchButton)

    await waitFor(() => {
      expect(batchButton.disabled).toBe(true)
    })
    expect(screen.getByText("正在读取 EXIF…")).toBeTruthy()
    releasePrepare?.()
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
  })

  it("无队列条目时单图导出仍可用（预览态即有 recipe 来源）", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input)
      if (url.endsWith("/api/render-jobs") && init?.method === "POST") {
        return jsonResponse({ jobId: "job-1", status: "completed", outputPath: "/tmp/out/single.jpg", actualFormat: "jpeg" })
      }
      return jsonResponse({ error: "unexpected" }, 404)
    })
    vi.stubGlobal("fetch", fetchMock)
    ;(window as unknown as { desktop?: unknown }).desktop = {
      selectExportPath: vi.fn(async () => "/tmp/out/single.jpg")
    }

    render(
      <PreviewPanel
        state={makeActiveState()}
        settings={makeSettings()}
        hasSelectedImage={true}
        queueItems={[]}
        resolveQueueItem={vi.fn()}
        prepareExifForExport={vi.fn(async () => {})}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "导出原图" }))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/render-jobs"), expect.anything())
    })
  })
})
