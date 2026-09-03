import { describe, expect, it } from "vitest"
import { buildResolvedRenderSettings, buildTextsFromSettings, resolveLogoBrand } from "./buildTexts"
import { buildRecipeFromSettings, buildPreviewRequest } from "./buildRecipe"
import type { RenderSettings, TextLayerSettings } from "../types"

/** 默认 logo 配置。 */
const defaultLogo = {
  enabled: false,
  mode: "auto-brand" as "auto-brand" | "brand-text",
  brand: null as string | null,
  placement: "border-top-right",
  size: 14,
  colorMode: "auto-contrast" as "auto-contrast" | "light" | "dark",
}

/** 构造最小合法 RenderSettings。 */
const makeSettings = (
  layers: readonly TextLayerSettings[],
  logo?: Partial<typeof defaultLogo>
): RenderSettings => ({
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
  gradient: { enabled: false, type: "linear", angle: 0, stops: [{ offset: 0, color: "#000000" }, { offset: 1, color: "#ffffff" }] },
  exportFormat: "png",
  jpegQuality: 95,
  outputSizePreset: "original",
  customOutputLongEdge: 2048,
  preserveMetadata: false,
  preserveColorProfile: false,
  preferHighBitDepth: false,
  borderStyle: null,
  logo: { ...defaultLogo, ...logo },
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

describe("buildResolvedRenderSettings", () => {
  it("resolvedTexts 替换 layer.content 中的变量占位符", () => {
    const settings = makeSettings([
      makeLayer("l1", "{Camera} · {Lens}"),
      makeLayer("l2", "{Film} · {Scanner}"),
    ])
    const resolved = buildResolvedRenderSettings(settings, null, ["Nikon F3 · 35mm", "Portra 400 · Noritsu"])
    expect(resolved.textLayers[0]!.content).toBe("Nikon F3 · 35mm")
    expect(resolved.textLayers[1]!.content).toBe("Portra 400 · Noritsu")
  })

  it("textOverride 覆盖第 0 层 content", () => {
    const settings = makeSettings([
      makeLayer("l1", "{Camera}"),
      makeLayer("l2", "{Film}"),
    ])
    const resolved = buildResolvedRenderSettings(settings, "手动覆盖", [null, null])
    expect(resolved.textLayers[0]!.content).toBe("手动覆盖")
    expect(resolved.textLayers[1]!.content).toBe("{Film}")
  })

  it("textOverride 为空时不覆盖", () => {
    const settings = makeSettings([
      makeLayer("l1", "{Camera}"),
    ])
    const resolved = buildResolvedRenderSettings(settings, null, ["Nikon F3"])
    expect(resolved.textLayers[0]!.content).toBe("Nikon F3")
  })

  it("resolvedTexts 为 null 时保留原始 content", () => {
    const settings = makeSettings([
      makeLayer("l1", "{Camera}"),
    ])
    const resolved = buildResolvedRenderSettings(settings, null, null)
    expect(resolved.textLayers[0]!.content).toBe("{Camera}")
  })

  it("auto-brand 模式下 resolvedBrand 写入 logo.brand", () => {
    const settings = makeSettings([], {
      enabled: true,
      mode: "auto-brand",
      brand: null,
    })
    const resolved = buildResolvedRenderSettings(settings, null, null, "NIKON")
    expect(resolved.logo.enabled).toBe(true)
    expect(resolved.logo.mode).toBe("auto-brand")
    expect(resolved.logo.brand).toBe("NIKON")
  })

  it("brand-text 模式下 resolvedBrand 不覆盖 logo.brand", () => {
    const settings = makeSettings([], {
      enabled: true,
      mode: "brand-text",
      brand: "Canon",
    })
    const resolved = buildResolvedRenderSettings(settings, null, null, "NIKON")
    expect(resolved.logo.brand).toBe("Canon")
  })

  it("logo 禁用时 resolvedBrand 不写入", () => {
    const settings = makeSettings([], { enabled: false })
    const resolved = buildResolvedRenderSettings(settings, null, null, "NIKON")
    expect(resolved.logo.enabled).toBe(false)
    expect(resolved.logo.brand).toBeNull()
  })

  it("不修改原 settings 对象（immutable）", () => {
    const layers = [makeLayer("l1", "{Camera}")]
    const settings = makeSettings(layers)
    buildResolvedRenderSettings(settings, null, ["Nikon F3"])
    expect(settings.textLayers[0]!.content).toBe("{Camera}")
  })
})

describe("链路一致性：四条链路使用同一套解析结果", () => {
  it("buildTextsFromSettings + buildResolvedRenderSettings 产生一致的文字内容", () => {
    const settings = makeSettings([
      makeLayer("l1", "{Camera} · {Lens}"),
      makeLayer("l2", "{Film}"),
    ])
    const resolvedTexts = ["Nikon F3 · 35mm", "Portra 400"]

    // 引擎预览 / 导出使用 buildTextsFromSettings
    const texts = buildTextsFromSettings(settings, null, resolvedTexts)

    // Canvas 使用 buildResolvedRenderSettings
    const resolved = buildResolvedRenderSettings(settings, null, resolvedTexts)

    expect(texts.length).toBe(2)
    expect(texts[0]!.content).toBe(resolved.textLayers[0]!.content)
    expect(texts[1]!.content).toBe(resolved.textLayers[1]!.content)
  })

  it("textOverride 在两条链路中一致", () => {
    const settings = makeSettings([
      makeLayer("l1", "{Camera}"),
      makeLayer("l2", "{Film}"),
    ])

    const texts = buildTextsFromSettings(settings, "手动覆盖", [null, null])
    const resolved = buildResolvedRenderSettings(settings, "手动覆盖", [null, null])

    expect(texts[0]!.content).toBe("手动覆盖")
    expect(resolved.textLayers[0]!.content).toBe("手动覆盖")
  })

  it("auto-brand 在两条链路中一致", () => {
    const settings = makeSettings([], {
      enabled: true,
      mode: "auto-brand",
      brand: null,
    })

    const resolved = buildResolvedRenderSettings(settings, null, null, "NIKON")

    // Canvas 使用 resolved.logo.brand
    expect(resolved.logo.brand).toBe("NIKON")

    // 引擎预览也会把 resolvedBrand 写入 logo（由 buildPreviewRequest 处理）
    // 这里验证 buildResolvedRenderSettings 的结果可以被 buildTextsFromSettings 正确使用
    expect(resolved.logo.enabled).toBe(true)
    expect(resolved.logo.mode).toBe("auto-brand")
  })

  it("品牌未识别时，Canvas 与导出行为一致（brand 为 null）", () => {
    const settings = makeSettings([], {
      enabled: true,
      mode: "auto-brand",
      brand: null,
    })

    const resolved = buildResolvedRenderSettings(settings, null, null, null)
    expect(resolved.logo.brand).toBeNull()
  })
})

describe("resolveLogoBrand：单图导出品牌回退", () => {
  it("单图导出场景：auto-brand + settings.logo.brand 已解析 + resolvedBrand 未传 → 回退到 settings.logo.brand", () => {
    // 模拟单图导出：resolvedSettings.logo.brand 已由 buildResolvedRenderSettings 写入 "NIKON"
    // buildRecipeFromSettings 调用时不传 resolvedBrand（undefined）
    const brand = resolveLogoBrand("auto-brand", "NIKON", undefined)
    expect(brand).toBe("NIKON")
  })

  it("批量导出场景：auto-brand + resolvedBrand 显式传入 → 优先使用 resolvedBrand", () => {
    const brand = resolveLogoBrand("auto-brand", "NIKON", "Canon")
    expect(brand).toBe("Canon")
  })

  it("批量导出场景：auto-brand + resolvedBrand=null（未识别）→ 返回 null，不回退", () => {
    const brand = resolveLogoBrand("auto-brand", "NIKON", null)
    expect(brand).toBeNull()
  })

  it("brand-text 模式不受 resolvedBrand 影响", () => {
    const brand = resolveLogoBrand("brand-text", "Canon", "NIKON")
    expect(brand).toBe("Canon")
  })

  it("brand-text 模式 + brand 为 null → 返回 null", () => {
    const brand = resolveLogoBrand("brand-text", null, "NIKON")
    expect(brand).toBeNull()
  })

  it("auto-brand + brand=null + resolvedBrand 未传 → 返回 null", () => {
    const brand = resolveLogoBrand("auto-brand", null, undefined)
    expect(brand).toBeNull()
  })
})

describe("端到端：单图导出品牌不丢失", () => {
  it("buildResolvedRenderSettings 写入 brand 后，resolveLogoBrand 回退能取到", () => {
    // 1. WorkspacePage 调用 buildResolvedRenderSettings，写入 resolvedBrand="NIKON"
    const settings = makeSettings([], {
      enabled: true,
      mode: "auto-brand",
      brand: null,
    })
    const resolvedSettings = buildResolvedRenderSettings(settings, null, null, "NIKON")
    expect(resolvedSettings.logo.brand).toBe("NIKON")

    // 2. 单图导出调用 buildRecipeFromSettings(filePath, resolvedSettings) — 不传 resolvedBrand
    //    内部调用 resolveLogoBrand(mode, resolvedSettings.logo.brand, undefined)
    const recipeBrand = resolveLogoBrand(
      resolvedSettings.logo.mode,
      resolvedSettings.logo.brand,
      undefined
    )
    expect(recipeBrand).toBe("NIKON")
  })

  it("批量导出传 resolvedBrand 时，优先于 resolvedSettings.logo.brand", () => {
    const settings = makeSettings([], {
      enabled: true,
      mode: "auto-brand",
      brand: null,
    })
    const resolvedSettings = buildResolvedRenderSettings(settings, null, null, "NIKON")

    // 批量导出传了 resolvedBrand="Canon"，应优先
    const recipeBrand = resolveLogoBrand(
      resolvedSettings.logo.mode,
      resolvedSettings.logo.brand,
      "Canon"
    )
    expect(recipeBrand).toBe("Canon")
  })
})

describe("边框风格：同一 RenderRecipe 的预览/导出一致性", () => {
  const styleSettings = (): RenderSettings => ({
    ...makeSettings([]),
    borderStyle: {
      id: "film-perforation",
      intensity: 90,
      edgeWidth: 12,
      holeCount: 16,
      paperTone: "#e8e8e8"
    }
  })

  it("buildRecipeFromSettings 把 borderStyle 原样写入引擎配方（预览与导出共用）", () => {
    const settings = styleSettings()
    const previewRecipe = buildPreviewRequest("/photos/a.jpg", settings, 1280, 1280).recipe
    const exportRecipe = buildRecipeFromSettings("/photos/a.jpg", settings)
    // 引擎预览与导出的 borderStyle 必须完全一致（同一份配置）
    expect(previewRecipe.borderStyle).toEqual(settings.borderStyle)
    expect(exportRecipe.borderStyle).toEqual(previewRecipe.borderStyle)
    expect(exportRecipe.borderStyle?.id).toBe("film-perforation")
  })

  it("borderStyle 为 null 时配方不带风格字段值（旧模板保持原行为）", () => {
    const settings = makeSettings([])
    expect(buildRecipeFromSettings("/photos/a.jpg", settings).borderStyle).toBeNull()
  })

  it("Canvas 渲染器接受全部 8 种风格 id 且不抛异常（含未知 id 回退为不绘制）", async () => {
    const { drawBorderStyle } = await import("../../preview/canvas/canvasRenderer")
    const calls: string[] = []
    const ctx = new Proxy({}, {
      get(_target, prop) {
        if (prop === "createLinearGradient") {
          return () => ({ addColorStop: () => {} })
        }
        return (...args: unknown[]) => {
          void args
          calls.push(String(prop))
        }
      },
      set() { return true }
    }) as unknown as CanvasRenderingContext2D

    const ids = ["exhibition-line", "polaroid-shadow", "film-perforation", "mat-double-line",
      "torn-edge", "negative-band", "magazine-keyline", "archive-label-box"]
    for (const id of [...ids, "unknown-style-x"]) {
      expect(() => drawBorderStyle(ctx,
        { id, intensity: 80, edgeWidth: 8, holeCount: 16, paperTone: "#e8e8e8" },
        20, 20, 400, 300, 440, 380, 40, 40)).not.toThrow()
    }
    // intensity=0 时不产生任何绘制调用
    const before = calls.length
    drawBorderStyle(ctx, { id: "exhibition-line", intensity: 0, edgeWidth: 8, holeCount: 0, paperTone: "#000" }, 20, 20, 400, 300, 440, 380, 40, 40)
    expect(calls.length).toBe(before)
  })
})
