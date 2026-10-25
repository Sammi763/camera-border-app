/**
 * v1 模板布局兼容适配器。
 *
 * 早期模板把画幅和裁剪开关作为顶层设置写入；这些字段只允许在模板导入、
 * 旧 userData 读取这一条边界被消费。适配器返回 v2 imagePlacement，并从
 * 返回值中移除旧字段，后续设置、RenderRecipe 与导出链路只看到 v2 结构。
 */

import type { RenderSettings } from "../../settings/types"
import { normalizeImagePlacement } from "../../preview/canvas/imagePlacementGeometry"

type LegacyTemplateRecord = Record<string, unknown>

/** 早期画幅 id 到 v2 目标比例的白名单。 */
const LEGACY_ASPECT_RATIOS: Readonly<Record<string, number>> = {
  "half-frame": 3 / 4,
  "135": 3 / 2,
  "645": 4 / 3,
  "6x6": 1,
  "6x7": 5 / 4,
  "6x8": 10 / 7,
  "6x9": 45 / 28,
  "6x10": 25 / 14,
  "6x12": 15 / 7
}

/**
 * 只在 v1 模板边界迁移早期布局字段；已有 imagePlacement 时不覆盖用户的 v2 值。
 */
export const migrateLegacyTemplateLayout = (
  input: LegacyTemplateRecord
): Partial<RenderSettings> => {
  const cleaned: LegacyTemplateRecord = { ...input }
  const legacyFilmFormat = typeof input["filmFormat"] === "string"
    ? input["filmFormat"]
    : input["filmFormat"] === null ? null : undefined
  const hasLegacyLayout = "filmFormat" in input || "autoCrop" in input

  delete cleaned["filmFormat"]
  delete cleaned["autoCrop"]

  if (!hasLegacyLayout || input["imagePlacement"] !== undefined) {
    return cleaned as Partial<RenderSettings>
  }

  return {
    ...cleaned,
    layoutPresetId: legacyFilmFormat ?? null,
    imagePlacement: normalizeImagePlacement({
      mode: input["autoCrop"] === true ? "fill" : "fit",
      targetAspectRatio: legacyFilmFormat === undefined || legacyFilmFormat === null
        ? null
        : LEGACY_ASPECT_RATIOS[legacyFilmFormat] ?? null
    })
  } as Partial<RenderSettings>
}
