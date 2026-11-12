import { afterEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { QueuePanel } from "./QueuePanel"
import type { ImportResult, QueueController, QueueItem } from "../types"

const { useThumbnailsMock } = vi.hoisted(() => ({
  useThumbnailsMock: vi.fn(() => new Map<string, string>())
}))

vi.mock("../hooks/useThumbnails", () => ({ useThumbnails: useThumbnailsMock }))

const makeItem = (id: string, overrides: Partial<QueueItem> = {}): QueueItem => ({
  id,
  filePath: `/photos/${id}.jpg`,
  fileName: `${id}.jpg`,
  sourcePath: `/photos/${id}.jpg`,
  sourceFormat: "jpg",
  converted: false,
  workingFormat: "jpg",
  textOverride: null,
  presetId: null,
  identityOverride: null,
  ...overrides
})

const makeQueue = (items: readonly QueueItem[]): QueueController => ({
  items,
  activeItemId: items[0]?.id ?? null,
  activeItem: items[0] ?? null,
  activeFilePath: items[0]?.filePath ?? null,
  activeTextOverride: null,
  activeImageProcessing: null,
  activeImageProcessingError: null,
  checkedItemIds: [],
  checkedCount: 0,
  missingCount: 0,
  canUndo: false,
  canRedo: false,
    topUndo: null,
    topRedo: null,
    relocateItem: vi.fn(async () => true),
    relocateMissingFromFolder: vi.fn(async () => ({ relocated: 0, ambiguous: [], unresolved: [] })),
    relocateItemToCandidate: vi.fn(async () => true),
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
  setActiveImageProcessing: vi.fn(),
  recordSourceVersion: vi.fn(),
  getEffectiveImageProcessing: vi.fn(() => null),
  syncImageProcessing: vi.fn(),
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

  it("筛选无匹配后恢复列表时，重新观察挂载的队列行并加载缩略图", async () => {
    const observe = vi.fn((target: Element) => {
      callback([{ target, isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], observer)
    })
    let callback: IntersectionObserverCallback
    let observer: IntersectionObserver
    class ObserverStub {
      constructor(next: IntersectionObserverCallback) {
        callback = next
        observer = this as unknown as IntersectionObserver
      }
      observe = observe
      disconnect = vi.fn()
    }
    vi.stubGlobal("IntersectionObserver", ObserverStub)
    const items = Array.from({ length: 7 }, (_, index) => makeItem(`photo-${index}`))
    render(<QueuePanel queue={makeQueue(items)} />)
    await waitFor(() => expect(useThumbnailsMock).toHaveBeenLastCalledWith(items.map((item) => item.filePath), expect.any(Map)))

    const filter = screen.getByRole("textbox", { name: "按文件名筛选队列" })
    fireEvent.change(filter, { target: { value: "no-match" } })
    await waitFor(() => expect(useThumbnailsMock).toHaveBeenLastCalledWith([], expect.any(Map)))
    observe.mockClear()
    fireEvent.change(filter, { target: { value: "" } })

    await waitFor(() => expect(observe).toHaveBeenCalledTimes(items.length))
    expect(useThumbnailsMock).toHaveBeenLastCalledWith(items.map((item) => item.filePath), expect.any(Map))
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
      expect(useThumbnailsMock).toHaveBeenLastCalledWith(["/photos/first.jpg"], expect.any(Map))
    })
  })

  it("筛选仍保留原行时，在异步观察回调到来前不释放已加载缩略图", async () => {
    const callbacks: Array<() => void> = []
    class ObserverStub {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element): void {
        callbacks.push(() => this.callback([
          { target, isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry
        ], this as unknown as IntersectionObserver))
      }
      disconnect(): void {}
    }
    vi.stubGlobal("IntersectionObserver", ObserverStub)
    const items = Array.from({ length: 7 }, (_, index) => makeItem(`photo-${index}`))
    render(<QueuePanel queue={makeQueue(items)} />)
    // 模拟原生异步观察：手动交付首轮可见通知，下一轮暂不交付。
    act(() => callbacks.splice(0).forEach((callback) => callback()))
    await waitFor(() => expect(useThumbnailsMock).toHaveBeenLastCalledWith(items.map((item) => item.filePath), expect.any(Map)))
    useThumbnailsMock.mockClear()
    fireEvent.change(screen.getByRole("textbox", { name: "按文件名筛选队列" }), { target: { value: "photo" } })
    expect(callbacks.length).toBe(items.length)
    for (const [paths] of useThumbnailsMock.mock.calls as unknown as Array<[string[]]>) {
      expect(paths).toEqual(items.map((item) => item.filePath))
    }
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
    // 右键菜单 Portal 到 body，避免被玻璃侧栏的 backdrop-filter/overflow 裁剪
    expect(menu.parentElement).toBe(document.body)

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

  it("右键菜单支持键盘打开、循环导航及 Escape 恢复到触发行", () => {
    render(<QueuePanel queue={makeQueue([makeItem("a")])} />)
    const opener = screen.getByText("a.jpg").closest("button")!
    opener.focus()
    fireEvent.keyDown(opener, { key: "F10", shiftKey: true })
    const menu = screen.getByRole("menu", { name: "队列图片操作" })
    const items = within(menu).getAllByRole("menuitem")
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(items[0]!, { key: "ArrowUp" })
    expect(document.activeElement).toBe(items[4])
    fireEvent.keyDown(items[4]!, { key: "ArrowDown" })
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(items[0]!, { key: "End" })
    expect(document.activeElement).toBe(items[4])
    fireEvent.keyDown(items[4]!, { key: "Home" })
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(items[0]!, { key: "Escape" })
    expect(screen.queryByRole("menu")).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it("菜单目标被移除后关闭，避免对旧条目执行操作", () => {
    const { rerender } = render(<QueuePanel queue={makeQueue([makeItem("a"), makeItem("b")])} />)
    fireEvent.contextMenu(screen.getByText("a.jpg"))
    rerender(<QueuePanel queue={makeQueue([makeItem("b")])} />)
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("右键菜单按实际尺寸钳制，并在窗口缩放时重新定位", () => {
    const measure = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return { width: this.classList.contains("queueContextMenu") ? 200 : 0,
        height: this.classList.contains("queueContextMenu") ? 240 : 0 } as DOMRect
    })
    const originalWidth = window.innerWidth
    const originalHeight = window.innerHeight
    try {
      window.innerWidth = 400
      window.innerHeight = 400
      render(<QueuePanel queue={makeQueue([makeItem("a")])} />)
      fireEvent.contextMenu(screen.getByText("a.jpg"), { clientX: 390, clientY: 390 })
      const menu = screen.getByRole("menu")
      expect(menu.style.left).toBe("192px")
      expect(menu.style.top).toBe("152px")
      window.innerHeight = 300
      fireEvent.resize(window)
      expect(menu.style.top).toBe("52px")
    } finally {
      window.innerWidth = originalWidth
      window.innerHeight = originalHeight
      measure.mockRestore()
    }
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

  it("外部图片拖到队列行不被吞掉，事件继续冒泡给根级文件拖放路由", () => {
    const queue = makeQueue([makeItem("a"), makeItem("b")])
    render(<QueuePanel queue={queue} />)

    const rowA = screen.getByText("a.jpg").closest("li")!
    const windowDrop = vi.fn()
    window.addEventListener("drop", windowDrop)
    const externalData = {
      setData: vi.fn(),
      getData: vi.fn(() => ""),
      types: ["Files"],
      files: [],
      effectAllowed: "",
      dropEffect: ""
    }
    try {
      const notCanceled = fireEvent.drop(rowA, { dataTransfer: externalData })
      // dispatchEvent 返回 true 表示未被 preventDefault；文件拖放路由才能收到事件。
      expect(notCanceled).toBe(true)
      expect(windowDrop).toHaveBeenCalledOnce()
      expect(queue.reorder).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener("drop", windowDrop)
    }
  })

  it("拖拽经过目标行时高亮落点与拖动行，drop/dragEnd 后清除", () => {
    const queue = makeQueue([makeItem("a"), makeItem("b"), makeItem("c")])
    queue.items.findIndex = Array.prototype.findIndex.bind(queue.items)
    render(<QueuePanel queue={queue} />)

    const rowA = screen.getByText("a.jpg").closest("li")!
    const rowB = screen.getByText("b.jpg").closest("li")!
    const dataTransfer = { setData: vi.fn(), getData: vi.fn(() => "b"), effectAllowed: "", dropEffect: "" }

    fireEvent.dragStart(rowB, { dataTransfer })
    expect(rowB.className).toContain("queueDragging")

    fireEvent.dragOver(rowA, { dataTransfer })
    expect(rowA.className).toContain("queueDropTarget")

    fireEvent.dragLeave(rowA, { dataTransfer })
    expect(rowA.className).not.toContain("queueDropTarget")

    fireEvent.dragOver(rowA, { dataTransfer })
    fireEvent.drop(rowA, { dataTransfer })
    expect(rowA.className).not.toContain("queueDropTarget")
    expect(rowB.className).not.toContain("queueDragging")

    // 取消拖拽（dragEnd 未 drop）同样清除反馈
    fireEvent.dragStart(rowB, { dataTransfer })
    fireEvent.dragOver(rowA, { dataTransfer })
    fireEvent.dragEnd(rowB, { dataTransfer })
    expect(rowA.className).not.toContain("queueDropTarget")
    expect(rowB.className).not.toContain("queueDragging")
  })

  it("右键菜单坐标按视口边缘钳制，不溢出屏幕", () => {
    const queue = makeQueue([makeItem("a")])
    render(<QueuePanel queue={queue} />)

    const originalWidth = window.innerWidth
    const originalHeight = window.innerHeight
    window.innerWidth = 300
    window.innerHeight = 200
    try {
      // 在视口右下角外右键
      fireEvent.contextMenu(screen.getByText("a.jpg"), { clientX: 290, clientY: 190 })
      const menu = screen.getByRole("menu", { name: "队列图片操作" })
      const left = Number(menu.style.left.replace("px", ""))
      const top = Number(menu.style.top.replace("px", ""))
      expect(left).toBeGreaterThanOrEqual(8)
      expect(left).toBeLessThanOrEqual(300 - 170 - 8)
      expect(top).toBeGreaterThanOrEqual(8)
      expect(top).toBeLessThanOrEqual(200 - 178 - 8)
    } finally {
      window.innerWidth = originalWidth
      window.innerHeight = originalHeight
    }
  })

  it("行内不再常驻目录文字，主体按钮的 title 提供文件名与完整路径", () => {
    const queue = makeQueue([makeItem("a")])
    render(<QueuePanel queue={queue} />)

    const main = screen.getByRole("button", { name: /无预览\s*a\.jpg/ })
    expect(main.getAttribute("title")).toContain("a.jpg")
    expect(main.getAttribute("title")).toContain("/photos/a.jpg")
    // 目录文字不再作为行内常驻节点渲染
    expect(screen.queryByText("/photos")).toBeNull()
  })

  it("长文件名和无预览状态共同组成原生可访问名称，视觉省略不截断名称", () => {
    const longFileName = "2026-11-10-camera-border-long-filename-queue-check-01.jpg"
    const filePath = `/photos/${longFileName}`
    const queue = makeQueue([
      makeItem("long", { fileName: longFileName, filePath, sourcePath: filePath })
    ])
    render(<QueuePanel queue={queue} />)

    // 可访问名称仍是完整文件名，不因视觉省略而截断
    const main = screen.getByRole("button", { name: (name) => name.startsWith("无预览") && name.includes(longFileName) })
    expect(main.hasAttribute("aria-label")).toBe(false)
    const fileNameSpan = main.querySelector(".queueFileName")
    expect(fileNameSpan?.textContent).toBe(longFileName)
    expect(main.getAttribute("title")).toContain(longFileName)
    expect(main.getAttribute("title")).toContain(filePath)
  })

  it("保留 RAW／内嵌 JPEG、HEIC、缺失文件与 T/P/I 徽标及缺失定位按钮", () => {
    const queue = makeQueue([
      makeItem("raw", {
        filePath: "/photos/raw.NEF",
        fileName: "raw.NEF",
        sourcePath: "/photos/raw.NEF",
        sourceFormat: "nef",
        converted: true,
        workingFormat: "png",
        missing: true,
        textOverride: "独立文字",
        presetId: "preset-1",
        identityOverride: { camera: "Nikon" }
      })
    ])
    render(<QueuePanel queue={queue} />)

    const main = screen.getByRole("button", { name: /raw\.NEF.*HEIC→PNG.*RAW.*内嵌 JPEG.*文件丢失/ })
    const nameContainer = main.querySelector(".queueName") as HTMLElement
    const fileNameSpan = nameContainer.querySelector(".queueFileName")
    expect(fileNameSpan?.textContent).toBe("raw.NEF")
    // 文件名 span 与徽标同处 .queueName，徽标位于文件名之后
    expect(nameContainer.firstElementChild).toBe(fileNameSpan)
    expect(within(nameContainer).getAllByText("RAW").length).toBeGreaterThan(0)
    expect(within(nameContainer).getByText("内嵌 JPEG")).toBeTruthy()
    expect(within(nameContainer).getByText("HEIC→PNG")).toBeTruthy()
    expect(within(nameContainer).getByText("文件丢失")).toBeTruthy()
    expect(within(nameContainer).getByText("T")).toBeTruthy()
    expect(within(nameContainer).getByText("P")).toBeTruthy()
    expect(within(nameContainer).getByText("I")).toBeTruthy()
    expect(main.getAttribute("title")).toContain("源文件丢失")
    expect(screen.getByRole("button", { name: "重新定位 raw.NEF" })).toBeTruthy()
  })

  it("底部常驻高频操作，排序/删除已选/清空只在“更多”浮层内", () => {
    const queue = makeQueue([makeItem("b"), makeItem("a")])
    render(<QueuePanel queue={queue} />)

    const actions = screen.getByRole("group", { name: "队列操作" })
    expect(within(actions).getByRole("button", { name: "全选" })).toBeTruthy()
    expect(within(actions).getByRole("button", { name: "撤销" })).toBeTruthy()
    expect(within(actions).getByRole("button", { name: "重做" })).toBeTruthy()
    expect(within(actions).getByRole("button", { name: "更多" })).toBeTruthy()
    expect(within(actions).queryByRole("button", { name: "按文件名 ↑" })).toBeNull()
    expect(within(actions).queryByRole("button", { name: "删除已选" })).toBeNull()
    expect(within(actions).queryByRole("button", { name: "清空队列" })).toBeNull()

    fireEvent.click(within(actions).getByRole("button", { name: "更多" }))
    const menu = screen.getByRole("group", { name: "更多队列操作" })
    // 浮层用普通 button 组成，不使用 role=menu/menuitem 的不完整 ARIA 模式
    expect(menu.getAttribute("role")).toBe("group")
    expect(within(menu).queryByRole("menuitem")).toBeNull()
    expect(within(menu).getByRole("button", { name: "按文件名 ↑" })).toBeTruthy()
    expect(within(menu).getByRole("button", { name: "按文件名 ↓" })).toBeTruthy()
    expect(within(menu).getByRole("button", { name: "删除已选" })).toBeTruthy()
    expect(within(menu).getByRole("button", { name: "清空队列" })).toBeTruthy()
  })

  it("“更多”内排序后调用 sortByName 并关闭浮层，再次打开可执行降序", () => {
    const queue = makeQueue([makeItem("b"), makeItem("a")])
    render(<QueuePanel queue={queue} />)

    const trigger = screen.getByRole("button", { name: "更多" })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole("button", { name: "按文件名 ↑" }))
    expect(queue.sortByName).toHaveBeenCalledWith("asc")
    expect(screen.queryByTestId("queue-more-menu")).toBeNull()
    expect(trigger.getAttribute("aria-expanded")).toBe("false")

    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole("button", { name: "按文件名 ↓" }))
    expect(queue.sortByName).toHaveBeenCalledWith("desc")
    expect(screen.queryByTestId("queue-more-menu")).toBeNull()
  })

  it("“更多”支持 Escape 关闭，并把焦点还给触发按钮", async () => {
    const queue = makeQueue([makeItem("a")])
    render(<QueuePanel queue={queue} />)

    const trigger = screen.getByRole("button", { name: "更多" })
    trigger.focus()
    fireEvent.click(trigger)
    const menu = screen.getByRole("group", { name: "更多队列操作" })
    const firstItem = within(menu).getByRole("button", { name: "按文件名 ↑" })
    await waitFor(() => expect(document.activeElement).toBe(firstItem))

    fireEvent.keyDown(window, { key: "Escape" })
    expect(screen.queryByTestId("queue-more-menu")).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it("“更多”点击外部关闭，并把焦点还给触发按钮", async () => {
    const queue = makeQueue([makeItem("a")])
    render(<QueuePanel queue={queue} />)

    const trigger = screen.getByRole("button", { name: "更多" })
    fireEvent.click(trigger)
    expect(screen.getByRole("group", { name: "更多队列操作" })).toBeTruthy()

    fireEvent.pointerDown(document.body)
    expect(screen.queryByTestId("queue-more-menu")).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it("键盘焦点离开“更多”浮层时关闭，不抢回已移动的焦点", () => {
    render(<QueuePanel queue={makeQueue([makeItem("a")])} />)
    fireEvent.click(screen.getByRole("button", { name: "更多" }))
    const outside = screen.getByRole("button", { name: "全选" })
    fireEvent.focusIn(outside)
    expect(screen.queryByTestId("queue-more-menu")).toBeNull()
  })

  it("Portal 浮层在 Tab 边界关闭，Shift+Tab 回到触发按钮", () => {
    render(<QueuePanel queue={makeQueue([makeItem("a")])} />)
    const trigger = screen.getByRole("button", { name: "更多" })
    fireEvent.click(trigger)
    const first = screen.getByRole("button", { name: "按文件名 ↑" })
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true })
    expect(screen.queryByTestId("queue-more-menu")).toBeNull()
    expect(document.activeElement).toBe(trigger)
    fireEvent.click(trigger)
    const last = screen.getByRole("button", { name: "清空队列" })
    last.focus()
    fireEvent.keyDown(last, { key: "Tab" })
    expect(screen.queryByTestId("queue-more-menu")).toBeNull()
  })

  it("窗口失焦时关闭浮层，不留下仍可执行的后台菜单", () => {
    render(<QueuePanel queue={makeQueue([makeItem("a")])} />)
    fireEvent.click(screen.getByRole("button", { name: "更多" }))
    fireEvent.blur(window)
    expect(screen.queryByTestId("queue-more-menu")).toBeNull()
    fireEvent.contextMenu(screen.getByText("a.jpg"))
    fireEvent.blur(window)
    expect(screen.queryByRole("menu")).toBeNull()
  })

  it("空选集时“删除已选”禁用并解释原因，不调用 removeChecked", () => {
    const queue = makeQueue([makeItem("a")])
    render(<QueuePanel queue={queue} />)

    fireEvent.click(screen.getByRole("button", { name: "更多" }))
    const menu = screen.getByRole("group", { name: "更多队列操作" })
    const removeCheckedButton = within(menu).getByRole("button", { name: "删除已选" }) as HTMLButtonElement
    expect(removeCheckedButton.disabled).toBe(true)
    expect(removeCheckedButton.getAttribute("aria-describedby")).not.toBeNull()
    expect(within(menu).getByText("先勾选图片，才能删除已选。")).toBeTruthy()

    fireEvent.click(removeCheckedButton)
    expect(queue.removeChecked).not.toHaveBeenCalled()
  })

  it("有勾选时“删除已选”可用，执行后关闭浮层", () => {
    const base = makeQueue([makeItem("a"), makeItem("b")])
    const queue: QueueController = {
      ...base,
      checkedItemIds: ["a", "b"],
      checkedCount: 2
    }
    render(<QueuePanel queue={queue} />)

    fireEvent.click(screen.getByRole("button", { name: "更多" }))
    const removeCheckedButton = screen.getByRole("button", { name: "删除已选" }) as HTMLButtonElement
    expect(removeCheckedButton.disabled).toBe(false)
    fireEvent.click(removeCheckedButton)
    expect(queue.removeChecked).toHaveBeenCalledOnce()
    expect(screen.queryByTestId("queue-more-menu")).toBeNull()
  })

  it("队列缩短到筛选行消失时清空隐藏的 filterText 与 missingOnly", async () => {
    const longItems = [
      makeItem("a", { missing: true }),
      makeItem("b"),
      makeItem("c"),
      makeItem("d"),
      makeItem("e"),
      makeItem("f"),
      makeItem("g")
    ]
    const denseQueue: QueueController = {
      ...makeQueue(longItems),
      missingCount: 1
    }
    const { rerender } = render(<QueuePanel queue={denseQueue} />)

    fireEvent.change(screen.getByRole("textbox", { name: "按文件名筛选队列" }), {
      target: { value: "zzz" }
    })
    expect(screen.getByText(/没有匹配「zzz」的图片/)).toBeTruthy()
    // 缺失横幅与筛选行各有一个入口，点击即可进入“仅看缺失”
    fireEvent.click(screen.getAllByRole("button", { name: "仅看缺失" })[0]!)

    rerender(<QueuePanel queue={{ ...makeQueue([makeItem("a", { missing: true }), makeItem("b"), makeItem("c")]), missingCount: 1 }} />)

    // 筛选行消失后两个隐藏条件都必须复位，否则列表仍会被过滤成空。
    await waitFor(() => {
      expect(screen.getByText("a.jpg")).toBeTruthy()
      expect(screen.getByText("b.jpg")).toBeTruthy()
      expect(screen.getByText("c.jpg")).toBeTruthy()
    })
    expect(screen.queryByRole("textbox", { name: "按文件名筛选队列" })).toBeNull()
    expect(screen.queryByText(/没有匹配/)).toBeNull()
  })

  it("缺失文件归零时复位“仅看缺失”，不留下空列表", async () => {
    const items = [
      makeItem("a", { missing: true }),
      makeItem("b"),
      makeItem("c"),
      makeItem("d"),
      makeItem("e"),
      makeItem("f"),
      makeItem("g")
    ]
    const base = makeQueue(items)
    const { rerender } = render(<QueuePanel queue={{ ...base, missingCount: 1 }} />)

    fireEvent.click(screen.getAllByRole("button", { name: "仅看缺失" })[0]!)
    expect(screen.queryByText("b.jpg")).toBeNull()

    rerender(<QueuePanel queue={{ ...base, missingCount: 0 }} />)
    await waitFor(() => expect(screen.getByText("b.jpg")).toBeTruthy())
    expect(screen.queryByRole("button", { name: "显示全部" })).toBeNull()
  })

  it("空队列安全渲染：不显示底部操作与“更多”，不崩溃", () => {
    expect(() => render(<QueuePanel queue={makeQueue([])} showImportActions={false} />)).not.toThrow()
    expect(screen.queryByRole("group", { name: "队列操作" })).toBeNull()
    expect(screen.queryByRole("button", { name: "更多" })).toBeNull()
    expect(screen.getByText("源图片")).toBeTruthy()
  })

  it("浮层打开时队列被清空也会安全关闭，不留下孤立菜单", () => {
    const { rerender } = render(<QueuePanel queue={makeQueue([makeItem("a")])} />)
    fireEvent.click(screen.getByRole("button", { name: "更多" }))
    expect(screen.getByTestId("queue-more-menu")).toBeTruthy()

    rerender(<QueuePanel queue={makeQueue([])} showImportActions={false} />)
    expect(screen.queryByTestId("queue-more-menu")).toBeNull()
    expect(screen.queryByRole("group", { name: "队列操作" })).toBeNull()
  })

  it("底部撤销/重做按可用状态禁用，并调用既有的 queue 控制器", () => {
    const base = makeQueue([makeItem("a")])
    const queue: QueueController = {
      ...base,
      canUndo: true,
      canRedo: true,
      topUndo: { seq: 1, description: "导入图片" },
      topRedo: { seq: 2, description: "删除图片" }
    }
    const { rerender } = render(<QueuePanel queue={queue} />)

    const undo = screen.getByRole("button", { name: "撤销" }) as HTMLButtonElement
    const redo = screen.getByRole("button", { name: "重做" }) as HTMLButtonElement
    expect(undo.disabled).toBe(false)
    expect(undo.title).toBe("撤销：导入图片")
    expect(redo.disabled).toBe(false)
    expect(redo.title).toBe("重做：删除图片")

    fireEvent.click(undo)
    expect(queue.undo).toHaveBeenCalledOnce()
    fireEvent.click(redo)
    expect(queue.redo).toHaveBeenCalledOnce()

    rerender(<QueuePanel queue={{ ...base, canUndo: false, canRedo: false }} />)
    expect((screen.getByRole("button", { name: "撤销" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "重做" }) as HTMLButtonElement).disabled).toBe(true)
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

describe("QueuePanel 导入入口与独立挂载", () => {
  afterEach(() => {
    delete (window as unknown as { desktop?: unknown }).desktop
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("默认显示面板内文件/文件夹导入入口，独立挂载保留导入失败反馈", () => {
    const queue = makeQueue([])
    const failedResult: ImportResult = {
      successCount: 0,
      failedFiles: ["bad.heic"],
      convertedFiles: [],
      heicUnsupported: false,
      skippedDuplicateCount: 0
    }
    render(<QueuePanel queue={{ ...queue, lastImportResult: failedResult }} />)

    expect(screen.getByRole("button", { name: "选择图片文件" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "选择图片文件夹" })).toBeTruthy()
    expect(screen.getByText("1 张导入失败：bad.heic")).toBeTruthy()
  })

  it("选择空文件夹时原位显示中文提示，不静默", async () => {
    const selectImageFolder = vi.fn(async () => ({ kind: "directory" as const, paths: [] }))
    ;(window as unknown as { desktop?: unknown }).desktop = { selectImageFolder }
    render(<QueuePanel queue={makeQueue([])} />)

    fireEvent.click(screen.getByRole("button", { name: "选择图片文件夹" }))
    expect(await screen.findByText("所选文件夹中未找到可导入的图片文件。")).toBeTruthy()
    expect(selectImageFolder).toHaveBeenCalledOnce()
  })

  it("showImportActions=false 时隐藏面板导入入口，但保留浏览器样片入口与开发提示", () => {
    const queue = makeQueue([makeItem("a")])
    render(<QueuePanel queue={{ ...queue, isBrowserMode: true }} showImportActions={false} />)

    expect(screen.queryByRole("button", { name: "选择图片文件" })).toBeNull()
    expect(screen.queryByRole("button", { name: "选择图片文件夹" })).toBeNull()
    expect(screen.getByRole("button", { name: "加载浏览器样片" })).toBeTruthy()
    expect(screen.getByText("仅用于开发验证，加载内置样片，非正式使用方式。正式导入请启动桌面应用。")).toBeTruthy()
  })

  it("pickReplacementFile IPC 失败时展示中文错误，不调用重定位", async () => {
    const queue = makeQueue([makeItem("a", { missing: true })])
    ;(window as unknown as { desktop?: unknown }).desktop = {
      pickReplacementFile: vi.fn(async () => { throw new Error("ipc unavailable") })
    }
    render(<QueuePanel queue={{ ...queue, missingCount: 1 }} />)

    fireEvent.click(screen.getByRole("button", { name: "重新定位 a.jpg" }))
    expect(await screen.findByText("重新定位 a.jpg 失败：无法读取所选文件，请重试。")).toBeTruthy()
    expect(queue.relocateItem).not.toHaveBeenCalled()
  })

  it("selectImageFolder IPC 失败时展示中文错误，不清空缺失条目", async () => {
    const queue = makeQueue([makeItem("a", { missing: true })])
    ;(window as unknown as { desktop?: unknown }).desktop = {
      selectImageFolder: vi.fn(async () => { throw new Error("dialog failed") })
    }
    render(<QueuePanel queue={{ ...queue, missingCount: 1 }} />)

    fireEvent.click(screen.getByRole("button", { name: "从文件夹重新定位" }))
    expect(await screen.findByText("从文件夹重新定位失败：无法读取所选文件夹或匹配文件，请重试。")).toBeTruthy()
    expect(queue.relocateMissingFromFolder).not.toHaveBeenCalled()
  })

  it("relocateMissingFromFolder 失败时展示中文错误，保留队列与绑定", async () => {
    const base = makeQueue([makeItem("a", { missing: true })])
    const queue: QueueController = {
      ...base,
      missingCount: 1,
      relocateMissingFromFolder: vi.fn(async () => { throw new Error("scan failed") })
    }
    ;(window as unknown as { desktop?: unknown }).desktop = {
      selectImageFolder: vi.fn(async () => ({ kind: "directory" as const, paths: ["/photos"] }))
    }
    render(<QueuePanel queue={queue} />)

    fireEvent.click(screen.getByRole("button", { name: "从文件夹重新定位" }))
    expect(await screen.findByText("从文件夹重新定位失败：无法读取所选文件夹或匹配文件，请重试。")).toBeTruthy()
    expect(queue.relocateMissingFromFolder).toHaveBeenCalledWith(["/photos"])
    expect(screen.getByText("a.jpg")).toBeTruthy()
  })
})
