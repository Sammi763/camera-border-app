/**
 * 图片区域设置与 RenderRecipe 图片放置配置的唯一转换入口。
 *
 * 图片区域是工作台可编辑的产品语义；RenderRecipe.imagePlacement 是
 * Canvas、Java 预览和导出共同消费的几何语义。这里负责把前者解析成后者，
 * 避免不同渲染链路各自解释方向和比例。
 */

import type { ImagePlacement } from "../../../types/preview"
import type { ImageAreaOrientation, ImageAreaRatio, ImageAreaSettings, RenderSettings } from "../types"
import {
  calculateImagePlacementGeometry,
  normalizeImagePlacement
} from "../../preview/canvas/imagePlacementGeometry"
import { resolveOutputSizeFromSettings } from "./outputSizePresets"

export const IMAGE_AREA_ORIENTATION_OPTIONS: readonly {
  readonly value: ImageAreaOrientation
  readonly label: string
}[] = [
  { value: "auto", label: "自动" },
  { value: "landscape", label: "横屏" },
  { value: "portrait", label: "竖屏" },
  { value: "square", label: "方形" }
]

export const IMAGE_AREA_RATIO_OPTIONS: readonly {
  readonly value: ImageAreaRatio
  readonly label: string
}[] = [
  { value: "original", label: "原图" },
  { value: "1:1", label: "1:1" },
  { value: "4:5", label: "4:5" },
  { value: "3:4", label: "3:4" },
  { value: "2:3", label: "2:3" },
  { value: "3:2", label: "3:2" },
  { value: "9:16", label: "9:16" }
]

const RATIO_ASPECTS: Readonly<Record<Exclude<ImageAreaRatio, "original">, number>> = {
  "1:1": 1,
  "4:5": 4 / 5,
  "3:4": 3 / 4,
  "2:3": 2 / 3,
  "3:2": 3 / 2,
  "9:16": 9 / 16
}

const DEFAULT_IMAGE_AREA: ImageAreaSettings = {
  orientation: "auto",
  ratio: "original",
  displayMode: "fit",
  focalX: 0.5,
  focalY: 0.5,
  rotation: 0,
  targetAspectRatioOverride: null
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

const finitePositive = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null
  }
  return value
}

const isImageAreaOrientation = (value: unknown): value is ImageAreaOrientation =>
  value === "auto" || value === "landscape" || value === "portrait" || value === "square"

const isImageAreaRatio = (value: unknown): value is ImageAreaRatio =>
  value === "original"
  || value === "1:1"
  || value === "4:5"
  || value === "3:4"
  || value === "2:3"
  || value === "3:2"
  || value === "9:16"

const aspectForRatio = (ratio: ImageAreaRatio): number | null =>
  ratio === "original" ? null : RATIO_ASPECTS[ratio]

const orientationForAspect = (aspect: number | null): Exclude<ImageAreaOrientation, "auto"> | "auto" => {
  if (aspect === null || !Number.isFinite(aspect) || aspect <= 0) return "auto"
  if (Math.abs(aspect - 1) < 0.005) return "square"
  return aspect > 1 ? "landscape" : "portrait"
}

const ratioForAspect = (aspect: number | null): {
  readonly ratio: ImageAreaRatio
  readonly orientation: ImageAreaOrientation
  readonly override: number | null
} => {
  const finiteAspect = finitePositive(aspect)
  if (finiteAspect === null) {
    return { ratio: "original", orientation: "auto", override: null }
  }

  const known = IMAGE_AREA_RATIO_OPTIONS
    .filter((option): option is { readonly value: Exclude<ImageAreaRatio, "original">; readonly label: string } => option.value !== "original")
    .find((option) => {
      const candidate = RATIO_ASPECTS[option.value]
      return Math.abs(candidate - finiteAspect) < 0.005
        || Math.abs((1 / candidate) - finiteAspect) < 0.005
    })
  if (known !== undefined) {
    return {
      ratio: known.value,
      orientation: orientationForAspect(finiteAspect),
      override: null
    }
  }
  return {
    ratio: "original",
    orientation: orientationForAspect(finiteAspect),
    override: finiteAspect
  }
}

/** 从旧 imagePlacement 迁移出图片区域设置。 */
export const imageAreaFromPlacement = (
  value?: Partial<ImagePlacement> | null
): ImageAreaSettings => {
  const placement = normalizeImagePlacement(value)
  const mapped = ratioForAspect(placement.targetAspectRatio)
  return {
    orientation: mapped.ratio === "original" && mapped.override === null
      ? "auto"
      : mapped.orientation,
    ratio: mapped.ratio,
    displayMode: placement.mode,
    focalX: placement.focalX,
    focalY: placement.focalY,
    rotation: placement.rotation,
    targetAspectRatioOverride: mapped.override
  }
}

/** 规范化图片区域，损坏值回退到旧 imagePlacement 或默认值。 */
export const normalizeImageAreaSettings = (
  value?: Partial<ImageAreaSettings> | null,
  fallbackPlacement?: Partial<ImagePlacement> | null
): ImageAreaSettings => {
  const fallback = imageAreaFromPlacement(fallbackPlacement)
  const candidate = value ?? fallback
  const ratio = isImageAreaRatio(candidate.ratio) ? candidate.ratio : fallback.ratio
  const orientation = isImageAreaOrientation(candidate.orientation)
    ? candidate.orientation
    : fallback.orientation
  const displayMode = candidate.displayMode === "fill" ? "fill" : "fit"
  const focalX = typeof candidate.focalX === "number" && Number.isFinite(candidate.focalX)
    ? clamp(candidate.focalX, 0, 1)
    : fallback.focalX
  const focalY = typeof candidate.focalY === "number" && Number.isFinite(candidate.focalY)
    ? clamp(candidate.focalY, 0, 1)
    : fallback.focalY
  const rotation = typeof candidate.rotation === "number" && Number.isFinite(candidate.rotation)
    ? ((candidate.rotation % 360) + 360) % 360
    : fallback.rotation
  const override = finitePositive(candidate.targetAspectRatioOverride)

  return {
    orientation,
    ratio,
    displayMode,
    focalX,
    focalY,
    rotation,
    targetAspectRatioOverride: ratio === "original" ? override : null
  }
}

/** 根据图片区域选项得到 RenderRecipe.imagePlacement。 */
export const imagePlacementFromArea = (
  area: Partial<ImageAreaSettings> | null | undefined,
  fallbackPlacement?: Partial<ImagePlacement> | null
): ImagePlacement => {
  const fallback = normalizeImagePlacement(fallbackPlacement)
  const normalized = normalizeImageAreaSettings(area, fallback)
  let targetAspectRatio: number | null = normalized.targetAspectRatioOverride ?? null
  if (targetAspectRatio === null) {
    const baseAspect = aspectForRatio(normalized.ratio)
    if (baseAspect !== null) {
      if (normalized.orientation === "landscape") {
        targetAspectRatio = Math.max(baseAspect, 1 / baseAspect)
      } else if (normalized.orientation === "portrait") {
        targetAspectRatio = Math.min(baseAspect, 1 / baseAspect)
      } else if (normalized.orientation === "square") {
        targetAspectRatio = 1
      } else {
        targetAspectRatio = baseAspect
      }
    }
  }
  return {
    mode: normalized.displayMode,
    focalX: normalized.focalX,
    focalY: normalized.focalY,
    rotation: normalized.rotation,
    targetAspectRatio
  }
}

/** 将当前设置解析为所有渲染链路使用的图片放置配置。 */
export const imagePlacementFromSettings = (settings: Pick<RenderSettings, "imageArea" | "imagePlacement">): ImagePlacement =>
  imagePlacementFromArea(settings.imageArea, settings.imagePlacement)

const formatAspect = (aspect: number): string => {
  const candidates: readonly { readonly label: string; readonly value: number }[] = [
    { label: "1:1", value: 1 },
    { label: "4:5", value: 4 / 5 },
    { label: "3:4", value: 3 / 4 },
    { label: "2:3", value: 2 / 3 },
    { label: "3:2", value: 3 / 2 },
    { label: "9:16", value: 9 / 16 }
  ]
  for (const candidate of candidates) {
    if (Math.abs(candidate.value - aspect) < 0.005) return candidate.label
    if (Math.abs((1 / candidate.value) - aspect) < 0.005) {
      const [width, height] = candidate.label.split(":").map(Number)
      return `${height}:${width}`
    }
  }
  return aspect.toFixed(2).replace(/0+$/, "").replace(/\.$/, "") + ":1"
}

export const imageAreaOrientationLabel = (orientation: ImageAreaOrientation): string => {
  switch (orientation) {
    case "landscape": return "横屏"
    case "portrait": return "竖屏"
    case "square": return "方形"
    case "auto": return "自动"
  }
}

export type ImageAreaSummary = {
  readonly orientation: ImageAreaOrientation
  readonly orientationLabel: string
  readonly ratioLabel: string
  readonly label: string
  readonly displayModeLabel: string
  readonly targetAspectRatio: number | null
}

/** 生成页面展示的图片区域摘要；source 尺寸只影响“原图”的方向显示。 */
export const summarizeImageArea = (
  settings: Pick<RenderSettings, "imageArea" | "imagePlacement">,
  sourceWidth?: number,
  sourceHeight?: number
): ImageAreaSummary => {
  const legacy = normalizeImagePlacement(settings.imagePlacement)
  const area = normalizeImageAreaSettings(settings.imageArea, legacy)
  const placement = imagePlacementFromArea(area, legacy)
  const sourceAspect = typeof sourceWidth === "number" && typeof sourceHeight === "number"
    && sourceWidth > 0 && sourceHeight > 0
    ? sourceWidth / sourceHeight
    : null
  const effectiveAspect = placement.targetAspectRatio ?? sourceAspect
  const orientation = orientationForAspect(effectiveAspect)
  const ratioLabel = area.ratio === "original" && area.targetAspectRatioOverride === null
    ? "原图"
    : effectiveAspect === null ? "原图" : formatAspect(effectiveAspect)
  return {
    orientation,
    orientationLabel: imageAreaOrientationLabel(orientation),
    ratioLabel,
    label: `${imageAreaOrientationLabel(orientation)} · ${ratioLabel}`,
    displayModeLabel: placement.mode === "fill" ? "填满裁切" : "完整显示",
    targetAspectRatio: placement.targetAspectRatio
  }
}

export type OutputPixelDimensions = {
  readonly width: number
  readonly height: number
}

/** 估算最终输出像素尺寸；预览 CSS 尺寸不参与计算。 */
export const calculateOutputPixelDimensions = (
  sourceWidth: number,
  sourceHeight: number,
  settings: RenderSettings
): OutputPixelDimensions | null => {
  const placement = imagePlacementFromSettings(settings)
  const geometry = calculateImagePlacementGeometry(sourceWidth, sourceHeight, placement)
  if (geometry === null) return null

  const placedWidth = Math.max(1, Math.round(geometry.targetWidth))
  const placedHeight = Math.max(1, Math.round(geometry.targetHeight))
  const limit = resolveOutputSizeFromSettings(settings)
  const scale = Math.min(
    1,
    limit.maxWidth > 0 ? limit.maxWidth / placedWidth : 1,
    limit.maxHeight > 0 ? limit.maxHeight / placedHeight : 1
  )
  const borderLeft = Math.max(0, Math.round(settings.borderLeft))
  const borderRight = Math.max(0, Math.round(settings.borderRight))
  const borderTop = Math.max(0, Math.round(settings.borderTop))
  const borderBottom = Math.max(0, Math.round(settings.borderBottom))
  return {
    width: Math.max(1, Math.round(placedWidth * scale) + borderLeft + borderRight),
    height: Math.max(1, Math.round(placedHeight * scale) + borderTop + borderBottom)
  }
}

export const DEFAULT_IMAGE_AREA_SETTINGS = DEFAULT_IMAGE_AREA
