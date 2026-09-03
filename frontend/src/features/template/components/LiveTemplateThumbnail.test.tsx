import { afterEach, describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"
import { LiveTemplateThumbnail } from "./LiveTemplateThumbnail"
import type { RenderSettings } from "../../settings/types"

/**
 * 当前照片模板缩略图测试：
 * - 缩略图必须复用与主预览/导出同一个 drawPreviewToCanvas；
 * - 绘制使用「当前设置 + 模板 patch」合并后的完整配置（同一份配置）；
 * - 设置变化时立即重绘。
 */

vi.mock("../../preview/canvas/canvasRenderer", () => ({
  drawPreviewToCanvas: vi.fn()
}))

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
  ({ naturalWidth: 300, naturalHeight: 200 }) as unknown as HTMLImageElement

afterEach(() => {
  vi.clearAllMocks()
})

describe("LiveTemplateThumbnail（当前照片模板缩略图）", () => {
  it("有当前照片时调用共享渲染器，画布尺寸为图片+边框的真实比例", () => {
    render(<LiveTemplateThumbnail image={fakeImage()} settings={baseSettings()} />)
    expect(drawPreviewToCanvas).toHaveBeenCalledTimes(1)
    const [canvas, , settings] = (drawPreviewToCanvas as ReturnType<typeof vi.fn>).mock.calls[0]!
    const c = canvas as HTMLCanvasElement
    // 内部分辨率 = 图片 + 边框（保证边框比例与真实渲染一致）
    expect(c.width).toBe(300 + 20 + 20)
    expect(c.height).toBe(200 + 20 + 80)
    expect(settings.borderBottom).toBe(80)
  })

  it("传给渲染器的来源必须是原始 HTMLImageElement（不能是只有尺寸的纯对象）", () => {
    // 回归：之前用 { naturalWidth, naturalHeight } as HTMLImageElement 适配，
    // 浏览器中 ctx.drawImage 会拒绝该纯对象，模板缩略图实际为空白。
    const image = fakeImage()
    render(<LiveTemplateThumbnail image={image} settings={baseSettings()} />)
    const [, source] = (drawPreviewToCanvas as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(source).toBe(image)
  })

  it("绘制使用合并后的模板配置（含 borderStyle），与主预览同一份配置", () => {
    const settings: RenderSettings = {
      ...baseSettings(),
      borderStyle: { id: "film-perforation", intensity: 90, edgeWidth: 12, holeCount: 16, paperTone: "#e8e8e8" }
    }
    render(<LiveTemplateThumbnail image={fakeImage()} settings={settings} />)
    const [, , used] = (drawPreviewToCanvas as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect((used as RenderSettings).borderStyle?.id).toBe("film-perforation")
  })

  it("大图先压到性能上限再参与布局计算", () => {
    const big = { naturalWidth: 6000, naturalHeight: 4000 } as unknown as HTMLImageElement
    const createElement = document.createElement.bind(document)
    const spy = vi.spyOn(document, "createElement")
    render(<LiveTemplateThumbnail image={big} settings={baseSettings()} />)
    // 创建了离屏 canvas 用于缩放
    expect(spy.mock.calls.some(([tag]) => tag === "canvas")).toBe(true)
    const [canvas, source] = (drawPreviewToCanvas as ReturnType<typeof vi.fn>).mock.calls[0]!
    const c = canvas as HTMLCanvasElement
    // 长边压到 ≤900 后再加边框
    expect(c.width).toBeLessThanOrEqual(900 + 40)
    // 回归：大图必须传离屏画布给渲染器，而不是只有尺寸的纯对象；
    // 否则浏览器中 ctx.drawImage 拒绝绘制，模板缩略图为空白。
    expect(source).toBeInstanceOf(HTMLCanvasElement)
    void createElement
    spy.mockRestore()
  })

  it("无当前照片时不调用渲染器", () => {
    render(<LiveTemplateThumbnail image={null} settings={baseSettings()} />)
    expect(drawPreviewToCanvas).not.toHaveBeenCalled()
  })
})
