/**
 * 底片数字化处理契约（T02 冻结）。
 *
 * 权威定义见 docs/adr/0007-explicit-film-digitization-mode.md；Java 侧对应
 * com.camborder.app.model.ImageProcessingConfig 与 ImageProcessingValidator。
 * 前端不得自行发明与后端冲突的字段名或枚举值。
 */

export type ImageProcessingInputMode = "sensor-raw" | "linear-tiff"
export type ImageProcessingInputSource =
  | "camera-raw"
  | "encoded-raster"
  | "linear-tiff"
  | "flextight-fff"
export type FilmPolarity = "positive" | "color-negative"
export type ImageAnalysisStage = "raw-linear" | "base-positive" | "current-positive"
export type ImageAnalysisPurpose = "histogram" | "neutral-balance"
export type FilmOutput = "srgb-jpeg" | "tiff16-srgb" | "tiff16-rec2020"

/** v2 已编码栅格输入解释；缺 ICC 时必须显式选色空间。 */
export type EncodedInput = {
  readonly colorSpace: "embedded" | "srgb" | "adobe-rgb" | "prophoto-rgb" | "linear-srgb" | "linear-rec2020"
  readonly bitDepth: 8 | 16
  readonly iccSha256?: string | null
  readonly alphaBackground?: "white" | "black"
}

/** v2 Flextight FFF 扫描输入模型；输出 Adobe RGB / 历史 gamma 不自动成为输入定义。 */
export type FlextightInput = {
  readonly device?: "flextight"
  readonly mainImage?: "rgb16"
  readonly colorSpace: "linear-srgb" | "linear-rec2020"
  readonly transferFunction?: "linear"
  readonly bitDepth?: 16
  readonly iccSha256?: string | null
}

export type RawOptions = {
  readonly whiteBalance?: "camera" | "daylight"
  readonly autoBright?: false
  readonly gamma?: "linear"
  readonly highlight?: "clip" | "unclip"
  readonly crop?: "vendor-inset" | "full-sensor"
}

export type LinearInput = {
  readonly transferFunction?: "linear"
  readonly colorSpace: "linear-srgb" | "linear-rec2020" | "linear-camera-rgb"
  readonly bitDepth?: 16
  readonly iccSha256?: string | null
}

export type LightSourceConfig = {
  readonly kind: "camera-white-balance" | "calibration"
  readonly calibrationId?: string | null
  readonly calibrationVersion?: number | null
  readonly rgbGain?: readonly [number, number, number] | null
  readonly referenceImagePath?: string | null
  readonly referenceFingerprint?: string | null
}

export type FilmBaseConfig = {
  readonly kind: "roi" | "reference-frame" | "manual"
  readonly roi?: NormalizedCrop | null
  readonly referenceImagePath?: string | null
  readonly referenceFingerprint?: string | null
  readonly rgb?: readonly [number, number, number] | null
  readonly stage?: "linear-camera-rgb" | "linear-working"
  readonly calibrationId?: string | null
  readonly calibrationVersion?: number | null
}

export type DensityConfig = {
  readonly min?: number
  readonly max?: number
}

export type NegativeConfig = {
  readonly calibrationSpaceKey?: string | null
  readonly enabled?: boolean
  readonly lightSource?: LightSourceConfig | null
  readonly filmBase?: FilmBaseConfig | null
  readonly density?: DensityConfig | null
  readonly profile?: "generic-color-negative-v1"
}

export type CurvePoint = {
  readonly x: number
  readonly y: number
}

export type MonotonicCurve = {
  readonly interpolation?: "linear"
  readonly points: readonly CurvePoint[]
}

export type PositiveAdjustments = {
  readonly exposureEv?: number
  readonly rgbBalanceEv?: readonly [number, number, number]
  readonly blackPoint?: number
  readonly whitePoint?: number
  readonly saturation?: number
  readonly masterCurve?: MonotonicCurve | null
  readonly redCurve?: MonotonicCurve | null
  readonly greenCurve?: MonotonicCurve | null
  readonly blueCurve?: MonotonicCurve | null
}

export type NormalizedCrop = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type SourceGeometry = {
  readonly crop?: NormalizedCrop
  readonly rotationDegrees?: number
}

export type ImageProcessingConfig = {
  readonly schemaVersion: number
  readonly algorithmVersion: string
  /** v1 字段；v2 请求必须省略。 */
  readonly inputMode?: ImageProcessingInputMode | null
  /** v2 输入来源；与 filmPolarity 分开表达。 */
  readonly inputSource?: ImageProcessingInputSource | null
  /** v2 胶片性质：正片跳过反相，color-negative 才进入片基/密度转正。 */
  readonly filmPolarity?: FilmPolarity | null
  readonly raw?: RawOptions | null
  readonly linearInput?: LinearInput | null
  readonly encodedInput?: EncodedInput | null
  readonly flextightInput?: FlextightInput | null
  readonly negative?: NegativeConfig | null
  readonly positive?: PositiveAdjustments | null
  readonly sourceGeometry?: SourceGeometry | null
}

/** 图像分析请求（T07 实现）；stage 统计阶段不含边框、文字、Logo。 */
export type ImageAnalysisRequest = {
  readonly outputSpace?: "srgb" | "linear-rec2020"
  readonly clientId?: string
  readonly generation?: number
  readonly recipe: import("./preview").RenderRecipe
  readonly stage?: ImageAnalysisStage
  readonly purpose?: ImageAnalysisPurpose
  /** 已应用 EXIF 方向、未应用编辑几何的完整源图归一化 ROI；缺省为全图。 */
  readonly roi?: NormalizedCrop | null
}

export type ImageAnalysisHistogram = {
  readonly red: readonly number[]
  readonly green: readonly number[]
  readonly blue: readonly number[]
  readonly luma: readonly number[]
  readonly underflow: number
  readonly overflow: number
}

export type ImageAnalysisRegionStats = {
  readonly pixelCount: number
  readonly mean: readonly [number, number, number]
  readonly min: readonly [number, number, number]
  readonly max: readonly [number, number, number]
  readonly clippedLow: readonly [number, number, number]
  readonly clippedHigh: readonly [number, number, number]
}

export type ImageAnalysisClippingStage = {
  readonly available: boolean
  readonly clippedLow: readonly number[]
  readonly clippedHigh: readonly number[]
  readonly note?: string | null
}

export type ImageAnalysisClipping = {
  readonly stages: Readonly<Record<string, ImageAnalysisClippingStage>>
}

export type NeutralBalanceSuggestion = {
  readonly available: boolean
  readonly stage: string
  readonly sampleCount: number
  readonly rejectedTooDark: number
  readonly rejectedClipped: number
  readonly rejectedNonFinite: number
  readonly sampleMean?: readonly [number, number, number] | null
  readonly suggestedRgbGain?: readonly [number, number, number] | null
  readonly suggestedRgbBalanceEv?: readonly [number, number, number] | null
  readonly confidence: "high" | "medium" | "low" | string
  readonly binding: string | null
  readonly note?: string | null
  readonly roi?: NormalizedCrop | null
}

export type ImageAnalysisResponse = {
  readonly resolvedFilmBase?: readonly [number, number, number] | null
  readonly resolvedLightGain?: readonly [number, number, number] | null
  readonly calibrationSpaceKey?: string | null
  readonly status: "ok" | "error" | string
  readonly purpose?: ImageAnalysisPurpose | string
  readonly neutralBalance?: NeutralBalanceSuggestion | null
  readonly message?: string | null
  readonly recipeSignature: string
  readonly sourceVersion: string
  readonly stage: ImageAnalysisStage | string
  readonly analyzedWidth: number
  readonly analyzedHeight: number
  readonly sampling: string
  readonly bucketCount: number
  readonly roi?: NormalizedCrop | null
  readonly histogram: ImageAnalysisHistogram
  readonly stats: ImageAnalysisRegionStats
  readonly clipping: ImageAnalysisClipping
}
