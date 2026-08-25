import { describe, expect, it, vi, afterEach } from "vitest"
import type { Mock } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { ShootingPresetPanel } from "./ShootingPresetPanel"
import type { PhotoAssetStore, ShootingPreset } from "../types"
import { createEmptyAssetStore } from "../types"

/** 构造预设。 */
const makePreset = (patch: Partial<ShootingPreset> = {}): ShootingPreset => ({
  id: "p1",
  name: "135 Portra 日常",
  category: "135 胶片",
  captureFormat: "135",
  cameraAssetId: null,
  lensAssetId: null,
  filmAssetId: null,
  defaultLocation: null,
  notes: null,
  ...patch
})

/** 含三类资产的资产库。 */
const makeAssetStore = (): PhotoAssetStore => ({
  ...createEmptyAssetStore(),
  cameras: [{ id: "cam-1", brand: "Leica", model: "M6", alias: "", notes: "" }],
  lenses: [{ id: "lens-1", brand: "Voigtlander", model: "35mm", focalLength: "35", maxAperture: "1.4", mount: "M", notes: "" }],
  films: [{ id: "film-1", brand: "Kodak", name: "Portra 400", iso: "400", type: "Color", colorProfile: "neutral", discontinued: false, notes: "" }]
})

type PanelProps = Parameters<typeof ShootingPresetPanel>[0]

/** 回调全部为 mock，便于断言调用。 */
type PanelMocks = {
  readonly onSavePreset: Mock
  readonly onDuplicatePreset: Mock
  readonly onDeletePreset: Mock
  readonly onClearError: Mock
  readonly onApplyToScope: Mock
  readonly onClearScope: Mock
}

const renderPanel = (overrides: Partial<PanelProps> = {}): { props: PanelProps & PanelMocks } & ReturnType<typeof render> => {
  const props = {
    presets: [makePreset(), makePreset({ id: "p2", name: "京都旅行", category: "旅行", captureFormat: "6x10" })],
    lastError: null,
    onSavePreset: vi.fn(),
    onDuplicatePreset: vi.fn(() => null),
    onDeletePreset: vi.fn(),
    onClearError: vi.fn(),
    onApplyToScope: vi.fn(),
    onClearScope: vi.fn(),
    hasSelectedImage: true,
    queueCount: 3,
    checkedCount: 0,
    assetStore: makeAssetStore(),
    presetUsageCounts: new Map<string, number>(),
    ...overrides
  } as unknown as PanelProps & PanelMocks
  const utils = render(<ShootingPresetPanel {...props} />)
  return { props, ...utils }
}

/** 进入新建/编辑表单。 */
const startCreate = async (): Promise<void> => {
  fireEvent.click(screen.getByRole("button", { name: "新建摄影预设" }))
}

/** 在画幅下拉中选择指定画幅。 */
const selectCaptureFormat = (value: string): void => {
  fireEvent.change(screen.getByLabelText(/拍摄画幅/), { target: { value } })
}

describe("ShootingPresetPanel（集成）", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("创建预设：填写名称/分类/画幅后保存，回调收到合法预设（6x10 可创建）", async () => {
    const { props } = renderPanel()
    await startCreate()

    fireEvent.change(screen.getByPlaceholderText("例如：135 Portra 日常"), {
      target: { value: "超宽 6x10" }
    })
    fireEvent.change(screen.getByPlaceholderText("例如：135 胶片 / 数码常用 / 旅行"), {
      target: { value: "中画幅" }
    })
    selectCaptureFormat("6x10")

    fireEvent.click(screen.getByRole("button", { name: "保存" }))

    expect(props.onSavePreset).toHaveBeenCalledTimes(1)
    const saved = props.onSavePreset.mock.calls[0]![0] as ShootingPreset
    expect(saved.name).toBe("超宽 6x10")
    expect(saved.category).toBe("中画幅")
    expect(saved.captureFormat).toBe("6x10")
    expect(saved.id.length).toBeGreaterThan(0)
  })

  it("6x12 也能创建预设（保留画幅）", async () => {
    const { props } = renderPanel()
    await startCreate()
    fireEvent.change(screen.getByPlaceholderText("例如：135 Portra 日常"), {
      target: { value: "超宽 6x12" }
    })
    selectCaptureFormat("6x12")
    fireEvent.click(screen.getByRole("button", { name: "保存" }))
    expect((props.onSavePreset.mock.calls[0]![0] as ShootingPreset).captureFormat).toBe("6x12")
  })

  it("空名称：显示错误提示且不保存", async () => {
    const { props } = renderPanel()
    await startCreate()
    selectCaptureFormat("135")
    fireEvent.click(screen.getByRole("button", { name: "保存" }))
    expect(screen.getByText("预设名称不能为空。")).toBeTruthy()
    expect(props.onSavePreset).not.toHaveBeenCalled()
  })

  it("缺少画幅：显示错误提示且不保存", async () => {
    const { props } = renderPanel()
    await startCreate()
    fireEvent.change(screen.getByPlaceholderText("例如：135 Portra 日常"), {
      target: { value: "无画幅预设" }
    })
    fireEvent.click(screen.getByRole("button", { name: "保存" }))
    expect(screen.getByText("请选择拍摄画幅。")).toBeTruthy()
    expect(props.onSavePreset).not.toHaveBeenCalled()
  })

  it("分类筛选：只显示所选分类的预设", () => {
    const { container } = renderPanel()
    fireEvent.change(screen.getByLabelText(/分类/), { target: { value: "135 胶片" } })
    const list = container.querySelector(".presetList") as HTMLElement
    expect(within(list).getByText("135 Portra 日常")).toBeTruthy()
    expect(within(list).queryByText("京都旅行")).toBeNull()
  })

  it("编辑预设：回填表单并保存", async () => {
    const { props } = renderPanel()
    fireEvent.click(screen.getAllByRole("button", { name: "编辑" })[0]!)
    const nameInput = screen.getByPlaceholderText("例如：135 Portra 日常") as HTMLInputElement
    expect(nameInput.value).toBe("135 Portra 日常")
    fireEvent.change(nameInput, { target: { value: "改名后的预设" } })
    fireEvent.click(screen.getByRole("button", { name: "保存" }))
    expect((props.onSavePreset.mock.calls[0]![0] as ShootingPreset).name).toBe("改名后的预设")
  })

  it("复制预设：调用 onDuplicatePreset", async () => {
    const { props } = renderPanel()
    fireEvent.click(screen.getAllByRole("button", { name: "复制" })[0]!)
    expect(props.onDuplicatePreset).toHaveBeenCalledWith("p1")
  })

  it("删除未被引用预设：直接删除", async () => {
    const { props } = renderPanel()
    fireEvent.click(screen.getAllByRole("button", { name: "删除" })[0]!)
    expect(props.onDeletePreset).toHaveBeenCalledWith("p1")
  })

  it("删除被引用预设：需确认，取消则不删，确认则删", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false)
    const { props } = renderPanel({ presetUsageCounts: new Map([["p1", 2]]) })

    fireEvent.click(screen.getAllByRole("button", { name: "删除" })[0]!)
    expect(confirmSpy).toHaveBeenCalled()
    expect(props.onDeletePreset).not.toHaveBeenCalled()

    confirmSpy.mockReturnValue(true)
    fireEvent.click(screen.getAllByRole("button", { name: "删除" })[0]!)
    expect(props.onDeletePreset).toHaveBeenCalledWith("p1")
    confirmSpy.mockRestore()
  })

  it("无当前图片时应用按钮禁用（默认作用域为当前图片）", () => {
    renderPanel({ hasSelectedImage: false })
    const applyButton = screen.getByRole("button", { name: "应用当前" })
    expect(applyButton.hasAttribute("disabled")).toBe(true)
  })

  it("有当前图片但未选预设时应用按钮禁用", () => {
    renderPanel()
    const applyButton = screen.getByRole("button", { name: "应用当前" })
    expect(applyButton.hasAttribute("disabled")).toBe(true)
  })

  it("应用作用域：当前图片 / 已选图片 / 全部图片，选择预设后调用回调", async () => {
    const { props } = renderPanel({ checkedCount: 2 })
    const applySelect = screen.getByLabelText(/选择预设/)
    fireEvent.change(applySelect, { target: { value: "p2" } })

    // 当前图片作用域（默认）
    const applyCurrent = screen.getByRole("button", { name: "应用当前" })
    expect(applyCurrent.hasAttribute("disabled")).toBe(false)
    fireEvent.click(applyCurrent)
    expect(props.onApplyToScope).toHaveBeenCalledWith("p2", "active")

    // 已选图片作用域：点击「已选 2 张」后按钮变为「应用已选」
    fireEvent.click(screen.getByRole("button", { name: "已选 2 张" }))
    const applyChecked = screen.getByRole("button", { name: "应用已选" })
    expect(applyChecked.hasAttribute("disabled")).toBe(false)
    fireEvent.click(applyChecked)
    expect(props.onApplyToScope).toHaveBeenCalledWith("p2", "checked")

    // 全部图片作用域
    fireEvent.click(screen.getByRole("button", { name: "全部图片" }))
    const applyAll = screen.getByRole("button", { name: "应用全部" })
    expect(applyAll.hasAttribute("disabled")).toBe(false)
    fireEvent.click(applyAll)
    expect(props.onApplyToScope).toHaveBeenCalledWith("p2", "all")
  })

  it("无已选图片时「已选」作用域按钮禁用", () => {
    renderPanel({ checkedCount: 0 })
    const scopeBtn = screen.getByRole("button", { name: "已选 0 张" })
    expect(scopeBtn.hasAttribute("disabled")).toBe(true)
  })

  it("引用资产列表：相机/镜头/胶片下拉来自资产库", async () => {
    renderPanel()
    await startCreate()
    const cameraSelect = screen.getByLabelText(/相机资产/) as HTMLSelectElement
    expect(within(cameraSelect).getByRole("option", { name: "Leica M6" })).toBeTruthy()
    const filmSelect = screen.getByLabelText(/胶片资产/) as HTMLSelectElement
    expect(within(filmSelect).getByRole("option", { name: "Kodak Portra 400" })).toBeTruthy()
  })

  it("错误横幅显示并可通过关闭按钮清除", async () => {
    const { props } = renderPanel({ lastError: "摄影预设读取失败，请检查文件权限或重启应用。" })
    expect(screen.getByText(/摄影预设读取失败/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "关闭" }))
    expect(props.onClearError).toHaveBeenCalled()
  })
})
