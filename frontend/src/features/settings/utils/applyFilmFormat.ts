/**
 * 画幅切换的推荐值应用工具。
 *
 * 画幅只提供「信息 + 边框建议」，规则（docs/prd.md §3.7 与 docs/tasks.md P0-02）：
 * - 切换画幅会自动填充推荐边框值（可见行为，用户可随后手动覆盖）；
 * - 画幅切换绝不改变 imagePlacement.mode（裁剪）、输出尺寸预设、自定义长边等设置——
 *   需要裁剪时必须由用户明确选择铺满；
 * - 画幅建议只作用于布局，不强行改变用户设置、原图比例或导出尺寸。
 *
 * 抽离为纯函数便于测试「画幅切换不会覆盖用户边框和裁剪设置」。
 */

import type { FilmFormatInfo } from "../../../types/preview"
import type { RenderSettings } from "../types"
import { normalizeImagePlacement } from "../../preview/canvas/imagePlacementGeometry"

const ASPECT_BY_FORMAT: Readonly<Record<string, number>> = {
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
 * 计算切换画幅后的设置补丁。
 *
 * @param settings 当前渲染设置
 * @param formatId 目标画幅 id（"" 表示清除画幅）
 * @param format 目标画幅信息；undefined 表示没有推荐边框（此时保留用户边框，仅切换画幅 id）
 * @returns 需要合并进 settings 的补丁
 */
export const applyFilmFormatSettings = (
  settings: RenderSettings,
  formatId: string,
  format: FilmFormatInfo | undefined
): Partial<RenderSettings> => {
  if (formatId === "") {
    return {
      layoutPresetId: null,
      imagePlacement: { ...normalizeImagePlacement(settings.imagePlacement), targetAspectRatio: null }
    }
  }
  const targetAspectRatio = format?.targetAspectRatio
    ?? ASPECT_BY_FORMAT[formatId]
    ?? null
  const currentPlacement = normalizeImagePlacement(settings.imagePlacement)
  const imagePlacement = { ...currentPlacement, targetAspectRatio }
  if (format === undefined) {
    return { layoutPresetId: formatId, imagePlacement }
  }
  return {
    layoutPresetId: formatId,
    imagePlacement,
    borderTop: format.recommendedBorder.top,
    borderBottom: format.recommendedBorder.bottom,
    borderLeft: format.recommendedBorder.left,
    borderRight: format.recommendedBorder.right
  }
}
