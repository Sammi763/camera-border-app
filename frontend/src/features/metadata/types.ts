/**
 * 摄影资产库、摄影预设与摄影身份的类型定义。
 *
 * PhotoIdentity 表示一张照片的完整摄影身份信息（相机、镜头、胶片、画幅等）。
 * ShootingPreset 是可分类的拍摄身份组合（P0-05），替代产品层的 Roll 成为主流程。
 * 资产库存储结构带 version 字段，方便后续迁移。
 *
 * 字段来源优先级固定为：每图覆盖 > 摄影预设 > EXIF > 空（docs/tasks.md §0.2）。
 */

// ---- 资产库条目类型 -----------------------------------------------------------

/** 相机资产。 */
export type CameraAsset = {
  readonly id: string
  readonly brand: string
  readonly model: string
  readonly alias: string
  readonly notes: string
}

/** 镜头资产。 */
export type LensAsset = {
  readonly id: string
  readonly brand: string
  readonly model: string
  readonly focalLength: string
  readonly maxAperture: string
  readonly mount: string
  readonly notes: string
}

/** 胶片资产。 */
export type FilmAsset = {
  readonly id: string
  readonly brand: string
  readonly name: string
  readonly iso: string
  readonly type: string
  readonly colorProfile: string
  readonly discontinued: boolean
  readonly notes: string
}

/** 扫描仪资产。 */
export type ScannerAsset = {
  readonly id: string
  readonly brand: string
  readonly model: string
  readonly software: string
  readonly notes: string
}

/** 实验室资产。 */
export type LabAsset = {
  readonly id: string
  readonly name: string
  readonly city: string
  readonly contact: string
  readonly notes: string
}

/** 冲洗工艺资产。 */
export type DeveloperAsset = {
  readonly id: string
  readonly name: string
  readonly type: string
  readonly notes: string
}

/** 资产库完整存储结构（带版本号，方便后续迁移）。 */
export type PhotoAssetStore = {
  readonly version: number
  readonly cameras: readonly CameraAsset[]
  readonly lenses: readonly LensAsset[]
  readonly films: readonly FilmAsset[]
  readonly scanners: readonly ScannerAsset[]
  readonly labs: readonly LabAsset[]
  readonly developers: readonly DeveloperAsset[]
}

/** 创建空的资产库。 */
export const createEmptyAssetStore = (): PhotoAssetStore => ({
  version: 1,
  cameras: [],
  lenses: [],
  films: [],
  scanners: [],
  labs: [],
  developers: []
})

/** 创建空的相机资产。 */
export const createEmptyCamera = (): CameraAsset => ({
  id: "",
  brand: "",
  model: "",
  alias: "",
  notes: ""
})

/** 创建空的镜头资产。 */
export const createEmptyLens = (): LensAsset => ({
  id: "",
  brand: "",
  model: "",
  focalLength: "",
  maxAperture: "",
  mount: "",
  notes: ""
})

/** 创建空的胶片资产。 */
export const createEmptyFilm = (): FilmAsset => ({
  id: "",
  brand: "",
  name: "",
  iso: "",
  type: "",
  colorProfile: "",
  discontinued: false,
  notes: ""
})

/** 创建空的扫描仪资产。 */
export const createEmptyScanner = (): ScannerAsset => ({
  id: "",
  brand: "",
  model: "",
  software: "",
  notes: ""
})

/** 创建空的实验室资产。 */
export const createEmptyLab = (): LabAsset => ({
  id: "",
  name: "",
  city: "",
  contact: "",
  notes: ""
})

/** 创建空的冲洗工艺资产。 */
export const createEmptyDeveloper = (): DeveloperAsset => ({
  id: "",
  name: "",
  type: "",
  notes: ""
})

// ---- 摄影身份与摄影预设 ---------------------------------------------------------

/** 摄影身份信息：相机、镜头、胶片、冲洗、扫描仪、实验室、地点、卷名、帧号、拍摄画幅。 */
export type PhotoIdentity = {
  readonly camera: string
  readonly lens: string
  readonly film: string
  readonly developer: string
  readonly scanner: string
  readonly lab: string
  readonly location: string
  readonly rollName: string
  readonly frameNumber: string
  /** 拍摄画幅 ID（见 constants/captureFormats.ts）。空字符串表示未设置。 */
  readonly captureFormat: string
}

/** 创建空的摄影身份。 */
export const createEmptyIdentity = (): PhotoIdentity => ({
  camera: "",
  lens: "",
  film: "",
  developer: "",
  scanner: "",
  lab: "",
  location: "",
  rollName: "",
  frameNumber: "",
  captureFormat: ""
})

/**
 * 可分类摄影预设（P0-05）：一组可复用的拍摄身份组合。
 *
 * 与视觉模板相互独立：预设只保存拍摄身份，不保存边框/文字/导出设置；
 * 删除预设不会删除图片、资产或模板。
 */
export type ShootingPreset = {
  readonly id: string
  /** 预设名称（必填）。 */
  readonly name: string
  /** 分类（必填，允许重复使用已有分类做筛选）。 */
  readonly category: string
  /** 拍摄画幅 ID（必填，见 constants/captureFormats.ts）。 */
  readonly captureFormat: string
  /** 相机资产引用；null 表示不引用。 */
  readonly cameraAssetId: string | null
  /** 镜头资产引用；null 表示不引用。 */
  readonly lensAssetId: string | null
  /** 胶片资产引用；null 表示不引用。 */
  readonly filmAssetId: string | null
  /** 默认拍摄地点（可选）。 */
  readonly defaultLocation: string | null
  /** 备注（可选）。 */
  readonly notes: string | null
}

/** 创建空的摄影预设（id 由调用方赋值，如 crypto.randomUUID()）。 */
export const createEmptyPreset = (): ShootingPreset => ({
  id: "",
  name: "",
  category: "",
  captureFormat: "",
  cameraAssetId: null,
  lensAssetId: null,
  filmAssetId: null,
  defaultLocation: null,
  notes: null
})

/** 内置胶片库条目（来自后端 GET /api/assets/film-stocks）。 */
export type FilmStock = {
  readonly id: string
  readonly brand: string
  readonly name: string
  readonly iso: number
  readonly type: string
  readonly colorProfile: string
  readonly discontinued: boolean
}

// ---- 控制器类型 ----------------------------------------------------------------

/** 资产库控制器（供 UI 使用）。 */
export type PhotoAssetController = {
  readonly store: PhotoAssetStore
  readonly lastError: string | null
  readonly saveCamera: (asset: CameraAsset) => void
  readonly deleteCamera: (id: string) => void
  readonly saveLens: (asset: LensAsset) => void
  readonly deleteLens: (id: string) => void
  readonly saveFilm: (asset: FilmAsset) => void
  readonly deleteFilm: (id: string) => void
  readonly saveScanner: (asset: ScannerAsset) => void
  readonly deleteScanner: (id: string) => void
  readonly saveLab: (asset: LabAsset) => void
  readonly deleteLab: (id: string) => void
  readonly saveDeveloper: (asset: DeveloperAsset) => void
  readonly deleteDeveloper: (id: string) => void
  readonly clearError: () => void
}

/** 摄影预设控制器（P0-05，供 ShootingPresetPanel 使用）。 */
export type ShootingPresetController = {
  readonly presets: readonly ShootingPreset[]
  readonly lastError: string | null
  readonly savePreset: (preset: ShootingPreset) => void
  /** 复制预设：生成新 id，名称追加「（副本）」。 */
  readonly duplicatePreset: (id: string) => ShootingPreset | null
  readonly deletePreset: (id: string) => void
  readonly clearError: () => void
}
