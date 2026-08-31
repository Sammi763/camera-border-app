import type { QueueItem } from "../types"

/**
 * 只把当前滚动容器视口中的队列项交给缩略图调度器。
 * 缺失文件即使被滚动到可见区域，也不应触发本地文件读取。
 */
export const selectVisibleThumbnailPaths = (
  items: readonly QueueItem[],
  visibleItemIds: ReadonlySet<string>
): readonly string[] => items
  .filter((item) => item.missing !== true && visibleItemIds.has(item.id))
  .map((item) => item.filePath)
