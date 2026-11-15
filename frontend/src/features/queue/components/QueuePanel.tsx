import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Panel } from "../../../components/layout/Panel"
import { useThumbnails } from "../hooks/useThumbnails"
import { selectVisibleThumbnailPaths } from "../hooks/visibleThumbnailPaths"
import { isRawFile, getRawFormatName } from "../../metadata/constants/rawExtensions"
import type { QueueController, QueueItem } from "../types"

type QueuePanelProps = {
  readonly queue: QueueController
  /**
   * 是否显示面板内的文件/文件夹导入入口，默认 true。
   * 工作台由顶栏与欢迎页承担导入，传入 false 避免同一屏出现重复入口；
   * 独立挂载（开发、测试或未来嵌入）时保留面板自带的导入与反馈。
   */
  readonly showImportActions?: boolean
}

/** 队列行内拖拽使用的 dataTransfer 类型；文件拖放不会携带该类型，二者在路由上互不干扰。 */
const QUEUE_ROW_DRAG_TYPE = "application/x-camborder-queue-item"

/** “更多”浮层尺寸估算：仅用于视口边缘钳制，实际宽高仍由样式决定。 */
const QUEUE_MORE_MENU_WIDTH = 208
const QUEUE_MORE_MENU_HEIGHT = 216
const QUEUE_MORE_VIEWPORT_MARGIN = 8

/** 两类 Portal 浮层都按实际尺寸钳制，窗口过小时由 CSS 限高并允许滚动。 */
const clampMenuPosition = (left: number, top: number, width: number, height: number) => ({
  left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
  top: Math.max(8, Math.min(top, window.innerHeight - height - 8))
})

type QueueContextMenuState = {
  readonly x: number
  readonly y: number
  readonly itemId: string
}

const QueueRow = ({
  item,
  thumbUrl,
  isActive,
  isChecked,
  isDropTarget,
  isDragging,
  onSelect,
  onToggleCheck,
  onRemove,
  onRelocate,
  onContextMenu,
  onRowKeyDown,
  onRowDragStart,
  onRowDragOver,
  onRowDragLeave,
  onRowDrop,
  onRowDragEnd
}: {
  readonly item: QueueItem
  readonly thumbUrl: string | undefined
  readonly isActive: boolean
  readonly isChecked: boolean
  readonly isDropTarget: boolean
  readonly isDragging: boolean
  readonly onSelect: (id: string) => void
  readonly onToggleCheck: (id: string) => void
  readonly onRemove: (id: string) => void
  /** 丢失文件的人工重定位（U11）：打开选择器并绑定到该条目。 */
  readonly onRelocate: (id: string) => void
  readonly onContextMenu: (event: React.MouseEvent<HTMLLIElement>, id: string) => void
  readonly onRowKeyDown: (event: React.KeyboardEvent<HTMLLIElement>, id: string) => void
  readonly onRowDragStart: (event: React.DragEvent<HTMLLIElement>, id: string) => void
  readonly onRowDragOver: (event: React.DragEvent<HTMLLIElement>, id: string) => void
  readonly onRowDragLeave: (event: React.DragEvent<HTMLLIElement>, id: string) => void
  readonly onRowDrop: (event: React.DragEvent<HTMLLIElement>, targetId: string) => void
  readonly onRowDragEnd: (event: React.DragEvent<HTMLLIElement>) => void
}): JSX.Element => {
  const classNames = [
    "queueItem",
    isActive ? "isActive" : "",
    isDropTarget ? "queueDropTarget" : "",
    isDragging ? "queueDragging" : ""
  ].filter((name) => name.length > 0).join(" ")
  const hasPreset = item.presetId !== null
  const hasIdentity = item.identityOverride !== null && Object.keys(item.identityOverride).length > 0

  return (
    <li
      className={classNames}
      data-queue-item-id={item.id}
      draggable
      onDragStart={(event) => onRowDragStart(event, item.id)}
      onDragOver={(event) => onRowDragOver(event, item.id)}
      onDragLeave={(event) => onRowDragLeave(event, item.id)}
      onDrop={(event) => onRowDrop(event, item.id)}
      onDragEnd={onRowDragEnd}
      onContextMenu={(event) => onContextMenu(event, item.id)}
      onKeyDown={(event) => onRowKeyDown(event, item.id)}
    >
      {/* U14 复合控件语义：行内交互元素各自承担语义——
          复选框（批量选中）、主体 button（设为当前预览）、删除 button；
          不再用 role="button" 包裹嵌套控件，读屏不再报告「按钮内含按钮」。 */}
      <input
        type="checkbox"
        className="queueItemCheck"
        aria-label={`批量选中 ${item.fileName}`}
        checked={isChecked}
        onChange={() => onToggleCheck(item.id)}
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        className="queueItemMain"
        aria-current={isActive ? "true" : undefined}
        data-working-path={item.filePath}
        title={item.missing === true
          ? `${item.fileName}\n${item.filePath}\n源文件丢失：可点“定位”重新绑定`
          : `${item.fileName}\n${item.filePath}`}
        onClick={() => onSelect(item.id)}
      >
        {!item.missing && thumbUrl !== undefined ? (
          <img className="queueThumbImg" src={thumbUrl} alt="" aria-hidden="true" />
        ) : (
          <span className="queueThumbPlaceholder">
            <span className="queueThumbPlaceholderText">
              {isRawFile(item.filePath) ? "RAW" : "无预览"}
            </span>
          </span>
        )}
        <span className="queueMeta">
          <span className="queueName">
            <span className="queueFileName">{item.fileName}</span>
            {item.converted && (
              <span className="queueRawBadge" title={`HEIC 已由随包解码助手转换为临时 PNG`}> HEIC→PNG</span>
            )}
            {isRawFile(item.filePath) && (
              <span className="queueRawBadge" title={getRawFormatName(item.filePath) ?? "RAW 格式"}> RAW</span>
            )}
            {isRawFile(item.filePath) && (
              <span className="queueRawBadge" title="处理模式由每图配方决定；实际解码事实见引擎预览报告">
                {item.imageProcessing?.inputSource === "flextight-fff" ? "扫描 RGB16"
                  : item.imageProcessing?.inputSource === "camera-raw" || item.imageProcessing?.inputMode === "sensor-raw" ? "传感器 RAW"
                    : item.filePath.toLowerCase().endsWith(".fff") ? "FFF 待解析" : "内嵌 JPEG"}
              </span>
            )}
            {item.missing === true && (
              <span className="queueRawBadge" title="恢复工作会话时未找到源文件"> 文件丢失</span>
            )}
            {item.textOverride !== null && (
              <span className="queueTextOverrideIndicator" title="此图片有独立文字"> T</span>
            )}
            {hasPreset && (
              <span className="queuePresetIndicator" title="已绑定摄影预设"> P</span>
            )}
            {hasIdentity && (
              <span className="queueIdentityIndicator" title="有摄影信息覆盖"> I</span>
            )}
          </span>
        </span>
        <span className="queueSelectBadge" aria-hidden="true">
          {isActive ? "当前" : "选择"}
        </span>
      </button>
      {item.missing === true && (
        <button
          type="button"
          className="ghostButton queueRelocateButton"
          aria-label={`重新定位 ${item.fileName}`}
          title="源文件丢失：重新选择它在磁盘上的位置（保留此条的编辑与预设）"
          onClick={(event) => {
            event.stopPropagation()
            onRelocate(item.id)
          }}
        >
          定位
        </button>
      )}
      <button
        type="button"
        className="ghostButton queueRemoveButton"
        aria-label={`删除 ${item.fileName}`}
        onClick={(event) => {
          event.stopPropagation()
          onRemove(item.id)
        }}
      >
        删除
      </button>
    </li>
  )
}

export const QueuePanel = ({ queue, showImportActions = true }: QueuePanelProps): JSX.Element => {
  const isEmpty = queue.items.length === 0
  const [folderHint, setFolderHint] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const queueListRef = useRef<HTMLUListElement>(null)
  const [visibleItemIds, setVisibleItemIds] = useState<ReadonlySet<string>>(() => new Set())
  /** 自绘右键菜单的受控状态；null 表示关闭。 */
  const [contextMenu, setContextMenu] = useState<QueueContextMenuState | null>(null)
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const contextMenuOpenerRef = useRef<HTMLButtonElement | null>(null)
  const [contextPosition, setContextPosition] = useState({ left: 8, top: 8 })
  /** “更多”操作浮层：普通按钮列表，不使用 role=menu/menuitem 的不完整 ARIA 语义。 */
  const [moreOpen, setMoreOpen] = useState(false)
  const [morePosition, setMorePosition] = useState({ left: QUEUE_MORE_VIEWPORT_MARGIN, top: QUEUE_MORE_VIEWPORT_MARGIN })
  const moreButtonRef = useRef<HTMLButtonElement | null>(null)
  const moreMenuRef = useRef<HTMLDivElement | null>(null)
  const moreMenuId = useId()
  const moreRemoveHintId = `${moreMenuId}-remove-hint`
  const draggedItemIdRef = useRef<string | null>(null)
  /** 当前拖拽中的行 id（降透明度反馈）。 */
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null)
  /** 当前悬停的落点行 id（插入位置高亮）。 */
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  // ---- 队列筛选与缺失重定位（U13/U11） --------------------------------------
  /** 名称筛选（大小写不敏感的子串匹配）。 */
  const [filterText, setFilterText] = useState("")
  /** 仅看缺失源文件的条目。 */
  const [missingOnly, setMissingOnly] = useState(false)
  /** 文件夹级重定位后的同名冲突清单：等待用户逐个人工绑定，绝不静默。 */
  const [ambiguousRelocations, setAmbiguousRelocations] = useState<readonly {
    readonly itemId: string
    readonly fileName: string
    readonly candidates: readonly string[]
  }[]>([])
  /** 重定位结果反馈。 */
  const [relocateHint, setRelocateHint] = useState<string | null>(null)

  /** 名称筛选行只在长队列出现；不可用时必须清空隐藏过滤条件。 */
  const filterControlsAvailable = !isEmpty && queue.items.length > 6

  // 列表过滤和观察器共用同一组行；筛选清空后重新挂载的节点也必须注册观察。
  const visibleItems = useMemo(() => {
    const keyword = filterText.trim().toLowerCase()
    return queue.items.filter((item) =>
      (!missingOnly || item.missing === true)
      && (keyword.length === 0 || item.fileName.toLowerCase().includes(keyword)))
  }, [queue.items, filterText, missingOnly])

  // 队列缩短到筛选行消失后，残留的 filterText/missingOnly 会让列表继续被隐藏；
  // 控件不可用时一并复位，避免出现“没有任何匹配”的空列表。
  useEffect(() => {
    if (!filterControlsAvailable) {
      setFilterText("")
      setMissingOnly(false)
    }
  }, [filterControlsAvailable])

  // 缺失文件为 0 时“仅看缺失”入口消失，同步复位该过滤条件。
  useEffect(() => {
    if (queue.missingCount === 0) {
      setMissingOnly(false)
    }
  }, [queue.missingCount])

  // 缩略图只跟随滚动容器中的可见行，避免 100 张队列在导入瞬间全部解码。
  useEffect(() => {
    const list = queueListRef.current
    if (list === null || typeof IntersectionObserver === "undefined") {
      // Electron Chromium 一定提供 IntersectionObserver；不支持时宁可不读文件，
      // 也不能退化成把整个队列一次性提交给缩略图调度器。
      setVisibleItemIds(new Set())
      return
    }

    // IO 回调是异步的；保留仍在列表中的可见项，避免每次输入筛选都释放再解码同一缩略图。
    setVisibleItemIds((previous) => {
      const retained = new Set(visibleItems.filter((item) => previous.has(item.id)).map((item) => item.id))
      return retained.size === previous.size ? previous : retained
    })
    const observer = new IntersectionObserver((entries) => {
      setVisibleItemIds((previous) => {
        const next = new Set(previous)
        let changed = false
        for (const entry of entries) {
          const itemId = (entry.target as HTMLElement).dataset["queueItemId"]
          if (itemId === undefined) continue
          const isVisible = entry.isIntersecting === true || entry.intersectionRatio > 0
          if (isVisible && !next.has(itemId)) {
            next.add(itemId)
            changed = true
          } else if (!isVisible && next.delete(itemId)) {
            changed = true
          }
        }
        return changed ? next : previous
      })
    }, { root: list, threshold: 0 })

    list.querySelectorAll<HTMLElement>("[data-queue-item-id]").forEach((row) => observer.observe(row))
    return () => observer.disconnect()
  }, [visibleItems])

  const filePaths = useMemo(
    () => selectVisibleThumbnailPaths(visibleItems, visibleItemIds),
    [visibleItems, visibleItemIds]
  )

  const thumbnailProcessing = useMemo(() => new Map(queue.items.map((item) => [item.filePath, item.imageProcessing ?? null])), [queue.items])
  const thumbnails = useThumbnails(filePaths, thumbnailProcessing)

  const checkedIdSet = useMemo(
    () => new Set(queue.checkedItemIds),
    [queue.checkedItemIds]
  )

  const allChecked = !isEmpty && queue.checkedCount === queue.items.length

  /** 依据触发按钮位置计算浮层坐标：优先向上展开，视口边缘钳制。 */
  const computeMoreMenuPosition = useCallback((): { readonly left: number; readonly top: number } => {
    const trigger = moreButtonRef.current
    const fallback = { left: QUEUE_MORE_VIEWPORT_MARGIN, top: QUEUE_MORE_VIEWPORT_MARGIN }
    if (trigger === null) {
      return fallback
    }
    const rect = trigger.getBoundingClientRect()
    const menuRect = moreMenuRef.current?.getBoundingClientRect()
    const width = menuRect?.width || QUEUE_MORE_MENU_WIDTH
    const height = menuRect?.height || QUEUE_MORE_MENU_HEIGHT
    const aboveTop = rect.top - height - QUEUE_MORE_VIEWPORT_MARGIN
    const belowTop = rect.bottom + QUEUE_MORE_VIEWPORT_MARGIN
    return clampMenuPosition(rect.right - width,
      aboveTop >= QUEUE_MORE_VIEWPORT_MARGIN ? aboveTop : belowTop, width, height)
  }, [])

  const closeMoreMenu = useCallback((restoreFocus: boolean): void => {
    setMoreOpen(false)
    if (restoreFocus) {
      moreButtonRef.current?.focus()
    }
  }, [])

  const openMoreMenu = useCallback((): void => {
    setContextMenu(null)
    setMorePosition(computeMoreMenuPosition())
    setMoreOpen(true)
  }, [computeMoreMenuPosition])

  const toggleMoreMenu = useCallback((): void => {
    if (moreOpen) {
      closeMoreMenu(true)
    } else {
      openMoreMenu()
    }
  }, [closeMoreMenu, moreOpen, openMoreMenu])

  /** 执行“更多”中的任一操作后立即关闭浮层，并把焦点还给触发按钮。 */
  const runMoreAction = useCallback((action: () => void): void => {
    setMoreOpen(false)
    action()
    moreButtonRef.current?.focus()
  }, [])

  // 队列被清空后强制关闭浮层，避免下次导入时残留“已打开”状态。
  useEffect(() => {
    if (isEmpty && moreOpen) {
      setMoreOpen(false)
    }
  }, [isEmpty, moreOpen])

  // 打开时把焦点移到第一个可用操作，键盘用户可直接 Tab 继续浏览。
  useLayoutEffect(() => {
    if (!moreOpen) {
      return
    }
    setMorePosition(computeMoreMenuPosition())
    moreMenuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus()
  }, [moreOpen, computeMoreMenuPosition])

  // 浮层打开期间：点击外部或按 Esc 关闭；关闭后焦点回到触发按钮。
  useEffect(() => {
    if (!moreOpen) {
      return
    }
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (moreButtonRef.current?.contains(target) || moreMenuRef.current?.contains(target)) {
        return
      }
      closeMoreMenu(true)
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.stopPropagation()
        closeMoreMenu(true)
      }
    }
    const handleFocusIn = (event: FocusEvent): void => {
      const target = event.target as Node
      if (!moreMenuRef.current?.contains(target) && !moreButtonRef.current?.contains(target)) {
        closeMoreMenu(false)
      }
    }
    const handleWindowBlur = (): void => closeMoreMenu(false)
    window.addEventListener("pointerdown", handlePointerDown, true)
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("focusin", handleFocusIn)
    window.addEventListener("blur", handleWindowBlur)
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true)
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("focusin", handleFocusIn)
      window.removeEventListener("blur", handleWindowBlur)
    }
  }, [closeMoreMenu, moreOpen])

  // 窗口缩放或滚动时重新钳制坐标，避免浮层停在旧位置。
  useEffect(() => {
    if (!moreOpen) {
      return
    }
    const updatePosition = (): void => setMorePosition(computeMoreMenuPosition())
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    return () => {
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
    }
  }, [computeMoreMenuPosition, moreOpen])

  const closeContextMenu = useCallback((restoreFocus: boolean): void => {
    setContextMenu(null)
    if (restoreFocus && contextMenuOpenerRef.current?.isConnected) {
      contextMenuOpenerRef.current.focus()
    }
  }, [])

  useLayoutEffect(() => {
    if (contextMenu === null) return
    const updatePosition = (): void => {
      const rect = contextMenuRef.current?.getBoundingClientRect()
      setContextPosition(clampMenuPosition(contextMenu.x, contextMenu.y, rect?.width || 170, rect?.height || 194))
    }
    updatePosition()
    contextMenuRef.current?.querySelector<HTMLButtonElement>("button")?.focus()
    window.addEventListener("resize", updatePosition)
    return () => window.removeEventListener("resize", updatePosition)
  }, [contextMenu])

  // 右键菜单打开时：点击菜单外任意位置或按 Esc 都关闭，不阻塞其余交互。
  useEffect(() => {
    if (contextMenu === null) {
      return
    }
    const handlePointerDown = (event: PointerEvent): void => {
      const menu = contextMenuRef.current
      if (menu !== null && menu.contains(event.target as Node)) {
        return
      }
      closeContextMenu(false)
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault()
        closeContextMenu(true)
      }
    }
    const handleFocusIn = (event: FocusEvent): void => {
      if (!contextMenuRef.current?.contains(event.target as Node)) closeContextMenu(false)
    }
    const handleWindowBlur = (): void => closeContextMenu(false)
    window.addEventListener("pointerdown", handlePointerDown, true)
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("focusin", handleFocusIn)
    window.addEventListener("blur", handleWindowBlur)
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true)
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("focusin", handleFocusIn)
      window.removeEventListener("blur", handleWindowBlur)
    }
  }, [contextMenu, closeContextMenu])

  /** 打开队列行右键菜单（阻止浏览器默认菜单）。 */
  const handleRowContextMenu = useCallback((event: React.MouseEvent<HTMLLIElement>, itemId: string): void => {
    event.preventDefault()
    setMoreOpen(false)
    contextMenuOpenerRef.current = event.currentTarget.querySelector<HTMLButtonElement>(".queueItemMain")
    setContextMenu({ x: event.clientX, y: event.clientY, itemId })
  }, [])

  const handleRowKeyDown = useCallback((event: React.KeyboardEvent<HTMLLIElement>, itemId: string): void => {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return
    event.preventDefault()
    setMoreOpen(false)
    contextMenuOpenerRef.current = event.currentTarget.querySelector<HTMLButtonElement>(".queueItemMain")
    const rect = event.currentTarget.getBoundingClientRect()
    setContextMenu({ x: rect.left, y: rect.bottom, itemId })
  }, [])

  // 删除/撤销可能让菜单目标消失，此时不能继续对旧条目执行批量关闭。
  useEffect(() => {
    if (contextMenu !== null && !queue.items.some((item) => item.id === contextMenu.itemId)) {
      closeContextMenu(false)
    }
  }, [queue.items, contextMenu, closeContextMenu])

  /** 记录被拖拽行，供 drop 时读取（dataTransfer 在 dragover 阶段不可读）。 */
  const handleRowDragStart = useCallback((event: React.DragEvent<HTMLLIElement>, itemId: string): void => {
    draggedItemIdRef.current = itemId
    setDraggingItemId(itemId)
    event.dataTransfer.setData(QUEUE_ROW_DRAG_TYPE, itemId)
    event.dataTransfer.effectAllowed = "move"
  }, [])

  /** 行内拖拽只允许移动到队列行上，不触发外层文件拖放高亮；悬停行作为落点高亮。 */
  const handleRowDragOver = useCallback((event: React.DragEvent<HTMLLIElement>, itemId: string): void => {
    if (draggedItemIdRef.current === null) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = "move"
    setDropTargetId((previous) => (previous === itemId ? previous : itemId))
  }, [])

  /** 拖拽离开某行时清除该行的落点高亮。 */
  const handleRowDragLeave = useCallback((_event: React.DragEvent<HTMLLIElement>, itemId: string): void => {
    setDropTargetId((previous) => (previous === itemId ? null : previous))
  }, [])

  /** 拖拽落点行即目标下标；拖回原位时 reorder 内部无历史记录。 */
  const handleRowDrop = useCallback((event: React.DragEvent<HTMLLIElement>, targetId: string): void => {
    const draggedId = draggedItemIdRef.current
      ?? (event.dataTransfer.getData(QUEUE_ROW_DRAG_TYPE) || null)
    // 外部文件拖到队列行没有内部行标识：不拦截，继续冒泡给根级文件拖放路由。
    if (draggedId === null) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    draggedItemIdRef.current = null
    setDraggingItemId(null)
    setDropTargetId(null)
    if (draggedId === targetId) {
      return
    }
    const targetIndex = queue.items.findIndex((item) => item.id === targetId)
    if (targetIndex >= 0) {
      queue.reorder(draggedId, targetIndex)
    }
  }, [queue])

  const handleRowDragEnd = useCallback((): void => {
    draggedItemIdRef.current = null
    setDraggingItemId(null)
    setDropTargetId(null)
  }, [])

  /** 单条人工重定位：打开选择器（默认定位原目录），绑定到该条目。 */
  const handleRelocateItem = useCallback(async (itemId: string): Promise<void> => {
    const bridge = window.desktop
    if (bridge === undefined || bridge.pickReplacementFile === undefined) {
      setRelocateHint("浏览器降级模式不支持重新定位，请启动桌面应用。")
      return
    }
    const item = queue.items.find((candidate) => candidate.id === itemId)
    if (item === undefined) return
    try {
      const picked = await bridge.pickReplacementFile(item.sourcePath)
      if (picked === null) return
      const ok = await queue.relocateItem(itemId, picked)
      setRelocateHint(ok ? `已重新定位 ${item.fileName}。` : `重新定位失败：所选文件不可读取或无法转换。`)
    } catch {
      // IPC 或重定位链路异常时给出可读反馈，避免 Promise rejection 变成静默失败。
      setRelocateHint(`重新定位 ${item.fileName} 失败：无法读取所选文件，请重试。`)
    }
  }, [queue])

  /** 文件夹级重定位：同名唯一自动绑定；同名冲突进入人工确认清单。 */
  const handleRelocateFromFolder = useCallback(async (): Promise<void> => {
    const bridge = window.desktop
    if (bridge === undefined || bridge.selectImageFolder === undefined) {
      setRelocateHint("浏览器降级模式不支持重新定位，请启动桌面应用。")
      return
    }
    setRelocateHint(null)
    try {
      const result = await bridge.selectImageFolder()
      if (result === null || result.paths.length === 0) return
      const summary = await queue.relocateMissingFromFolder(result.paths)
      setAmbiguousRelocations(summary.ambiguous)
      const parts = [`已重新定位 ${summary.relocated} 张`]
      if (summary.unresolved.length > 0) {
        parts.push(`${summary.unresolved.length} 张未找到同名文件`)
      }
      if (summary.ambiguous.length > 0) {
        parts.push(`${summary.ambiguous.length} 张存在同名候选，请逐个确认`)
      }
      setRelocateHint(parts.join("；") + "。")
    } catch {
      // 目录选择或批量匹配失败时保持条目与编辑不变，只展示可读错误。
      setRelocateHint("从文件夹重新定位失败：无法读取所选文件夹或匹配文件，请重试。")
    }
  }, [queue])

  /** 选择文件夹导入，空文件夹时显示中文提示。 */
  const handleAddFolder = useCallback(async (): Promise<void> => {
    setFolderHint(null)
    const bridge = window.desktop
    if (bridge !== undefined && bridge.selectImageFolder !== undefined) {
      const result = await bridge.selectImageFolder()
      if (result === null) {
        // 用户取消了选择
        return
      }
      if (result.paths.length === 0) {
        setFolderHint("所选文件夹中未找到可导入的图片文件。")
        return
      }
      // 有图片，直接加入队列
      void queue.addFromPaths(result.paths)
      return
    }
    // 浏览器模式：降级到 addImageFolder
    await queue.addImageFolder()
  }, [queue])

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setDragActive(true)
  }, [])

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setDragActive(false)
  }, [])

  // Electron 模式：两个本机导入按钮为主入口；浏览器降级时禁用，由底部弱提示承载。
  const importDisabled = queue.isBrowserMode

  return (
    <div
      className="queueDropZone"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={() => setDragActive(false)}
    >
      <Panel label="队列" title="源图片" className={`queuePanel${dragActive ? " queueDropActive" : ""}`}>
        {/* 主导入入口：文件 / 文件夹。工作台由顶栏承担导入时通过 showImportActions 关闭。 */}
        {showImportActions && (
          <div className="queueImportActions">
            <button
              type="button"
              className="ghostButton queueImportButton"
              disabled={importDisabled}
              title={importDisabled ? "浏览器降级模式下不可用，请启动桌面应用" : undefined}
              onClick={() => void queue.addImageFiles()}
            >
              选择图片文件
            </button>
            <button
              type="button"
              className="ghostButton queueImportButton"
              disabled={importDisabled}
              title={importDisabled ? "浏览器降级模式下不可用，请启动桌面应用" : undefined}
              onClick={() => void handleAddFolder()}
            >
              选择图片文件夹
            </button>
          </div>
        )}

        {/* 空态提示：明确告诉用户从本机选择 */}
        {isEmpty && (
          <div className="queueEmptyHint">
            <p className="panelHint">
              {queue.isBrowserMode
                ? "浏览器降级模式：本机导入不可用，请启动桌面应用。"
                : "从本机选择图片文件或文件夹开始，或直接拖拽图片到此处。"}
            </p>
          </div>
        )}

        {folderHint !== null && (
          <p className="panelHint queueFolderHint">{folderHint}</p>
        )}

      {/* HEIC 转换 / 去重 / 导入结果反馈 */}
      {queue.lastImportResult !== null && (() => {
        const r = queue.lastImportResult
        if (r.successCount === 0 && r.failedFiles.length === 0 && r.skippedDuplicateCount === 0) return null
        const parts: string[] = []
        if (r.convertedFiles.length > 0) {
          parts.push(`${r.convertedFiles.length} 张 HEIC/HEIF 已转换为 PNG`)
        }
        if (r.heicUnsupported) {
          parts.push("当前平台暂不支持 HEIC 转换")
        }
        if (r.failedFiles.length > 0) {
          parts.push(`${r.failedFiles.length} 张导入失败：${r.failedFiles.join("、")}`)
        }
        if (r.skippedDuplicateCount > 0) {
          parts.push(`${r.skippedDuplicateCount} 张已在队列中，已跳过`)
        }
        if (parts.length === 0) return null
        return <p className="panelHint queueImportHint">{parts.join("；")}</p>
      })()}

      {/* 缺失文件横幅（U11）：恢复会话后说明恢复/缺失数量并提供重定位入口 */}
      {!isEmpty && queue.missingCount > 0 && (
        <div className="queueMissingBanner" role="status" data-testid="queue-missing-banner">
          <span>
            队列共 {queue.items.length} 张，其中 {queue.missingCount} 张找不到源文件（编辑与预设已保留）。
          </span>
          <span className="queueMissingActions">
            <button
              type="button"
              className="ghostButton"
              disabled={importDisabled}
              title={importDisabled ? "浏览器降级模式下不可用" : "选择一个文件夹，按文件名找回丢失的源文件"}
              onClick={() => void handleRelocateFromFolder()}
            >
              从文件夹重新定位
            </button>
            {/* 缺失过滤入口常驻横幅：小队列没有筛选行时也可用 */}
            <button
              type="button"
              className="ghostButton"
              aria-pressed={missingOnly}
              onClick={() => setMissingOnly((previous) => !previous)}
            >
              {missingOnly ? "显示全部" : "仅看缺失"}
            </button>
          </span>
        </div>
      )}

      {/* 同名冲突人工确认（U11）：不静默绑定，由用户逐个选择 */}
      {ambiguousRelocations.length > 0 && (
        <div className="queueAmbiguousRelocate" role="alert" data-testid="queue-ambiguous-relocate">
          <p>以下文件在所选文件夹中存在多个同名候选，请逐个确认：</p>
          {ambiguousRelocations.map((entry) => (
            <div key={entry.itemId} className="queueAmbiguousRow">
              <span className="queueAmbiguousName">{entry.fileName}</span>
              <span className="queueAmbiguousCandidates">
                {entry.candidates.map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    className="ghostButton queueAmbiguousCandidate"
                    title={`绑定到 ${candidate}`}
                    onClick={() => {
                      // 绑定目标以 ambiguous 条目携带的条目 id 为准：
                      // 队列中可能存在多个同名丢失条目，不能按文件名回查。
                      void queue.relocateItemToCandidate(entry.itemId, candidate).then((ok) => {
                        if (ok) {
                          setAmbiguousRelocations((previous) => previous.filter((e) => e.itemId !== entry.itemId))
                        }
                      })
                    }}
                  >
                    {candidate}
                  </button>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 名称筛选与缺失过滤（U13/U11）：仅影响显示，不改变队列数据；小队列不显示，避免噪音 */}
      {!isEmpty && queue.items.length > 6 && (
        <div className="queueFilterRow">
          <input
            type="text"
            className="settingTextInput queueFilterInput"
            placeholder="按文件名筛选…"
            aria-label="按文件名筛选队列"
            value={filterText}
            onChange={(event) => setFilterText(event.target.value)}
          />
          {queue.missingCount > 0 && (
            <button
              type="button"
              className="ghostButton"
              aria-pressed={missingOnly}
              onClick={() => setMissingOnly((previous) => !previous)}
            >
              {missingOnly ? "显示全部" : "仅看缺失"}
            </button>
          )}
        </div>
      )}

      {relocateHint !== null && (
        <p className="panelHint queueRelocateHint" role="status">{relocateHint}</p>
      )}

      {/* 队列列表 */}
      {!isEmpty && (() => {
        if (visibleItems.length === 0) {
          return (
            <p className="panelHint queueFilterEmpty" role="status">
              没有匹配「{filterText}」的图片{missingOnly ? "（仅看缺失）" : ""}。
            </p>
          )
        }
        return (
          <ul ref={queueListRef} className="queueList">
            {visibleItems.map((item) => (
              <QueueRow
                key={item.id}
                item={item}
                thumbUrl={thumbnails.get(item.filePath)}
                isActive={item.id === queue.activeItemId}
                isChecked={checkedIdSet.has(item.id)}
                isDropTarget={item.id === dropTargetId && item.id !== draggingItemId}
                isDragging={item.id === draggingItemId}
                onSelect={queue.setActive}
                onToggleCheck={queue.toggleChecked}
                onRemove={queue.removeItem}
                onRelocate={(id) => void handleRelocateItem(id)}
                onContextMenu={handleRowContextMenu}
                onRowKeyDown={handleRowKeyDown}
                onRowDragStart={handleRowDragStart}
                onRowDragOver={handleRowDragOver}
                onRowDragLeave={handleRowDragLeave}
                onRowDrop={handleRowDrop}
                onRowDragEnd={handleRowDragEnd}
              />
            ))}
          </ul>
        )
      })()}

      {/* 右键菜单：队列批量关闭操作（对应 PRD §3.3 待规划项）。 */}
      {/* 菜单为 fixed 定位，坐标按视口边缘钳制，避免在屏幕右/下缘溢出不可见。 */}
      {contextMenu !== null && (() => {
        const menuItems: readonly { readonly label: string; readonly action: () => void }[] = [
          { label: "删除此图片", action: () => queue.removeItem(contextMenu.itemId) },
          { label: "删除其他图片", action: () => queue.removeOthers(contextMenu.itemId) },
          { label: "删除左侧图片", action: () => queue.removeLeftOf(contextMenu.itemId) },
          { label: "删除右侧图片", action: () => queue.removeRightOf(contextMenu.itemId) },
          { label: "清空队列", action: () => queue.clear() }
        ]
        return createPortal(
          <div
            ref={contextMenuRef}
            className="queueContextMenu"
            role="menu"
            aria-label="队列图片操作"
            style={{ left: `${contextPosition.left}px`, top: `${contextPosition.top}px` }}
            onKeyDown={(event) => {
              if (event.key === "Tab") {
                closeContextMenu(true)
                return
              }
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
              event.preventDefault()
              event.stopPropagation()
              const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")]
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
              const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
                : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length
              buttons[next]?.focus()
            }}
          >
            {menuItems.map((menuItem) => (
              <button
                key={menuItem.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className="queueContextMenuItem"
                onClick={() => {
                  closeContextMenu(true)
                  menuItem.action()
                }}
              >
                {menuItem.label}
              </button>
            ))}
          </div>,
          document.body
        )
      })()}

      {/* 底部操作常驻（有图片时）：高频操作直接露出，低频/破坏性操作收进“更多”。 */}
      {!isEmpty && (
        <div className="queueActions" role="group" aria-label="队列操作">
          <span className="queueCount">
            {queue.items.length} 张图片
            {queue.checkedCount > 0 && (
              <span className="queueCheckedCount"> · 已选 {queue.checkedCount} 张</span>
            )}
          </span>
          <button
            type="button"
            className="ghostButton queueActionButton"
            onClick={allChecked ? queue.uncheckAll : queue.checkAll}
            title={allChecked ? "取消全选" : "全选队列全部图片"}
          >
            {allChecked ? "取消全选" : "全选"}
          </button>
          <button
            type="button"
            className="ghostButton queueActionButton"
            disabled={!queue.canUndo}
            onClick={queue.undo}
            title={queue.topUndo === null ? undefined : `撤销：${queue.topUndo.description}`}
          >
            撤销
          </button>
          <button
            type="button"
            className="ghostButton queueActionButton"
            disabled={!queue.canRedo}
            onClick={queue.redo}
            title={queue.topRedo === null ? undefined : `重做：${queue.topRedo.description}`}
          >
            重做
          </button>
          <button
            ref={moreButtonRef}
            type="button"
            className="ghostButton queueActionButton queueMoreButton"
            aria-expanded={moreOpen}
            aria-controls={moreOpen ? moreMenuId : undefined}
            title="更多队列操作：排序、删除已选、清空"
            onClick={toggleMoreMenu}
          >
            更多
          </button>
        </div>
      )}

      {queue.missingCount > 0 && (
        <p className="panelHint queueFolderHint">{queue.missingCount} 张恢复图片的源文件已丢失，可删除条目后重新导入。</p>
      )}

      {/* 浏览器降级：弱化到底部，明确为开发降级，不抢主入口 */}
      {queue.isBrowserMode && (
        <div className="queueBrowserFallback">
          <span className="queueBrowserFallbackLabel">开发降级模式</span>
          <button
            type="button"
            className="ghostButton queueImportButtonFallback"
            onClick={() => void queue.addImages()}
          >
            加载浏览器样片
          </button>
          <p className="panelHint panelHintBrowser">
            仅用于开发验证，加载内置样片，非正式使用方式。正式导入请启动桌面应用。
          </p>
        </div>
      )}
      </Panel>

      {/* “更多”浮层：固定定位到 body，避免被队列滚动容器裁剪。
          使用普通 button 组成，不声明 role=menu/menuitem。 */}
      {moreOpen && !isEmpty && createPortal(
        <div
          id={moreMenuId}
          ref={moreMenuRef}
          className="queueMoreMenu"
          role="group"
          aria-label="更多队列操作"
          data-testid="queue-more-menu"
          style={{ position: "fixed", left: `${morePosition.left}px`, top: `${morePosition.top}px` }}
          onKeyDown={(event) => {
            if (event.key !== "Tab") return
            const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")]
            if (event.shiftKey && document.activeElement === buttons[0]) {
              event.preventDefault()
              closeMoreMenu(true)
            } else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) {
              // Portal 在 body 末尾：先回触发点，让浏览器按原工作台 DOM 顺序继续 Tab。
              closeMoreMenu(true)
            }
          }}
        >
          <button
            type="button"
            className="queueMoreMenuItem"
            title="按文件名升序排列（稳定排序，同名文件保持原顺序）"
            onClick={() => runMoreAction(() => queue.sortByName("asc"))}
          >
            按文件名 ↑
          </button>
          <button
            type="button"
            className="queueMoreMenuItem"
            title="按文件名降序排列（稳定排序，同名文件保持原顺序）"
            onClick={() => runMoreAction(() => queue.sortByName("desc"))}
          >
            按文件名 ↓
          </button>
          <div className="queueMoreDivider" aria-hidden="true" />
          <button
            type="button"
            className="queueMoreMenuItem"
            disabled={queue.checkedCount === 0}
            aria-describedby={queue.checkedCount === 0 ? moreRemoveHintId : undefined}
            title={queue.checkedCount === 0
              ? "先勾选图片，才能删除已选"
              : `删除已选的 ${queue.checkedCount} 张图片`}
            onClick={() => runMoreAction(queue.removeChecked)}
          >
            删除已选
          </button>
          {queue.checkedCount === 0 && (
            <p id={moreRemoveHintId} className="queueMoreHint">
              先勾选图片，才能删除已选。
            </p>
          )}
          <div className="queueMoreDivider" aria-hidden="true" />
          <button
            type="button"
            className="queueMoreMenuItem queueMoreDangerItem"
            title="清空队列中的全部图片（可撤销）"
            onClick={() => runMoreAction(queue.clear)}
          >
            清空队列
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}
