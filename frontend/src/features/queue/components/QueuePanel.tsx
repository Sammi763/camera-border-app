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
  const [dropHint, setDropHint] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)

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
      void queue.addFromPaths(result.paths)
      return
    }
    // 浏览器模式：降级到 addImageFolder
    await queue.addImageFolder()
  }, [queue])

  /** 拖拽导入：从拖入文件提取本地路径（Electron 的 File 带 path 属性）。 */
  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setDragActive(false)
    setDropHint(null)
    if (queue.isBrowserMode) {
      setDropHint("拖拽导入需要桌面模式，浏览器降级模式下请使用「加载浏览器样片」。")
      return
    }
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => (file as File & { path?: string }).path)
      .filter((p): p is string => p !== undefined && p.trim().length > 0)
    if (paths.length === 0) {
      setDropHint("未识别到可导入的本地图片文件。")
      return
    }
    void queue.addFromPaths(paths)
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
      onDrop={handleDrop}
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

        {dropHint !== null && (
          <p className="panelHint queueFolderHint">{dropHint}</p>
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
    </div>
  )
}
