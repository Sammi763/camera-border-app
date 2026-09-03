/**
 * 设置模块的 UI 状态类型。
 */

/**
 * 文字放置区域：
 * - image: 文字绘制在图片区域内
 * - border: 文字绘制在边框区域内
 */
export type TextArea = "image" | "border"

/** 渐变设置。 */
export type GradientSettings = {
  readonly enabled: boolean
  readonly type: "linear" | "radial"
  readonly angle: number
  readonly stops: readonly { readonly offset: number; readonly color: string }[]
}

/**
 * 边框风格配置（可选）：在纯色/渐变边框上叠加确定性装饰。
 *
 * 与引擎 BorderStyle / canvasRenderer.drawBorderStyle 使用同一套风格 ID、
 * 参数语义与几何规则（几何规格见 java-engine util/BorderStyleRenderer 类注释）。
 * - id：未识别的风格在渲染时被静默忽略（回退原始行为）
 * - intensity：0-100，0 表示不绘制
 * - edgeWidth：装饰特征尺寸（px）
 * - holeCount：齿孔/刻痕数量（仅齿孔、负片边使用）
 * - paperTone：装饰色（hex）；为空时按各风格默认色；非法颜色由引擎返回 4xx
 */
export type BorderStyleSettings = {
  readonly id: string
  readonly intensity: number
  readonly edgeWidth: number
  readonly holeCount: number
  readonly paperTone: string
}

/**
 * 输出尺寸预设：
 * - original：原图尺寸（不缩放）
 * - 1080p / 2k / 4k：按长边等比缩小到对应像素
 * - custom：用户自定义长边像素
 */
export type OutputSizePreset = "original" | "1080p" | "2k" | "4k" | "custom"

import type { ImagePlacement } from "../../types/preview"

/**
 * 品牌标识（Logo）配置。
 *
 * MVP 首版支持两种模式：
 * - auto-brand：根据当前图片的相机信息自动识别品牌，绘制品牌文字
 * - brand-text：用户手动输入品牌文字
 */
export type LogoConfig = {
  /** 是否启用品牌标识。 */
  readonly enabled: boolean
  /** 显示模式：自动识别 / 品牌文字。 */
  readonly mode: "auto-brand" | "brand-text"
  /** 手动指定的品牌文字（mode 为 brand-text 时使用）。 */
  readonly brand: string | null
  /** 位置：border-top-left / border-top-center / border-top-right / border-bottom-left / border-bottom-center / border-bottom-right。 */
  readonly placement: string
  /** 字号。 */
  readonly size: number
  /** 颜色模式：自动对比 / 浅色 / 深色。 */
  readonly colorMode: "auto-contrast" | "light" | "dark"
  /** 自定义 PNG/签名的本地路径。 */
  readonly imagePath?: string | null
  /** PNG/签名不透明度（0-1）。 */
  readonly opacity?: number
  /** 自动对比度开关。 */
  readonly autoContrast?: boolean
}

/**
 * 单个文字图层设置。
 * 每个图层可独立配置内容、字体、字号、颜色、位置、背景条、阴影、描边。
 */
export type TextLayerSettings = {
  /** 图层标识。 */
  readonly id: string
  /** 是否启用该图层。 */
  readonly enabled: boolean
  /** 文字内容，支持 {Camera} 等变量。 */
  readonly content: string
  /** 字体族名称。 */
  readonly fontFamily: string
  /** 字号。 */
  readonly fontSize: number
  /** 文字颜色。 */
  readonly color: string
  /** 位置：top-center / center / bottom-center。 */
  readonly placement: string
  /** 放置区域：图片上或边框上。 */
  readonly textArea: TextArea
  /** 水平边距；按当前图片/边框区域的左右边缘定位时生效。 */
  readonly marginX: number
  /** 垂直偏移。 */
  readonly marginY: number
  /** 行间距（px）。 */
  readonly lineSpacing?: number
  /** 字距（px）。 */
  readonly letterSpacing?: number
  /** 背景条：是否启用。 */
  readonly backgroundEnabled: boolean
  /** 背景条：颜色。 */
  readonly backgroundColor: string
  /** 背景条：水平内边距。 */
  readonly backgroundPaddingX: number
  /** 背景条：垂直内边距。 */
  readonly backgroundPaddingY: number
  /** 阴影：是否启用。 */
  readonly shadowEnabled: boolean
  /** 阴影：颜色。 */
  readonly shadowColor: string
  /** 阴影：模糊半径。 */
  readonly shadowBlur: number
  /** 阴影：水平偏移。 */
  readonly shadowOffsetX: number
  /** 阴影：垂直偏移。 */
  readonly shadowOffsetY: number
  /** 描边：是否启用。 */
  readonly strokeEnabled: boolean
  /** 描边：颜色。 */
  readonly strokeColor: string
  /** 描边：宽度。 */
  readonly strokeWidth: number
}

/**
 * 最小可编辑预览参数。
 *
 * 保留旧单段文字字段（textContent/textFontSize/textColor/textPlacement/textArea/fontFamily）用于向后兼容：
 * - 旧模板 / 旧 localStorage 设置加载时不会因缺少 textLayers 而崩溃
 * - 当 textLayers 非空时，预览/导出以 textLayers 为准
 * - 当 textLayers 为空数组时，回退到旧单段文字逻辑
 */
export type RenderSettings = {
  readonly borderColor: string
  /** 上边框宽度（px）。 */
  readonly borderTop: number
  /** 下边框宽度（px）。 */
  readonly borderBottom: number
  /** 左边框宽度（px）。 */
  readonly borderLeft: number
  /** 右边框宽度（px）。 */
  readonly borderRight: number
  // ---- 旧单段文字字段（向后兼容） ----
  readonly textContent: string
  readonly textFontSize: number
  readonly textColor: string
  readonly textPlacement: string
  /** 文字放置区域：图片上或边框上。 */
  readonly textArea: TextArea
  readonly fontFamily: string
  // ---- 多段文字图层 ----
  /** 文字图层列表。空数组时回退到旧单段文字逻辑。 */
  readonly textLayers: readonly TextLayerSettings[]
  /** 图片布局几何；画幅选择只负责填充其中的 targetAspectRatio。 */
  readonly imagePlacement?: ImagePlacement
  /** 布局预设标识，展示层使用，不会写入 RenderRecipe。 */
  readonly layoutPresetId?: string | null
  /** 渐变设置。 */
  readonly gradient: GradientSettings
  /** 边框风格；null 表示不启用风格装饰（旧模板保持原行为）。 */
  readonly borderStyle: BorderStyleSettings | null
  /** 导出格式：png / jpeg / tiff。 */
  readonly exportFormat: "png" | "jpeg" | "tiff"
  /** JPEG 导出质量（1-100），仅 exportFormat 为 jpeg 时生效。 */
  readonly jpegQuality: number
  /** 输出尺寸预设。 */
  readonly outputSizePreset: OutputSizePreset
  /** 自定义输出长边（像素），仅 outputSizePreset 为 custom 时生效。 */
  readonly customOutputLongEdge: number
  /** 专业导出：是否保留 EXIF 元数据。 */
  readonly preserveMetadata: boolean
  /** 专业导出：是否保留 ICC 色彩配置文件。 */
  readonly preserveColorProfile: boolean
  /** 专业导出：是否优先保留高位深（>8bit）。TIFF 支持，其他格式降级。 */
  readonly preferHighBitDepth: boolean
  /** 品牌标识配置。 */
  readonly logo: LogoConfig
}

/**
 * 仅供旧 localStorage/模板迁移使用的布局字段。
 *
 * 这些字段不是当前设置或 RenderRecipe 的一部分；它们单独建类型，
 * 防止新的设置状态继续写出已经失效的 autoCrop/filmFormat。
 */
export type LegacyLayoutSettings = {
  readonly autoCrop?: boolean
  readonly filmFormat?: string | null
}

/** 迁移入口允许的旧/新设置输入。迁移完成后必须返回 RenderSettings。 */
export type RenderSettingsInput = Partial<RenderSettings> & LegacyLayoutSettings

export type NumberSettingKey = "borderTop" | "borderBottom" | "borderLeft" | "borderRight"
  | "textFontSize" | "jpegQuality" | "customOutputLongEdge"

export type SettingsController = {
  readonly settings: RenderSettings
  /**
   * 设置版本号，每次防抖结束后自动递增。
   * usePreview 通过监听此值变化来触发预览请求。
   */
  readonly settingsVersion: number
  readonly update: (patch: Partial<RenderSettings>) => void
  /** NaN 安全的数字输入更新，自动钳制到 [min, max] 范围。 */
  readonly updateNumber: (key: NumberSettingKey, value: number, min: number, max: number) => void
  /** 更新指定文字图层。 */
  readonly updateTextLayer: (layerId: string, patch: Partial<TextLayerSettings>) => void
  /** 恢复默认 3 段文字图层。 */
  readonly resetTextLayers: () => void
  /** 替换全部文字图层。 */
  readonly replaceTextLayers: (layers: readonly TextLayerSettings[]) => void
  /** 渲染设置历史（不含每图覆盖；每图覆盖由 QueueController 管理）。 */
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly undo: () => void
  readonly redo: () => void
}
