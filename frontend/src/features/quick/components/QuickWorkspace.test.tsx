import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { QuickWorkspace } from "./QuickWorkspace"
import type { QueueController, QueueItem } from "../../queue/types"
import type { PreviewState } from "../../preview/types"
import type { RenderSettings } from "../../settings/types"
import type { PhotoIdentity } from "../../metadata/types"
import type { BatchScope } from "../../queue/types"
import type { ExportController } from "../../preview/hooks/useExportController"

/**
 * 快速出图模式导出禁用回归测试：
 * - 引擎不可用（loading/error）时，快速模式的单图、批量导出按钮都禁用并显示原因；
 * - 引擎恢复 ready（engineAvailable=true）后自动恢复可用。
 * 快速模式与高级模式共用 PreviewPanel 的导出禁用逻辑，这里验证 QuickWorkspace
 * 正确把 engineAvailable/engineUnavailableReason 透传下去。
 */

const makeSettings = (): RenderSettings => ({
  borderColor: "#fff", borderTop: 10, borderBottom: 20, borderLeft: 10, borderRight: 10,
  borderStyle: null,
  textContent: "", textFontSize: 20, textColor: "#222", textPlacement: "bottom-center", textArea: "border",
  fontFamily: "sans-serif",
  textLayers: [
    { id: "l1", enabled: true, content: "{Camera}", fontFamily: "sans-serif", fontSize: 20, color: "#222", placement: "bottom-center", textArea: "border", marginX: 0, marginY: 20, backgroundEnabled: false, backgroundColor: "#000", backgroundPaddingX: 6, backgroundPaddingY: 3, shadowEnabled: false, shadowColor: "#000", shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, strokeEnabled: false, strokeColor: "#000", strokeWidth: 1 }
  ],
  autoCrop: false, filmFormat: null, gradient: { enabled: false, type: "linear", angle: 0, stops: [] },
  exportFormat: "jpeg", jpegQuality: 90, outputSizePreset: "original", customOutputLongEdge: 0,
  preserveMetadata: true, preserveColorProfile: true, preferHighBitDepth: false,
  logo: { enabled: false, mode: "auto-brand", brand: null, placement: "x", size: 48, colorMode: "auto-contrast" }
})

const makeItem = (id: string, filePath: string): QueueItem => ({
  id, filePath, fileName: `${id}.jpg`,
  sourcePath: filePath, sourceFormat: "jpg", converted: false, workingFormat: "jpg",
  textOverride: null, presetId: null, identityOverride: null
})

const makeActivePreview = (): PreviewState => ({
  kind: "active",
  filePath: "/photos/a.jpg",
  fileName: "a.jpg",
  currentImage: document.createElement("img"),
  engineDisplayUrl: null,
  engineSyncStatus: "idle",
  engineResponse: null
})

/** 最小 QueueController（仅渲染 QueuePanel/PreviewPanel 需要的字段）。 */
const makeQueue = (items: readonly QueueItem[]): QueueController => ({
  items,
  activeItemId: items[0]?.id ?? null,
  activeItem: items[0] ?? null,
  activeFilePath: items[0]?.filePath ?? null,
  activeTextOverride: null,
  checkedItemIds: [],
  checkedCount: 0,
  missingCount: 0,
  canUndo: false,
  canRedo: false,
  isBrowserMode: false,
  lastImportResult: null,
  addImages: vi.fn(async () => {}),
  addImageFiles: vi.fn(async () => {}),
  addImageFolder: vi.fn(async () => {}),
  addFromPaths: vi.fn(async () => {}),
  setActive: vi.fn(),
  toggleChecked: vi.fn(),
  checkAll: vi.fn(),
  uncheckAll: vi.fn(),
  removeItem: vi.fn(),
  removeChecked: vi.fn(),
  clear: vi.fn(),
  undo: vi.fn(),
  redo: vi.fn(),
  setActiveTextOverride: vi.fn(),
  getEffectiveText: vi.fn(() => ""),
  assignPresetToScope: vi.fn(),
  clearPresetFromScope: vi.fn(),
  clearPresetBinding: vi.fn(),
  setActiveIdentityOverride: vi.fn(),
  clearActiveIdentityOverride: vi.fn(),
  getEffectiveIdentity: vi.fn(() => ({
    camera: "", lens: "", film: "", developer: "", scanner: "", lab: "", location: "", rollName: "", frameNumber: "", captureFormat: ""
  })),
  getIdentitySources: vi.fn(() => ({ camera: null, lens: null, film: null, location: null, frameNumber: null, captureFormat: null }))
})

const identity: PhotoIdentity = {
  camera: "", lens: "", film: "", developer: "", scanner: "", lab: "", location: "", rollName: "", frameNumber: "", captureFormat: ""
}

const makeExportController = (): ExportController => ({
  single: { kind: "idle" },
  batch: { kind: "idle" },
  isExporting: false,
  isBatchExporting: false,
  startSingleExport: vi.fn(async () => {}),
  startBatchExport: vi.fn(async () => {}),
  retryFailed: vi.fn(async () => {}),
  cancelActiveExport: vi.fn(async () => {}),
  openExportDirectory: vi.fn()
})

const renderQuick = (engineAvailable: boolean, engineUnavailableReason: string | null = null): void => {
  const items = [makeItem("a", "/photos/a.jpg"), makeItem("b", "/photos/b.jpg")]
  render(    <QuickWorkspace
      queue={makeQueue(items)}
      preview={makeActivePreview()}
      settings={makeSettings()}
      activeItem={items[0]!}
      selectedIdentity={identity}
      identitySources={null}
      presets={[]}
      activePresetId={null}
      recommendedTemplateId={null}
      currentImage={document.createElement("img")}
      exportController={makeExportController()}
      resolvedBrand={null}
      resolvedTextOverride={null}
      resolvedTextLayers={null}
      batchExportLabel="批量导出 2 张"
      engineAvailable={engineAvailable}
      engineUnavailableReason={engineUnavailableReason}
      onApplyTemplate={vi.fn()}
      onApplyInfoCardVariant={vi.fn()}
      operationScope="all"
      onOperationScopeChange={vi.fn()}
      onApplyPreset={vi.fn((_id: string, _scope: BatchScope) => {})}
      onClearPreset={vi.fn((_scope: BatchScope) => {})}
      onCreatePresetFromText={vi.fn()}
    />
  )
}

describe("QuickWorkspace 快速模式导出禁用", () => {
  beforeEach(() => {
    // CanvasPreview 依赖 ResizeObserver，jsdom 需要桩
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub)
    vi.stubGlobal("URL.createObjectURL", () => "blob:fake")
    vi.stubGlobal("URL.revokeObjectURL", () => {})
  })
  it("引擎不可用时：单图与批量导出按钮禁用并显示原因", () => {
    renderQuick(false, "引擎启动失败，请重试。")
    const single = screen.getByRole("button", { name: "导出原图" })
    expect(single.hasAttribute("disabled")).toBe(true)
    const batch = screen.getByRole("button", { name: "批量导出 2 张" })
    expect(batch.hasAttribute("disabled")).toBe(true)
    expect(screen.getByText(/引擎不可用，导出已禁用/)).toBeTruthy()
  })

  it("引擎 loading 时同样禁用导出（engineAvailable=false）", () => {
    renderQuick(false, null)
    expect(screen.getByRole("button", { name: "导出原图" }).hasAttribute("disabled")).toBe(true)
    expect(screen.getByRole("button", { name: "批量导出 2 张" }).hasAttribute("disabled")).toBe(true)
  })

  it("引擎恢复 ready 后导出按钮自动恢复可用", () => {
    renderQuick(true)
    expect(screen.getByRole("button", { name: "导出原图" }).hasAttribute("disabled")).toBe(false)
    expect(screen.getByRole("button", { name: "批量导出 2 张" }).hasAttribute("disabled")).toBe(false)
    expect(screen.queryByText(/引擎不可用，导出已禁用/)).toBeNull()
  })
})
