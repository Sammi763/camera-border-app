/**
 * 颜色亮度判断工具。
 *
 * 根据边框色亮度自动选择品牌标识的深浅颜色，
 * 确保品牌标识在深色/浅色边框上都清晰可见。
 */

/**
 * 解析 hex 颜色为 RGB 分量。
 * 支持 #RGB 和 #RRGGBB 格式。
 */
const parseHexColor = (hex: string): { r: number; g: number; b: number } => {
  let s = hex.trim()
  if (s.startsWith("#")) {
    s = s.substring(1)
  }
  if (s.length === 3) {
    s = s[0]! + s[0]! + s[1]! + s[1]! + s[2]! + s[2]!
  }
  const num = parseInt(s, 16)
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  }
}

/**
 * 计算相对亮度（ITU-R BT.709 公式简化版）。
 * 返回 0-1 之间的值，0=最暗，1=最亮。
 */
export const relativeLuminance = (hex: string): number => {
  const { r, g, b } = parseHexColor(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

/**
 * 判断颜色是否偏深。
 * 亮度 < 0.5 视为深色。
 */
export const isDarkColor = (hex: string): boolean => {
  return relativeLuminance(hex) < 0.5
}

/**
 * 根据边框色自动选择对比色。
 * - 深色边框 → 浅色标识（#f0f0f0）
 * - 浅色边框 → 深色标识（#222222）
 */
export const autoContrastColor = (borderColor: string): string => {
  return isDarkColor(borderColor) ? "#f0f0f0" : "#222222"
}
