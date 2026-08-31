import { afterEach, describe, expect, it, vi } from "vitest"
import { render, waitFor } from "@testing-library/react"
import { QueuePanel } from "./QueuePanel"
import type { QueueController, QueueItem } from "../types"

const { useThumbnailsMock } = vi.hoisted(() => ({
  useThumbnailsMock: vi.fn(() => new Map<string, string>())
}))

vi.mock("../hooks/useThumbnails", () => ({ useThumbnails: useThumbnailsMock }))

const makeItem = (id: string): QueueItem => ({
  id,
  filePath: `/photos/${id}.jpg`,
  fileName: `${id}.jpg`,
  sourcePath: `/photos/${id}.jpg`,
  sourceFormat: "jpg",
  converted: false,
  workingFormat: "jpg",
  textOverride: null,
  presetId: null,
  identityOverride: null
})

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
  getEffectiveIdentity: vi.fn(),
  getIdentitySources: vi.fn()
})

describe("QueuePanel 可见缩略图调度", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("只把 IntersectionObserver 判定为可见的队列行交给 useThumbnails", async () => {
    class IntersectionObserverStub {
      private readonly callback: IntersectionObserverCallback

      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback
      }

      observe(target: Element): void {
        const itemId = (target as HTMLElement).dataset["queueItemId"]
        this.callback([
          {
            target,
            isIntersecting: itemId === "first",
            intersectionRatio: itemId === "first" ? 1 : 0
          } as IntersectionObserverEntry
        ], this as unknown as IntersectionObserver)
      }

      disconnect(): void {}
    }
    vi.stubGlobal("IntersectionObserver", IntersectionObserverStub)

    render(<QueuePanel queue={makeQueue([makeItem("first"), makeItem("second")])} />)

    await waitFor(() => {
      expect(useThumbnailsMock).toHaveBeenLastCalledWith(["/photos/first.jpg"])
    })
  })
})
