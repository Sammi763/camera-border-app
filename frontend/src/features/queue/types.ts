/**
 * 队列模块的 UI 状态类型。
 */

import type { PhotoIdentity, Roll } from "../metadata/types"
import type { PhotoMetadata } from "../../types/preview"

/** 队列中的图片项。`filePath` 是引擎实际处理的路径（可能是转换后的临时文件）。 */
export type QueueItem = {
  readonly id: string
  /** 引擎实际处理的文件路径（HEIC 转换后为临时 JPEG 路径）。 */
  readonly filePath: string
  /** 用户可见的原始文件名。 */
  readonly fileName: string
  readonly isSelected: boolean
  /** 原始文件路径（HEIC 转换时与 filePath 不同；非转换时与 filePath 相同）。 */
  readonly sourcePath: string
  /** 原始文件格式（如 "heic"、"jpg"）。 */
  readonly sourceFormat: string
  /** 是否发生了格式转换（如 HEIC → JPEG）。 */
  readonly converted: boolean
  /** 转换后的工作格式（如 "jpg"），未转换时与 sourceFormat 相同。 */
  readonly workingFormat: string
  /** 每张图独立的文字内容覆盖。null 表示使用全局默认。 */
  readonly textOverride: string | null
  /** 绑定的 Roll ID。null 表示未绑定。 */
  readonly rollId: string | null
  /** 每张图独立的摄影身份覆盖。null 表示使用 Roll 或全局默认。 */
  readonly identityOverride: Partial<PhotoIdentity> | null
}

/** 导入结果（HEIC 转换反馈等）。 */
export type ImportResult = {
  /** 成功导入的文件数。 */
  readonly successCount: number
  /** 转换失败的文件名列表。 */
  readonly failedFiles: readonly string[]
  /** 被转换的 HEIC 文件名列表。 */
  readonly convertedFiles: readonly string[]
  /** 非 macOS 平台不支持 HEIC 时的提示。 */
  readonly heicUnsupported: boolean
}

/** 队列控制器，暴露给 QueuePanel 使用。 */
export type QueueController = {
  readonly items: readonly QueueItem[]
  readonly selectedFilePath: string | null
  readonly selectedTextOverride: string | null
  readonly isBrowserMode: boolean
  /** 最近一次导入的结果（HEIC 转换反馈等）。 */
  readonly lastImportResult: ImportResult | null
  readonly addImages: () => Promise<void>
  readonly addImageFiles: () => Promise<void>
  readonly addImageFolder: () => Promise<void>
  readonly addFromPaths: (paths: readonly string[]) => Promise<void>
  readonly select: (id: string) => void
  readonly clear: () => void
  readonly setSelectedTextOverride: (text: string | null) => void
  readonly getEffectiveText: (id: string, globalText: string) => string
  readonly assignRollToSelected: (rollId: string | null) => void
  readonly assignRollToAll: (rollId: string | null) => void
  readonly clearRollBinding: (rollId: string) => void
  readonly clearAllRollBindings: () => void
  readonly setSelectedIdentityOverride: (patch: Partial<PhotoIdentity>) => void
  readonly clearSelectedIdentityOverride: () => void
  /**
   * 计算图片的有效摄影身份。
   * 优先级：每图覆盖 > Roll > EXIF（可选传入）> 空默认。
   */
  readonly getEffectiveIdentity: (
    itemId: string,
    rolls: readonly Roll[],
    exifByPath?: ReadonlyMap<string, PhotoMetadata>
  ) => PhotoIdentity
}
