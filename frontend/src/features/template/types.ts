/**
 * 模板模块类型定义。
 *
 * 模板包含完整的渲染设置快照，用于保存和复用。
 */

import type { RenderSettings } from "../../features/settings/types"

/** 模板数据结构。 */
export type Template = {
  readonly id: string
  readonly name: string
  readonly settings: RenderSettings
  readonly createdAt: number
}

/** 模板管理控制器。 */
export type TemplateController = {
  readonly templates: readonly Template[]
  readonly defaultTemplateId: string | null
  /** 最近一次操作的错误信息，null 表示无错误。 */
  readonly lastError: string | null
  readonly saveTemplate: (name: string, settings: RenderSettings) => void
  readonly loadTemplate: (id: string) => RenderSettings | null
  readonly deleteTemplate: (id: string) => void
  readonly setDefault: (id: string | null) => void
  /** 清除错误信息。 */
  readonly clearError: () => void
}
