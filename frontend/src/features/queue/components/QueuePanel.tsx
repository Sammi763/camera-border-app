import { useCallback, useMemo, useState } from "react"
import { Panel } from "../../../components/layout/Panel"
import { useThumbnails } from "../hooks/useThumbnails"
import { toDirPath } from "../../../utils/fileName"
import type { QueueController, QueueItem } from "../types"

type QueuePanelProps = {
  readonly queue: QueueController
}

const QueueRow = ({
  item,
  thumbUrl,
  onSelect
}: {
  readonly item: QueueItem
  readonly thumbUrl: string | undefined
  readonly onSelect: (id: string) => void
}): JSX.Element => {
  const rowClassName = item.isSelected ? "queueItem isSelected" : "queueItem"
  const hasRoll = item.rollId !== null
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
      {thumbUrl !== undefined ? (
        <img className="queueThumbImg" src={thumbUrl} alt="" aria-hidden="true" />
      ) : (
        <span className="queueThumbPlaceholder" aria-hidden="true">
          <span className="queueThumbPlaceholderText">无预览</span>
        </span>
      )}
      <span className="queueMeta">
        <span className="queueName">
          {item.fileName}
          {item.textOverride !== null && (
            <span className="queueTextOverrideIndicator" title="此图片有独立文字"> T</span>
          )}
          {hasRoll && (
            <span className="queueRollIndicator" title="已绑定 Roll"> R</span>
          )}
          {hasIdentity && (
            <span className="queueIdentityIndicator" title="有摄影信息覆盖"> I</span>
          )}
        </span>
        <span className="queueSub" title={item.filePath}>{toDirPath(item.filePath)}</span>
      </span>
      <span className="queueSelectBadge">
        {item.isSelected ? "当前" : "选择"}
      </span>
    </li>
  )
}

export const QueuePanel = ({ queue }: QueuePanelProps): JSX.Element => {
  const isEmpty = queue.items.length === 0
  const [folderHint, setFolderHint] = useState<string | null>(null)

  const filePaths = useMemo(
    () => queue.items.map((item) => item.filePath),
    [queue.items]
  )

  const thumbnails = useThumbnails(filePaths)

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
      queue.addFromPaths(result.paths)
      return
    }
    // 浏览器模式：降级到 addImageFolder
    await queue.addImageFolder()
  }, [queue])

  // Electron 模式：两个本机导入按钮为主入口；浏览器降级时禁用，由底部弱提示承载。
  const importDisabled = queue.isBrowserMode

  return (
    <Panel label="队列" title="源图片" className="queuePanel">
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
              : "从本机选择图片文件或文件夹开始。"}
          </p>
        </div>
      )}

      {folderHint !== null && (
        <p className="panelHint queueFolderHint">{folderHint}</p>
      )}

      {/* 队列列表 */}
      {!isEmpty && (
        <ul className="queueList">
          {queue.items.map((item) => (
            <QueueRow
              key={item.id}
              item={item}
              thumbUrl={thumbnails.get(item.filePath)}
              onSelect={queue.select}
            />
          ))}
        </ul>
      )}

      {/* 底部操作 */}
      {!isEmpty && (
        <div className="queueActions">
          <span className="queueCount">{queue.items.length} 张图片</span>
          <button type="button" className="ghostButton" onClick={queue.clear}>
            清空
          </button>
        </div>
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
  )
}
