import { afterEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { FilmWorkspacePreview } from "./FilmWorkspacePreview"
import { DEFAULT_SETTINGS } from "../../settings/hooks/useSettings"
import { createDefaultFilmProcessing } from "../defaults"
import { buildRecipeFromSettings } from "../../settings/utils/buildRecipe"
import type { ImageAnalysisResponse } from "../../../types/imageProcessing"
vi.mock("../../../services/engine/imageAnalysisApi", () => ({ analyzeImage: vi.fn() }))
vi.mock("../../../services/engine/previewApi", () => ({ requestPreview: vi.fn() }))
const { analyzeImage } = await import("../../../services/engine/imageAnalysisApi")
const { requestPreview } = await import("../../../services/engine/previewApi")
const config = createDefaultFilmProcessing("/photos/a.ARW")!
const stableRecipe = buildRecipeFromSettings("/photos/a.ARW", DEFAULT_SETTINGS, undefined, undefined, undefined, config)
const state = { kind: "active" as const, filePath: "/photos/a.ARW", fileName: "a.ARW", currentImage: null,
  engineDisplayUrl: "/previews/current", engineSyncStatus: "synced" as const, engineResponse: null, filmMode: true,
  engineRecipe: stableRecipe, engineClientId: "film_test", engineGeneration: 1 }
const analysis: ImageAnalysisResponse = { status: "ok", recipeSignature: "signature", sourceVersion: "version", stage: "current-positive",
  analyzedWidth: 2, analyzedHeight: 1, sampling: "full", bucketCount: 2, histogram: { red: [1, 1], green: [1, 1], blue: [1, 1], luma: [1, 1], underflow: 0, overflow: 0 },
  stats: { pixelCount: 2, mean: [0.2, 0.3, 0.4], min: [0, 0, 0], max: [1, 1, 1], clippedLow: [0, 0, 0], clippedHigh: [0, 0, 0] }, clipping: { stages: {} } }
afterEach(() => { delete (window as unknown as {desktop?: unknown}).desktop; vi.resetAllMocks(); localStorage.clear() })
describe("底片预览工具", () => {
  it("中性取样使用完整源坐标的基础正片预览", async () => {
    vi.mocked(analyzeImage).mockResolvedValue(analysis)
    vi.mocked(requestPreview).mockResolvedValue({ status: "ok", message: "", previewAvailable: true, previewUrl: "/previews/base" })
    render(<FilmWorkspacePreview state={state} settings={DEFAULT_SETTINGS} config={config} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "中性取样" }))
    await waitFor(() => expect(screen.getByRole("img", { name: "底片校色预览" }).getAttribute("src")).toBe("/previews/base"))
    expect(requestPreview).toHaveBeenCalledWith(expect.objectContaining({ stage: "base-positive", sourceCoordinates: true }), undefined, expect.any(AbortSignal))
  })

  it("展示引擎直方图并请求三阶段对比和真实像素", async () => {
    vi.mocked(analyzeImage).mockResolvedValue(analysis)
    vi.mocked(requestPreview).mockResolvedValue({ status: "ok", message: "", previewAvailable: true, previewUrl: "/previews/compare" })
    render(<FilmWorkspacePreview state={state} settings={DEFAULT_SETTINGS} config={config} onChange={vi.fn()} />)
    await screen.findByRole("img", { name: "RGB 直方图" })
    fireEvent.click(screen.getByRole("button", { name: "基础转正" }))
    await waitFor(() => expect(requestPreview).toHaveBeenCalledWith(expect.objectContaining({ stage: "base-positive", recipe: expect.objectContaining({ imageProcessing: config }) }), undefined, expect.any(AbortSignal)))
    fireEvent.click(screen.getByRole("button", { name: "100% 像素" }))
    await waitFor(() => expect(requestPreview).toHaveBeenCalledWith(expect.objectContaining({ maxWidth: 0, maxHeight: 0 }), undefined, expect.any(AbortSignal)))
  })
  it("片基框选先切到完整源坐标负片视图", async () => {
    vi.mocked(analyzeImage).mockResolvedValue(analysis)
    vi.mocked(requestPreview).mockResolvedValue({ status: "ok", message: "", previewAvailable: true, previewUrl: "/previews/raw" })
    render(<FilmWorkspacePreview state={state} settings={DEFAULT_SETTINGS} config={config} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "框选片基" }))
    await waitFor(() => expect(requestPreview).toHaveBeenCalledWith(expect.objectContaining({ stage: "raw-linear", sourceCoordinates: true }), undefined, expect.any(AbortSignal)))
    expect(screen.getByText(/拖动框选未曝光片边/)).toBeTruthy()
  })
  it("分析失败可解释，不显示假直方图", async () => {
    vi.mocked(analyzeImage).mockRejectedValue(new Error("不支持的输入"))
    render(<FilmWorkspacePreview state={state} settings={DEFAULT_SETTINGS} config={config} />)
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "不支持的输入")
    expect(screen.queryByRole("img", { name: "RGB 直方图" })).toBeNull()
  })
  it("参考帧选择尚未返回时切图，旧选择不能写入新图", async () => {
    let resolvePick!: (paths: string[]) => void
    ;(window as unknown as {desktop?: unknown}).desktop = { selectImageFiles: () => new Promise<string[]>((resolve) => { resolvePick = resolve }) }
    vi.mocked(analyzeImage).mockResolvedValue(analysis)
    const onChange = vi.fn()
    const view = render(<FilmWorkspacePreview state={state} settings={DEFAULT_SETTINGS} config={config} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: "选择同卷片基参考帧" }))
    view.rerender(<FilmWorkspacePreview state={{...state,filePath:"/photos/b.ARW"}} settings={DEFAULT_SETTINGS} config={config} onChange={onChange} />)
    await act(async () => { resolvePick(["/photos/reference.ARW"]); await Promise.resolve() })
    await waitFor(() => expect(onChange).not.toHaveBeenCalled())
  })

  it("保存校准使用引擎解析后的数值，应用时携带版本", async () => {
    const onChange = vi.fn()
    vi.mocked(analyzeImage).mockResolvedValue({ ...analysis, calibrationSpaceKey: "linear-rec2020",
      resolvedFilmBase: [0.8, 0.7, 0.6], resolvedLightGain: [1.1, 1, 0.9] })
    render(<FilmWorkspacePreview state={state} settings={DEFAULT_SETTINGS} config={config} onChange={onChange} />)
    await screen.findByRole("img", { name: "RGB 直方图" })
    fireEvent.change(screen.getByRole("textbox", { name: "校准名称" }), { target: { value: "同卷日光" } })
    fireEvent.click(screen.getByRole("button", { name: "保存校准" }))
    await screen.findByRole("option", { name: "同卷日光" })
    fireEvent.click(screen.getByRole("button", { name: "应用校准" }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ negative: expect.objectContaining({
      calibrationSpaceKey: "linear-rec2020", filmBase: expect.objectContaining({ kind: "manual", rgb: [0.8, 0.7, 0.6], calibrationVersion: 1 }),
      lightSource: expect.objectContaining({ rgbGain: [1.1, 1, 0.9], calibrationVersion: 1 })
    }) }), expect.anything())
  })

})

it("阶段预览被替代后同步状态能恢复，基础视图取样重新请求完整坐标", async () => {
  vi.mocked(analyzeImage).mockResolvedValue(analysis)
  let release!: (value: Awaited<ReturnType<typeof requestPreview>>) => void
  vi.mocked(requestPreview).mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    .mockResolvedValue({ status: "ok", message: "", previewAvailable: true, previewUrl: "/previews/raw" })
  render(<FilmWorkspacePreview state={state} settings={DEFAULT_SETTINGS} config={config} onChange={vi.fn()} />)
  await screen.findByRole("img", { name: "RGB 直方图" })
  fireEvent.click(screen.getByRole("button", { name: "基础转正" }))
  fireEvent.click(screen.getByRole("button", { name: "原始负片" }))
  await act(async () => { release({ status: "ok", message: "", previewAvailable: true, previewUrl: "/previews/old" }) })
  await waitFor(() => expect(screen.queryByText("引擎同步中")).toBeNull())
  fireEvent.click(screen.getByRole("button", { name: "基础转正" }))
  await waitFor(() => expect(requestPreview).toHaveBeenLastCalledWith(expect.objectContaining({ sourceCoordinates: false }), undefined, expect.any(AbortSignal)))
  fireEvent.click(screen.getByRole("button", { name: "中性取样" }))
  await waitFor(() => expect(requestPreview).toHaveBeenLastCalledWith(expect.objectContaining({ stage: "base-positive", sourceCoordinates: true }), undefined, expect.any(AbortSignal)))
  fireEvent.click(screen.getByRole("button", { name: "当前结果" }))
  expect(screen.queryByText(/正在显示基础正片/)).toBeNull()
})
