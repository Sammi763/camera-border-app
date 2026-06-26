/**
 * 队列模块的 UI 状态类型。
 */

import type { PhotoIdentity, Roll } from "../metadata/types"

/** 队列中的图片项。`filePath` 是桌面文件选择器返回的绝对本地路径。 */
export type QueueItem = {
  readonly id: string
  readonly filePath: string
  readonly fileName: string
  readonly isSelected: boolean
  /** 每张图独立的文字内容覆盖。null 表示使用全局默认。 */
  readonly textOverride: string | null
  /** 绑定的 Roll ID。null 表示未绑定。 */
  readonly rollId: string | null
  /** 每张图独立的摄影身份覆盖。null 表示使用 Roll 或全局默认。 */
  readonly identityOverride: Partial<PhotoIdentity> | null
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
  /** 选择图片文件加入队列（Electron 模式用系统文件选择器，浏览器模式降级）。 */
  readonly addImageFiles: () => Promise<void>
  /** 选择图片文件夹，扫描目录内图片加入队列。 */
  readonly addImageFolder: () => Promise<void>
  /** 将指定路径列表加入队列（用于已获取路径后的直接入队）。 */
  readonly addFromPaths: (paths: readonly string[]) => void
  readonly select: (id: string) => void
  readonly clear: () => void
  /** 设置当前选中图片的文字覆盖。传 null 清除覆盖。 */
  readonly setSelectedTextOverride: (text: string | null) => void
  /** 获取指定图片的有效文字内容（覆盖值或全局默认）。 */
  readonly getEffectiveText: (id: string, globalText: string) => string
  /** 将 Roll 应用到当前选中图片。传 null 清除 Roll 绑定。 */
  readonly assignRollToSelected: (rollId: string | null) => void
  /** 将 Roll 应用到队列全部图片。传 null 清除所有 Roll 绑定。 */
  readonly assignRollToAll: (rollId: string | null) => void
  /** 清除绑定到指定 Roll ID 的所有图片的 Roll 绑定。 */
  readonly clearRollBinding: (rollId: string) => void
  /** 清除全部图片的 Roll 绑定。 */
  readonly clearAllRollBindings: () => void
  /** 设置当前选中图片的摄影身份覆盖。 */
  readonly setSelectedIdentityOverride: (patch: Partial<PhotoIdentity>) => void
  /** 清除当前选中图片的摄影身份覆盖。 */
  readonly clearSelectedIdentityOverride: () => void
  /** 获取指定图片的有效摄影身份（覆盖 > Roll > 空默认）。 */
  readonly getEffectiveIdentity: (itemId: string, rolls: readonly Roll[]) => PhotoIdentity
}
