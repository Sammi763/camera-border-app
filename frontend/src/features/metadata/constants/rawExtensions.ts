/**
 * RAW 文件扩展名常量。
 *
 * 用于前端扩展名判断、UI 提示等场景。
 * 与 Electron fileDialog.ts 和 Java engine RawDecoder 保持一致。
 *
 * RAW 支持能力分级：
 * - preview-supported：该扩展名通常能稳定读取内嵌 JPEG，但像素来源仍是内嵌预览
 * - preview-only：尝试读取内嵌 JPEG，但不保证每个文件都成功
 * - unsupported：当前不支持
 */

/** 支持的 RAW 文件扩展名（小写，含前导点）。 */
export const RAW_EXTENSIONS = new Set([
  ".nef", ".cr2", ".cr3", ".arw", ".raf", ".dng", ".orf", ".rw2", ".pef"
])

/** RAW 格式中文名称映射（用于 UI 提示）。 */
export const RAW_FORMAT_NAMES: Readonly<Record<string, string>> = {
  ".nef": "Nikon NEF",
  ".cr2": "Canon CR2",
  ".cr3": "Canon CR3",
  ".arw": "Sony ARW",
  ".raf": "Fujifilm RAF",
  ".dng": "Adobe DNG",
  ".orf": "Olympus ORF",
  ".rw2": "Panasonic RW2",
  ".pef": "Pentax PEF"
}

/** RAW 支持能力分级。 */
export type RawTier = "preview-supported" | "preview-only" | "unsupported"

/** RAW 扩展名到支持能力分级的映射。 */
const RAW_TIERS: Readonly<Record<string, RawTier>> = {
  ".nef": "preview-supported",
  ".cr2": "preview-supported",
  ".dng": "preview-supported",
  ".arw": "preview-only",
  ".cr3": "preview-only",
  ".raf": "preview-only",
  ".orf": "preview-only",
  ".rw2": "preview-only",
  ".pef": "preview-only"
}

/** RAW 能力分级的中文说明。 */
export const RAW_TIER_LABELS: Readonly<Record<RawTier, string>> = {
  "preview-supported": "受限预览（使用内嵌 JPEG，不是真实 RAW 显影）",
  "preview-only": "受限预览（尝试读取内嵌 JPEG，不是真实 RAW 显影）",
  "unsupported": "不支持"
}

/**
 * 判断文件路径是否为 RAW 格式（按扩展名）。
 */
export const isRawFile = (filePath: string): boolean => {
  const lastDot = filePath.lastIndexOf(".")
  if (lastDot < 0) {
    return false
  }
  const ext = filePath.slice(lastDot).toLowerCase()
  return RAW_EXTENSIONS.has(ext)
}

/**
 * 获取 RAW 文件的中文格式名称。
 * 非 RAW 文件返回 null。
 */
export const getRawFormatName = (filePath: string): string | null => {
  const lastDot = filePath.lastIndexOf(".")
  if (lastDot < 0) {
    return null
  }
  const ext = filePath.slice(lastDot).toLowerCase()
  return RAW_FORMAT_NAMES[ext] ?? null
}

/**
 * 获取 RAW 文件的支持能力分级。
 * 非 RAW 文件返回 "unsupported"。
 */
export const getRawTier = (filePath: string): RawTier => {
  const lastDot = filePath.lastIndexOf(".")
  if (lastDot < 0) {
    return "unsupported"
  }
  const ext = filePath.slice(lastDot).toLowerCase()
  return RAW_TIERS[ext] ?? "unsupported"
}
