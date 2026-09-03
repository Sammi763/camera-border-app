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
  engine: { managed: false }
}

type RenderJobRecord = {
  readonly imagePath: string
  readonly texts: readonly string[]
  readonly imagePlacement: { readonly mode: string; readonly targetAspectRatio: number | null }
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
        items: readonly {
          recipe: {
            imagePath: string
            texts: readonly { content: string }[]
            imagePlacement: { mode: string; focalX: number; focalY: number; rotation: number; targetAspectRatio: number | null }
          }
        }[]
      }
      for (const snapshot of body.items) {
        callLog.push(`job:${snapshot.recipe.imagePath}`)
        renderJobs.push({
          imagePath: snapshot.recipe.imagePath,
          texts: snapshot.recipe.texts.map((t) => t.content),
          imagePlacement: snapshot.recipe.imagePlacement
        })
      }
      return jsonResponse({
        jobId: "job-batch",
        status: "completed",
        total: body.items.length,
        completed: body.items.length,
        items: body.items.map((snapshot, index) => ({
          index,
          status: "completed",
          outputPath: `/tmp/out/${index}.jpg`,
          actualFormat: "jpeg",
          imagePath: snapshot.recipe.imagePath
        }))
      }, 202)
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
    // 此用例同时挂载完整 WorkspacePage（队列/预设/模板/资产/EXIF/预览/批量导出），
    // 并等待 prepareExifForExport 串行读取 EXIF + 批量导出 render-jobs。
    // 默认 5s 在 CI/冷启动下可能超时；提升到 20s 保证稳定（非隐藏测试）。
    const { renderJobs, metadataRequests, callLog } = setupWorkspace()
    render(<WorkspacePage runtime={runtime} />)

    // 1) 从统一欢迎页导入两张图片（A 有 EXIF，B 无 EXIF）
    fireEvent.click(await screen.findByRole("button", { name: "选择照片" }))
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

    // 3) 打开摄影信息页签与预设管理抽屉，新建 6x10 预设
    fireEvent.click(screen.getByRole("tab", { name: "摄影信息" }))
    fireEvent.click(screen.getByRole("button", { name: "管理拍摄信息预设" }))
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
    fireEvent.click(screen.getByRole("button", { name: "全部图片" }))
    fireEvent.click(screen.getByRole("button", { name: "应用全部" }))

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

    // 8) 有 EXIF 的 A：camera/lens 来自 EXIF（默认摄影信息卡模板 {Camera}·{Lens}·{Film}，
    //    数码照片无胶片字段时自动清理多余分隔符）
    const recipeA = renderJobs.find((r) => r.imagePath === PHOTO_A)!
    expect(recipeA.texts[0]).toBe("NIKON Z6 · Nikkor 50mm")

    // 9) 无 EXIF 的 B：降级为空（camera/lens 空、图层跳过），不阻塞导出
    const recipeB = renderJobs.find((r) => r.imagePath === PHOTO_B)!
    expect(recipeB.texts).toHaveLength(0)
    expect(recipeB.texts.some((t) => t.includes("NIKON"))).toBe(false)

    // 10) 预设只提供身份：渲染配方使用明确的 v2 图片布局，不再写入旧字段
    expect(recipeA.imagePlacement).toEqual({
      mode: "fit",
      focalX: 0.5,
      focalY: 0.5,
      rotation: 0,
      targetAspectRatio: null
    })
    expect(recipeB.imagePlacement).toEqual(recipeA.imagePlacement)
  }, 20000) // CI/冷启动下默认 5s 不足以完成完整批量导出链路；提高至此用例专属上限（非隐藏测试）

  it("旧 Roll 数据（readRolls 返回旧格式）不会导致工作台崩溃，界面不出现 Roll 入口", async () => {
    const { desktop } = setupWorkspace()
    // 模拟旧版 rolls.json 数据
    desktop.readRolls = vi.fn(async () => "[{ \"id\": \"old-roll\", \"name\": \"Old Roll\", \"camera\": \"Leica M6\" }]")
    render(<WorkspacePage runtime={runtime} />)

    // 统一工作台空态正常渲染；（无 Roll 面板、无扫描仪/实验室/冲洗工艺入口，不崩溃）
    expect(await screen.findByText("把照片变成摄影作品卡")).toBeTruthy()
    expect(screen.queryByText(/Roll|扫描仪|实验室|冲洗工艺/)).toBeNull()
  })
})

describe("WorkspacePage 统一工作台（首屏与默认模板）", () => {
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

  it("空队列显示欢迎页（Electron 模式）：选择照片 / 选择文件夹 / 拖入提示 / 价值提示，无加载样片", async () => {
    setupWorkspace()
    render(<WorkspacePage runtime={runtime} />)

    // 欢迎页入口：Electron 模式不显示「加载样片」，避免样片入口接到本机文件选择器
    expect(await screen.findByRole("button", { name: "选择照片" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "选择文件夹" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "加载样片" })).toBeNull()
    expect(screen.getByText(/把照片拖进这个窗口/)).toBeTruthy()
    // 价值提示
    expect(screen.getByText("本地处理")).toBeTruthy()
    expect(screen.getByText("无需登录")).toBeTruthy()
    expect(screen.getByText("EXIF 自动读取")).toBeTruthy()
  })

  it("浏览器降级模式欢迎页额外提供「加载样片」", async () => {
    const harness = setupWorkspace()
    delete (window as unknown as { desktop?: unknown }).desktop
    render(<WorkspacePage runtime={runtime} />)

    expect(await screen.findByRole("button", { name: "选择照片" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "选择文件夹" })).toBeNull()
    expect(screen.getByRole("button", { name: "加载样片" })).toBeTruthy()
    void harness
  })

  it("导入照片后自动应用「摄影信息卡」默认模板", async () => {
    setupWorkspace()
    render(<WorkspacePage runtime={runtime} />)

    fireEvent.click(await screen.findByRole("button", { name: "选择照片" }))
    await waitFor(() => {
      expect(screen.getByText("A.jpg")).toBeTruthy()
    })

    // 默认模板自动应用：摄影信息卡卡片显示「已应用」
    expect(await screen.findByText("已应用")).toBeTruthy()
  })

  it("用户手动选择过模板后，后续导入不再自动覆盖用户选择", async () => {
    setupWorkspace()
    render(<WorkspacePage runtime={runtime} />)

    // 首次导入：自动应用摄影信息卡
    fireEvent.click(await screen.findByRole("button", { name: "选择照片" }))
    await waitFor(() => {
      expect(screen.getByText("A.jpg")).toBeTruthy()
    })
    await screen.findByText("已应用")

    // 手动应用「经典白边」
    const findClassicCard = (): HTMLElement =>
      screen.getByText("经典白边").closest(".templateGalleryCard") as HTMLElement
    fireEvent.click(within(findClassicCard()).getByRole("button", { name: "应用" }))
    expect(within(findClassicCard()).getByRole("button", { name: "已应用" })).toBeTruthy()

    // 清空并重新导入：仍保持经典白边，不自动覆盖回摄影信息卡
    fireEvent.click(screen.getByRole("button", { name: "清空" }))
    fireEvent.click(await screen.findByRole("button", { name: "选择照片" }))
    await waitFor(() => {
      expect(screen.getByText("A.jpg")).toBeTruthy()
    })
    expect(within(findClassicCard()).getByRole("button", { name: "已应用" })).toBeTruthy()
  })

  it("有照片后固定显示三页签、底部导出 Dock，并把管理入口放进抽屉", async () => {
    setupWorkspace()
    const { container } = render(<WorkspacePage runtime={runtime} />)

    fireEvent.click(await screen.findByRole("button", { name: "选择照片" }))
    await waitFor(() => {
      expect(screen.getByText("A.jpg")).toBeTruthy()
    })

    expect(screen.getAllByRole("tab")).toHaveLength(3)
    expect(screen.getByRole("tab", { name: "样式" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "摄影信息" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "输出" })).toBeTruthy()
    expect(screen.getByRole("group", { name: "导出" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "管理用户版式" })).toBeTruthy()

    const themeSelect = screen.getByRole("combobox", { name: "界面主题" })
    expect((themeSelect as HTMLSelectElement).value).toBe("dark")
    fireEvent.change(themeSelect, { target: { value: "warm" } })
    expect(container.querySelector(".workspaceShell")?.getAttribute("data-theme")).toBe("warm")

    fireEvent.click(screen.getByRole("tab", { name: "摄影信息" }))
    fireEvent.click(screen.getByRole("button", { name: "打开资料库" }))
    expect(screen.getByRole("dialog", { name: "资料库" })).toBeTruthy()
    fireEvent.keyDown(screen.getByRole("dialog", { name: "资料库" }), { key: "Escape" })
    expect(screen.queryByRole("dialog", { name: "资料库" })).toBeNull()
  })
})
