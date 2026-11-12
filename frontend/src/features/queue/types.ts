/**
 * 队列模块的 UI 状态类型。
 *
 * 队列状态语义（批量工作流阶段重构）：
 * - activeItemId：当前预览图片（点击缩略图切换，驱动预览与单图编辑）；
 * - checkedItemIds：批量操作选中图片（复选框控制，驱动预设批量应用与批量导出范围）。
 * 两者独立维护，单一状态不再同时承担「预览」与「批量」两种语义。
 */

import type { PhotoAssetStore, PhotoIdentity, ShootingPreset } from "../metadata/types"
import type { PhotoMetadata } from "../../types/preview"
import type { ImageProcessingConfig } from "../../types/imageProcessing"
import type { IdentitySourceMap } from "../metadata/utils/resolveIdentityFieldSources"
import type { HistoryEntryMeta } from "../../utils/historySequence"

/** 队列中的图片项。`filePath` 是引擎实际处理的路径（可能是转换后的临时文件）。 */
export type QueueItem = {
  readonly id: string
  /** 引擎实际处理的文件路径（HEIC/HEIF 转换后为临时 PNG 路径）。 */
  readonly filePath: string
  /** 用户可见的原始文件名。 */
  readonly fileName: string
  /** 原始文件路径（HEIC 转换时与 filePath 不同；非转换时与 filePath 相同）。 */
  readonly sourcePath: string
  /** 原始文件格式（如 "heic"、"jpg"）。 */
  readonly sourceFormat: string
  /** 是否发生了格式转换（如 HEIC/HEIF -> PNG）。 */
  readonly converted: boolean
  /** 转换后的工作格式（如 "png"），未转换时与 sourceFormat 相同。 */
  readonly workingFormat: string
  /** 每张图独立的文字内容覆盖。null 表示使用全局默认。 */
  readonly textOverride: string | null
  /** 绑定的摄影预设 ID。null 表示未绑定。 */
  readonly presetId: string | null
  /** 每张图独立的摄影身份覆盖。null 表示使用摄影预设或全局默认。 */
  readonly identityOverride: Partial<PhotoIdentity> | null
  /** 每张图独立的底片处理配置；缺省/null 表示普通模式。 */
  readonly imageProcessing?: ImageProcessingConfig | null
  /** 会话恢复时发现底片配置损坏/版本不支持的解释；有值时处理保持关闭。 */
  readonly imageProcessingError?: string | null
  /** 源文件版本（mtime/size 或引擎返回的指纹）；用于失效旧缓存/取样。 */
  readonly sourceVersion?: string | null
  /** 会话恢复时发现源文件不可读取。保留条目供用户删除或重新导入。 */
  readonly missing?: boolean
}

/** 工作区唯一操作范围：当前预览图 / 复选框选中图片 / 全部图片。 */
export type OperationScope = "active" | "checked" | "all"
/** 旧名称兼容层；所有新状态与组件统一使用 OperationScope。 */
export type BatchScope = OperationScope

/** 整卷同步时可独立选择的底片配置字段组。 */
export type FilmSyncField = "lightSource" | "filmBase" | "density" | "positive" | "curves" | "sourceGeometry"

/** 导入结果（HEIC 转换反馈等）。 */
export type ImportResult = {
  /** 成功导入的文件数。 */
  readonly successCount: number
  /** 转换失败的文件名列表。 */
  readonly failedFiles: readonly string[]
  /** 被转换的 HEIC 文件名列表。 */
  readonly convertedFiles: readonly string[]
  /** 随包解码助手不可用或解码失败时的提示。 */
  readonly heicUnsupported: boolean
  /** 因已在队列中被跳过的重复路径数（按 sourcePath 反斜杠归一后比较）。 */
  readonly skippedDuplicateCount: number
}

/** 队列控制器，暴露给 QueuePanel 使用。 */
export type QueueController = {
  readonly items: readonly QueueItem[]
  /** 当前预览图片的 id。null 表示队列为空。 */
  readonly activeItemId: string | null
  /** 批量操作选中的图片 id 列表（保持勾选顺序，去重）。 */
  readonly checkedItemIds: readonly string[]
  /** 复选框选中数量（便捷读取）。 */
  readonly checkedCount: number
  /** 当前预览图片（activeItemId 对应项；队列为空时为 null）。 */
  readonly activeItem: QueueItem | null
  /** 当前预览图片路径（快捷读取）。 */
  readonly activeFilePath: string | null
  /** 当前预览图片的文字覆盖（快捷读取）。 */
  readonly activeTextOverride: string | null
  /** 当前预览图片的底片处理配置；缺省/null 表示普通模式。 */
  readonly activeImageProcessing: ImageProcessingConfig | null
  /** 当前预览图片的底片配置损坏解释；有值时处理保持关闭。 */
  readonly activeImageProcessingError: string | null
  readonly isBrowserMode: boolean
  /** 最近一次导入的结果（HEIC 转换反馈等）。 */
  readonly lastImportResult: ImportResult | null
  /** 恢复会话后标记为丢失的图片数量。 */
  readonly missingCount: number
  /** 队列内容与每图覆盖的撤销/重做状态。 */
  readonly canUndo: boolean
  readonly canRedo: boolean
  /** 栈顶历史元数据（全局序号 + 动作描述），供工作台协调全局 ⌘Z 与按钮提示。 */
  readonly topUndo: HistoryEntryMeta | null
  readonly topRedo: HistoryEntryMeta | null
  readonly addImages: () => Promise<void>
  readonly addImageFiles: () => Promise<void>
  readonly addImageFolder: () => Promise<void>
  readonly addFromPaths: (paths: readonly string[]) => Promise<void>
  /** 切换当前预览图片（点击缩略图）。 */
  readonly setActive: (id: string) => void
  /** 切换某张图片的批量选中状态（复选框）。 */
  readonly toggleChecked: (id: string) => void
  /** 全选 / 取消全选。 */
  readonly checkAll: () => void
  readonly uncheckAll: () => void
  /** 删除一张图片；删除当前图时确定性选择下一张，否则上一张。 */
  readonly removeItem: (id: string) => void
  /** 删除所有勾选图片。 */
  readonly removeChecked: () => void
  /** 关闭除指定图片外的全部图片（保留该条目及其每图覆盖与绑定）。 */
  readonly removeOthers: (id: string) => void
  /** 关闭指定图片左侧的全部图片。 */
  readonly removeLeftOf: (id: string) => void
  /** 关闭指定图片右侧的全部图片。 */
  readonly removeRightOf: (id: string) => void
  /** 将指定图片移动到目标下标（自动钳制；拖回原位不产生撤销历史）。 */
  readonly reorder: (id: string, toIndex: number) => void
  /** 按文件名排序队列；稳定排序，同名文件保持原相对顺序。 */
  readonly sortByName: (direction: "asc" | "desc") => void
  readonly clear: () => void
  /** 撤销/重做队列管理及每图覆盖更改。 */
  readonly undo: () => void
  readonly redo: () => void
  /** 更新当前预览图片的文字覆盖。 */
  readonly setActiveTextOverride: (text: string | null) => void
  /**
   * 更新当前预览图片的底片处理配置（深复制后写入队列历史）。
   * 相同 historyTag 的连续手势（如曲线拖动）合并为一条撤销历史。
   */
  readonly setActiveImageProcessing: (
    config: ImageProcessingConfig | null,
    options?: { readonly historyTag?: string; readonly description?: string }
  ) => void
  /** 读取指定图片的有效底片配置（深复制）；不存在或普通模式返回 null。 */
  readonly recordSourceVersion: (id: string, version: string) => void
  readonly getEffectiveImageProcessing: (id: string) => ImageProcessingConfig | null
  /**
   * 选择性同步底片配置到 active/checked/all。只复制指定字段组，其他每图覆盖保留；
   * 一次调用形成一条撤销历史；损坏配置的条目跳过，不污染其他结果。
   */
  readonly syncImageProcessing: (
    scope: OperationScope,
    source: ImageProcessingConfig,
    fields: readonly FilmSyncField[]
  ) => void
  readonly getEffectiveText: (id: string, globalText: string) => string
  /** 应用摄影预设到指定作用范围。 */
  readonly assignPresetToScope: (presetId: string | null, scope: OperationScope) => void
  /** 清除指定作用范围的预设绑定。 */
  readonly clearPresetFromScope: (scope: OperationScope) => void
  /** 清除绑定到指定预设 ID 的所有图片的预设绑定（删除预设时调用）。 */
  readonly clearPresetBinding: (presetId: string) => void
  /** 更新当前预览图片的摄影身份覆盖。 */
  readonly setActiveIdentityOverride: (patch: Partial<PhotoIdentity>) => void
  /** 清除当前预览图片的摄影身份覆盖。 */
  readonly clearActiveIdentityOverride: () => void
  /**
   * 重新定位丢失条目到新路径（U11）：保留条目身份、每图覆盖、预设绑定、
   * 排序与选中，并按 HEIC 规则重建工作文件。失败（不可读/转换失败）返回 false。
   */
  readonly relocateItem: (id: string, newPath: string) => Promise<boolean>
  /**
   * 文件夹级重定位（U11）：按文件名匹配候选；同名候选唯一时自动绑定，
   * 多个同名候选不静默绑定，在 ambiguous 中返回候选供用户逐个确认。
   */
  readonly relocateMissingFromFolder: (candidatePaths: readonly string[]) => Promise<{
    readonly relocated: number
    readonly ambiguous: readonly { readonly itemId: string; readonly fileName: string; readonly candidates: readonly string[] }[]
    readonly unresolved: readonly string[]
  }>
  /** 同名冲突时的人工确认绑定入口。 */
  readonly relocateItemToCandidate: (id: string, candidatePath: string) => Promise<boolean>
  /**
   * 计算图片的有效摄影身份。
   * 优先级：每图覆盖 > 摄影预设 > EXIF（可选传入）> 空默认。
   */
  readonly getEffectiveIdentity: (
    itemId: string,
    presets: readonly ShootingPreset[],
    assetStore: PhotoAssetStore,
    exifByPath?: ReadonlyMap<string, PhotoMetadata>
  ) => PhotoIdentity
  /**
   * 计算图片各展示字段的来源标识（EXIF / 摄影预设 / 每图覆盖）。
   * 判定逻辑与 getEffectiveIdentity 的合并链一致。
   */
  readonly getIdentitySources: (
    itemId: string,
    presets: readonly ShootingPreset[],
    assetStore: PhotoAssetStore,
    exifByPath?: ReadonlyMap<string, PhotoMetadata>
  ) => IdentitySourceMap
}
