import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { WorkspacePage } from "./WorkspacePage"
import type { DesktopRuntime } from "../types/runtime"

/**
 * Workspace wiring 集成测试：
 * - 导入两张图片（一张有 EXIF、一张无 EXIF）；
 * - 创建摄影预设（画幅 6x10）并应用到全部图片；
 * - 批量导出：断言队列中每一张图片的 EXIF 都先被读取（photo-metadata 请求先于对应
 *   render-jobs 请求），且每张图片的 RenderRecipe 使用同一套有效摄影信息
 *   （每图覆盖 > 摄影预设 > EXIF > 空），无 EXIF 图片降级为空、不阻塞整批导出。
 */

const runtime: DesktopRuntime = {
  appName: "camera-border-app",
  platform: "darwin",
  engine: { managed: false, baseUrl: "http://127.0.0.1:8080" }
}

type RenderJobRecord = {
  readonly imagePath: string
  readonly texts: readonly string[]
  readonly filmFormat: string | null
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  })

/** 引擎侧画幅列表（含 6x10 与 6x12）。 */
const FILM_FORMATS = [
  { id: "half-frame", label: "半格", aspectRatio: "18:24", recommendedBorder: { top: 40, bottom: 120, left: 40, right: 40 } },
  { id: "135", label: "135", aspectRatio: "36:24", recommendedBorder: { top: 40, bottom: 80, left: 40, right: 40 } },
  { id: "6x9", label: "6×9", aspectRatio: "90:56", recommendedBorder: { top: 50, bottom: 80, left: 50, right: 50 } },
  { id: "6x10", label: "6×10", aspectRatio: "100:56", recommendedBorder: { top: 50, bottom: 85, left: 50, right: 50 } },
  { id: "6x12", label: "6×12", aspectRatio: "120:56", recommendedBorder: { top: 50, bottom: 90, left: 50, right: 50 } }
]

const PHOTO_A = "/photos/A.jpg" // 有 EXIF
const PHOTO_B = "/photos/B.jpg" // 无 EXIF

function setupWorkspace() {
  const renderJobs: RenderJobRecord[] = []
  const metadataRequests: string[] = []
  /** 统一调用日志：meta:<path> 与 job:<path>，用于断言「先读 EXIF 再导出」。 */
  const callLog: string[] = []

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? "GET"
    if (url.endsWith("/api/health")) {
      return jsonResponse({ status: "ok", app: "test", version: "0" })
    }
    if (url.endsWith("/api/dev/photos")) {
      return jsonResponse({ photos: [] })
    }
    if (url.endsWith("/api/assets/film-stocks")) {
      return jsonResponse([])
    }
    if (url.endsWith("/api/film-formats")) {
      return jsonResponse(FILM_FORMATS)
    }
    if (url.endsWith("/api/preview")) {
      return jsonResponse({ status: "ok", message: "", previewAvailable: false, previewUrl: "" })
    }
    if (url.endsWith("/api/photo-metadata") && method === "POST") {
      const body = JSON.parse(String(init?.body)) as { imagePath: string }
      metadataRequests.push(body.imagePath)
      callLog.push(`meta:${body.imagePath}`)
      if (body.imagePath === PHOTO_A) {
        return jsonResponse({ cameraModel: "NIKON Z6", lensModel: "Nikkor 50mm" })
      }
      // 无 EXIF：引擎返回 500，前端应降级为空、不阻塞整批导出
      return jsonResponse({ error: "no exif for this image" }, 500)
    }
    if (url.endsWith("/api/render-jobs") && method === "POST") {
      const body = JSON.parse(String(init?.body)) as {
        recipe: { imagePath: string; texts: readonly { content: string }[]; filmFormat: string | null }
      }
      callLog.push(`job:${body.recipe.imagePath}`)
      renderJobs.push({
        imagePath: body.recipe.imagePath,
        texts: body.recipe.texts.map((t) => t.content),
        filmFormat: body.recipe.filmFormat
      })
      return jsonResponse({ jobId: `job-${renderJobs.length}`, status: "completed", outputPath: "/tmp/out/x.jpg", actualFormat: "jpeg" })
    }
    return jsonResponse({ error: `unexpected ${url}` }, 404)
  })
  vi.stubGlobal("fetch", fetchMock)

  const desktop = {
    selectImages: vi.fn(async () => []),
    selectImageSources: vi.fn(async () => null),
    selectImageFiles: vi.fn(async () => [PHOTO_A, PHOTO_B]),
    selectImageFolder: vi.fn(async () => null),
    selectExportPath: vi.fn(async () => "/tmp/out/single.jpg"),
    selectExportDirectory: vi.fn(async () => "/tmp/out"),
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
    listSystemFonts: vi.fn(async () => [])
  }
  ;(window as unknown as { desktop?: unknown }).desktop = desktop

  return { fetchMock, renderJobs, metadataRequests, callLog, desktop }
}

const teardownWorkspace = (): void => {
  delete (window as unknown as { desktop?: unknown }).desktop
  vi.unstubAllGlobals()
}

describe("WorkspacePage wiring（摄影预设 + EXIF 批量导出闭环）", () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.stubGlobal("URL.createObjectURL", () => "blob:fake")
    vi.stubGlobal("URL.revokeObjectURL", () => {})
  })

  afterEach(() => {
    teardownWorkspace()
    vi.restoreAllMocks()
  })

  it("批量导出：队列中每张图片都先读 EXIF，再用同一套有效摄影信息生成 RenderRecipe", async () => {
    const { renderJobs, metadataRequests, callLog } = setupWorkspace()
    render(<WorkspacePage runtime={runtime} />)

    // 1) 导入两张图片（A 有 EXIF，B 无 EXIF）
    fireEvent.click(await screen.findByRole("button", { name: "选择图片文件" }))
    await waitFor(() => {
      expect(screen.getByText("A.jpg")).toBeTruthy()
      expect(screen.getByText("B.jpg")).toBeTruthy()
    })

    // 2) 设置面板的画幅下拉同时包含 6x10 与 6x12（契约：画幅目录检索）
    const formatSelect = await screen.findByLabelText(/画幅格式/)
    await waitFor(() => {
      expect(within(formatSelect).getByRole("option", { name: "6×10" })).toBeTruthy()
      expect(within(formatSelect).getByRole("option", { name: "6×12" })).toBeTruthy()
    })

    // 3) 打开「摄影预设」分组，新建 6x10 预设
    fireEvent.click(screen.getByRole("button", { name: "摄影预设" }))
    fireEvent.click(await screen.findByRole("button", { name: "新建摄影预设" }))
    fireEvent.change(screen.getByPlaceholderText("例如：135 Portra 日常"), {
      target: { value: "超宽 6x10" }
    })
    fireEvent.change(screen.getByPlaceholderText("例如：135 胶片 / 数码常用 / 旅行"), {
      target: { value: "中画幅" }
    })
    fireEvent.change(screen.getByLabelText(/拍摄画幅/), { target: { value: "6x10" } })
    fireEvent.click(screen.getByRole("button", { name: "保存" }))
    // 预设名会同时出现在列表行与应用下拉框中，等待其出现即可
    await screen.findAllByText("超宽 6x10")

    // 4) 选中新预设并应用到全部图片
    const applySelect = screen.getByLabelText("选择预设")
    const presetOption = Array.from((applySelect as HTMLSelectElement).options).find((o) => o.value !== "")
    expect(presetOption).toBeDefined()
    fireEvent.change(applySelect, { target: { value: presetOption!.value } })
    fireEvent.click(screen.getByRole("button", { name: "应用到全部图片" }))

    // 5) 批量导出两张
    fireEvent.click(screen.getByRole("button", { name: /批量导出 2 张/ }))

    // 6) 两张图的 RenderRecipe 都提交成功
    await waitFor(() => {
      expect(renderJobs).toHaveLength(2)
    })

    // 7) 队列中每一张图片的 EXIF 都先被读取（含无 EXIF 的 B），且先于对应导出
    expect(metadataRequests).toContain(PHOTO_A)
    expect(metadataRequests).toContain(PHOTO_B)
    expect(callLog.indexOf(`meta:${PHOTO_A}`)).toBeLessThan(callLog.indexOf(`job:${PHOTO_A}`))
    expect(callLog.indexOf(`meta:${PHOTO_B}`)).toBeLessThan(callLog.indexOf(`job:${PHOTO_B}`))

    // 8) 有 EXIF 的 A：camera/lens 来自 EXIF；画幅来自预设
    const recipeA = renderJobs.find((r) => r.imagePath === PHOTO_A)!
    expect(recipeA.texts[0]).toBe("NIKON Z6 · Nikkor 50mm")
    expect(recipeA.texts[1]).toBe("6×10")

    // 9) 无 EXIF 的 B：降级为空（camera/lens 空、图层跳过），画幅仍来自预设，不阻塞导出
    const recipeB = renderJobs.find((r) => r.imagePath === PHOTO_B)!
    expect(recipeB.texts).toContain("6×10")
    expect(recipeB.texts.some((t) => t.includes("NIKON"))).toBe(false)

    // 10) 预设只提供身份：不改变边框/裁剪/导出设置（filmFormat 来自设置，保持 null）
    expect(recipeA.filmFormat).toBeNull()
    expect(recipeB.filmFormat).toBeNull()
  })

  it("旧 Roll 数据（readRolls 返回旧格式）不会导致工作台崩溃，界面不出现 Roll 入口", async () => {
    const { desktop } = setupWorkspace()
    // 模拟旧版 rolls.json 数据
    desktop.readRolls = vi.fn(async () => "[{ \"id\": \"old-roll\", \"name\": \"Old Roll\", \"camera\": \"Leica M6\" }]")
    render(<WorkspacePage runtime={runtime} />)

    // 工作台正常渲染（无 Roll 面板、无扫描仪/实验室/冲洗工艺入口，不崩溃）
    expect(await screen.findByText("队列")).toBeTruthy()
    expect(screen.queryByText(/Roll|扫描仪|实验室|冲洗工艺/)).toBeNull()
  })
})
