/**
 * 摄影预设 JSON 编解码与输入校验。
 *
 * 负责把持久化 JSON（预设数组）解析为 ShootingPreset[]，并校验新建/编辑表单输入。
 * 从 useShootingPresets hook 中抽离，便于独立测试。
 *
 * 解析策略（失败路径覆盖）：
 * - 非 JSON / 非数组 → 整体失败，返回中文错误描述；
 * - 数组中结构不合法的条目 → 丢弃并计数（部分数据可抢救，不让整份数据失效）；
 * - 未知画幅 ID / 悬空资产引用 → 保留（向前兼容），由解析层降级为空，不崩溃。
 */

import type { ShootingPreset } from "../types"
import { isKnownCaptureFormat } from "../constants/captureFormats"

/** 解析结果：成功返回预设列表与跳过的非法条目数，失败返回 error 描述。 */
export type PresetsCodecResult =
  | { readonly ok: true; readonly presets: readonly ShootingPreset[]; readonly skipped: number }
  | { readonly ok: false; readonly error: string }

/** 表单输入校验错误码。 */
export type PresetFieldError =
  | "empty-name"
  | "missing-capture-format"
  | "invalid-capture-format"
  | "invalid-asset-id"

/**
 * 校验预设输入（创建/编辑时使用）。
 *
 * - 空名称 → empty-name
 * - 缺少画幅 → missing-capture-format
 * - 未知画幅 id → invalid-capture-format
 * - 资产引用为空字符串（应为 null 或非空字符串）→ invalid-asset-id
 *
 * 返回错误码数组，空数组表示通过。
 */
export const validatePresetInput = (preset: ShootingPreset): readonly PresetFieldError[] => {
  const errors: PresetFieldError[] = []

  if (preset.name.trim().length === 0) {
    errors.push("empty-name")
  }
  if (preset.captureFormat.length === 0) {
    errors.push("missing-capture-format")
  } else if (!isKnownCaptureFormat(preset.captureFormat)) {
    errors.push("invalid-capture-format")
  }
  for (const assetId of [preset.cameraAssetId, preset.lensAssetId, preset.filmAssetId]) {
    if (assetId !== null && assetId.trim().length === 0) {
      errors.push("invalid-asset-id")
    }
  }

  return errors
}

/** 条目结构守卫：字段类型合法（不校验业务规则，业务规则见 validatePresetInput）。 */
const isPresetLike = (value: unknown): value is ShootingPreset => {
  if (typeof value !== "object" || value === null) {
    return false
  }
  const obj = value as Record<string, unknown>
  if (typeof obj["id"] !== "string" || obj["id"].length === 0) {
    return false
  }
  if (typeof obj["name"] !== "string") {
    return false
  }
  if (typeof obj["category"] !== "string") {
    return false
  }
  if (typeof obj["captureFormat"] !== "string") {
    return false
  }
  for (const key of ["cameraAssetId", "lensAssetId", "filmAssetId", "defaultLocation", "notes"] as const) {
    const value = obj[key]
    if (value !== null && typeof value !== "string") {
      return false
    }
  }
  return true
}

/**
 * 解析摄影预设 JSON 字符串。
 *
 * 不会静默吞掉错误：JSON 层或整体结构失败时返回 error 描述；
 * 数组内非法条目跳过并计数，调用方据此提示「部分数据不合法，已忽略」。
 */
export const parsePresetsJson = (json: string): PresetsCodecResult => {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, error: "摄影预设数据不是合法 JSON，已临时使用空预设列表。请检查本地数据文件。" }
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, error: "摄影预设数据结构不合法，已临时使用空预设列表。请检查本地数据文件。" }
  }

  const presets: ShootingPreset[] = []
  let skipped = 0
  for (const item of parsed) {
    if (isPresetLike(item)) {
      presets.push(item)
    } else {
      skipped++
    }
  }

  return { ok: true, presets, skipped }
}
