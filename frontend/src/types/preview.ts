/**
 * Java 引擎渲染/预览 API 的契约镜像。
 *
 * 这些类型与后端模型逐字对应 —— `RenderRecipe` 是共享的核心
 * （ARCHITECTURE.md §4.1），`PreviewRequest` 仅在其基础上补充预览
 * 尺寸信息。它们是长期契约，而非临时 DTO，因此字段命名遵循后端
 * 约定（`imagePath`、`previewUrl`）。
 */

export type BorderConfig = {
  readonly top: number
  readonly bottom: number
  readonly left: number
  readonly right: number
  readonly color: string
}

/** 渐变停靠点。 */
export type GradientStop = {
  readonly offset: number
  readonly color: string
}

/** 渐变配置，对应后端 GradientConfig。 */
export type GradientConfig = {
  readonly enabled: boolean
  readonly type: "linear" | "radial"
  readonly angle: number
  readonly stops: readonly GradientStop[]
}

export type TextItem = {
  readonly content: string
  readonly fontFamily: string
  readonly fontSize: number
  readonly color: string
  readonly placement: string
  readonly marginX: number
  readonly marginY: number
}

export type RenderRecipe = {
  readonly imagePath: string
  readonly border: BorderConfig | null
  readonly gradient: GradientConfig | null
  readonly texts: readonly TextItem[]
  readonly filmFormat: string | null
  readonly autoCrop: boolean
}

export type PreviewRequest = {
  readonly recipe: RenderRecipe
  readonly maxWidth: number
  readonly maxHeight: number
}

export type PreviewResponse = {
  readonly status: string
  readonly message: string
  readonly previewAvailable: boolean
  readonly previewUrl: string
}

/**
 * 导出设置，与 RenderRecipe 配合使用。
 * 对应 Java 引擎的 ExportSettings 模型（ARCHITECTURE.md §4.3）。
 */
export type ExportSettings = {
  readonly format: "png" | "jpeg"
  readonly outputPath: string
  readonly jpegQuality: number
}

/**
 * 导出任务请求体，提交至 POST /api/render-jobs。
 * recipe 与预览共享同一份核心渲染配置（ARCHITECTURE.md §4.1）。
 */
export type RenderJobRequest = {
  readonly recipe: RenderRecipe
  readonly export: ExportSettings
}

/**
 * 导出任务创建响应，POST /api/render-jobs 返回。
 */
export type RenderJobCreatedResponse = {
  readonly jobId: string
}

/**
 * 导出任务状态响应，GET /api/render-jobs/{jobId} 返回。
 */
export type RenderJobStatusResponse = {
  readonly jobId: string
  readonly status: "pending" | "running" | "completed" | "failed"
  readonly outputPath?: string
  readonly error?: string
}

/**
 * 画幅格式信息，GET /api/film-formats 返回。
 */
export type FilmFormatInfo = {
  readonly id: string
  readonly label: string
  readonly recommendedBorder: BorderConfig
}

/**
 * 照片元数据，POST /api/photo-metadata 返回。
 */
export type PhotoMetadata = {
  readonly cameraModel?: string
  readonly lensModel?: string
  readonly aperture?: string
  readonly shutterSpeed?: string
  readonly iso?: string
  readonly focalLength?: string
  readonly filmName?: string
}
