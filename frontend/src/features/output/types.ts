import type { RenderSettings } from "../settings/types"

/**
 * 独立输出预设只保存输出策略，不携带版式、图片布局或摄影信息。
 * 这样版式可以在不同输出目标之间复用。
 */
export type OutputPresetSettings = Pick<RenderSettings,
  | "exportFormat"
  | "jpegQuality"
  | "outputSizePreset"
  | "customOutputLongEdge"
  | "preserveMetadata"
  | "preserveColorProfile"
  | "preferHighBitDepth"
>

export type OutputPreset = {
  readonly id: string
  readonly name: string
  readonly settings: OutputPresetSettings
  readonly createdAt: number
}

export type OutputPresetController = {
  readonly presets: readonly OutputPreset[]
  readonly lastError: string | null
  readonly savePreset: (name: string, settings: OutputPresetSettings) => void
  readonly updatePreset: (id: string, name: string, settings: OutputPresetSettings) => void
  readonly duplicatePreset: (id: string, name?: string) => void
  readonly deletePreset: (id: string) => void
  readonly clearError: () => void
}

export const outputPresetSettingsFrom = (settings: RenderSettings): OutputPresetSettings => ({
  exportFormat: settings.exportFormat,
  jpegQuality: settings.jpegQuality,
  outputSizePreset: settings.outputSizePreset,
  customOutputLongEdge: settings.customOutputLongEdge,
  preserveMetadata: settings.preserveMetadata,
  preserveColorProfile: settings.preserveColorProfile,
  preferHighBitDepth: settings.preferHighBitDepth
})
