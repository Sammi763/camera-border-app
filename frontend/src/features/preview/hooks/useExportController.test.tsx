import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { effectiveExportFormat, buildExportSummary, buildNamingPreview, useExportController } from "./useExportController"
import type { PreviewState } from "../types"
import type { QueueItem } from "../../queue/types"
import type { RenderSettings } from "../../settings/types"
import type { CapabilitiesResponse, RenderJobRequest } from "../../../types/preview"

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

const renderSingle = () => {
  ;(window as unknown as { desktop?: unknown }).desktop = {
    selectExportPath: async () => "/exports/first-border.png"
  }
  return renderHook(() => useExportController({
    state, settings: settings(20), queueItems: [first], batchExportItems: [first],
    resolveQueueItem: () => ({ textOverride: null, resolvedLayers: [], brand: null }),
    prepareExifForExport: async () => {}, autoOpenExportDirectory: false, engineAvailable: true
  }))
}

const deferredResponse = () => {
  let resolve!: (response: Response) => void
  const pending = new Promise<Response>(done => { resolve = done })
  return { pending, resolve }
}

const largeBatch = (count: number, capabilities?: CapabilitiesResponse) => {
  const items = Array.from({ length: count }, (_, index) => ({
    ...first, id: String(index), filePath: `/photos/${index}/same.jpg`, sourcePath: `/photos/${index}/same.jpg`, fileName: "same.jpg"
  }))
  ;(window as unknown as { desktop?: unknown }).desktop = { selectExportDirectory: async () => "/exports" }
  return renderHook(() => useExportController({
    state, settings: { ...settings(20), exportNaming: { mode: "prefix-index", prefix: "roll" } },
    queueItems: items, batchExportItems: items,
    resolveQueueItem: () => ({ textOverride: null, resolvedLayers: [], brand: null }),
    prepareExifForExport: async () => {}, engineAvailable: true, autoOpenExportDirectory: false,
    ...(capabilities === undefined ? {} : { capabilities })
  }))
}

const readyPreflight = (request: RenderJobRequest) => ({
  status: "ready", items: request.items.map((item, index) => ({
    index, status: "ready", imagePath: item.recipe.imagePath, outputPath: item.export.outputPath, blockingReasons: []
  }))
})

const completedChunk = (jobId: string, count: number) => ({
  jobId, status: "completed", total: count, completed: count,
  items: Array.from({ length: count }, (_, index) => ({ index, status: "completed", actualFormat: "png" }))
})

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
    const {result} = renderHook(() => useExportController({state,settings:{...settings(20),filmOutput:"tiff16-rec2020",borderlessMaster:true},
      queueItems:[item],batchExportItems:[],resolveQueueItem:()=>({textOverride:null,resolvedLayers:[],brand:null}),
      prepareExifForExport:async()=>{},autoOpenExportDirectory:false,engineAvailable:true}))
    await act(async()=>result.current.startSingleExport())
    expect(choose).toHaveBeenCalledWith("first-border.tif")
    const request = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [unknown,RequestInit])[1].body))
    expect(request.items[0]).toMatchObject({sourceVersion:"pinned-version",recipe:{imageProcessing:processing,borderlessMaster:true},
      export:{format:"tiff",filmOutput:"tiff16-rec2020",tier:"custom"}})
  })

  it("分组预检后按 100 张提交，跨组保持整批命名和逐图结果", async () => {
    const calls: { path: string; request: RenderJobRequest }[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      const request = JSON.parse(String(init?.body)) as RenderJobRequest
      calls.push({ path, request })
      if (path.endsWith("/api/export-preflight")) return jsonResponse(readyPreflight(request))
      return jsonResponse(completedChunk(`job-${calls.length}`, request.items.length), 202)
    }))
    const { result } = largeBatch(201, {} as CapabilitiesResponse)

    await act(async () => result.current.startBatchExport())

    expect(calls.map(call => [call.path.split("/").at(-1), call.request.items.length])).toEqual([
      ["export-preflight", 100], ["export-preflight", 100], ["export-preflight", 1],
      ["render-jobs", 100], ["render-jobs", 100], ["render-jobs", 1]
    ])
    expect(calls[4]?.request.items[0]?.export.outputPath).toBe("/exports/roll-101.png")
    expect(calls[5]?.request.items[0]?.export.outputPath).toBe("/exports/roll-201.png")
    expect(result.current.batch).toMatchObject({ kind: "completed", total: 201, success: 201, failed: 0 })
  })

  it("末组预检受阻时一张都不提交", async () => {
    const calls: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(String(input))
      const response = readyPreflight(JSON.parse(String(init?.body)) as RenderJobRequest)
      return jsonResponse(calls.length === 1 ? response
        : { status: "blocked", items: [{ ...response.items[0], status: "blocked", blockingReasons: ["输出路径已存在"] }] })
    }))
    const { result } = largeBatch(101, {} as CapabilitiesResponse)
    await act(async () => result.current.startBatchExport())
    expect(calls.map(path => path.split("/").at(-1))).toEqual(["export-preflight", "export-preflight"])
    expect(result.current.batch).toMatchObject({ kind: "error" })
    expect(result.current.batchReview?.[100]).toMatchObject({ reasons: ["输出路径已存在"], canRename: true })
  })

  it("全部源照片已标记缺失时，保留清单且不会读取 EXIF、预检或提交", async () => {
    const items = [{ ...first, missing: true, imageProcessingError: "配方错误" }, { ...second, missing: true }]
    const fetchMock = vi.fn()
    const prepareExifForExport = vi.fn(async () => {})
    vi.stubGlobal("fetch", fetchMock)
    ;(window as unknown as { desktop?: unknown }).desktop = { selectExportDirectory: async () => "/exports" }
    const { result } = renderHook(() => useExportController({
      state, settings: settings(20), queueItems: items, batchExportItems: items,
      capabilities: {} as CapabilitiesResponse, prepareExifForExport,
      resolveQueueItem: () => ({ textOverride: null, resolvedLayers: [], brand: null }),
      engineAvailable: true, autoOpenExportDirectory: false
    }))

    await act(async () => result.current.startBatchExport())
    expect(result.current.batchReview).toMatchObject(items.map(item => ({
      sourcePath: item.sourcePath, canRepair: false, canRename: false, canExportPlain: false,
      reasons: ["源照片缺失，请在队列中重新定位文件"]
    })))
    await act(async () => result.current.resolveBatchReview?.({ 0: "skip", 1: "skip" }))
    expect(result.current.batchReview).toHaveLength(2)
    expect(prepareExifForExport).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("取消当前分组时保留前组成功结果，并阻止后续分组提交", async () => {
    let posts = 0
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts++
        return posts === 1
          ? jsonResponse(completedChunk("first", 100), 202)
          : jsonResponse({ jobId: "second", status: "running", processed: 1, completed: 1 }, 202)
      }
      return jsonResponse({
        jobId: "second", status: "cancelled",
        items: Array.from({ length: 100 }, (_, index) => ({ index, status: index === 0 ? "completed" : "cancelled" }))
      })
    }))
    const { result } = largeBatch(201)
    let pending: Promise<void>
    act(() => { pending = result.current.startBatchExport() })
    await waitFor(() => expect(result.current.batch)
      .toMatchObject({ kind: "running", total: 201, current: 101, success: 101 }))

    await act(async () => result.current.cancelActiveExport())
    expect(result.current.batch).toMatchObject({ kind: "cancelled", total: 201, success: 101, cancelled: 100 })
    await act(async () => pending!)
    expect(posts).toBe(2)
  })

  it("分组查询中断后重新查询原任务，已完成分组不会重发", async () => {
    let posts = 0
    let queries = 0
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts++
        if (posts === 2) return jsonResponse({ jobId: "interrupted", status: "running" }, 202)
        return jsonResponse(completedChunk(`job-${posts}`, posts === 1 ? 100 : 1), 202)
      }
      if (++queries === 1) throw new TypeError("network down")
      return jsonResponse(completedChunk("interrupted", 100))
    }))
    const { result } = largeBatch(201)
    await act(async () => result.current.startBatchExport())
    expect(result.current.batch).toMatchObject({ kind: "unconfirmed", jobId: "interrupted" })
    if (result.current.batch.kind !== "unconfirmed") throw new Error("应保留待确认状态")
    expect(result.current.batch.results).toHaveLength(100)

    await act(async () => result.current.requeryUnconfirmed())
    expect(result.current.batch).toMatchObject({ kind: "completed", total: 201, success: 201 })
    expect(posts).toBe(3)
  })

  it("跨组重试超过上限的失败项，保留成功文件和原始输出编号", async () => {
    const requests: RenderJobRequest[] = []
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as RenderJobRequest
      requests.push(request)
      const completed = completedChunk(`job-${requests.length}`, request.items.length)
      if (requests.length <= 2) {
        return jsonResponse({
          ...completed,
          items: completed.items.map(item =>
            requests.length === 1 && item.index === 0 ? item : { ...item, status: "failed", error: "写入失败" })
        }, 202)
      }
      return jsonResponse(completed, 202)
    }))
    const { result } = largeBatch(102)
    await act(async () => result.current.startBatchExport())
    expect(result.current.batch).toMatchObject({ kind: "completed", success: 1, failed: 101 })

    await act(async () => result.current.retryFailed())
    expect(requests.map(request => request.items.length)).toEqual([100, 2, 100, 1])
    expect(requests[2]?.items[0]?.export.outputPath).toBe("/exports/roll-002.png")
    expect(requests[3]?.items[0]?.export.outputPath).toBe("/exports/roll-102.png")
    expect(result.current.batch).toMatchObject({ kind: "completed", total: 102, success: 102, failed: 0 })
  })

  it("后续分组提交响应未知时，保留前组结果且不继续提交", async () => {
    let posts = 0
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (++posts === 1) return jsonResponse(completedChunk("first", 100), 202)
      throw new TypeError("network down")
    }))
    const { result } = largeBatch(201)
    await act(async () => result.current.startBatchExport())
    expect(result.current.batch).toMatchObject({ kind: "unconfirmed", jobId: null, total: 201 })
    if (result.current.batch.kind !== "unconfirmed") throw new Error("应保留待确认状态")
    expect(result.current.batch.results).toHaveLength(100)
    await act(async () => result.current.requeryUnconfirmed())
    expect(posts).toBe(2)
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

  it.each(["queued", "completed"] as const)("POST 返回 %s 前取消，仅对活动任务发送一次 DELETE", async (ack) => {
    const post = deferredResponse()
    const cancel = vi.fn(async () => jsonResponse({ jobId: "one", status: "running" }))
    const submit = vi.fn(() => post.pending)
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return submit()
      if (init?.method === "DELETE") return cancel()
      return jsonResponse({ jobId: "one", status: "cancelled" })
    })
    vi.stubGlobal("fetch", fetchMock)
    const { result } = renderSingle()
    let pending!: Promise<void>
    act(() => {
      pending = result.current.startSingleExport()
      void result.current.startSingleExport()
    })
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    await act(async () => { await result.current.cancelActiveExport() })
    expect(cancel).not.toHaveBeenCalled()
    await act(async () => {
      post.resolve(jsonResponse({ jobId: "one", status: ack }))
    })
    await act(async () => {
      await result.current.cancelActiveExport()
      await pending
    })
    expect(cancel).toHaveBeenCalledTimes(ack === "queued" ? 1 : 0)
    expect(result.current.single.kind).toBe(ack === "queued" ? "cancelled" : "completed")
  })

  it.each(["GET", "DELETE"] as const)("旧任务较迟的 %s 响应不能覆盖后续任务", async (lateMethod) => {
    const late = deferredResponse()
    const firstPoll = vi.fn(() => lateMethod === "GET" ? late.pending : jsonResponse(completedChunk("old", 1)))
    const firstCancel = vi.fn(() => lateMethod === "DELETE" ? late.pending : jsonResponse({ jobId: "old", status: "cancelled" }))
    const submit = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ jobId: "old", status: "queued" }))
      .mockResolvedValueOnce(jsonResponse({ jobId: "new", status: "completed", outputPath: "/exports/new.png", actualFormat: "png" }))
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return submit()
      return init?.method === "DELETE" ? firstCancel() : firstPoll()
    }))
    const { result } = renderSingle()
    let polling!: Promise<void>
    let cancelling!: Promise<void>
    act(() => { polling = result.current.startSingleExport() })
    await waitFor(() => expect(result.current.single.kind).toBe("running"))
    act(() => { cancelling = result.current.cancelActiveExport() })
    await waitFor(() => expect(result.current.single.kind).toBe(lateMethod === "GET" ? "cancelled" : "completed"))
    await act(async () => { await result.current.startSingleExport() })
    late.resolve(jsonResponse({ jobId: "old", status: "failed", error: "过期响应" }))
    await act(async () => { await Promise.all([polling, cancelling]) })
    expect(result.current.single).toMatchObject({ kind: "completed", outputPath: "/exports/new.png" })
    expect(firstCancel).toHaveBeenCalledTimes(1)
    expect(submit).toHaveBeenCalledTimes(2)
  })

  it("DELETE 断线后继续轮询，用户再次取消时才重试 DELETE", async () => {
    const cancel = vi.fn()
      .mockRejectedValueOnce(new Error("取消断线"))
      .mockResolvedValueOnce(jsonResponse({ jobId: "one", status: "cancelled" }))
    const query = vi.fn(async () => jsonResponse({ jobId: "one", status: cancel.mock.calls.length === 2 ? "cancelled" : "running" }))
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return jsonResponse({ jobId: "one", status: "queued" })
      return init?.method === "DELETE" ? cancel() : query()
    }))
    const { result } = renderSingle()
    let pending!: Promise<void>
    act(() => { pending = result.current.startSingleExport() })
    await waitFor(() => expect(result.current.single.kind).toBe("running"))
    await act(async () => result.current.cancelActiveExport())
    expect(result.current.notice).toContain("取消请求失败")
    await waitFor(() => expect(query).toHaveBeenCalledTimes(1), { timeout: 2000 })
    expect(cancel).toHaveBeenCalledTimes(1)

    await act(async () => {
      await result.current.cancelActiveExport()
      await pending
    })
    expect(cancel).toHaveBeenCalledTimes(2)
    expect(result.current.single.kind).toBe("cancelled")
    expect(result.current.notice).toBeNull()
  })

  it("单图恢复查询继续轮询，重复点击共享一次查询，再次断线仍可查原任务", async () => {
    const recovered = deferredResponse()
    const submit = vi.fn(async () => jsonResponse({ jobId: "one", status: "queued" }))
    const query = vi.fn()
      .mockRejectedValueOnce(new Error("首次断线"))
      .mockReturnValueOnce(recovered.pending)
      .mockRejectedValueOnce(new Error("再次断线"))
      .mockResolvedValueOnce(jsonResponse({ jobId: "one", status: "running" }))
      .mockResolvedValueOnce(jsonResponse(completedChunk("one", 1)))
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "POST" ? submit() : query(String(input))))
    const { result } = renderSingle()
    await act(async () => result.current.startSingleExport())
    let resuming!: Promise<void>
    act(() => {
      resuming = result.current.requeryUnconfirmed()
      void result.current.requeryUnconfirmed()
      void result.current.startSingleExport()
    })
    expect(query).toHaveBeenCalledTimes(2)
    recovered.resolve(jsonResponse({ jobId: "one", status: "pending" }))
    await act(async () => resuming)
    expect(result.current.single).toMatchObject({ kind: "unconfirmed", jobId: "one", outputPath: "/exports/first-border.png" })
    await act(async () => result.current.requeryUnconfirmed())
    expect(result.current.single).toMatchObject({ kind: "completed", outputPath: "/exports/first-border.png" })
    expect(submit).toHaveBeenCalledTimes(1)
    expect(query.mock.calls.map(([url]) => url)).toEqual(Array(5).fill("/api/render-jobs/one"))
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
    await act(async () => result.current.requeryUnconfirmed())
    // POST 只发出一次：结果未知时不自动重发
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((result.current.single as { message: string }).message).toContain("不会自动重复提交")
  })
})


it("已存在目标另存后重新预检，损坏配方需明确确认才按普通图导出", async () => {
  const damaged = { ...second, imageProcessingError: "配方版本损坏" }
  const items = [first, damaged]
  const posts: RenderJobRequest[] = []
  ;(window as unknown as { desktop?: unknown }).desktop = { selectExportDirectory: async () => "/exports" }
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as RenderJobRequest
    if (String(input).endsWith("/api/export-preflight")) {
      const ready = readyPreflight(request)
      const rows = ready.items.map(item => item.outputPath === "/exports/first-border.png"
        ? { ...item, status: "blocked", blockingReasons: ["输出路径已存在"] } : item)
      return jsonResponse({ status: rows.some(item => item.status === "blocked") ? "blocked" : "ready", items: rows })
    }
    posts.push(request)
    return jsonResponse(completedChunk("job", request.items.length), 202)
  }))
  const { result } = renderHook(() => useExportController({
    state, settings: settings(20), queueItems: items, batchExportItems: items, capabilities: {} as CapabilitiesResponse,
    resolveQueueItem: () => ({ textOverride: null, resolvedLayers: [], brand: null }),
    prepareExifForExport: async () => {}, autoOpenExportDirectory: false, engineAvailable: true
  }))

  await act(async () => result.current.startBatchExport())
  expect(posts).toHaveLength(0)
  expect(result.current.batchReview).toMatchObject([{ canRename: true }, { canExportPlain: true }])
  await act(async () => result.current.resolveBatchReview?.({ 0: "rename", 1: "plain" }))
  expect(posts).toHaveLength(0)
  expect(result.current.batchReview?.map(row => row.outputPath)).toEqual(["/exports/first-border-1.png", "/exports/second-border.png"])
  await act(async () => result.current.resolveBatchReview?.({}))
  expect(posts).toHaveLength(1)
  expect(posts[0]?.items[1]?.recipe.imageProcessing).toBeNull()
})
