/**
 * 摄影资产库与 Roll 胶卷工作流的类型定义。
 *
 * PhotoIdentity 表示一张照片的完整摄影身份信息（相机、镜头、胶片等）。
 * Roll 表示一卷胶卷的绑定信息，同卷照片可批量继承。
 * 资产库存储结构带 version 字段，方便后续迁移。
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

// ---- 摄影身份与 Roll -----------------------------------------------------------

/** 摄影身份信息：相机、镜头、胶片、冲洗、扫描仪、实验室、地点、卷名、帧号。 */
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
  frameNumber: ""
})

/** Roll 胶卷数据结构。 */
export type Roll = {
  readonly id: string
  readonly name: string
  readonly camera: string
  readonly lens: string
  readonly film: string
  readonly developer: string
  readonly scanner: string
  readonly lab: string
  readonly location: string
  readonly notes: string
}

/** 创建空的 Roll。 */
export const createEmptyRoll = (): Roll => ({
  id: "",
  name: "",
  camera: "",
  lens: "",
  film: "",
  developer: "",
  scanner: "",
  lab: "",
  location: "",
  notes: ""
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

/** Roll 控制器。 */
export type RollController = {
  readonly rolls: readonly Roll[]
  readonly lastError: string | null
  readonly saveRoll: (roll: Roll) => void
  readonly deleteRoll: (id: string) => void
  readonly clearError: () => void
}
