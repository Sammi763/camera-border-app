/**
 * 有效摄影身份解析：字段优先级固定为 每图覆盖 > 摄影预设 > EXIF > 空。
 *
 * 这是 P0-05/P0-06 的核心合并逻辑，抽离为纯函数便于独立测试。
 * 预览（Canvas/引擎）、单图导出、批量导出统一走这里，保证变量解析一致。
 */

import type { PhotoAssetStore, PhotoIdentity, ShootingPreset } from "../types"
import { createEmptyIdentity } from "../types"
import type { PhotoMetadata } from "../../../types/preview"

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
    make?: string
    model?: string
    lensModel?: string
    filmBrand?: string
    filmIso?: string
    filmType?: string
    filmName?: string
    location?: string
    captureFormat: string
  } = { captureFormat: preset.captureFormat }

  if (preset.cameraAssetId !== null) {
    const asset = assetStore.cameras.find((candidate) => candidate.id === preset.cameraAssetId)
    const label = asset === undefined ? "" : asset.alias.trim().length > 0
      ? asset.alias
      : `${asset.brand} ${asset.model}`.trim()
    if (label.length > 0) {
      result.camera = label
    }
    if (asset !== undefined) {
      if (asset.brand.trim().length > 0) result.make = asset.brand
      if (asset.model.trim().length > 0) result.model = asset.model
    }
  }
  if (preset.lensAssetId !== null) {
    const asset = assetStore.lenses.find((candidate) => candidate.id === preset.lensAssetId)
    const label = asset === undefined ? "" : `${asset.brand} ${asset.model}`.trim()
    if (label.length > 0) {
      result.lens = label
    }
    if (asset !== undefined && asset.model.trim().length > 0) {
      result.lensModel = asset.model
    }
  }
  if (preset.filmAssetId !== null) {
    const asset = assetStore.films.find((candidate) => candidate.id === preset.filmAssetId)
    const label = asset === undefined ? "" : `${asset.brand} ${asset.name}`.trim()
    if (label.length > 0) {
      result.film = label
    }
    if (asset !== undefined) {
      if (asset.brand.trim().length > 0) result.filmBrand = asset.brand
      if (asset.iso.trim().length > 0) result.filmIso = asset.iso
      if (asset.type.trim().length > 0) result.filmType = asset.type
      if (asset.name.trim().length > 0) result.filmName = asset.name
    }
  }
  if (preset.defaultLocation !== null && preset.defaultLocation.trim().length > 0) {
    result.location = preset.defaultLocation
  }

  return result
}

/** 导出任务使用的图片身份输入；调用方应传入任务开始时复制的快照。 */
export type QueueIdentityInput = {
  readonly filePath: string
  /** 原始路径仅用于回溯；转换格式时优先读取带有迁移元数据的工作 PNG。 */
  readonly sourcePath?: string
  readonly presetId: string | null
  readonly identityOverride: Partial<PhotoIdentity> | null
}

/**
 * 按指定的队列快照解析身份，不通过 id 回读实时队列。
 *
 * 导出开始后即使用户继续编辑同一图片的覆盖值，也不能污染已经排队的任务；
 * EXIF 则由调用方在准备阶段完成读取后通过快照路径映射传入。
 */
export const resolveIdentityForQueueItem = (
  item: QueueIdentityInput,
  presets: readonly ShootingPreset[],
  assetStore: PhotoAssetStore,
  exifByPath: ReadonlyMap<string, PhotoMetadata>
): PhotoIdentity => {
  const preset = item.presetId === null
    ? null
    : presets.find((candidate) => candidate.id === item.presetId) ?? null
  return mergeIdentityChain({
    override: item.identityOverride,
    preset: preset === null ? null : resolvePresetIdentity(preset, assetStore),
    exif: exifByPath.get(item.filePath) ?? exifByPath.get(item.sourcePath ?? "") ?? null
  })
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
    captureFormat: firstNonEmpty(override?.captureFormat, preset?.captureFormat) || empty.captureFormat,
    fNumber: firstNonEmpty(override?.fNumber, preset?.fNumber, exif?.fNumber, exif?.aperture),
    exposureTime: firstNonEmpty(override?.exposureTime, preset?.exposureTime, exif?.exposureTime, exif?.shutterSpeed),
    iso: firstNonEmpty(override?.iso, preset?.iso, exif?.iso),
    focalLength: firstNonEmpty(override?.focalLength, preset?.focalLength, exif?.focalLength),
    dateTimeOriginal: firstNonEmpty(override?.dateTimeOriginal, preset?.dateTimeOriginal, exif?.dateTimeOriginal),
    make: firstNonEmpty(override?.make, preset?.make, exif?.make),
    model: firstNonEmpty(override?.model, preset?.model, exif?.model),
    lensModel: firstNonEmpty(override?.lensModel, preset?.lensModel, exif?.lensModel),
    filmBrand: firstNonEmpty(override?.filmBrand, preset?.filmBrand),
    filmIso: firstNonEmpty(override?.filmIso, preset?.filmIso),
    filmType: firstNonEmpty(override?.filmType, preset?.filmType),
    filmName: firstNonEmpty(override?.filmName, preset?.filmName, exif?.filmName)
  }
}
