/**
 * 纯 CSS 缩略图组件。
 *
 * 用一个灰色/渐变矩形代表照片区域，
 * 通过 CSS custom properties 传入动态颜色和尺寸，
 * 布局样式全部在 styles.css 中定义。
 * 不使用图片文件，纯 HTML + CSS 渲染。
 */

import type { BuiltInTemplate } from "../presets/builtInTemplates"

type TemplateThumbnailProps = {
  readonly thumb: BuiltInTemplate["thumb"]
  readonly className?: string
}

/**
 * 将 0-1 的 bottomRatio 转换为像素 padding-bottom（相对于 40px 基准）。
 */
const computePadBottom = (bottomRatio: number): string => {
  return `${Math.round(4 + bottomRatio * 40)}px`
}

/**
 * 简单的颜色亮度调整（hex → hex）。
 */
const adjustBrightness = (hex: string, amount: number): string => {
  const num = parseInt(hex.replace("#", ""), 16)
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount))
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`
}

/** CSS custom properties 的类型安全映射。 */
type ThumbCssVars = React.CSSProperties & {
  "--preset-border-color": string
  "--preset-photo-color": string
  "--preset-photo-color-dark": string
  "--preset-text-color": string
  "--preset-pad-bottom": string
}

export const TemplateThumbnail = ({ thumb, className }: TemplateThumbnailProps): JSX.Element => {
  const { borderColor, photoColor, textColor, bottomRatio } = thumb

  const cssVars: ThumbCssVars = {
    "--preset-border-color": borderColor,
    "--preset-photo-color": photoColor,
    "--preset-photo-color-dark": adjustBrightness(photoColor, -20),
    "--preset-text-color": textColor,
    "--preset-pad-bottom": computePadBottom(bottomRatio),
  }

  return (
    <div
      className={`templatePresetThumbFrame ${className ?? ""}`}
      style={cssVars}
    >
      <div className="templatePresetThumbPhoto" />
      {bottomRatio > 0.08 && (
        <div className="templatePresetThumbTextLine" />
      )}
    </div>
  )
}
