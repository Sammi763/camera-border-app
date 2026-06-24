/**
 * 队列模块的 UI 状态类型。
 */

/** 队列中的图片项。`filePath` 是桌面文件选择器返回的绝对本地路径。 */
export type QueueItem = {
  readonly id: string
  readonly filePath: string
  readonly fileName: string
  readonly isSelected: boolean
  /** 每张图独立的文字内容覆盖。null 表示使用全局默认。 */
  readonly textOverride: string | null
}

/** 队列控制器，暴露给 QueuePanel 使用。 */
export type QueueController = {
  readonly items: readonly QueueItem[]
  readonly selectedFilePath: string | null
  /** 当前选中项的文字覆盖内容。 */
  readonly selectedTextOverride: string | null
  /** 当前是否为浏览器模式（无 Electron 桌面桥接）。 */
  readonly isBrowserMode: boolean
  readonly addImages: () => Promise<void>
  readonly select: (id: string) => void
  readonly clear: () => void
  /** 设置当前选中图片的文字覆盖。传 null 清除覆盖。 */
  readonly setSelectedTextOverride: (text: string | null) => void
  /** 获取指定图片的有效文字内容（覆盖值或全局默认）。 */
  readonly getEffectiveText: (id: string, globalText: string) => string
}
