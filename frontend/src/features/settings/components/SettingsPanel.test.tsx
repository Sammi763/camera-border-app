import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SettingsPanel } from "./SettingsPanel"
import { DEFAULT_SETTINGS } from "../hooks/useSettings"
import type { SettingsController } from "../types"
import type { CapabilitiesResponse } from "../../../types/preview"

const makeCapabilities = (): CapabilitiesResponse => {
  const format = {
    available: true,
    bitDepths: [8],
    icc: true,
    exif: true,
    xmp: true,
    iptc: true,
    gps: true,
    dpi: true
  }
  return {
    schemaVersion: 1,
    components: {},
    input: {},
    output: { jpeg: format, png: format, tiff: format },
    tiers: {
      "quick-share": { available: true, defaultFormat: "jpeg" },
      "standard-delivery": { available: true, defaultFormat: "jpeg" },
      "high-fidelity-archive": { available: true, defaultFormat: "tiff" },
      custom: { available: true }
    }
  }
}

const makeController = (
  update: SettingsController["update"],
  settings: SettingsController["settings"] = DEFAULT_SETTINGS
): SettingsController => ({
  settings,
  restoredFromStorage: false,
  settingsVersion: 0,
  update,
  updateNumber: vi.fn(),
  updateTextLayer: vi.fn(),
  resetTextLayers: vi.fn(),
  replaceTextLayers: vi.fn(),
  canUndo: false,
  canRedo: false,
  undo: vi.fn(),
  redo: vi.fn()
})

describe("SettingsPanel 阶段 2 图片区域与输出格式", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => []
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("三个固定输出档位都提供 PNG 变体，选择 PNG 不偷偷切到 custom", async () => {
    const expectedFormats = {
      "quick-share": ["jpeg", "png"],
      "standard-delivery": ["jpeg", "png"],
      "high-fidelity-archive": ["png", "tiff"]
    } as const

    for (const tier of Object.keys(expectedFormats) as (keyof typeof expectedFormats)[]) {
      const update = vi.fn()
      const view = render(
        <SettingsPanel
          controller={makeController(update, { ...DEFAULT_SETTINGS, tier, exportFormat: tier === "high-fidelity-archive" ? "tiff" : "jpeg" })}
          hasSelectedImage={true}
          selectedFilePath={null}
          textOverride={null}
          setTextOverride={vi.fn()}
          showStyleSettings={false}
          capabilities={makeCapabilities()}
        />
      )

      await waitFor(() => expect(screen.getByLabelText("输出格式")).toBeTruthy())
      const formatSelect = screen.getByLabelText("输出格式") as HTMLSelectElement
      expect(Array.from(formatSelect.options).map((option) => option.value)).toEqual(expectedFormats[tier])
      fireEvent.change(formatSelect, { target: { value: "png" } })

      expect(update).toHaveBeenCalledWith({ exportFormat: "png" })
      expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ tier: "custom" }))
      view.unmount()
    }
  })

  it("图片区域控件同时更新产品语义与 RenderRecipe 兼容字段", async () => {
    const update = vi.fn()
    const controller = makeController(update)
    const view = render(
      <SettingsPanel
        controller={controller}
        hasSelectedImage={true}
        selectedFilePath={null}
        textOverride={null}
        setTextOverride={vi.fn()}
        showOutputSettings={false}
      />
    )

    await waitFor(() => expect(screen.getByLabelText("图片区域方向")).toBeTruthy())
    fireEvent.change(screen.getByLabelText("图片区域方向"), { target: { value: "portrait" } })
    const orientationPatch = update.mock.calls.at(-1)?.[0] as Partial<typeof DEFAULT_SETTINGS> | undefined
    expect(orientationPatch?.imageArea).toMatchObject({ orientation: "portrait" })
    expect(orientationPatch?.imagePlacement).toMatchObject({ targetAspectRatio: null })

    const updatedSettings = { ...DEFAULT_SETTINGS, ...orientationPatch }
    view.rerender(
      <SettingsPanel
        controller={makeController(update, updatedSettings)}
        hasSelectedImage={true}
        selectedFilePath={null}
        textOverride={null}
        setTextOverride={vi.fn()}
        showOutputSettings={false}
      />
    )
    fireEvent.change(screen.getByLabelText("图片区域比例"), { target: { value: "4:5" } })
    const ratioPatch = update.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined
    expect(ratioPatch?.["imageArea"]).toMatchObject({ orientation: "portrait", ratio: "4:5" })
    expect(ratioPatch?.["imagePlacement"]).toMatchObject({ targetAspectRatio: 4 / 5 })
  })
})
