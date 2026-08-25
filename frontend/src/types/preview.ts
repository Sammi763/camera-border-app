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
  /** 背景条：是否启用。 */
  readonly backgroundEnabled?: boolean
  /** 背景条：颜色。 */
  readonly backgroundColor?: string
  /** 背景条：水平内边距。 */
  readonly backgroundPaddingX?: number
  /** 背景条：垂直内边距。 */
  readonly backgroundPaddingY?: number
  /** 阴影：是否启用。 */
  readonly shadowEnabled?: boolean
  /** 阴影：颜色。 */
  readonly shadowColor?: string
  /** 阴影：模糊半径。 */
  readonly shadowBlur?: number
  /** 阴影：水平偏移。 */
  readonly shadowOffsetX?: number
  /** 阴影：垂直偏移。 */
  readonly shadowOffsetY?: number
  /** 描边：是否启用。 */
  readonly strokeEnabled?: boolean
  /** 描边：颜色。 */
  readonly strokeColor?: string
  /** 描边：宽度。 */
  readonly strokeWidth?: number
}

/** 品牌标识配置，对应后端 LogoConfig。 */
export type LogoConfig = {
  readonly enabled: boolean
  readonly mode: "auto-brand" | "brand-text"
  readonly brand: string | null
  readonly placement: string
  readonly size: number
  readonly colorMode: "auto-contrast" | "light" | "dark"
}

/**
 * 边框风格配置（可选）。
 * 与引擎 BorderStyle / canvasRenderer.drawBorderStyle 同一套风格 ID 与参数语义。
 */
export type BorderStyleConfig = {
  readonly id: string
  readonly intensity: number
  readonly edgeWidth: number
  readonly holeCount: number
  readonly paperTone: string
}

/**
 * 图片解码来源状态（引擎预览/导出响应返回）。
 * - standard：标准格式由 ImageIO 直接读取；
 * - raw-developed：RAW 经 LibRaw 完成真实显影；
 * - embedded-preview-fallback：RAW 降级为嵌入预览，warning 说明原因。
 */
export type SourceDecode = {
  readonly mode: "standard" | "raw-developed" | "embedded-preview-fallback"
  readonly format: string
  readonly warning: string | null
}

export type RenderRecipe = {
  readonly imagePath: string
  readonly border: BorderConfig | null
  readonly gradient: GradientConfig | null
  readonly texts: readonly TextItem[]
  readonly filmFormat: string | null
  readonly autoCrop: boolean
  /** 品牌标识配置，null 表示不绘制品牌标识。 */
  readonly logo?: LogoConfig | null
  /** 边框风格；缺省/null/未识别 id 时引擎保持原始渲染行为。 */
  readonly borderStyle?: BorderStyleConfig | null
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
  /** 解码来源状态；引擎未返回（旧版本）时为空。 */
  readonly sourceDecode?: SourceDecode | null
}

/**
 * 导出设置，与 RenderRecipe 配合使用。
 * 对应 Java 引擎的 ExportSettings 模型（ARCHITECTURE.md §4.3）。
 */
export type ExportSettings = {
  readonly format: "png" | "jpeg" | "tiff"
  readonly outputPath: string
  readonly jpegQuality: number
  /** 导出目标尺寸上限（像素）：等比缩小的边界，0 表示不限制（原图尺寸）。 */
  readonly maxWidth?: number
  readonly maxHeight?: number
  /** 专业导出：是否保留 EXIF 元数据。 */
  readonly preserveMetadata?: boolean
  /** 专业导出：是否保留 ICC 色彩配置文件。 */
  readonly preserveColorProfile?: boolean
  /** 专业导出：是否优先保留高位深（>8bit）。 */
  readonly preferHighBitDepth?: boolean
}

/**
 * 导出任务请求体，提交至 POST /api/render-jobs。
 * recipe 与预览共享同一份核心渲染配置（ARCHITECTURE.md §4.1）。
 */
export type RenderJobRequest = {
  readonly recipe: RenderRecipe
  readonly export: ExportSettings
}

/** 专业能力应用状态（镜像 Java ImageEncoder.FeatureStatus）。 */
export type FeatureStatus = "NOT_REQUESTED" | "APPLIED" | "SKIPPED" | "DOWNGRADED"

/** 单项专业能力的应用结果。 */
export type FeatureResult = {
  readonly status: FeatureStatus
  readonly message: string | null
}

/**
 * 导出任务状态响应，POST /api/render-jobs（同步完成）与 GET /api/render-jobs/{jobId} 返回。
 * 包含结构化的专业能力应用结果，前端据此展示真实导出摘要。
 */
export type RenderJobStatusResponse = {
  readonly jobId: string
  readonly status: "pending" | "running" | "completed" | "failed"
  readonly message?: string
  readonly outputPath?: string
  readonly error?: string
  /** 导出摘要：实际使用的格式。 */
  readonly actualFormat?: string
  /** EXIF 元数据保留的真实应用结果。 */
  readonly metadataPreservation?: FeatureResult
  /** ICC 色彩配置文件保留的真实应用结果。 */
  readonly colorProfilePreservation?: FeatureResult
  /** 高位深输出的真实应用结果。 */
  readonly highBitDepth?: FeatureResult
  /** 解码来源状态；引擎未返回（旧版本）时为空。 */
  readonly sourceDecode?: SourceDecode | null
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
