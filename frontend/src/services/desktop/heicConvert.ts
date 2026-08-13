/**
 * HEIC/HEIF 文件转换服务。
 *
 * 桌面模式下，调用 Electron 主进程的 convertHeicFiles IPC，
 * 将 HEIC/HEIF 文件转换为临时 JPEG 供引擎处理。
 *
 * 浏览器模式下不支持 HEIC，原样返回路径（引擎会报错）。
 */

import { isHeicFile } from "../../features/metadata/constants/imageFormats"

/** 转换结果项。 */
export type ConvertedPath = {
  /** 原始路径。 */
  readonly original: string
  /** 转换后的路径（可能是临时 JPEG 路径，也可能是原始路径）。null 表示转换失败。 */
  readonly resolved: string | null
  /** 是否发生了转换。 */
  readonly converted: boolean
}

/**
 * 批量转换路径列表中的 HEIC 文件。
 *
 * - 非 HEIC 文件原样返回
 * - HEIC 文件通过 Electron 主进程转换为临时 JPEG
 * - 转换失败的文件 resolved 为 null
 * - 浏览器模式下 HEIC 文件 resolved 为 null
 *
 * @param paths 原始文件路径列表
 * @returns 转换结果列表（与输入一一对应）
 */
export const resolveHeicPaths = async (
  paths: readonly string[]
): Promise<readonly ConvertedPath[]> => {
  if (paths.length === 0) {
    return []
  }

  const bridge = window.desktop
  if (bridge === undefined || bridge.convertHeicFiles === undefined) {
    // 浏览器模式或旧版 Electron：HEIC 无法转换
    return paths.map((p) => ({
      original: p,
      resolved: isHeicFile(p) ? null : p,
      converted: false
    }))
  }

  const convertedPaths = await bridge.convertHeicFiles(paths)

  return paths.map((p, i) => {
    const resolved = convertedPaths[i] ?? null
    return {
      original: p,
      resolved,
      converted: resolved !== null && resolved !== p
    }
  })
}
