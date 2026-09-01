import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { buildExportSummary, useExportController } from "./useExportController"
import type { PreviewState } from "../types"
import type { QueueItem } from "../../queue/types"
import type { RenderSettings } from "../../settings/types"

const first: QueueItem = {
  id: "first",
  filePath: "/photos/first.jpg",
  fileName: "first.jpg",
  sourcePath: "/photos/first.jpg",
  sourceFormat: "jpg",
  converted: false,
  workingFormat: "jpg",
  textOverride: null,
  presetId: null,
  identityOverride: null
}

const second: QueueItem = { ...first, id: "second", filePath: "/photos/second.jpg", fileName: "second.jpg", sourcePath: "/photos/second.jpg" }

const state: PreviewState = {
  kind: "active",
  filePath: first.filePath,
  fileName: first.fileName,
  currentImage: null,
  engineDisplayUrl: null,
  engineSyncStatus: "synced",
  engineResponse: null
}

const settings = (borderTop: number): RenderSettings => ({
  borderColor: "#ffffff",
  borderTop,
  borderBottom: 20,
  borderLeft: 20,
  borderRight: 20,
  textContent: "",
  textFontSize: 24,
  textColor: "#000000",
  textPlacement: "bottom-center",
  textArea: "image",
  fontFamily: "sans-serif",
  textLayers: [],
  autoCrop: false,
  filmFormat: null,
  gradient: { enabled: false, type: "linear", angle: 0, stops: [] },
  borderStyle: null,
  exportFormat: "png",
  jpegQuality: 95,
  outputSizePreset: "original",
  customOutputLongEdge: 2048,
  preserveMetadata: false,
  preserveColorProfile: false,
  preferHighBitDepth: false,
  logo: { enabled: false, mode: "auto-brand", brand: null, placement: "border-top-right", size: 14, colorMode: "auto-contrast" }
})

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

afterEach(() => {
  delete (window as unknown as { desktop?: unknown }).desktop
  vi.unstubAllGlobals()
})

describe("useExportController", () => {
  it("批量失败项的可选专业结果为 null 时仍能归并终态", () => {
    expect(buildExportSummary({
      metadataPreservation: null,
      colorProfilePreservation: null,
      highBitDepth: null,
      sourceDecode: null
    })).toEqual([])
  })

  it("在选择目录和读取 EXIF 期间冻结图片范围、RenderRecipe 和 ExportSettings", async () => {
    let releaseExif!: () => void
    const prepareExifForExport = vi.fn(() => new Promise<void>((resolve) => { releaseExif = resolve }))
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({
      jobId: "job-1",
      status: "completed",
      total: 2,
      completed: 2,
      items: [
        { index: 0, status: "completed", outputPath: "/exports/first-border.png", actualFormat: "png" },
        { index: 1, status: "completed", outputPath: "/exports/second-border.png", actualFormat: "png" }
      ]
    }, 202))
    vi.stubGlobal("fetch", fetchMock)
    ;(window as unknown as { desktop?: unknown }).desktop = {
      selectExportDirectory: vi.fn(async () => "/exports")
    }

    const resolveQueueItem = vi.fn(() => ({ textOverride: null, resolvedLayers: [], brand: null }))
    const { result, rerender } = renderHook(
      ({ currentSettings, targets }) => useExportController({
        state,
        settings: currentSettings,
        queueItems: [first, second],
        batchExportItems: targets,
        resolveQueueItem,
        prepareExifForExport,
        autoOpenExportDirectory: false,
        engineAvailable: true
      }),
      { initialProps: { currentSettings: settings(20), targets: [first, second] as readonly QueueItem[] } }
    )

    let pending: Promise<void>
    act(() => {
      pending = result.current.startBatchExport()
    })
    await waitFor(() => expect(prepareExifForExport).toHaveBeenCalledWith([first.filePath, second.filePath]))

    // 用户在等待期间继续编辑并改变选中范围；已启动任务不可被这些变化影响。
    rerender({ currentSettings: settings(999), targets: [first] })
    releaseExif()
    await act(async () => { await pending! })

    const request = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))
    expect(request.items).toHaveLength(2)
    expect(request.items.map((item: { recipe: { imagePath: string } }) => item.recipe.imagePath))
      .toEqual([first.filePath, second.filePath])
    expect(request.items[0].recipe.border.top).toBe(20)
    expect(request.items[1].recipe.border.top).toBe(20)
    expect(result.current.batch.kind).toBe("completed")
  })

  it("取消单图任务后立即显示已取消，而不是继续显示渲染中", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        return jsonResponse({
          jobId: "job-single",
          status: "cancelled",
          total: 1,
          cancelled: 1,
          items: [{ index: 0, status: "cancelled", error: "任务已取消，未执行" }]
        })
      }
      if (init?.method === "POST") {
        return jsonResponse({
          jobId: "job-single",
          status: "queued",
          total: 1,
          items: [{ index: 0, status: "queued" }]
        }, 202)
      }
      return jsonResponse({
        jobId: "job-single",
        status: "cancelled",
        total: 1,
        cancelled: 1,
        items: [{ index: 0, status: "cancelled", error: "任务已取消，未执行" }]
      })
    })
    vi.stubGlobal("fetch", fetchMock)
    ;(window as unknown as { desktop?: unknown }).desktop = {
      selectExportPath: vi.fn(async () => "/exports/first.png")
    }

    const { result } = renderHook(() => useExportController({
      state,
      settings: settings(20),
      queueItems: [first],
      batchExportItems: [first],
      resolveQueueItem: vi.fn(() => ({ textOverride: null, resolvedLayers: [], brand: null })),
      prepareExifForExport: vi.fn(async () => {}),
      autoOpenExportDirectory: false,
      engineAvailable: true
    }))

    let pending: Promise<void>
    act(() => {
      pending = result.current.startSingleExport()
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/render-jobs"),
      expect.objectContaining({ method: "POST" })
    ))

    await act(async () => {
      await result.current.cancelActiveExport()
    })
    expect(result.current.single).toMatchObject({ kind: "cancelled" })
    await act(async () => { await pending! })
  })

  it("取消批量任务立即收敛到已取消并保留逐项结果", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        return jsonResponse({
          jobId: "job-batch",
          status: "cancelled",
          total: 2,
          completed: 0,
          failed: 0,
          cancelled: 2,
          items: [
            { index: 0, status: "cancelled", error: "任务已取消，未执行" },
            { index: 1, status: "cancelled", error: "任务已取消，未执行" }
          ]
        })
      }
      if (init?.method === "POST") {
        return jsonResponse({
          jobId: "job-batch",
          status: "queued",
          total: 2,
          items: [{ index: 0, status: "queued" }, { index: 1, status: "queued" }]
        }, 202)
      }
      return jsonResponse({
        jobId: "job-batch",
        status: "cancelled",
        total: 2,
        cancelled: 2,
        items: [
          { index: 0, status: "cancelled", error: "任务已取消，未执行" },
          { index: 1, status: "cancelled", error: "任务已取消，未执行" }
        ]
      })
    })
    vi.stubGlobal("fetch", fetchMock)
    ;(window as unknown as { desktop?: unknown }).desktop = {
      selectExportDirectory: vi.fn(async () => "/exports")
    }

    const { result } = renderHook(() => useExportController({
      state,
      settings: settings(20),
      queueItems: [first, second],
      batchExportItems: [first, second],
      resolveQueueItem: vi.fn(() => ({ textOverride: null, resolvedLayers: [], brand: null })),
      prepareExifForExport: vi.fn(async () => {}),
      autoOpenExportDirectory: false,
      engineAvailable: true
    }))

    let pending: Promise<void>
    act(() => {
      pending = result.current.startBatchExport()
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/render-jobs"),
      expect.objectContaining({ method: "POST" })
    ))

    await act(async () => {
      await result.current.cancelActiveExport()
    })
    expect(result.current.batch).toMatchObject({ kind: "cancelled", total: 2, cancelled: 2 })
    await act(async () => { await pending! })
  })
})
