import type { RenderSettingsInput } from "../../settings/types"
import type { LayoutSettings, OutputSettingKey } from "../types"
import { normalizeTemplateSettings } from "./normalizeTemplate"

/** 版式持久化时需要剥离的输出字段。 */
export const OUTPUT_SETTING_KEYS: readonly OutputSettingKey[] = [
  "exportFormat",
  "jpegQuality",
  "outputSizePreset",
  "customOutputLongEdge",
  "preserveMetadata",
  "preserveColorProfile",
  "preferHighBitDepth"
]

/**
 * 早期导出文件曾把输出设置包在对象中；这些容器也不属于当前版式。
 * 只处理明确的历史字段名，避免误删用户未来可能使用的视觉设置。
 */
export const LEGACY_OUTPUT_CONTAINER_KEYS = [
  "export",
  "output",
  "outputSettings",
  "outputPreset"
] as const

/**
 * 将任意旧/新的设置快照规范化为只含视觉设置的版式。
 * 该函数是 localStorage、Electron userData、JSON 导入和复制操作的共同入口。
 */
export const toLayoutSettings = (settings: RenderSettingsInput): LayoutSettings => {
  const normalized = normalizeTemplateSettings(settings)
  const layout = { ...normalized } as Record<string, unknown>
  for (const key of OUTPUT_SETTING_KEYS) {
    delete layout[key]
  }
  for (const key of LEGACY_OUTPUT_CONTAINER_KEYS) {
    delete layout[key]
  }
  return layout as LayoutSettings
}

/** 读取持久化版式时允许的结构化检查。 */
export const isLayoutSettings = (value: unknown): value is LayoutSettings => {
  if (value === null || typeof value !== "object") return false
  const settings = value as Record<string, unknown>
  // 类型上的 Omit 无法约束来自 JSON 的运行时对象；这里显式拒绝输出字段，
  // 防止调用方绕过 toLayoutSettings 后把格式、尺寸或质量存进版式。
  if (
    OUTPUT_SETTING_KEYS.some((key) => key in settings)
    || LEGACY_OUTPUT_CONTAINER_KEYS.some((key) => key in settings)
  ) return false
  return typeof settings["borderColor"] === "string"
    && typeof settings["borderTop"] === "number"
    && typeof settings["borderBottom"] === "number"
    && typeof settings["borderLeft"] === "number"
    && typeof settings["borderRight"] === "number"
    && Array.isArray(settings["textLayers"])
    && typeof settings["gradient"] === "object"
}
