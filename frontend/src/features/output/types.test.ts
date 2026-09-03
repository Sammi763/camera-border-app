import { describe, expect, it } from "vitest"
import type { RenderSettings } from "../settings/types"
import { outputPresetSettingsFrom } from "./types"
import { isValidOutputPreset, isValidOutputPresetSettings, uniqueOutputPresetName } from "./hooks/useOutputPresets"

const settings = {
  exportFormat: "jpeg",
  jpegQuality: 88,
  outputSizePreset: "4k",
  customOutputLongEdge: 4096,
  preserveMetadata: true,
  preserveColorProfile: true,
  preferHighBitDepth: false
} as RenderSettings

describe("OutputPreset", () => {
  it("只提取输出字段，不把布局设置带入预设", () => {
    expect(outputPresetSettingsFrom(settings)).toEqual({
      exportFormat: "jpeg",
      jpegQuality: 88,
      outputSizePreset: "4k",
      customOutputLongEdge: 4096,
      preserveMetadata: true,
      preserveColorProfile: true,
      preferHighBitDepth: false
    })
    expect(outputPresetSettingsFrom(settings)).not.toHaveProperty("borderTop")
    expect(outputPresetSettingsFrom(settings)).not.toHaveProperty("imagePlacement")
  })

  it("同名预设生成确定性的非覆盖名称", () => {
    expect(uniqueOutputPresetName("社交平台", [])).toBe("社交平台")
    expect(uniqueOutputPresetName("社交平台", ["社交平台", "社交平台 (2)"])).toBe("社交平台 (3)")
  })

  it("拒绝损坏的输出枚举、范围和记录元数据", () => {
    const valid = outputPresetSettingsFrom(settings)
    expect(isValidOutputPresetSettings(valid)).toBe(true)
    expect(isValidOutputPresetSettings({ ...valid, outputSizePreset: "poster" })).toBe(false)
    expect(isValidOutputPresetSettings({ ...valid, jpegQuality: 0 })).toBe(false)
    expect(isValidOutputPresetSettings({ ...valid, customOutputLongEdge: Number.NaN })).toBe(false)
    expect(isValidOutputPreset({
      id: "p1",
      name: "有效预设",
      createdAt: Date.now(),
      settings: valid
    })).toBe(true)
    expect(isValidOutputPreset({
      id: "p2",
      name: " ",
      createdAt: Date.now(),
      settings: valid
    })).toBe(false)
  })
})
