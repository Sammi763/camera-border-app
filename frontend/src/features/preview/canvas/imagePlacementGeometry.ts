/**
 * RenderRecipe v2 图片放置几何。
 *
 * Canvas 和 Java 引擎都遵循这里的计算顺序：先按 rotation 求旋转包围盒，
 * 再按 targetAspectRatio 求目标框，最后按 fit/fill 与 focalX/focalY 求绘制偏移。
 * Java 端对应实现位于 util/ImagePlacementRenderer.java；两端只允许改变绘图 API，
 * 不允许改变这些公式。
 */

import type { ImagePlacement, ImagePlacementMode } from "../../../types/preview"

export type { ImagePlacement, ImagePlacementMode }

export const DEFAULT_IMAGE_PLACEMENT: ImagePlacement = {
  mode: "fit",
  focalX: 0.5,
  focalY: 0.5,
  rotation: 0,
  targetAspectRatio: null
}

export type ImagePlacementGeometry = ImagePlacement & {
  readonly sourceWidth: number
  readonly sourceHeight: number
  readonly rotatedWidth: number
  readonly rotatedHeight: number
  readonly targetWidth: number
  readonly targetHeight: number
  /** 原图绘制尺寸（旋转前）。 */
  readonly drawWidth: number
  readonly drawHeight: number
  /** 旋转包围盒左上角相对目标框左上角的偏移。 */
  readonly offsetX: number
  readonly offsetY: number
  /** 原图缩放因子，供 Canvas 的 transform 使用。 */
  readonly scale: number
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

const normalizeAngle = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0
  }
  const normalized = value % 360
  return normalized < 0 ? normalized + 360 : normalized
}

const finitePositive = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return null
  }
  return value
}

export const normalizeImagePlacement = (
  value?: Partial<ImagePlacement> | null
): ImagePlacement => {
  const mode: ImagePlacementMode = value?.mode === "fill" ? "fill" : "fit"
  const focalX = Number.isFinite(value?.focalX) ? clamp(value!.focalX!, 0, 1) : 0.5
  const focalY = Number.isFinite(value?.focalY) ? clamp(value!.focalY!, 0, 1) : 0.5
  const rotation = normalizeAngle(value?.rotation ?? 0)
  const targetAspectRatio = finitePositive(value?.targetAspectRatio)
  return { mode, focalX, focalY, rotation, targetAspectRatio }
}

/**
 * 计算放置几何。目标框是旋转后原图包围盒内能容纳的最大指定比例矩形；
 * 因而旧配方在 targetAspectRatio=null 时不会被隐式裁剪或放大。
 */
export const calculateImagePlacementGeometry = (
  sourceWidth: number,
  sourceHeight: number,
  value?: Partial<ImagePlacement> | null
): ImagePlacementGeometry | null => {
  if (
    !Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight)
    || sourceWidth <= 0 || sourceHeight <= 0
  ) {
    return null
  }

  const placement = normalizeImagePlacement(value)
  const radians = (placement.rotation * Math.PI) / 180
  // 对 90° 等直角做归零，避免浮点误差让两端输出出现 200.00000000003。
  const absCosRaw = Math.abs(Math.cos(radians))
  const absSinRaw = Math.abs(Math.sin(radians))
  const absCos = absCosRaw < 1e-12 ? 0 : absCosRaw
  const absSin = absSinRaw < 1e-12 ? 0 : absSinRaw
  const rotatedWidth = sourceWidth * absCos + sourceHeight * absSin
  const rotatedHeight = sourceWidth * absSin + sourceHeight * absCos

  let targetWidth = rotatedWidth
  let targetHeight = rotatedHeight
  if (placement.targetAspectRatio !== null) {
    if (rotatedWidth / rotatedHeight > placement.targetAspectRatio) {
      targetWidth = rotatedHeight * placement.targetAspectRatio
    } else {
      targetHeight = rotatedWidth / placement.targetAspectRatio
    }
  }

  const scale = placement.mode === "fill"
    ? Math.max(targetWidth / rotatedWidth, targetHeight / rotatedHeight)
    : Math.min(targetWidth / rotatedWidth, targetHeight / rotatedHeight)
  const drawRotatedWidth = rotatedWidth * scale
  const drawRotatedHeight = rotatedHeight * scale
  const freeX = targetWidth - drawRotatedWidth
  const freeY = targetHeight - drawRotatedHeight
  const offsetXRaw = placement.mode === "fill" ? freeX * placement.focalX : freeX / 2
  const offsetYRaw = placement.mode === "fill" ? freeY * placement.focalY : freeY / 2
  const offsetX = Math.abs(offsetXRaw) < 1e-12 ? 0 : offsetXRaw
  const offsetY = Math.abs(offsetYRaw) < 1e-12 ? 0 : offsetYRaw

  return {
    ...placement,
    sourceWidth,
    sourceHeight,
    rotatedWidth,
    rotatedHeight,
    targetWidth,
    targetHeight,
    drawWidth: sourceWidth * scale,
    drawHeight: sourceHeight * scale,
    offsetX,
    offsetY,
    scale
  }
}
