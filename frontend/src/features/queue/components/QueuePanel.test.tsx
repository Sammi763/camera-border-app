import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueuePanel } from "./QueuePanel"
import type { ImportResult, QueueController, QueueItem } from "../types"

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
  removeOthers: vi.fn(),
  removeLeftOf: vi.fn(),
  removeRightOf: vi.fn(),
  reorder: vi.fn(),
  sortByName: vi.fn(),
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

describe("QueuePanel 队列交互增强", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("行右键打开受控菜单，菜单项调用对应队列操作并关闭菜单", () => {
    const queue = makeQueue([makeItem("a"), makeItem("b"), makeItem("c")])
    render(<QueuePanel queue={queue} />)

    fireEvent.contextMenu(screen.getByText("b.jpg"))
    const menu = screen.getByRole("menu", { name: "队列图片操作" })
    expect(menu).toBeDefined()

    fireEvent.click(screen.getByRole("menuitem", { name: "删除其他图片" }))
    expect(queue.removeOthers).toHaveBeenCalledWith("b")
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("右键菜单支持删除左右侧与清空，Escape 关闭菜单", () => {
    const queue = makeQueue([makeItem("a"), makeItem("b")])
    render(<QueuePanel queue={queue} />)

    fireEvent.contextMenu(screen.getByText("a.jpg"))
    fireEvent.click(screen.getByRole("menuitem", { name: "删除右侧图片" }))
    expect(queue.removeRightOf).toHaveBeenCalledWith("a")

    fireEvent.contextMenu(screen.getByText("a.jpg"))
    fireEvent.click(screen.getByRole("menuitem", { name: "删除左侧图片" }))
    expect(queue.removeLeftOf).toHaveBeenCalledWith("a")

    fireEvent.contextMenu(screen.getByText("b.jpg"))
    fireEvent.click(screen.getByRole("menuitem", { name: "清空队列" }))
    expect(queue.clear).toHaveBeenCalledOnce()

    fireEvent.contextMenu(screen.getByText("b.jpg"))
    fireEvent.keyDown(window, { key: "Escape" })
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("行拖拽到目标行时按目标下标 reorder，拖回原位不调用", () => {
    const queue = makeQueue([makeItem("a"), makeItem("b"), makeItem("c")])
    queue.items.findIndex = Array.prototype.findIndex.bind(queue.items)
    render(<QueuePanel queue={queue} />)

    const rowB = screen.getByText("b.jpg").closest("li")!
    const rowA = screen.getByText("a.jpg").closest("li")!
    const dataTransfer = { setData: vi.fn(), getData: vi.fn(() => "b"), effectAllowed: "", dropEffect: "" }

    fireEvent.dragStart(rowB, { dataTransfer })
    fireEvent.drop(rowA, { dataTransfer })
    // 目标行 a 的下标是 0
    expect(queue.reorder).toHaveBeenCalledWith("b", 0)

    // 拖回自身：不触发 reorder
    fireEvent.dragStart(rowA, { dataTransfer: { ...dataTransfer, getData: vi.fn(() => "a") } })
    fireEvent.drop(rowA, { dataTransfer: { getData: vi.fn(() => "a") } })
    expect(queue.reorder).toHaveBeenCalledOnce()
  })

  it("底部排序按钮按方向调用 sortByName", () => {
    const queue = makeQueue([makeItem("b"), makeItem("a")])
    render(<QueuePanel queue={queue} />)

    fireEvent.click(screen.getByRole("button", { name: "按文件名 ↑" }))
    expect(queue.sortByName).toHaveBeenCalledWith("asc")
    fireEvent.click(screen.getByRole("button", { name: "按文件名 ↓" }))
    expect(queue.sortByName).toHaveBeenCalledWith("desc")
  })

  it("导入去重提示：跳过计数大于 0 时展示跳过文案", () => {
    const queue = makeQueue([makeItem("a")])
    const importResult: ImportResult = {
      successCount: 0,
      failedFiles: [],
      convertedFiles: [],
      heicUnsupported: false,
      skippedDuplicateCount: 2
    }
    render(<QueuePanel queue={{ ...queue, lastImportResult: importResult }} />)

    expect(screen.getByText("2 张已在队列中，已跳过")).toBeDefined()
  })

  it("无跳过且无成败信息时不展示导入提示", () => {
    const queue = makeQueue([makeItem("a")])
    const importResult: ImportResult = {
      successCount: 3,
      failedFiles: [],
      convertedFiles: [],
      heicUnsupported: false,
      skippedDuplicateCount: 0
    }
    render(<QueuePanel queue={{ ...queue, lastImportResult: importResult }} />)

    expect(screen.queryByText(/已在队列中/)).toBeNull()
  })
})
