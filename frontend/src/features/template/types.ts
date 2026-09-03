/**
 * 模板模块类型定义。
 *
 * 模板包含完整的渲染设置快照，用于保存和复用。
 */

import type { RenderSettings } from "../../features/settings/types"

/** 输出选项只属于 OutputPreset，不属于用户版式。 */
export type OutputSettingKey =
  | "exportFormat"
  | "jpegQuality"
  | "outputSizePreset"
  | "customOutputLongEdge"
  | "preserveMetadata"
  | "preserveColorProfile"
  | "preferHighBitDepth"

/** 用户版式的持久化结构：只描述布局、边框、文字和标识视觉设置。 */
export type LayoutSettings = Omit<RenderSettings, OutputSettingKey>

/** 模板数据结构。 */
export type Template = {
  readonly id: string
  readonly name: string
  readonly settings: LayoutSettings
  readonly createdAt: number
}

/** 模板管理控制器。 */
export type TemplateController = {
  readonly templates: readonly Template[]
  readonly defaultTemplateId: string | null
  /** 最近一次操作的错误信息，null 表示无错误。 */
  readonly lastError: string | null
  readonly saveTemplate: (name: string, settings: Partial<RenderSettings>) => void
  /** 用当前设置覆盖已有版式，保留版式 ID 与创建时间。 */
  readonly updateTemplate: (id: string, name: string, settings: Partial<RenderSettings>) => void
  /** 复制已有版式并生成新的 ID。 */
  readonly duplicateTemplate: (id: string, name?: string) => void
  /** 重命名版式，不改变其设置。 */
  readonly renameTemplate: (id: string, name: string) => void
  readonly loadTemplate: (id: string) => LayoutSettings | null
  readonly deleteTemplate: (id: string) => void
  readonly setDefault: (id: string | null) => void
  /** 清除错误信息。 */
  readonly clearError: () => void
}
