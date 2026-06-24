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
 * 最小可编辑预览参数。只暴露对当前占位预览有意义的字段，
 * 其余 RenderRecipe 子结构（filmFormat、完整 TextItem 属性）
 * 在 buildPreviewRequest 中使用硬编码默认值。
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
  readonly textContent: string
  readonly textFontSize: number
  readonly textColor: string
  readonly textPlacement: string
  /** 文字放置区域：图片上或边框上。 */
  readonly textArea: TextArea
  readonly fontFamily: string
  readonly autoCrop: boolean
  /** 画幅格式标识，null 表示不使用画幅。 */
  readonly filmFormat: string | null
  /** 渐变设置。 */
  readonly gradient: GradientSettings
  /** 导出格式：png 或 jpeg。 */
  readonly exportFormat: "png" | "jpeg"
  /** JPEG 导出质量（1-100），仅 exportFormat 为 jpeg 时生效。 */
  readonly jpegQuality: number
}

export type NumberSettingKey = "borderTop" | "borderBottom" | "borderLeft" | "borderRight"
  | "textFontSize" | "jpegQuality"

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
}
