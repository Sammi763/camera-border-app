import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Panel } from "../../../components/layout/Panel"
import { useThumbnails } from "../hooks/useThumbnails"
import { selectVisibleThumbnailPaths } from "../hooks/visibleThumbnailPaths"
import { toDirPath } from "../../../utils/fileName"
import { isRawFile, getRawFormatName } from "../../metadata/constants/rawExtensions"
import { isHeicFile } from "../../metadata/constants/imageFormats"
import type { QueueController, QueueItem } from "../types"

type QueuePanelProps = {
  readonly queue: QueueController
}

/** 队列行内拖拽使用的 dataTransfer 类型；文件拖放不会携带该类型，二者在路由上互不干扰。 */
const QUEUE_ROW_DRAG_TYPE = "application/x-camborder-queue-item"

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
  onSelect,
  onToggleCheck,
  onRemove,
  onContextMenu,
  onRowDragStart,
  onRowDragOver,
  onRowDrop,
  onRowDragEnd
}: {
  readonly item: QueueItem
  readonly thumbUrl: string | undefined
  readonly isActive: boolean
  readonly isChecked: boolean
  readonly onSelect: (id: string) => void
  readonly onToggleCheck: (id: string) => void
  readonly onRemove: (id: string) => void
  readonly onContextMenu: (event: React.MouseEvent<HTMLLIElement>, id: string) => void
  readonly onRowDragStart: (event: React.DragEvent<HTMLLIElement>, id: string) => void
  readonly onRowDragOver: (event: React.DragEvent<HTMLLIElement>) => void
  readonly onRowDrop: (event: React.DragEvent<HTMLLIElement>, targetId: string) => void
  readonly onRowDragEnd: (event: React.DragEvent<HTMLLIElement>) => void
}): JSX.Element => {
  const rowClassName = isActive ? "queueItem isActive" : "queueItem"
  const hasPreset = item.presetId !== null
  const hasIdentity = item.identityOverride !== null && Object.keys(item.identityOverride).length > 0

  return (
    <li
      className={rowClassName}
      data-queue-item-id={item.id}
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(event) => onRowDragStart(event, item.id)}
      onDragOver={onRowDragOver}
      onDrop={(event) => onRowDrop(event, item.id)}
      onDragEnd={onRowDragEnd}
      onClick={() => onSelect(item.id)}
      onContextMenu={(event) => onContextMenu(event, item.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect(item.id)
        }
      }}
    >
      {/* 批量选中复选框：点击只切换勾选，不切换当前预览图 */}
      <input
        type="checkbox"
        className="queueItemCheck"
        aria-label={`批量选中 ${item.fileName}`}
        checked={isChecked}
        onChange={() => onToggleCheck(item.id)}
        onClick={(e) => e.stopPropagation()}
      />
      {!item.missing && thumbUrl !== undefined ? (
        <img className="queueThumbImg" src={thumbUrl} alt="" aria-hidden="true" />
      ) : (
        <span className="queueThumbPlaceholder" aria-hidden="true">
          <span className="queueThumbPlaceholderText">
            {isRawFile(item.filePath) ? "RAW" : "无预览"}
          </span>
        </span>
      )}
      <span className="queueMeta">
        <span className="queueName">
          {item.fileName}
          {item.converted && (
            <span className="queueRawBadge" title={`HEIC 已由随包解码助手转换为临时 PNG`}> HEIC→PNG</span>
          )}
          {isRawFile(item.filePath) && (
            <span className="queueRawBadge" title={getRawFormatName(item.filePath) ?? "RAW 格式"}> RAW</span>
          )}
          {isRawFile(item.filePath) && (
            <span className="queueRawBadge" title="仅使用 RAW 文件内嵌 JPEG 像素；不执行传感器 RAW 显影"> 内嵌 JPEG</span>
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
        <span className="queueSub" title={item.filePath}>{toDirPath(item.filePath)}</span>
      </span>
      <span className="queueSelectBadge">
        {isActive ? "当前" : "选择"}
      </span>
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

export const QueuePanel = ({ queue }: QueuePanelProps): JSX.Element => {
  const isEmpty = queue.items.length === 0
  const [folderHint, setFolderHint] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const queueListRef = useRef<HTMLUListElement>(null)
  const [visibleItemIds, setVisibleItemIds] = useState<ReadonlySet<string>>(() => new Set())
  /** 自绘右键菜单的受控状态；null 表示关闭。 */
  const [contextMenu, setContextMenu] = useState<QueueContextMenuState | null>(null)
  const contextMenuRef = useRef<HTMLDivElement | null>(null)
  const draggedItemIdRef = useRef<string | null>(null)

  // 缩略图只跟随滚动容器中的可见行，避免 100 张队列在导入瞬间全部解码。
  useEffect(() => {
    const list = queueListRef.current
    if (list === null || typeof IntersectionObserver === "undefined") {
      // Electron Chromium 一定提供 IntersectionObserver；不支持时宁可不读文件，
      // 也不能退化成把整个队列一次性提交给缩略图调度器。
      setVisibleItemIds(new Set())
      return
    }

    setVisibleItemIds(new Set())
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
  }, [queue.items])

  const filePaths = useMemo(
    () => selectVisibleThumbnailPaths(queue.items, visibleItemIds),
    [queue.items, visibleItemIds]
  )

  const thumbnails = useThumbnails(filePaths)

  const checkedIdSet = useMemo(
    () => new Set(queue.checkedItemIds),
    [queue.checkedItemIds]
  )

  const allChecked = !isEmpty && queue.checkedCount === queue.items.length

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
      setContextMenu(null)
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setContextMenu(null)
      }
    }
    window.addEventListener("pointerdown", handlePointerDown, true)
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [contextMenu])

  /** 打开队列行右键菜单（阻止浏览器默认菜单）。 */
  const handleRowContextMenu = useCallback((event: React.MouseEvent<HTMLLIElement>, itemId: string): void => {
    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY, itemId })
  }, [])

  /** 记录被拖拽行，供 drop 时读取（dataTransfer 在 dragover 阶段不可读）。 */
  const handleRowDragStart = useCallback((event: React.DragEvent<HTMLLIElement>, itemId: string): void => {
    draggedItemIdRef.current = itemId
    event.dataTransfer.setData(QUEUE_ROW_DRAG_TYPE, itemId)
    event.dataTransfer.effectAllowed = "move"
  }, [])

  /** 行内拖拽只允许移动到队列行上，不触发外层文件拖放高亮。 */
  const handleRowDragOver = useCallback((event: React.DragEvent<HTMLLIElement>): void => {
    if (draggedItemIdRef.current === null) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = "move"
  }, [])

  /** 拖拽落点行即目标下标；拖回原位时 reorder 内部无历史记录。 */
  const handleRowDrop = useCallback((event: React.DragEvent<HTMLLIElement>, targetId: string): void => {
    event.preventDefault()
    event.stopPropagation()
    const draggedId = draggedItemIdRef.current
      ?? (event.dataTransfer.getData(QUEUE_ROW_DRAG_TYPE) || null)
    draggedItemIdRef.current = null
    if (draggedId === null || draggedId === targetId) {
      return
    }
    const targetIndex = queue.items.findIndex((item) => item.id === targetId)
    if (targetIndex >= 0) {
      queue.reorder(draggedId, targetIndex)
    }
  }, [queue])

  const handleRowDragEnd = useCallback((): void => {
    draggedItemIdRef.current = null
  }, [])

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
        {/* 主导入入口：文件 / 文件夹 */}
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

      {/* 队列列表 */}
      {!isEmpty && (
        <ul ref={queueListRef} className="queueList">
          {queue.items.map((item) => (
            <QueueRow
              key={item.id}
              item={item}
              thumbUrl={thumbnails.get(item.filePath)}
              isActive={item.id === queue.activeItemId}
              isChecked={checkedIdSet.has(item.id)}
              onSelect={queue.setActive}
              onToggleCheck={queue.toggleChecked}
              onRemove={queue.removeItem}
              onContextMenu={handleRowContextMenu}
              onRowDragStart={handleRowDragStart}
              onRowDragOver={handleRowDragOver}
              onRowDrop={handleRowDrop}
              onRowDragEnd={handleRowDragEnd}
            />
          ))}
        </ul>
      )}

      {/* 右键菜单：队列批量关闭操作（对应 PRD §3.3 待规划项） */}
      {contextMenu !== null && (() => {
        const menuItems: readonly { readonly label: string; readonly action: () => void }[] = [
          { label: "删除此图片", action: () => queue.removeItem(contextMenu.itemId) },
          { label: "删除其他图片", action: () => queue.removeOthers(contextMenu.itemId) },
          { label: "删除左侧图片", action: () => queue.removeLeftOf(contextMenu.itemId) },
          { label: "删除右侧图片", action: () => queue.removeRightOf(contextMenu.itemId) },
          { label: "清空队列", action: () => queue.clear() }
        ]
        return (
          <div
            ref={contextMenuRef}
            className="queueContextMenu"
            role="menu"
            aria-label="队列图片操作"
            style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          >
            {menuItems.map((menuItem) => (
              <button
                key={menuItem.label}
                type="button"
                role="menuitem"
                className="queueContextMenuItem"
                onClick={() => {
                  setContextMenu(null)
                  menuItem.action()
                }}
              >
                {menuItem.label}
              </button>
            ))}
          </div>
        )
      })()}

      {/* 底部操作：批量选择状态 + 全选/取消全选 + 清空 */}
      {!isEmpty && (
        <div className="queueActions">
          <span className="queueCount">
            {queue.items.length} 张图片
            {queue.checkedCount > 0 && (
              <span className="queueCheckedCount"> · 已选 {queue.checkedCount} 张</span>
            )}
          </span>
          <button
            type="button"
            className="ghostButton"
            onClick={allChecked ? queue.uncheckAll : queue.checkAll}
            title={allChecked ? "取消全选" : "全选队列全部图片"}
          >
            {allChecked ? "取消全选" : "全选"}
          </button>
          <button type="button" className="ghostButton" disabled={queue.checkedCount === 0} onClick={queue.removeChecked}>
            删除已选
          </button>
          <button type="button" className="ghostButton" onClick={queue.clear}>
            清空
          </button>
          <button
            type="button"
            className="ghostButton queueSortButton"
            title="按文件名升序排列（稳定排序，同名文件保持原顺序）"
            onClick={() => queue.sortByName("asc")}
          >
            按文件名 ↑
          </button>
          <button
            type="button"
            className="ghostButton queueSortButton"
            title="按文件名降序排列（稳定排序，同名文件保持原顺序）"
            onClick={() => queue.sortByName("desc")}
          >
            按文件名 ↓
          </button>
          <button type="button" className="ghostButton" disabled={!queue.canUndo} onClick={queue.undo}>撤销</button>
          <button type="button" className="ghostButton" disabled={!queue.canRedo} onClick={queue.redo}>重做</button>
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
    </div>
  )
}
