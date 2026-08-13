/**
 * 图片格式常量。
 *
 * 统一管理 HEIC/HEIF 扩展名识别，供队列、预览、导出等模块共享。
 * 与 Electron fileDialog.ts 中的 SUPPORTED_IMAGE_EXTENSIONS 保持一致。
 */

/** HEIC/HEIF 扩展名集合（小写）。 */
const HEIC_EXTENSIONS = new Set([".heic", ".heif"])

/** 判断文件是否为 HEIC/HEIF 格式。 */
export const isHeicFile = (filePath: string): boolean => {
  const dotIndex = filePath.lastIndexOf(".")
  if (dotIndex < 0) return false
  return HEIC_EXTENSIONS.has(filePath.slice(dotIndex).toLowerCase())
}

/** HEIC/HEIF 格式名称。 */
export const HEIC_FORMAT_NAME = "HEIC/HEIF"
