/**
 * 摄影信息来源标识解析。
 *
 * 用于在摄影信息面板标识「EXIF / 摄影预设 / 每图覆盖」来源。
 * 判定逻辑与 mergeIdentityChain（resolveIdentity.ts）保持一致：
 * 每图覆盖 > 摄影预设 > EXIF > 空。
 * 仅对「展示型」字段做来源标注；developer/scanner/lab/rollName 等旧暗房字段不标注。
 */

import type { PhotoIdentity } from "../types"
import type { PhotoMetadata } from "../../../types/preview"

/** 字段来源：每图覆盖 / 摄影预设 / EXIF / 无来源。 */
export type IdentityFieldSource = "override" | "preset" | "exif" | null

/** 展示型字段到来源的映射。 */
export type IdentitySourceMap = {
  readonly camera: IdentityFieldSource
  readonly lens: IdentityFieldSource
  readonly film: IdentityFieldSource
  readonly location: IdentityFieldSource
  readonly frameNumber: IdentityFieldSource
  readonly captureFormat: IdentityFieldSource
}

/** 判断字符串是否「有实际内容」。 */
const nonEmpty = (value: string | null | undefined): boolean =>
  value !== null && value !== undefined && value.trim().length > 0

/**
 * 解析每个展示字段的实际来源。
 *
 * @param override 每图覆盖（null 表示无覆盖）
 * @param preset 摄影预设解析出的身份片段（null 表示未绑定预设或未提供该字段）
 * @param exif 图片 EXIF 元数据（null 表示无 EXIF）
 */
export const resolveIdentityFieldSources = (options: {
  readonly override: Partial<PhotoIdentity> | null
  readonly preset: Partial<PhotoIdentity> | null
  readonly exif: PhotoMetadata | null
}): IdentitySourceMap => {
  const { override, preset, exif } = options

  const fieldSource = (
    overrideValue: string | null | undefined,
    presetValue: string | null | undefined,
    exifValue: string | null | undefined
  ): IdentityFieldSource => {
    if (nonEmpty(overrideValue)) return "override"
    if (nonEmpty(presetValue)) return "preset"
    if (nonEmpty(exifValue)) return "exif"
    return null
  }

  return {
    camera: fieldSource(override?.camera, preset?.camera, exif?.cameraModel),
    lens: fieldSource(override?.lens, preset?.lens, exif?.lensModel),
    film: fieldSource(override?.film, preset?.film, exif?.filmName),
    location: fieldSource(override?.location, preset?.location, null),
    frameNumber: fieldSource(override?.frameNumber, preset?.frameNumber, null),
    // EXIF 不提供画幅；画幅来源只有覆盖与预设
    captureFormat: fieldSource(override?.captureFormat, preset?.captureFormat, null)
  }
}

/** 来源到中文标签的映射。 */
export const IDENTITY_SOURCE_LABELS: Record<Exclude<IdentityFieldSource, null>, string> = {
  override: "每图覆盖",
  preset: "摄影预设",
  exif: "EXIF"
}
