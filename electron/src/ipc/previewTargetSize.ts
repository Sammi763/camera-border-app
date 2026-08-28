/**
 * 本地预览目标尺寸计算（纯函数，便于单元测试）。
 *
 * 规则（docs/tasks 与 ARCHITECTURE 本地优先/保真约束）：
 * - 同时遵守 maxWidth 与 maxHeight；
 * - 保持纵横比：宽高按同一缩放比例计算，不会变形；
 * - 不得放大原图：scale ≤ 1，原图更小则原样返回；
 * - 最大边长不超过 MAX_DIMENSION_CAP（防 OOM 与放大失真）。
 */

/** 单张预览的最大边长上限（防 OOM 与放大失真）。 */
export const MAX_DIMENSION_CAP = 2048

/** 目标尺寸。 */
export type PreviewTargetSize = {
  readonly width: number
  readonly height: number
}

/**
 * 计算缩放目标尺寸。
 *
 * @param naturalWidth 原图宽（>0）
 * @param naturalHeight 原图高（>0）
 * @param maxWidth 请求的最大宽（正整数）
 * @param maxHeight 请求的最大高（正整数）
 * @param cap 最大边长封顶（默认 2048）
 * @returns 目标尺寸；原图尺寸非法时返回 null
 */
export const resolvePreviewTargetSize = (
  naturalWidth: number,
  naturalHeight: number,
  maxWidth: number,
  maxHeight: number,
  cap: number = MAX_DIMENSION_CAP
): PreviewTargetSize | null => {
  if (
    !Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight) ||
    naturalWidth <= 0 || naturalHeight <= 0
  ) {
    return null
  }
  const scale = Math.min(
    1, // 不放大原图
    maxWidth / naturalWidth,
    maxHeight / naturalHeight,
    cap / naturalWidth,
    cap / naturalHeight
  )
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale))
  }
}
