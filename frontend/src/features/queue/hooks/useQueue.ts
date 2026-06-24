import { useCallback, useState } from "react"
import { fetchDevPhotos } from "../../../services/engine/devPhotosApi"
import { toFileName } from "../../../utils/fileName"
import type { QueueController, QueueItem } from "../types"

/**
 * 维护图片队列及其选中状态。
 *
 * 模式检测逻辑：
 * - Electron 模式：window.desktop 存在，使用系统文件选择器
 * - 浏览器模式：window.desktop 不存在，降级调用 GET /api/dev/photos 获取样片
 *
 * 两种模式下队列行为一致：图片入队、首张自动选中、切换触发预览。
 */
export const useQueue = (): QueueController => {
  const [items, setItems] = useState<readonly QueueItem[]>([])
  const isBrowserMode = window.desktop === undefined

  const addImages = useCallback(async (): Promise<void> => {
    const paths = await loadSourcePaths()
    if (paths.length === 0) {
      return
    }

    setItems((previous) => {
      const isFirstSelection = previous.length === 0
      const added = paths.map((filePath, index) => ({
        id: crypto.randomUUID(),
        filePath,
        fileName: toFileName(filePath),
        isSelected: isFirstSelection && index === 0,
        textOverride: null
      }))
      return [...previous, ...added]
    })
  }, [])

  const select = useCallback((id: string): void => {
    setItems((previous) =>
      previous.map((item) => ({
        ...item,
        isSelected: item.id === id
      }))
    )
  }, [])

  const clear = useCallback((): void => {
    setItems([])
  }, [])

  const setSelectedTextOverride = useCallback((text: string | null): void => {
    setItems((previous) =>
      previous.map((item) =>
        item.isSelected ? { ...item, textOverride: text } : item
      )
    )
  }, [])

  const getEffectiveText = useCallback((id: string, globalText: string): string => {
    const item = items.find((i) => i.id === id)
    if (item?.textOverride !== null && item?.textOverride !== undefined) {
      return item.textOverride
    }
    return globalText
  }, [items])

  const selected = items.find((item) => item.isSelected)
  const selectedFilePath = selected === undefined ? null : selected.filePath
  const selectedTextOverride = selected?.textOverride ?? null

  return {
    items,
    selectedFilePath,
    selectedTextOverride,
    isBrowserMode,
    addImages,
    select,
    clear,
    setSelectedTextOverride,
    getEffectiveText
  }
}

/**
 * 获取图片来源路径列表。
 *
 * 优先使用 Electron 桌面桥接的系统文件选择器；
 * 若桥接不存在（浏览器模式），则从 Java 引擎的 /api/dev/photos
 * 端点获取 photos/ 目录下的样片路径。
 */
const loadSourcePaths = async (): Promise<readonly string[]> => {
  const bridge = window.desktop
  if (bridge !== undefined) {
    return bridge.selectImages()
  }

  try {
    return await fetchDevPhotos()
  } catch {
    return []
  }
}
