import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import type { ComponentProps } from "react"
import { TemplateGallery } from "./TemplateGallery"
import { BUILT_IN_TEMPLATES, PHOTO_INFO_CARD_TEMPLATE_IDS } from "../presets/builtInTemplates"
import type { RenderSettings } from "../../settings/types"

/**
 * 版式画廊测试：
 * - 缩略图使用当前选中变体的实际配置，普通卡片使用「有效设置 + 模板 patch」的合并结果；
 * - 说明与字段标签收进「详情」展开区，展开不触发应用；
 * - 摄影信息卡的布局／边框设置位于画廊网格下方的独立分组，仅在已应用时展示；
 * - 精选／全部切换继续持久化到 localStorage。
 */

vi.mock("../../preview/canvas/canvasRenderer", async () => {
  const actual = await vi.importActual<typeof import("../../preview/canvas/canvasRenderer")>(
    "../../preview/canvas/canvasRenderer"
  )
  return {
    ...actual,
    drawPreviewToCanvas: vi.fn()
  }
})

import { drawPreviewToCanvas } from "../../preview/canvas/canvasRenderer"

const baseSettings = (): RenderSettings => ({
  borderColor: "#ffffff",
  borderTop: 20,
  borderBottom: 80,
  borderLeft: 20,
  borderRight: 20,
  textContent: "",
  textFontSize: 24,
  textColor: "#000000",
  textPlacement: "bottom-center",
  textArea: "border",
  fontFamily: "sans-serif",
  textLayers: [],
  gradient: { enabled: false, type: "linear", angle: 0, stops: [] },
  exportFormat: "png",
  jpegQuality: 95,
  outputSizePreset: "original",
  customOutputLongEdge: 2048,
  preserveMetadata: false,
  preserveColorProfile: false,
  preferHighBitDepth: false,
  borderStyle: null,
  logo: { enabled: false, mode: "auto-brand", brand: null, placement: "border-top-right", size: 14, colorMode: "auto-contrast" }
})

const fakeImage = (): HTMLImageElement =>
  ({ naturalWidth: 300, naturalHeight: 200, src: "blob:mock" }) as unknown as HTMLImageElement

type GalleryProps = ComponentProps<typeof TemplateGallery>

/** 统一渲染入口：返回可复用的回调 mock 与局部 rerender（用于模拟已应用变体变化）。 */
const renderGallery = (overrides: Partial<GalleryProps> = {}) => {
  const onApply = vi.fn()
  const onApplyInfoCardVariant = vi.fn()
  const baseProps: GalleryProps = {
    activePresetId: null,
    recommendedTemplateId: null,
    currentImage: null,
    currentSettings: baseSettings(),
    onApply,
    onApplyInfoCardVariant
  }
  const view = render(<TemplateGallery {...baseProps} {...overrides} />)
  const rerenderGallery = (next: Partial<GalleryProps>): void => {
    view.rerender(<TemplateGallery {...baseProps} {...overrides} {...next} />)
  }
  return { ...view, rerenderGallery, onApply, onApplyInfoCardVariant }
}

const findCard = (name: string): HTMLElement => {
  const card = screen.getByText(name).closest(".templateGalleryCard")
  if (!(card instanceof HTMLElement)) {
    throw new Error(`未找到模板卡片：${name}`)
  }
  return card
}

const findDetailsRegion = (card: HTMLElement, detailsId: string): HTMLElement | null =>
  card.querySelector<HTMLElement>(`[id="${detailsId}"]`)

const INFO_CARD_VARIANT_CASES = [
  { id: PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite, layout: "底部居中", border: "白边" },
  { id: PHOTO_INFO_CARD_TEMPLATE_IDS.centerBlack, layout: "底部居中", border: "黑边" },
  { id: PHOTO_INFO_CARD_TEMPLATE_IDS.leftWhite, layout: "左下", border: "白边" },
  { id: PHOTO_INFO_CARD_TEMPLATE_IDS.leftBlack, layout: "左下", border: "黑边" }
] as const

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("TemplateGallery（U03 缩略图有效性）", () => {
  it("摄影信息卡选中黑边变体时，缩略图使用黑边变体的实际配置", () => {
    const blackVariant = BUILT_IN_TEMPLATES.find((t) => t.id === PHOTO_INFO_CARD_TEMPLATE_IDS.centerBlack)
    expect(blackVariant).toBeDefined()
    render(
      <TemplateGallery
        activePresetId={PHOTO_INFO_CARD_TEMPLATE_IDS.centerBlack}
        recommendedTemplateId={null}
        currentImage={fakeImage()}
        currentSettings={baseSettings()}
        onApply={vi.fn()}
        onApplyInfoCardVariant={vi.fn()}
      />
    )

    expect(screen.getByText("已应用")).toBeTruthy()
    const calls = (drawPreviewToCanvas as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    // 信息卡缩略图的合并设置必须包含黑边变体 patch 的全部字段（而非基础白边版式）
    const infoCardCall = calls.find((call) => {
      const used = call[2] as RenderSettings
      return blackVariant !== undefined
        && Object.entries(blackVariant.settingsPatch).every(([key, value]) =>
          JSON.stringify((used as Record<string, unknown>)[key]) === JSON.stringify(value))
    })
    expect(infoCardCall).toBeDefined()
  })

  it("普通卡片把有效设置与模板 patch 合并后交给共享渲染器", () => {
    const polaroid = BUILT_IN_TEMPLATES.find((t) => t.id === "polaroid")
    expect(polaroid).toBeDefined()
    render(
      <TemplateGallery
        activePresetId={null}
        recommendedTemplateId={null}
        currentImage={fakeImage()}
        currentSettings={baseSettings()}
        onApply={vi.fn()}
        onApplyInfoCardVariant={vi.fn()}
      />
    )

    const calls = (drawPreviewToCanvas as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.length).toBeGreaterThan(1)
    const polaroidCall = calls.find((call) => {
      const used = call[2] as RenderSettings
      return polaroid !== undefined
        && Object.entries(polaroid.settingsPatch).every(([key, value]) =>
          JSON.stringify((used as Record<string, unknown>)[key]) === JSON.stringify(value))
    })
    expect(polaroidCall).toBeDefined()
  })

  it("无当前照片时回退静态缩略图，不调用共享渲染器", () => {
    render(
      <TemplateGallery
        activePresetId={null}
        recommendedTemplateId={null}
        currentImage={null}
        currentSettings={baseSettings()}
        onApply={vi.fn()}
        onApplyInfoCardVariant={vi.fn()}
      />
    )
    expect(drawPreviewToCanvas).not.toHaveBeenCalled()
  })
})

describe("TemplateGallery 卡片详情", () => {
  it("详情默认收起；展开只显示说明与字段，不触发任何应用回调", () => {
    const { onApply, onApplyInfoCardVariant } = renderGallery()
    const card = findCard("摄影信息卡")
    const detailsButton = within(card).getByRole("button", { name: "详情" })
    const detailsId = detailsButton.getAttribute("aria-controls")

    expect(detailsButton.getAttribute("aria-expanded")).toBe("false")
    expect(detailsId).toBeTruthy()
    const details = findDetailsRegion(card, detailsId!)
    expect(details).not.toBeNull()
    expect(details!.hidden).toBe(true)
    // 默认关闭时说明与字段标签不进入可见内容。
    expect(within(card).queryByText(/白边画廊卡纸感/)).toBeNull()
    expect(within(card).queryByText("相机")).toBeNull()

    fireEvent.click(detailsButton)

    expect(detailsButton.getAttribute("aria-expanded")).toBe("true")
    expect(detailsButton.textContent).toBe("收起详情")
    expect(details!.hidden).toBe(false)
    expect(within(details!).getByText(/白边画廊卡纸感/)).toBeTruthy()
    expect(within(details!).getByText("相机")).toBeTruthy()
    expect(within(details!).getByText("镜头")).toBeTruthy()
    expect(within(details!).getByText("胶片")).toBeTruthy()
    expect(onApply).not.toHaveBeenCalled()
    expect(onApplyInfoCardVariant).not.toHaveBeenCalled()
  })

  it("每张卡片的详情区域 id 唯一且都能被 aria-controls 找到", () => {
    renderGallery()
    const detailButtons = screen.getAllByRole("button", { name: "详情" })
    const detailsIds = detailButtons.map((button) => button.getAttribute("aria-controls"))

    expect(detailsIds.length).toBeGreaterThan(1)
    expect(new Set(detailsIds).size).toBe(detailsIds.length)
    for (const detailsId of detailsIds) {
      expect(detailsId).toBeTruthy()
      expect(document.getElementById(detailsId!)).toBeTruthy()
    }
  })
})

describe("TemplateGallery 摄影信息卡应用与设置分组", () => {
  it("未应用摄影信息卡时点击应用使用默认 centerWhite，且不展示当前版式设置", () => {
    const { onApply, onApplyInfoCardVariant } = renderGallery({ activePresetId: null })
    expect(screen.queryByRole("region", { name: "当前版式设置" })).toBeNull()

    fireEvent.click(within(findCard("摄影信息卡")).getByRole("button", { name: "应用" }))

    expect(onApplyInfoCardVariant).toHaveBeenCalledWith(PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite)
    expect(onApply).not.toHaveBeenCalled()
  })

  for (const variantCase of INFO_CARD_VARIANT_CASES) {
    it(`已应用摄影信息卡（${variantCase.id}）时点击应用沿用当前变体`, () => {
      const { onApply, onApplyInfoCardVariant } = renderGallery({ activePresetId: variantCase.id })

      fireEvent.click(within(findCard("摄影信息卡")).getByRole("button", { name: "已应用" }))

      expect(onApplyInfoCardVariant).toHaveBeenCalledWith(variantCase.id)
      expect(onApply).not.toHaveBeenCalled()
    })

    it(`摄影信息卡变体（${variantCase.id}）的布局与边框正确高亮`, () => {
      renderGallery({ activePresetId: variantCase.id })
      const settings = screen.getByRole("region", { name: "当前版式设置" })
      const layoutButton = within(settings).getByRole("button", { name: variantCase.layout })
      const borderButton = within(settings).getByRole("button", { name: variantCase.border })
      const otherLayout = variantCase.layout === "底部居中" ? "左下" : "底部居中"
      const otherBorder = variantCase.border === "白边" ? "黑边" : "白边"

      expect(layoutButton.className).toContain("templateGalleryVariantActive")
      expect(borderButton.className).toContain("templateGalleryVariantActive")
      expect(within(settings).getByRole("button", { name: otherLayout }).className)
        .not.toContain("templateGalleryVariantActive")
      expect(within(settings).getByRole("button", { name: otherBorder }).className)
        .not.toContain("templateGalleryVariantActive")
    })
  }

  it("切换变体后两组按钮的可访问选中状态同步更新，未选按钮保持未按下", () => {
    const { rerenderGallery } = renderGallery({ activePresetId: PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite })

    for (const variantCase of INFO_CARD_VARIANT_CASES) {
      rerenderGallery({ activePresetId: variantCase.id })
      const settings = screen.getByRole("region", { name: "当前版式设置" })
      expect(within(settings).getByRole("button", { name: variantCase.layout, pressed: true })).toBeTruthy()
      expect(within(settings).getByRole("button", { name: variantCase.border, pressed: true })).toBeTruthy()
      expect(within(settings).getAllByRole("button", { pressed: true })).toHaveLength(2)
      expect(within(settings).getAllByRole("button", { pressed: false })).toHaveLength(2)
    }

    rerenderGallery({ activePresetId: "classic-white" })
    expect(screen.queryByRole("region", { name: "当前版式设置" })).toBeNull()
  })

  it("当前版式设置分组只在摄影信息卡已应用时展示", () => {
    const { rerenderGallery } = renderGallery({ activePresetId: "classic-white" })
    expect(screen.queryByRole("region", { name: "当前版式设置" })).toBeNull()

    rerenderGallery({ activePresetId: PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite })
    expect(screen.getByRole("region", { name: "当前版式设置" })).toBeTruthy()

    rerenderGallery({ activePresetId: null })
    expect(screen.queryByRole("region", { name: "当前版式设置" })).toBeNull()
  })

  it("切换布局保留当前边框，切换边框保留当前布局", () => {
    const { rerenderGallery, onApplyInfoCardVariant } = renderGallery({
      activePresetId: PHOTO_INFO_CARD_TEMPLATE_IDS.centerBlack
    })
    const settings = (): HTMLElement => screen.getByRole("region", { name: "当前版式设置" })

    // 居中 + 黑边 -> 左下，仍保留黑边
    fireEvent.click(within(settings()).getByRole("button", { name: "左下" }))
    expect(onApplyInfoCardVariant).toHaveBeenLastCalledWith(PHOTO_INFO_CARD_TEMPLATE_IDS.leftBlack)
    onApplyInfoCardVariant.mockClear()

    // 左下 + 黑边 -> 白边，仍保留左下
    rerenderGallery({ activePresetId: PHOTO_INFO_CARD_TEMPLATE_IDS.leftBlack })
    fireEvent.click(within(settings()).getByRole("button", { name: "白边" }))
    expect(onApplyInfoCardVariant).toHaveBeenLastCalledWith(PHOTO_INFO_CARD_TEMPLATE_IDS.leftWhite)
    onApplyInfoCardVariant.mockClear()

    // 左下 + 白边 -> 居中，仍保留白边
    rerenderGallery({ activePresetId: PHOTO_INFO_CARD_TEMPLATE_IDS.leftWhite })
    fireEvent.click(within(settings()).getByRole("button", { name: "底部居中" }))
    expect(onApplyInfoCardVariant).toHaveBeenLastCalledWith(PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite)
    onApplyInfoCardVariant.mockClear()

    // 居中 + 白边 -> 黑边，仍保留居中
    rerenderGallery({ activePresetId: PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite })
    fireEvent.click(within(settings()).getByRole("button", { name: "黑边" }))
    expect(onApplyInfoCardVariant).toHaveBeenLastCalledWith(PHOTO_INFO_CARD_TEMPLATE_IDS.centerBlack)
  })

  it("无效 activePresetId 不崩溃，并按未应用状态回退默认变体", () => {
    const { onApply, onApplyInfoCardVariant } = renderGallery({ activePresetId: "not-a-real-template" })

    expect(screen.queryByText("已应用")).toBeNull()
    expect(screen.queryByRole("region", { name: "当前版式设置" })).toBeNull()

    fireEvent.click(within(findCard("摄影信息卡")).getByRole("button", { name: "应用" }))

    expect(onApplyInfoCardVariant).toHaveBeenCalledWith(PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite)
    expect(onApply).not.toHaveBeenCalled()
  })
})

describe("TemplateGallery 精选／全部切换", () => {
  it("切换后写入 localStorage，并能在下次挂载时恢复偏好", () => {
    const first = renderGallery()
    expect(screen.queryByText("暗房黑边")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: /展开全部版式/ }))
    expect(screen.getByText("暗房黑边")).toBeTruthy()
    expect(window.localStorage.getItem("camborder.gallery.showAllTemplates")).toBe("true")

    first.unmount()
    renderGallery()
    expect(screen.getByText("暗房黑边")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "收起，只看精选" }))
    expect(screen.queryByText("暗房黑边")).toBeNull()
    expect(window.localStorage.getItem("camborder.gallery.showAllTemplates")).toBe("false")
  })

  it("收起状态下保留当前已应用的非精选模板，取消应用后恢复精选列表", () => {
    const { rerenderGallery } = renderGallery({ activePresetId: "darkroom-black" })

    // 默认收起：非精选模板本不在常规列表中，但已应用时必须保留卡片与状态。
    expect(screen.getByText("暗房黑边")).toBeTruthy()
    expect(within(findCard("暗房黑边")).getByRole("button", { name: "已应用" })).toBeTruthy()
    // 收起状态不应因此退化为“全部版式”。
    expect(screen.queryByText("Negative Sleeve")).toBeNull()

    rerenderGallery({ activePresetId: null })

    expect(screen.queryByText("暗房黑边")).toBeNull()
    expect(screen.getByText("经典白边")).toBeTruthy()
  })

  it("摄影信息卡的非默认变体只通过设置分组切换，不出现在网格卡片中", () => {
    renderGallery({ activePresetId: PHOTO_INFO_CARD_TEMPLATE_IDS.leftBlack })

    expect(screen.getByRole("region", { name: "当前版式设置" })).toBeTruthy()
    expect(screen.queryByText("摄影信息卡 · 黑 · 左下")).toBeNull()
    expect(screen.getAllByText("摄影信息卡")).toHaveLength(1)
  })
})
