import { useCallback, useMemo, useState } from "react"
import { Panel } from "../../../components/layout/Panel"
import { useThumbnails } from "../hooks/useThumbnails"
import { toDirPath } from "../../../utils/fileName"
import { isRawFile, getRawFormatName, getRawTier } from "../../metadata/constants/rawExtensions"
import { isHeicFile } from "../../metadata/constants/imageFormats"
import type { QueueController, QueueItem } from "../types"

type QueuePanelProps = {
  readonly queue: QueueController
}

const QueueRow = ({
  item,
  thumbUrl,
  isActive,
  isChecked,
  onSelect,
  onToggleCheck,
  onRemove
}: {
  readonly item: QueueItem
  readonly thumbUrl: string | undefined
  readonly isActive: boolean
  readonly isChecked: boolean
  readonly onSelect: (id: string) => void
  readonly onToggleCheck: (id: string) => void
  readonly onRemove: (id: string) => void
}): JSX.Element => {
  const rowClassName = isActive ? "queueItem isActive" : "queueItem"
  const hasPreset = item.presetId !== null
  const hasIdentity = item.identityOverride !== null && Object.keys(item.identityOverride).length > 0

  return (
    <li
      className={rowClassName}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item.id)}
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
            <span className="queueRawBadge" title={`HEIC 已转换为临时 JPEG 工作链路处理`}> HEIC→JPEG</span>
          )}
          {isRawFile(item.filePath) && (
            <span className="queueRawBadge" title={getRawFormatName(item.filePath) ?? "RAW 格式"}> RAW</span>
          )}
          {isRawFile(item.filePath) && getRawTier(item.filePath) === "preview-only" && (
            <span className="queueRawBadge" title="仅嵌入预览模式，非完整显影"> 预览</span>
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

  const filePaths = useMemo(
    () => queue.items.filter((item) => item.missing !== true).map((item) => item.filePath),
    [queue.items]
  )

  const thumbnails = useThumbnails(filePaths)

  const checkedIdSet = useMemo(
    () => new Set(queue.checkedItemIds),
    [queue.checkedItemIds]
  )

  const allChecked = !isEmpty && queue.checkedCount === queue.items.length

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

      {/* HEIC 转换 / 导入结果反馈 */}
      {queue.lastImportResult !== null && (() => {
        const r = queue.lastImportResult
        if (r.successCount === 0 && r.failedFiles.length === 0) return null
        const parts: string[] = []
        if (r.convertedFiles.length > 0) {
          parts.push(`${r.convertedFiles.length} 张 HEIC 已转换为 JPEG`)
        }
        if (r.heicUnsupported) {
          parts.push("当前平台暂不支持 HEIC 转换")
        }
        if (r.failedFiles.length > 0) {
          parts.push(`${r.failedFiles.length} 张导入失败：${r.failedFiles.join("、")}`)
        }
        if (parts.length === 0) return null
        return <p className="panelHint queueImportHint">{parts.join("；")}</p>
      })()}

      {/* 队列列表 */}
      {!isEmpty && (
        <ul className="queueList">
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
            />
          ))}
        </ul>
      )}

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
