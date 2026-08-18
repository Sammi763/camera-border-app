/**
 * 有效摄影身份解析：字段优先级固定为 每图覆盖 > 摄影预设 > EXIF > 空。
 *
 * 这是 P0-05/P0-06 的核心合并逻辑，抽离为纯函数便于独立测试。
 * 预览（Canvas/引擎）、单图导出、批量导出统一走这里，保证变量解析一致。
 */

import type { PhotoAssetStore, PhotoIdentity, ShootingPreset } from "../types"
import { createEmptyIdentity } from "../types"
import type { PhotoMetadata } from "../../../types/preview"

/** 相机资产显示名：优先别名，其次「品牌 型号」。 */
const cameraLabel = (store: PhotoAssetStore, assetId: string): string => {
  const asset = store.cameras.find((c) => c.id === assetId)
  if (asset === undefined) {
    return ""
  }
  return asset.alias.trim().length > 0 ? asset.alias : `${asset.brand} ${asset.model}`.trim()
}

/** 镜头资产显示名：「品牌 型号」。 */
const lensLabel = (store: PhotoAssetStore, assetId: string): string => {
  const asset = store.lenses.find((l) => l.id === assetId)
  if (asset === undefined) {
    return ""
  }
  return `${asset.brand} ${asset.model}`.trim()
}

/** 胶片资产显示名：「品牌 名称」。 */
const filmLabel = (store: PhotoAssetStore, assetId: string): string => {
  const asset = store.films.find((f) => f.id === assetId)
  if (asset === undefined) {
    return ""
  }
  return `${asset.brand} ${asset.name}`.trim()
}

/** 取第一个有实际内容的字符串；空白值不能阻断低优先级来源。 */
const firstNonEmpty = (...values: readonly (string | null | undefined)[]): string => {
  for (const value of values) {
    if (value !== null && value !== undefined && value.trim().length > 0) {
      return value
    }
  }
  return ""
}

/**
 * 把摄影预设解析为可展示的身份片段（Partial：只包含预设实际提供的字段）。
 *
 * 关键语义（对应契约「空字符串不会错误阻断继承」）：
 * - 预设未引用的资产 / 未填的地点 → 对应字段**不出现**在结果中，
 *   合并链会继续向 EXIF 等更低优先级来源取值，而不是用空字符串遮挡；
 * - 引用了但资产不存在（悬空 ID）→ 视为该字段未提供，同样回落到 EXIF；
 * - captureFormat 是预设必填字段，始终提供。
 *
 * 不会抛出异常、不会产生 undefined/null 显示（缺失时降级为空字符串）。
 */
export const resolvePresetIdentity = (
  preset: ShootingPreset,
  assetStore: PhotoAssetStore
): Partial<PhotoIdentity> => {
  // 局部可变对象：PhotoIdentity 字段为 readonly，Partial 不能直接赋值
  const result: {
    camera?: string
    lens?: string
    film?: string
    location?: string
    captureFormat: string
  } = { captureFormat: preset.captureFormat }

  if (preset.cameraAssetId !== null) {
    const label = cameraLabel(assetStore, preset.cameraAssetId)
    if (label.length > 0) {
      result.camera = label
    }
  }
  if (preset.lensAssetId !== null) {
    const label = lensLabel(assetStore, preset.lensAssetId)
    if (label.length > 0) {
      result.lens = label
    }
  }
  if (preset.filmAssetId !== null) {
    const label = filmLabel(assetStore, preset.filmAssetId)
    if (label.length > 0) {
      result.film = label
    }
  }
  if (preset.defaultLocation !== null && preset.defaultLocation.trim().length > 0) {
    result.location = preset.defaultLocation
  }

  return result
}

/**
 * 合并身份链：每图覆盖 > 摄影预设 > EXIF > 空。
 *
 * 每个字段独立取优先级最高的非空来源；preset 为 Partial——
 * 只有预设实际提供的字段（有值的字符串）才会遮挡 EXIF，
 * 空值/未提供字段回落到 EXIF 或空，不阻断继承。
 * preset 传 null 表示图片未绑定预设；exif 传 null 表示该路径无 EXIF。
 */
export const mergeIdentityChain = (options: {
  readonly override: Partial<PhotoIdentity> | null
  readonly preset: Partial<PhotoIdentity> | null
  readonly exif: PhotoMetadata | null
}): PhotoIdentity => {
  const { override, preset, exif } = options
  const empty = createEmptyIdentity()

  return {
    camera: firstNonEmpty(override?.camera, preset?.camera, exif?.cameraModel) || empty.camera,
    lens: firstNonEmpty(override?.lens, preset?.lens, exif?.lensModel) || empty.lens,
    film: firstNonEmpty(override?.film, preset?.film, exif?.filmName) || empty.film,
    developer: firstNonEmpty(override?.developer, preset?.developer) || empty.developer,
    scanner: firstNonEmpty(override?.scanner, preset?.scanner) || empty.scanner,
    lab: firstNonEmpty(override?.lab, preset?.lab) || empty.lab,
    location: firstNonEmpty(override?.location, preset?.location) || empty.location,
    rollName: firstNonEmpty(override?.rollName, preset?.rollName) || empty.rollName,
    frameNumber: firstNonEmpty(override?.frameNumber) || empty.frameNumber,
    // EXIF 不提供画幅；画幅来源只有覆盖与预设
    captureFormat: firstNonEmpty(override?.captureFormat, preset?.captureFormat) || empty.captureFormat
  }
}
