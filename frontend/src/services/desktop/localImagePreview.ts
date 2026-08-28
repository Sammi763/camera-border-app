/**
 * 本地图片预览（前端服务封装）。
 *
 * 调用 window.desktop.loadLocalImagePreview 读取本地图片并缩放为 dataURL。
 * 用于：
 * - 引擎不可用时工作台预览的兜底（仅 JPEG/PNG/WebP/BMP/TIFF 等系统可解码格式）；
 * - 队列缩略图兜底（与工作台同链路）。
 *
 * RAW/HEIC 等系统缩略图无法解码的格式 → 返回 null，由 UI 显式提示
 * "本地预览不可用，需等待引擎恢复"，不静默伪装成正常预览。
 */

import { isHeicFile } from "../../features/metadata/constants/imageFormats"

export type LocalPreview = {
  readonly dataUrl: string
  readonly width: number
  readonly height: number
}

/** 与 Electron 主进程 SUPPORTED_EXTENSIONS 保持一致。 */
const SUPPORTED_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"
])

/** RAW 扩展名集合（系统缩略图无法解码）。 */
const RAW_EXTENSIONS = new Set([
  ".nef", ".cr2", ".cr3", ".arw", ".raf", ".dng", ".orf", ".rw2", ".pef"
])

/** 是否为本地预览支持的栅格格式（不含 HEIC/RAW）。 */
export const isLocalPreviewSupported = (filePath: string): boolean => {
  const dotIndex = filePath.lastIndexOf(".")
  if (dotIndex < 0) {
    return false
  }
  const ext = filePath.slice(dotIndex).toLowerCase()
  return SUPPORTED_EXTENSIONS.has(ext)
}

/** 是否为 RAW 或 HEIC（系统缩略图无法解码，提示用户等待引擎恢复）。 */
export const isRawOrHeicFile = (filePath: string): boolean => {
  const dotIndex = filePath.lastIndexOf(".")
  if (dotIndex < 0) {
    return false
  }
  const ext = filePath.slice(dotIndex).toLowerCase()
  return RAW_EXTENSIONS.has(ext) || isHeicFile(filePath)
}

/**
 * 在主进程读取本地图片并生成 dataURL 预览。
 * 任何失败（桥接不存在、文件不存在、解码失败）返回 null，UI 据此降级提示。
 */
export const loadLocalImagePreview = async (
  imagePath: string,
  maxWidth: number,
  maxHeight: number
): Promise<LocalPreview | null> => {
  const bridge = window.desktop
  if (bridge === undefined || bridge.loadLocalImagePreview === undefined) {
    return null
  }
  try {
    return await bridge.loadLocalImagePreview(imagePath, maxWidth, maxHeight)
  } catch {
    return null
  }
}
