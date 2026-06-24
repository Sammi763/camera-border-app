import { useMemo } from "react"
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
  const addButtonLabel = queue.isBrowserMode ? "加载样片" : "添加图片…"

  const filePaths = useMemo(
    () => queue.items.map((item) => item.filePath),
    [queue.items]
  )

  const thumbnails = useThumbnails(filePaths)

  return (
    <Panel label="队列" title="图片队列" className="queuePanel">
      {isEmpty ? (
        <div>
          <p className="panelHint">暂无图片，请加载本地图片开始。</p>
          {queue.isBrowserMode && (
            <p className="panelHint panelHintBrowser">
              浏览器模式：点击下方按钮加载 photos/ 目录样片。
            </p>
          )}
        </div>
      ) : (
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
      <div className="queueActions">
        <button type="button" className="ghostButton" onClick={() => void queue.addImages()}>
          {addButtonLabel}
        </button>
        {!isEmpty && (
          <button type="button" className="ghostButton" onClick={queue.clear}>
            清空
          </button>
        )}
      </div>
    </Panel>
  )
}
