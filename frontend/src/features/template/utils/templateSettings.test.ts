import { describe, expect, it } from "vitest"
import { isLayoutSettings, toLayoutSettings } from "./templateSettings"
import type { RenderSettings } from "../../settings/types"

const visualSettings: RenderSettings = {
  borderColor: "#ffffff",
  borderTop: 20,
  borderBottom: 30,
  borderLeft: 20,
  borderRight: 20,
  textContent: "",
  textFontSize: 20,
  textColor: "#000000",
  textPlacement: "bottom-center",
  textArea: "border",
  fontFamily: "sans-serif",
  textLayers: [],
  gradient: {
    enabled: false,
    type: "linear" as const,
    angle: 0,
    stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }]
  },
  borderStyle: null,
  logo: {
    enabled: false,
    mode: "auto-brand" as const,
    brand: null,
    placement: "border-top-right",
    size: 14,
    colorMode: "auto-contrast" as const
  },
  exportFormat: "jpeg" as const,
  jpegQuality: 72,
  outputSizePreset: "2k" as const,
  customOutputLongEdge: 2048,
  preserveMetadata: true,
  preserveColorProfile: true,
  preferHighBitDepth: false
}

describe("templateSettings", () => {
  it("版式快照剥离所有输出设置", () => {
    const layout = toLayoutSettings(visualSettings)
    expect(layout).not.toHaveProperty("exportFormat")
    expect(layout).not.toHaveProperty("jpegQuality")
    expect(layout).not.toHaveProperty("outputSizePreset")
    expect(layout).not.toHaveProperty("preserveMetadata")
    expect(isLayoutSettings(layout)).toBe(true)
  })

  it("运行时拒绝混入输出设置的版式对象", () => {
    expect(isLayoutSettings({
      ...toLayoutSettings(visualSettings),
      exportFormat: "png"
    })).toBe(false)
  })

  it("迁移早期版式中的嵌套输出容器", () => {
    const legacySettings = {
      ...visualSettings,
      export: { format: "jpeg", quality: 80 },
      output: { longEdge: 2048 }
    }
    const layout = toLayoutSettings(legacySettings)

    expect(layout).not.toHaveProperty("export")
    expect(layout).not.toHaveProperty("output")
    expect(isLayoutSettings(layout)).toBe(true)
    expect(isLayoutSettings({
      ...layout,
      outputPreset: { name: "旧输出" }
    })).toBe(false)
  })
})
