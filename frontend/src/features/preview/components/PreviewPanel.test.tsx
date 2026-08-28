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
  borderStyle: null,
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
        batchExportItems={[]}
        batchExportLabel="批量导出 1 张"
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

    // 等到导出终态再结束，防止悬挂异步链路在后续测试中触发它们的通知 mock
    await waitFor(() => {
      expect(screen.getAllByText(/导出完成/).length).toBeGreaterThan(0)
    })
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
        batchExportItems={[makeItem(), secondItem]}
        batchExportLabel="批量导出 2 张"
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
    // 等到批量导出终态再结束，防止悬挂异步链路污染后续测试
    await waitFor(() => {
      expect(screen.getAllByText(/批量导出完成/).length).toBeGreaterThan(0)
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
        batchExportItems={[]}
        batchExportLabel="批量导出 0 张"
        resolveQueueItem={vi.fn()}
        prepareExifForExport={vi.fn(async () => {})}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "导出原图" }))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/render-jobs"), expect.anything())
    })
    // 等到导出终态再结束，防止悬挂异步链路污染后续测试
    await waitFor(() => {
      expect(screen.getAllByText(/导出完成/).length).toBeGreaterThan(0)
    })
  })

  it("批量导出：失败项定位到具体文件并可重试成功", async () => {
    // 第一次请求全部失败；重试时全部成功
    let firstRun = true
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input)
      if (url.endsWith("/api/render-jobs") && init?.method === "POST") {
        if (firstRun) {
          // 500 → submitRenderJob 抛错 → 该项标记失败
          return jsonResponse({ jobId: "job-fail", status: "failed", error: "渲染失败" }, 500)
        }
        return jsonResponse({ jobId: "job-ok", status: "completed", outputPath: "/tmp/out/b.jpg", actualFormat: "jpeg" })
      }
      return jsonResponse({ error: "unexpected" }, 404)
    })
    vi.stubGlobal("fetch", fetchMock)
    ;(window as unknown as { desktop?: unknown }).desktop = {
      selectExportDirectory: vi.fn(async () => "/tmp/out")
    }

    const item = makeItem()
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
        queueItems={[item, secondItem]}
        batchExportItems={[item, secondItem]}
        batchExportLabel="批量导出 2 张"
        resolveQueueItem={vi.fn(() => ({ textOverride: null, resolvedLayers: [], brand: null }))}
        prepareExifForExport={vi.fn(async () => {})}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "批量导出 2 张" }))

    // 首轮：两张全部失败 → 完成态显示失败 2，并列出失败文件与重试按钮
    await waitFor(() => {
      expect(screen.getByText(/失败 2/)).toBeTruthy()
    })
    // 失败文件可定位到具体文件名
    expect(screen.getAllByText(/A\.jpg/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/B\.jpg/).length).toBeGreaterThan(0)

    // 第二轮（重试）：全部成功 → 完成态更新为成功 2
    firstRun = false
    fireEvent.click(screen.getByRole("button", { name: /重试失败项/ }))
    await waitFor(() => {
      expect(screen.getByText(/成功 2/)).toBeTruthy()
    })
    expect(screen.getByText(/失败 0/)).toBeTruthy()
  })

  it("批量失败重试使用首次导出批次快照：改变勾选范围后仍只重试原批次失败项", async () => {
    const requestedPaths: string[] = []
    let firstRun = true
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input)
      if (url.endsWith("/api/render-jobs") && init?.method === "POST") {
        const body = JSON.parse(String(init?.body)) as { recipe: { imagePath: string } }
        requestedPaths.push(body.recipe.imagePath)
        if (firstRun && body.recipe.imagePath === "/photos/B.jpg") {
          return jsonResponse({ jobId: "job-fail", status: "failed", error: "渲染失败" }, 500)
        }
        return jsonResponse({ jobId: "job-ok", status: "completed", outputPath: "/tmp/out.jpg", actualFormat: "jpeg" })
      }
      return jsonResponse({ error: "unexpected" }, 404)
    })
    vi.stubGlobal("fetch", fetchMock)
    ;(window as unknown as { desktop?: unknown }).desktop = {
      selectExportDirectory: vi.fn(async () => "/tmp/out")
    }

    const itemA = makeItem()
    const itemB = { ...makeItem(), id: "q2", filePath: "/photos/B.jpg", fileName: "B.jpg", sourcePath: "/photos/B.jpg" }
    const itemC = { ...makeItem(), id: "q3", filePath: "/photos/C.jpg", fileName: "C.jpg", sourcePath: "/photos/C.jpg" }

    const { rerender } = render(
      <PreviewPanel
        state={makeActiveState()}
        settings={makeSettings()}
        hasSelectedImage={true}
        queueItems={[itemA, itemB, itemC]}
        batchExportItems={[itemA, itemB]}
        batchExportLabel="批量导出已选 2 张"
        resolveQueueItem={vi.fn(() => ({ textOverride: null, resolvedLayers: [], brand: null }))}
        prepareExifForExport={vi.fn(async () => {})}
      />
    )

    // 首轮导出批次快照 = [A, B]，B 失败
    fireEvent.click(screen.getByRole("button", { name: "批量导出已选 2 张" }))
    await waitFor(() => {
      expect(screen.getByText(/失败 1/)).toBeTruthy()
    })
    firstRun = false

    // 用户改变勾选范围（batchExportItems 变为 [A, C]）
    rerender(
      <PreviewPanel
        state={makeActiveState()}
        settings={makeSettings()}
        hasSelectedImage={true}
        queueItems={[itemA, itemB, itemC]}
        batchExportItems={[itemA, itemC]}
        batchExportLabel="批量导出已选 2 张"
        resolveQueueItem={vi.fn(() => ({ textOverride: null, resolvedLayers: [], brand: null }))}
        prepareExifForExport={vi.fn(async () => {})}
      />
    )

    // 重试：只重发原批次失败项 B，不重发 A，也不发新范围里的 C
    fireEvent.click(screen.getByRole("button", { name: /重试失败项/ }))
    await waitFor(() => {
      expect(screen.getByText(/成功 2/)).toBeTruthy()
    })
    // 全部请求：首轮 A、B + 重试 B；C 从未被请求
    expect(requestedPaths.filter((p) => p === "/photos/B.jpg")).toHaveLength(2)
    expect(requestedPaths.filter((p) => p === "/photos/A.jpg")).toHaveLength(1)
    expect(requestedPaths).not.toContain("/photos/C.jpg")
  })

  // ── 阶段进度（P3 默认版式与导出反馈） ────────────────────────
  // 单图导出明确区分「准备」与「渲染」两阶段，并互斥禁用另一导出入口；
  // 批量导出展示 current/total + 成功/失败计数。
  // 通知规则：
  // - 单图/批量成功或失败时通过 window.desktop.showNotification 触发系统通知；
  // - 取消保存路径或目录时不发通知；
  // - 浏览器模式（无 showNotification 桥接）时仍保留 inline 状态。
  describe("单图阶段进度", () => {
    it("准备阶段（EXIF 读取）显示「准备中…」并禁用单图与批量按钮", async () => {
      let releasePrepare: (() => void) | undefined
      const prepareGate = new Promise<void>((resolve) => {
        releasePrepare = resolve
      })
      const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
        const url = String(input)
        if (url.endsWith("/api/render-jobs")) {
          return jsonResponse({ jobId: "j1", status: "completed", outputPath: "/tmp/o.jpg", actualFormat: "jpeg" })
        }
        return jsonResponse({ error: "unexpected" }, 404)
      })
      vi.stubGlobal("fetch", fetchMock)
      ;(window as unknown as { desktop?: unknown }).desktop = {
        selectExportPath: vi.fn(async () => "/tmp/o.jpg"),
        showNotification: vi.fn(async () => true)
      }

      const secondItem = {
        ...makeItem(), id: "q2", filePath: "/photos/B.jpg", fileName: "B.jpg", sourcePath: "/photos/B.jpg"
      }
      render(
        <PreviewPanel
          state={makeActiveState()}
          settings={makeSettings()}
          hasSelectedImage={true}
          queueItems={[makeItem(), secondItem]}
          batchExportItems={[makeItem(), secondItem]}
          batchExportLabel="批量导出 2 张"
          resolveQueueItem={vi.fn(() => ({ textOverride: null, resolvedLayers: [], brand: null }))}
          prepareExifForExport={vi.fn(async () => { await prepareGate })}
        />
      )

      const exportButton = screen.getByRole("button", { name: "导出原图" }) as HTMLButtonElement
      const batchButton = screen.getByRole("button", { name: "批量导出 2 张" }) as HTMLButtonElement
      fireEvent.click(exportButton)

      // 准备阶段：单图按钮显示「准备中…」且 disabled；批量按钮互斥 disabled
      await waitFor(() => {
        expect(exportButton.disabled).toBe(true)
      })
      expect(exportButton.textContent).toBe("准备中…")
      expect(batchButton.disabled).toBe(true)
      expect(screen.getByRole("status", { name: "单图导出进度" })).toBeTruthy()
      const progress = screen.getByRole("progressbar", { name: "单图导出进度" })
      // 非确定进度：无 aria-valuenow（引擎不提供内部百分比），用 indeterminate 动画
      expect(progress.hasAttribute("aria-valuenow")).toBe(false)
      expect(progress.querySelector(".previewExportProgressFillIndeterminate")).toBeTruthy()
      expect(progress.getAttribute("aria-valuetext")).toContain("读取 EXIF")

      // 释放 EXIF 门后必须等到导出终态，避免悬挂的异步链路在后续测试中
      // 触发它们自己的 showNotification mock（跨测试污染计数）
      releasePrepare?.()
      await waitFor(() => {
        expect(screen.getByText(/导出完成/)).toBeTruthy()
      })
    })

    it("渲染阶段（等待引擎响应）显示「渲染中…」并继续禁用按钮", async () => {
      let releaseRender: (() => void) | undefined
      const renderGate = new Promise<Response>((resolve) => {
        releaseRender = () => resolve(jsonResponse({ jobId: "j1", status: "completed", outputPath: "/tmp/o.jpg", actualFormat: "jpeg" }))
      })
      const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
        const url = String(input)
        if (url.endsWith("/api/render-jobs")) {
          return renderGate
        }
        return jsonResponse({ error: "unexpected" }, 404)
      })
      vi.stubGlobal("fetch", fetchMock)
      ;(window as unknown as { desktop?: unknown }).desktop = {
        selectExportPath: vi.fn(async () => "/tmp/o.jpg"),
        showNotification: vi.fn(async () => true)
      }

      render(
        <PreviewPanel
          state={makeActiveState()}
          settings={makeSettings()}
          hasSelectedImage={true}
          queueItems={[makeItem()]}
          batchExportItems={[]}
          batchExportLabel=""
          resolveQueueItem={vi.fn(() => ({ textOverride: null, resolvedLayers: [], brand: null }))}
          prepareExifForExport={vi.fn(async () => {})}
        />
      )

      const exportButton = screen.getByRole("button", { name: "导出原图" }) as HTMLButtonElement
      fireEvent.click(exportButton)

      // 准备完成 → 进入渲染阶段：按钮文案变为「渲染中…」
      await waitFor(() => {
        expect(exportButton.textContent).toBe("渲染中…")
      })
      expect(exportButton.disabled).toBe(true)
      expect(screen.getByRole("status", { name: "单图导出进度" }).textContent).toContain("渲染")
      const progress = screen.getByRole("progressbar", { name: "单图导出进度" })
      // 渲染阶段同样是非确定进度，不伪造百分比
      expect(progress.hasAttribute("aria-valuenow")).toBe(false)
      expect(progress.querySelector(".previewExportProgressFillIndeterminate")).toBeTruthy()
      expect(progress.getAttribute("aria-valuetext")).toContain("渲染")
      // 等到终态再结束，防止悬挂异步链路污染后续测试的通知 mock 计数
      releaseRender?.()
      await waitFor(() => {
        expect(screen.getByText(/导出完成/)).toBeTruthy()
      })
    })

    it("单图成功：通过 window.desktop.showNotification 发送「导出完成」+ 文件名", async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
        const url = String(input)
        if (url.endsWith("/api/render-jobs")) {
          return jsonResponse({ jobId: "j1", status: "completed", outputPath: "/tmp/o.jpg", actualFormat: "jpeg" })
        }
        return jsonResponse({ error: "unexpected" }, 404)
      })
      vi.stubGlobal("fetch", fetchMock)
      const showNotification = vi.fn(async () => true)
      ;(window as unknown as { desktop?: unknown }).desktop = {
        selectExportPath: vi.fn(async () => "/tmp/o.jpg"),
        showNotification
      }

      render(
        <PreviewPanel
          state={makeActiveState()}
          settings={makeSettings()}
          hasSelectedImage={true}
          queueItems={[makeItem()]}
          batchExportItems={[]}
          batchExportLabel=""
          resolveQueueItem={vi.fn(() => ({ textOverride: null, resolvedLayers: [], brand: null }))}
          prepareExifForExport={vi.fn(async () => {})}
        />
      )

      fireEvent.click(screen.getByRole("button", { name: "导出原图" }))
      await waitFor(() => {
        expect(screen.getByText(/导出完成/)).toBeTruthy()
      })
      expect(showNotification).toHaveBeenCalledTimes(1)
      const callArgs = (showNotification.mock.calls[0] ?? []) as readonly unknown[]
      const title = callArgs[0]
      const body = callArgs[1]
      expect(title).toBe("导出完成")
      // body 展示文件名（不出现绝对路径）
      expect(String(body)).toContain("A")
      expect(String(body)).not.toContain("/photos/A.jpg")
    })

    it("单图失败：通过 showNotification 发送「导出失败」+ 错误摘要", async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
        const url = String(input)
        if (url.endsWith("/api/render-jobs")) {
          return jsonResponse({ jobId: "j1", status: "failed", error: "image file not found: C:\\Users\\private\\A.jpg" }, 500)
        }
        return jsonResponse({ error: "unexpected" }, 404)
      })
      vi.stubGlobal("fetch", fetchMock)
      const showNotification = vi.fn(async () => true)
      ;(window as unknown as { desktop?: unknown }).desktop = {
        selectExportPath: vi.fn(async () => "/tmp/o.jpg"),
        showNotification
      }

      render(
        <PreviewPanel
          state={makeActiveState()}
          settings={makeSettings()}
          hasSelectedImage={true}
          queueItems={[makeItem()]}
          batchExportItems={[]}
          batchExportLabel=""
          resolveQueueItem={vi.fn(() => ({ textOverride: null, resolvedLayers: [], brand: null }))}
          prepareExifForExport={vi.fn(async () => {})}
        />
      )

      fireEvent.click(screen.getByRole("button", { name: "导出原图" }))
      await waitFor(() => {
        expect(screen.getByText(/image file not found/)).toBeTruthy()
      })
      expect(showNotification).toHaveBeenCalledTimes(1)
      const callArgs = (showNotification.mock.calls[0] ?? []) as readonly unknown[]
      const title = callArgs[0]
      const body = callArgs[1]
      expect(title).toBe("导出失败")
      expect(String(body)).toContain("A")
      expect(String(body)).not.toContain("C:\\Users\\private\\A.jpg")
    })

    it("取消保存路径：不发通知，不显示错误", async () => {
      const showNotification = vi.fn(async () => true)
      ;(window as unknown as { desktop?: unknown }).desktop = {
        selectExportPath: vi.fn(async () => null),
        showNotification
      }
      const fetchMock = vi.fn(async () => jsonResponse({ error: "should not be called" }, 404))
      vi.stubGlobal("fetch", fetchMock)

      render(
        <PreviewPanel
          state={makeActiveState()}
          settings={makeSettings()}
          hasSelectedImage={true}
          queueItems={[makeItem()]}
          batchExportItems={[]}
          batchExportLabel=""
          resolveQueueItem={vi.fn(() => ({ textOverride: null, resolvedLayers: [], brand: null }))}
          prepareExifForExport={vi.fn(async () => {})}
        />
      )

      fireEvent.click(screen.getByRole("button", { name: "导出原图" }))
      // 回到 idle
      await waitFor(() => {
        expect((screen.getByRole("button", { name: "导出原图" }) as HTMLButtonElement).disabled).toBe(false)
      })
      expect(showNotification).not.toHaveBeenCalled()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it("浏览器模式（无 showNotification 桥接）仍显示 inline 状态，不抛异常", async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
        const url = String(input)
        if (url.endsWith("/api/render-jobs")) {
          return jsonResponse({ jobId: "j1", status: "completed", outputPath: "/tmp/o.jpg", actualFormat: "jpeg" })
        }
        return jsonResponse({ error: "unexpected" }, 404)
      })
      vi.stubGlobal("fetch", fetchMock)
      // 浏览器模式：window.desktop 完全不存在
      delete (window as unknown as { desktop?: unknown }).desktop

      // 文件不在 /photos/ 下时浏览器模式无法推导输出路径 → 显示降级提示
      const browserState = {
        ...makeActiveState(),
        filePath: "/somewhere/A.jpg",
        fileName: "A.jpg"
      }
      render(
        <PreviewPanel
          state={browserState}
          settings={makeSettings()}
          hasSelectedImage={true}
          queueItems={[]}
          batchExportItems={[]}
          batchExportLabel=""
          resolveQueueItem={vi.fn(() => ({ textOverride: null, resolvedLayers: [], brand: null }))}
          prepareExifForExport={vi.fn(async () => {})}
        />
      )

      fireEvent.click(screen.getByRole("button", { name: "导出原图" }))
      await waitFor(() => {
        expect(screen.getByText(/浏览器降级模式|无法选择保存位置/)).toBeTruthy()
      })
    })
  })

  describe("批量导出进度 + 通知", () => {
    it("批量进行中显示 current/total 与成功/失败计数（progressbar role）", async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        if (url.endsWith("/api/render-jobs") && init?.method === "POST") {
          // 延迟响应，确保 running 态的 progressbar 有足够时间渲染
          await new Promise((resolve) => setTimeout(resolve, 80))
          return jsonResponse({
            jobId: "j1",
            status: "completed",
            outputPath: "/tmp/o.jpg",
            actualFormat: "jpeg",
            metadataPreservation: { status: "SKIPPED", message: "当前格式不支持 EXIF" }
          })
        }
        return jsonResponse({ error: "unexpected" }, 404)
      })
      vi.stubGlobal("fetch", fetchMock)
      const showNotification = vi.fn(async () => true)
      ;(window as unknown as { desktop?: unknown }).desktop = {
        selectExportDirectory: vi.fn(async () => "/tmp/out"),
        showNotification
      }

      const itemA = makeItem()
      const itemB = { ...makeItem(), id: "q2", filePath: "/photos/B.jpg", fileName: "B.jpg", sourcePath: "/photos/B.jpg" }
      const itemC = { ...makeItem(), id: "q3", filePath: "/photos/C.jpg", fileName: "C.jpg", sourcePath: "/photos/C.jpg" }
      render(
        <PreviewPanel
          state={makeActiveState()}
          settings={makeSettings()}
          hasSelectedImage={true}
          queueItems={[itemA, itemB, itemC]}
          batchExportItems={[itemA, itemB, itemC]}
          batchExportLabel="批量导出 3 张"
          resolveQueueItem={vi.fn(() => ({ textOverride: null, resolvedLayers: [], brand: null }))}
          prepareExifForExport={vi.fn(async () => {})}
        />
      )

      fireEvent.click(screen.getByRole("button", { name: "批量导出 3 张" }))
      await waitFor(() => {
        const bar = screen.getByRole("progressbar", { name: "批量导出进度" })
        expect(bar.getAttribute("aria-valuetext")).toContain("3")
        expect(bar.querySelector(".previewBatchProgressFill")).toBeTruthy()
      })
      // 等到批量导出终态再结束，防止悬挂异步链路在后续测试中触发它们的通知 mock
      await waitFor(() => {
        expect(screen.getByText(/批量导出完成/)).toBeTruthy()
      })
      expect(screen.getAllByText(/EXIF：当前格式不支持 EXIF/)).toHaveLength(3)
    })

    it("批量全部成功：发「批量导出完成」+ 成功数", async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        if (url.endsWith("/api/render-jobs") && init?.method === "POST") {
          return jsonResponse({ jobId: "j1", status: "completed", outputPath: "/tmp/o.jpg", actualFormat: "jpeg" })
        }
        return jsonResponse({ error: "unexpected" }, 404)
      })
      vi.stubGlobal("fetch", fetchMock)
      const showNotification = vi.fn(async () => true)
      ;(window as unknown as { desktop?: unknown }).desktop = {
        selectExportDirectory: vi.fn(async () => "/tmp/out"),
        showNotification
      }

      const itemA = makeItem()
      const itemB = { ...makeItem(), id: "q2", filePath: "/photos/B.jpg", fileName: "B.jpg", sourcePath: "/photos/B.jpg" }
      render(
        <PreviewPanel
          state={makeActiveState()}
          settings={makeSettings()}
          hasSelectedImage={true}
          queueItems={[itemA, itemB]}
          batchExportItems={[itemA, itemB]}
          batchExportLabel="批量导出 2 张"
          resolveQueueItem={vi.fn(() => ({ textOverride: null, resolvedLayers: [], brand: null }))}
          prepareExifForExport={vi.fn(async () => {})}
        />
      )

      fireEvent.click(screen.getByRole("button", { name: "批量导出 2 张" }))
      await waitFor(() => {
        expect(screen.getByText(/批量导出完成/)).toBeTruthy()
      })
      expect(showNotification).toHaveBeenCalledTimes(1)
      const callArgs = (showNotification.mock.calls[0] ?? []) as readonly unknown[]
      const title = callArgs[0]
      const body = callArgs[1]
      expect(title).toBe("批量导出完成")
      expect(String(body)).toContain("2")
    })

    it("批量部分失败：发「批量导出部分失败」+ 成功/失败数", async () => {
      let firstRun = true
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input)
        if (url.endsWith("/api/render-jobs") && init?.method === "POST") {
          if (firstRun) {
            return jsonResponse({ jobId: "j1", status: "failed", error: "渲染失败" }, 500)
          }
          return jsonResponse({ jobId: "j2", status: "completed", outputPath: "/tmp/o.jpg", actualFormat: "jpeg" })
        }
        return jsonResponse({ error: "unexpected" }, 404)
      })
      vi.stubGlobal("fetch", fetchMock)
      const showNotification = vi.fn(async () => true)
      ;(window as unknown as { desktop?: unknown }).desktop = {
        selectExportDirectory: vi.fn(async () => "/tmp/out"),
        showNotification
      }

      const itemA = makeItem()
      const itemB = { ...makeItem(), id: "q2", filePath: "/photos/B.jpg", fileName: "B.jpg", sourcePath: "/photos/B.jpg" }
      render(
        <PreviewPanel
          state={makeActiveState()}
          settings={makeSettings()}
          hasSelectedImage={true}
          queueItems={[itemA, itemB]}
          batchExportItems={[itemA, itemB]}
          batchExportLabel="批量导出 2 张"
          resolveQueueItem={vi.fn(() => ({ textOverride: null, resolvedLayers: [], brand: null }))}
          prepareExifForExport={vi.fn(async () => {})}
        />
      )

      fireEvent.click(screen.getByRole("button", { name: "批量导出 2 张" }))
      await waitFor(() => {
        expect(screen.getByText(/失败 2/)).toBeTruthy()
      })
      // 首轮全部失败 → 通知「批量导出部分失败」+ 成功 0 / 失败 2
      expect(showNotification).toHaveBeenCalledTimes(1)
      const callArgs = (showNotification.mock.calls[0] ?? []) as readonly unknown[]
      const title = callArgs[0]
      const body = callArgs[1]
      expect(title).toBe("批量导出部分失败")
      expect(String(body)).toContain("0")
      expect(String(body)).toContain("2")

      // 重试全部成功 → 再发一次「批量导出完成」
      firstRun = false
      fireEvent.click(screen.getByRole("button", { name: /重试失败项/ }))
      await waitFor(() => {
        expect(screen.getByText(/成功 2/)).toBeTruthy()
      })
      await waitFor(() => {
        expect(showNotification).toHaveBeenCalledTimes(2)
      })
      const callArgs2 = (showNotification.mock.calls[1] ?? []) as readonly unknown[]
      const title2 = callArgs2[0]
      expect(title2).toBe("批量导出完成")
    })

  it("取消目录选择：不发通知，不调用 fetch", async () => {
    const showNotification = vi.fn(async () => true)
    ;(window as unknown as { desktop?: unknown }).desktop = {
      selectExportDirectory: vi.fn(async () => null),
      showNotification
    }
    const fetchMock = vi.fn(async () => jsonResponse({ error: "should not be called" }, 404))
    vi.stubGlobal("fetch", fetchMock)

    const itemA = makeItem()
    const itemB = { ...makeItem(), id: "q2", filePath: "/photos/B.jpg", fileName: "B.jpg", sourcePath: "/photos/B.jpg" }
    render(
      <PreviewPanel
        state={makeActiveState()}
        settings={makeSettings()}
        hasSelectedImage={true}
        queueItems={[itemA, itemB]}
        batchExportItems={[itemA, itemB]}
        batchExportLabel="批量导出 2 张"
        resolveQueueItem={vi.fn(() => ({ textOverride: null, resolvedLayers: [], brand: null }))}
        prepareExifForExport={vi.fn(async () => {})}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "批量导出 2 张" }))
    await waitFor(() => {
      expect((screen.getByRole("button", { name: "批量导出 2 张" }) as HTMLButtonElement).disabled).toBe(false)
    })
    expect(showNotification).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // ── 引擎不可用时的导出禁用（P3 Windows 离线 + 引擎双层兜底） ────────────
  // 关键：导出是高保真链路，必须由 Java 引擎完成；引擎不可用时按钮禁用并
  // 显式说明原因（不让用户点了再失败）。引擎恢复后按钮自动恢复可用。
  describe("引擎不可用时的导出禁用", () => {
    it("engineAvailable=false：单图与批量导出按钮均禁用，按钮含 title 解释原因", () => {
      render(
        <PreviewPanel
          state={makeActiveState()}
          settings={makeSettings()}
          hasSelectedImage={true}
          queueItems={[makeItem(), {
            ...makeItem(), id: "q2", filePath: "/photos/B.jpg", fileName: "B.jpg", sourcePath: "/photos/B.jpg"
          }]}
          batchExportItems={[makeItem(), {
            ...makeItem(), id: "q2", filePath: "/photos/B.jpg", fileName: "B.jpg", sourcePath: "/photos/B.jpg"
          }]}
          batchExportLabel="批量导出 2 张"
          resolveQueueItem={vi.fn(() => ({ textOverride: null, resolvedLayers: [], brand: null }))}
          prepareExifForExport={vi.fn(async () => {})}
          engineAvailable={false}
        />
      )
      const exportButton = screen.getByRole("button", { name: /导出原图/ }) as HTMLButtonElement
      expect(exportButton.disabled).toBe(true)
      expect(exportButton.title).toMatch(/引擎.*不可用|恢复引擎/)
      const batchButton = screen.getByRole("button", { name: /批量导出/ }) as HTMLButtonElement
      expect(batchButton.disabled).toBe(true)
      expect(batchButton.title).toMatch(/引擎.*不可用|恢复引擎/)
    })

    it("engineAvailable=true：导出按钮可用", () => {
      render(
        <PreviewPanel
          state={makeActiveState()}
          settings={makeSettings()}
          hasSelectedImage={true}
          queueItems={[makeItem()]}
          batchExportItems={[]}
          batchExportLabel=""
          resolveQueueItem={vi.fn(() => ({ textOverride: null, resolvedLayers: [], brand: null }))}
          prepareExifForExport={vi.fn(async () => {})}
          engineAvailable={true}
        />
      )
      const exportButton = screen.getByRole("button", { name: "导出原图" }) as HTMLButtonElement
      expect(exportButton.disabled).toBe(false)
    })
  })
})
})
