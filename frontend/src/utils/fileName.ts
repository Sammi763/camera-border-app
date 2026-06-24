/**
 * 文件名相关的工具函数。
 *
 * 从绝对路径中提取文件名、目录路径等，跨平台兼容 Windows 和 Unix 路径分隔符。
 */

/** 从绝对路径中提取文件名（含扩展名）。 */
export const toFileName = (filePath: string): string => {
  const segments = filePath.split(/[/\\]/)
  return segments[segments.length - 1] ?? filePath
}

/** 从绝对路径中提取目录部分（去掉文件名）。 */
export const toDirPath = (filePath: string): string => {
  const segments = filePath.split(/[/\\]/)
  segments.pop()
  const dir = segments.join("/")
  return dir.length > 0 ? dir : filePath
}

/** 从文件名生成导出文件名：去掉扩展名，加 -border.{ext}。 */
export const toExportFileName = (fileName: string, format: "png" | "jpeg"): string => {
  const dotIndex = fileName.lastIndexOf(".")
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName
  const ext = format === "jpeg" ? "jpg" : "png"
  return `${baseName}-border.${ext}`
}
