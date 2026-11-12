import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { effectiveExportFormat, buildExportSummary, buildNamingPreview, useExportController } from "./useExportController"
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
  it("底片输出组合决定扩展名，混合批次按每张图选择格式", () => {
    const processing = {} as NonNullable<QueueItem["imageProcessing"]>
    const configured = { ...settings(20), filmOutput: "tiff16-rec2020" as const }
    expect(effectiveExportFormat(configured, processing)).toBe("tiff")
    expect(effectiveExportFormat(configured, null)).toBe("png")
    expect(buildNamingPreview([first,second],{mode:"original-suffix",prefix:""}, (_item,index)=>index===0?"tif":"png"))
      .toEqual(["first-border.tif","second-border.png"])
  })

  it("底片单图使用真实组合扩展名并把源版本与逐图配方送入任务", async () => {
    const processing = { schemaVersion: 1 } as NonNullable<QueueItem["imageProcessing"]>
    const item = {...first,imageProcessing:processing,sourceVersion:"pinned-version"}
    const choose = vi.fn(async () => "/exports/film.tif")
    ;(window as unknown as {desktop?:unknown}).desktop = {selectExportPath:choose}
    const fetchMock = vi.fn(async () => jsonResponse({jobId:"film-job",status:"completed",total:1,completed:1,
      items:[{index:0,status:"completed",outputPath:"/exports/film.tif",actualFormat:"tiff"}]},202))
    vi.stubGlobal("fetch",fetchMock)
    const {result} = renderHook(() => useExportController({state,settings:{...settings(20),filmOutput:"tiff16-rec2020"},
      queueItems:[item],batchExportItems:[],resolveQueueItem:()=>({textOverride:null,resolvedLayers:[],brand:null}),
      prepareExifForExport:async()=>{},autoOpenExportDirectory:false,engineAvailable:true}))
    await act(async()=>result.current.startSingleExport())
    expect(choose).toHaveBeenCalledWith("first-border.tif")
    const request = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [unknown,RequestInit])[1].body))
    expect(request.items[0]).toMatchObject({sourceVersion:"pinned-version",recipe:{imageProcessing:processing},
      export:{format:"tiff",filmOutput:"tiff16-rec2020",tier:"custom"}})
  })

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
    // EXIF 等待现在会传入可中止 signal（U06），路径仍是第一个参数
    await waitFor(() => expect(prepareExifForExport).toHaveBeenCalledWith([first.filePath, second.filePath], expect.anything()))

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

  it("批量命名 prefix-index：输出路径为前缀-三位序号，无 -border 后缀", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({
      jobId: "job-2",
      status: "completed",
      total: 2,
      completed: 2,
      items: [
        { index: 0, status: "completed", outputPath: "/exports/kyoto-001.png", actualFormat: "png" },
        { index: 1, status: "completed", outputPath: "/exports/kyoto-002.png", actualFormat: "png" }
      ]
    }, 202))
    vi.stubGlobal("fetch", fetchMock)
    ;(window as unknown as { desktop?: unknown }).desktop = {
      selectExportDirectory: vi.fn(async () => "/exports")
    }

    const namingSettings: RenderSettings = {
      ...settings(20),
      exportNaming: { mode: "prefix-index", prefix: "kyoto" }
    }
    const resolveQueueItem = vi.fn(() => ({ textOverride: null, resolvedLayers: [], brand: null }))
    const { result } = renderHook(() => useExportController({
      state,
      settings: namingSettings,
      queueItems: [first, second],
      batchExportItems: [first, second],
      resolveQueueItem,
      prepareExifForExport: vi.fn(async () => {}),
      autoOpenExportDirectory: false,
      engineAvailable: true
    }))

    await act(async () => { await result.current.startBatchExport() })

    const request = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))
    expect(request.items[0].export.outputPath).toBe("/exports/kyoto-001.png")
    expect(request.items[1].export.outputPath).toBe("/exports/kyoto-002.png")
  })

  it("buildNamingPreview 展示实际输出文件名样例", () => {
    expect(buildNamingPreview(
      [first, second],
      { mode: "original-suffix", prefix: "" },
      "png"
    )).toEqual(["first-border.png", "second-border.png"])
    expect(buildNamingPreview(
      [first, second],
      { mode: "prefix-index", prefix: "kyoto" },
      "jpg"
    )).toEqual(["kyoto-001.jpg", "kyoto-002.jpg"])
    // 空前缀回退 export
    expect(buildNamingPreview(
      [first],
      { mode: "prefix-index", prefix: "  " },
      "png"
    )).toEqual(["export-001.png"])
  })

  it("准备阶段取消：EXIF 等待期间置本地令牌，异步返回后不再提交任务", async () => {
    let releaseExif!: () => void
    const prepareExifForExport = vi.fn(() => new Promise<void>((resolve) => { releaseExif = resolve }))
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ error: "unexpected" }, 500))
    vi.stubGlobal("fetch", fetchMock)
    ;(window as unknown as { desktop?: unknown }).desktop = {
      selectExportPath: vi.fn(async () => "/exports/first-border.png")
    }

    const { result } = renderHook(() => useExportController({
      state,
      settings: settings(20),
      queueItems: [first],
      batchExportItems: [first],
      resolveQueueItem: () => ({ textOverride: null, resolvedLayers: [], brand: null }),
      prepareExifForExport,
      autoOpenExportDirectory: false,
      engineAvailable: true
    }))

    let pending: Promise<void>
    act(() => {
      pending = result.current.startSingleExport()
    })
    await waitFor(() => expect(prepareExifForExport).toHaveBeenCalled())

    // 尚未取得 jobId：取消进入本地令牌，不发送引擎 DELETE
    await act(async () => { await result.current.cancelActiveExport() })
    expect(fetchMock).not.toHaveBeenCalled()

    releaseExif()
    await act(async () => { await pending! })
    // 后续选择器/预检结果不得继续提交任务
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.single.kind).toBe("cancelled")
  })

  it("查询中断进入状态待确认并保留 jobId；重新查询原任务后收敛到终态", async () => {
    let pollAttempts = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/api/render-jobs") && init?.method === "POST") {
        return jsonResponse({ jobId: "job-9", status: "running", total: 1 }, 202)
      }
      pollAttempts += 1
      if (pollAttempts === 1) {
        throw new TypeError("network down")
      }
      return jsonResponse({
        jobId: "job-9",
        status: "completed",
        total: 1,
        completed: 1,
        items: [{ index: 0, status: "completed", outputPath: "/exports/first-border.png", actualFormat: "png" }]
      })
    })
    vi.stubGlobal("fetch", fetchMock)
    ;(window as unknown as { desktop?: unknown }).desktop = {
      selectExportPath: vi.fn(async () => "/exports/first-border.png")
    }

    const { result } = renderHook(() => useExportController({
      state,
      settings: settings(20),
      queueItems: [first],
      batchExportItems: [],
      resolveQueueItem: () => ({ textOverride: null, resolvedLayers: [], brand: null }),
      prepareExifForExport: vi.fn(async () => {}),
      autoOpenExportDirectory: false,
      engineAvailable: true
    }))

    await act(async () => { await result.current.startSingleExport() })
    expect(result.current.single).toMatchObject({ kind: "unconfirmed", jobId: "job-9" })

    await act(async () => { await result.current.requeryUnconfirmed() })
    expect(result.current.single).toMatchObject({ kind: "completed", outputPath: "/exports/first-border.png" })
  })

  it("重新查询时引擎已重启（404）：解释任务记录失效，不伪装为可续跑", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/api/render-jobs") && init?.method === "POST") {
        return jsonResponse({ jobId: "job-8", status: "running", total: 1 }, 202)
      }
      return jsonResponse({ error: "render job not found" }, 404)
    })
    vi.stubGlobal("fetch", fetchMock)
    ;(window as unknown as { desktop?: unknown }).desktop = {
      selectExportPath: vi.fn(async () => "/exports/first-border.png")
    }

    const { result } = renderHook(() => useExportController({
      state,
      settings: settings(20),
      queueItems: [first],
      batchExportItems: [],
      resolveQueueItem: () => ({ textOverride: null, resolvedLayers: [], brand: null }),
      prepareExifForExport: vi.fn(async () => {}),
      autoOpenExportDirectory: false,
      engineAvailable: true
    }))

    await act(async () => { await result.current.startSingleExport() })
    expect(result.current.single.kind).toBe("unconfirmed")

    await act(async () => { await result.current.requeryUnconfirmed() })
    expect(result.current.single.kind).toBe("unconfirmed")
    expect((result.current.single as { message: string }).message).toContain("引擎中没有该任务记录")
  })

  it("提交响应丢失（网络断开且无 jobId）：进入结果未知，不自动重复提交", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      throw new TypeError("post network down")
    })
    vi.stubGlobal("fetch", fetchMock)
    ;(window as unknown as { desktop?: unknown }).desktop = {
      selectExportPath: vi.fn(async () => "/exports/first-border.png")
    }

    const { result } = renderHook(() => useExportController({
      state,
      settings: settings(20),
      queueItems: [first],
      batchExportItems: [],
      resolveQueueItem: () => ({ textOverride: null, resolvedLayers: [], brand: null }),
      prepareExifForExport: vi.fn(async () => {}),
      autoOpenExportDirectory: false,
      engineAvailable: true
    }))

    await act(async () => { await result.current.startSingleExport() })
    expect(result.current.single).toMatchObject({ kind: "unconfirmed", jobId: null })
    // POST 只发出一次：结果未知时不自动重发
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((result.current.single as { message: string }).message).toContain("不会自动重复提交")
  })
})
