import { describe, expect, it } from "vitest"
import { buildTextsFromSettings, encodePlacement } from "./buildTexts"
import type { RenderSettings, TextLayerSettings } from "../types"

/** 构造测试用 RenderSettings，含 3 段文字图层。 */
const makeSettings = (layers: readonly TextLayerSettings[]): RenderSettings => ({
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
  textLayers: layers,
  autoCrop: false,
  filmFormat: null,
  gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
  exportFormat: "png",
  jpegQuality: 95,
  outputSizePreset: "original",
  customOutputLongEdge: 2048,
  preserveMetadata: false,
  preserveColorProfile: false,
  preferHighBitDepth: false,
  borderStyle: null,
  logo: { enabled: false, mode: "auto-brand", brand: null, placement: "border-top-right", size: 14, colorMode: "auto-contrast" },
})

const makeLayer = (id: string, content: string, extra?: Partial<TextLayerSettings>): TextLayerSettings => ({
  id,
  enabled: true,
  content,
  fontFamily: "sans-serif",
  fontSize: 16,
  color: "#000000",
  placement: "bottom-center",
  textArea: "border",
  marginX: 0,
  marginY: 20,
  backgroundEnabled: false,
  backgroundColor: "#000000",
  backgroundPaddingX: 6,
  backgroundPaddingY: 3,
  shadowEnabled: false,
  shadowColor: "#000000",
  shadowBlur: 0,
  shadowOffsetX: 2,
  shadowOffsetY: 2,
  strokeEnabled: false,
  strokeColor: "#000000",
  strokeWidth: 1,
  ...extra,
})

describe("encodePlacement", () => {
  it("border + bottom-center → border-bottom-center", () => {
    expect(encodePlacement("border", "bottom-center")).toBe("border-bottom-center")
  })

  it("image + top-center → image-top-center", () => {
    expect(encodePlacement("image", "top-center")).toBe("image-top-center")
  })

  it("已有前缀的不重复添加", () => {
    expect(encodePlacement("border", "border-top-center")).toBe("border-top-center")
  })
})

describe("buildTextsFromSettings", () => {
  it("空 textLayers 返回空数组", () => {
    const settings = makeSettings([])
    expect(buildTextsFromSettings(settings).length).toBe(0)
  })

  it("多段 enabled 图层都出现在结果中", () => {
    const settings = makeSettings([
      makeLayer("l1", "第一行"),
      makeLayer("l2", "第二行"),
      makeLayer("l3", "第三行"),
    ])
    const texts = buildTextsFromSettings(settings)
    expect(texts.length).toBe(3)
    expect(texts[0]!.content).toBe("第一行")
    expect(texts[1]!.content).toBe("第二行")
    expect(texts[2]!.content).toBe("第三行")
  })

  it("disabled 图层被跳过", () => {
    const settings = makeSettings([
      makeLayer("l1", "第一行"),
      makeLayer("l2", "第二行", { enabled: false }),
      makeLayer("l3", "第三行"),
    ])
    const texts = buildTextsFromSettings(settings)
    expect(texts.length).toBe(2)
    expect(texts[0]!.content).toBe("第一行")
    expect(texts[1]!.content).toBe("第三行")
  })

  it("空内容图层被跳过", () => {
    const settings = makeSettings([
      makeLayer("l1", "第一行"),
      makeLayer("l2", "  "),
      makeLayer("l3", "第三行"),
    ])
    const texts = buildTextsFromSettings(settings)
    expect(texts.length).toBe(2)
  })

  it("textOverride 覆盖第 0 层 content", () => {
    const settings = makeSettings([
      makeLayer("l1", "原始第一行"),
      makeLayer("l2", "第二行"),
    ])
    const texts = buildTextsFromSettings(settings, "覆盖文字")
    expect(texts.length).toBe(2)
    expect(texts[0]!.content).toBe("覆盖文字")
    expect(texts[1]!.content).toBe("第二行")
  })

  it("textOverride 为空时不覆盖", () => {
    const settings = makeSettings([
      makeLayer("l1", "原始第一行"),
    ])
    const texts = buildTextsFromSettings(settings, null)
    expect(texts[0]!.content).toBe("原始第一行")
  })

  it("textOverride 为空字符串时不覆盖", () => {
    const settings = makeSettings([
      makeLayer("l1", "原始第一行"),
    ])
    const texts = buildTextsFromSettings(settings, "  ")
    expect(texts[0]!.content).toBe("原始第一行")
  })

  it("resolvedTexts 覆盖对应层 content", () => {
    const settings = makeSettings([
      makeLayer("l1", "{Camera}"),
      makeLayer("l2", "{Film}"),
    ])
    const texts = buildTextsFromSettings(settings, undefined, ["Nikon F3", "Portra 400"])
    expect(texts[0]!.content).toBe("Nikon F3")
    expect(texts[1]!.content).toBe("Portra 400")
  })

  it("textOverride 优先于 resolvedTexts[0]", () => {
    const settings = makeSettings([
      makeLayer("l1", "{Camera}"),
      makeLayer("l2", "{Film}"),
    ])
    const texts = buildTextsFromSettings(settings, "手动覆盖", ["Nikon F3", "Portra 400"])
    expect(texts[0]!.content).toBe("手动覆盖")
    expect(texts[1]!.content).toBe("Portra 400")
  })

  it("resolvedTexts 中 null 值回退到 layer.content", () => {
    const settings = makeSettings([
      makeLayer("l1", "原始第一行"),
      makeLayer("l2", "原始第二行"),
    ])
    const texts = buildTextsFromSettings(settings, undefined, [null, "解析第二行"])
    expect(texts[0]!.content).toBe("原始第一行")
    expect(texts[1]!.content).toBe("解析第二行")
  })

  it("样式字段（背景条/阴影/描边）正确传递到 TextItem", () => {
    const settings = makeSettings([
      makeLayer("l1", "test", {
        backgroundEnabled: true,
        backgroundColor: "#ff0000",
        shadowEnabled: true,
        shadowColor: "#000000",
        shadowBlur: 4,
        strokeEnabled: true,
        strokeColor: "#ffffff",
        strokeWidth: 2,
      }),
    ])
    const texts = buildTextsFromSettings(settings)
    expect(texts[0]!.backgroundEnabled).toBe(true)
    expect(texts[0]!.backgroundColor).toBe("#ff0000")
    expect(texts[0]!.shadowEnabled).toBe(true)
    expect(texts[0]!.shadowBlur).toBe(4)
    expect(texts[0]!.strokeEnabled).toBe(true)
    expect(texts[0]!.strokeWidth).toBe(2)
  })
})
