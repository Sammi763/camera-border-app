import type { ImageFileVersion } from "../../types/runtime"

/**
 * 获取受限图片版本信息。
 *
 * 桌面壳不存在（浏览器开发模式）或旧 preload 未提供该能力时，按等长 null 退化；
 * 缓存仍可工作，只是使用 unknown-mtime 键而不会触碰浏览器文件系统。
 */
export const getImageFileVersions = async (
  paths: readonly string[]
): Promise<readonly (ImageFileVersion | null)[]> => {
  const inspect = window.desktop?.getImageFileVersions
  if (inspect === undefined) {
    return paths.map(() => null)
  }
  try {
    const result = await inspect(paths)
    return paths.map((_, index) => {
      const version = result[index]
      if (version === null || version === undefined) return null
      if (!Number.isFinite(version.mtimeMs) || !Number.isFinite(version.sizeBytes)) return null
      return version
    })
  } catch {
    return paths.map(() => null)
  }
}
