/**
 * 快速流程「创建摄影预设」辅助：把自由文本录入转换成可保存的资产 + 预设。
 *
 * 胶片用户在快速模式直接录入相机/镜头/胶片文本，无需先进资产库：
 * - 已存在同名资产（品牌+型号一致）时复用其 id，不产生重复资产；
 * - 不存在则生成新资产（品牌取首个词，其余为型号）；
 * - 最后返回一个引用这些资产的摄影预设。
 *
 * 本函数是纯函数：只负责「文本 -> 资产/预设」的映射，不做任何持久化。
 */

import type { CameraAsset, FilmAsset, LensAsset, PhotoAssetStore, ShootingPreset } from "../../metadata/types"
import { createEmptyPreset } from "../../metadata/types"

/** 快速创建预设的表单草稿。 */
export type PresetDraft = {
  readonly name: string
  readonly category: string
  readonly captureFormat: string
  readonly camera: string
  readonly lens: string
  readonly film: string
  readonly location: string
}

/** 创建结果：待保存的新资产 + 引用它们的预设。 */
export type PresetBuildResult = {
  readonly preset: ShootingPreset
  readonly newCameras: readonly CameraAsset[]
  readonly newLenses: readonly LensAsset[]
  readonly newFilms: readonly FilmAsset[]
}

/** 把「品牌 型号」文本拆为品牌（首词）与型号（其余）。 */
const splitLabel = (label: string): { brand: string; model: string } => {
  const trimmed = label.trim()
  const spaceIndex = trimmed.indexOf(" ")
  if (spaceIndex <= 0) {
    return { brand: trimmed, model: "" }
  }
  return {
    brand: trimmed.slice(0, spaceIndex).trim(),
    model: trimmed.slice(spaceIndex + 1).trim()
  }
}

/** 按品牌+型号查找已有相机资产；返回 null 表示不存在。 */
const findCamera = (store: PhotoAssetStore, brand: string, model: string): CameraAsset | null => {
  return store.cameras.find((c) => c.brand === brand && c.model === model) ?? null
}

const findLens = (store: PhotoAssetStore, brand: string, model: string): LensAsset | null => {
  return store.lenses.find((l) => l.brand === brand && l.model === model) ?? null
}

const findFilm = (store: PhotoAssetStore, brand: string, name: string): FilmAsset | null => {
  return store.films.find((f) => f.brand === brand && f.name === name) ?? null
}

/**
 * 构建预设：资产复用已有项，缺失项生成新资产。
 * captureFormat 为空或非法时返回 null（调用方提示用户）。
 */
export const buildPresetFromText = (
  draft: PresetDraft,
  assetStore: PhotoAssetStore
): PresetBuildResult | null => {
  if (draft.captureFormat.trim().length === 0) {
    return null
  }

  const newCameras: CameraAsset[] = []
  const newLenses: LensAsset[] = []
  const newFilms: FilmAsset[] = []

  let cameraAssetId: string | null = null
  if (draft.camera.trim().length > 0) {
    const { brand, model } = splitLabel(draft.camera)
    const existing = findCamera(assetStore, brand, model)
    if (existing !== null) {
      cameraAssetId = existing.id
    } else {
      const created: CameraAsset = {
        id: crypto.randomUUID(),
        brand,
        model,
        alias: draft.camera.trim(),
        notes: "由快速流程创建"
      }
      newCameras.push(created)
      cameraAssetId = created.id
    }
  }

  let lensAssetId: string | null = null
  if (draft.lens.trim().length > 0) {
    const { brand, model } = splitLabel(draft.lens)
    const existing = findLens(assetStore, brand, model)
    if (existing !== null) {
      lensAssetId = existing.id
    } else {
      const created: LensAsset = {
        id: crypto.randomUUID(),
        brand,
        model,
        focalLength: "",
        maxAperture: "",
        mount: "",
        notes: "由快速流程创建"
      }
      newLenses.push(created)
      lensAssetId = created.id
    }
  }

  let filmAssetId: string | null = null
  if (draft.film.trim().length > 0) {
    const { brand, model } = splitLabel(draft.film)
    const existing = findFilm(assetStore, brand, model)
    if (existing !== null) {
      filmAssetId = existing.id
    } else {
      const created: FilmAsset = {
        id: crypto.randomUUID(),
        brand,
        name: model,
        iso: "",
        type: "",
        colorProfile: "",
        discontinued: false,
        notes: "由快速流程创建"
      }
      newFilms.push(created)
      filmAssetId = created.id
    }
  }

  const preset: ShootingPreset = {
    ...createEmptyPreset(),
    id: crypto.randomUUID(),
    name: draft.name.trim().length > 0 ? draft.name.trim() : "未命名预设",
    category: draft.category.trim(),
    captureFormat: draft.captureFormat,
    cameraAssetId,
    lensAssetId,
    filmAssetId,
    defaultLocation: draft.location.trim().length > 0 ? draft.location.trim() : null,
    notes: "由快速流程创建"
  }

  return { preset, newCameras, newLenses, newFilms }
}
