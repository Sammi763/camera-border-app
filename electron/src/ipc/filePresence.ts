import { stat } from "node:fs/promises"
import { extname, isAbsolute } from "node:path"
import { ipcMain } from "electron"
import { IPC_CHANNELS } from "../types/desktopApi.js"

/** 预览缓存失效所需的最小版本信息；输入路径与返回值按下标一一对应。 */
export type ImageFileVersion = {
  readonly mtimeMs: number
  readonly sizeBytes: number
}

/** 会话恢复允许检查的图片扩展名；与导入对话框白名单保持一致。 */
const IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".heic", ".heif",
  ".nef", ".cr2", ".cr3", ".arw", ".raf", ".dng", ".orf", ".rw2", ".pef"
])

const MAX_PATHS_PER_REQUEST = 200

const isAllowedImagePath = (value: unknown): value is string =>
  typeof value === "string"
  && value.trim().length > 0
  && isAbsolute(value)
  && IMAGE_EXTENSIONS.has(extname(value).toLowerCase())

/**
 * 受限的文件存在性 IPC。
 *
 * 它只服务于已保存工作会话的恢复：输入必须是数量受限的绝对图片路径，输出只包含
 * 同位置 boolean，不泄露文件内容、目录列表、mtime 或任意路径元数据。
 */
export const registerFilePresenceIpc = (): void => {
  ipcMain.handle(IPC_CHANNELS.CHECK_IMAGE_PATHS, async (_event, paths: unknown): Promise<readonly boolean[]> => {
    if (!Array.isArray(paths) || paths.length > MAX_PATHS_PER_REQUEST) {
      return []
    }
    return Promise.all(paths.map(async (path): Promise<boolean> => {
      if (!isAllowedImagePath(path)) return false
      try {
        return (await stat(path)).isFile()
      } catch {
        return false
      }
    }))
  })
}

/**
 * 受限的图片版本 IPC。
 *
 * 仅给 Renderer 的预览/缩略图缓存生成 key：同样使用路径白名单与 200 项上限，
 * 且只返回 mtime 与大小，不能借此读取任意文件内容、枚举目录或访问非图片路径。
 */
export const registerImageFileVersionIpc = (): void => {
  ipcMain.handle(
    IPC_CHANNELS.GET_IMAGE_FILE_VERSIONS,
    async (_event, paths: unknown): Promise<readonly (ImageFileVersion | null)[]> => {
      if (!Array.isArray(paths) || paths.length > MAX_PATHS_PER_REQUEST) {
        return []
      }
      return Promise.all(paths.map(async (path): Promise<ImageFileVersion | null> => {
        if (!isAllowedImagePath(path)) return null
        try {
          const info = await stat(path)
          if (!info.isFile()) return null
          return { mtimeMs: info.mtimeMs, sizeBytes: info.size }
        } catch {
          return null
        }
      }))
    }
  )
}

export const IPC_FILE_PRESENCE_CHANNEL = IPC_CHANNELS.CHECK_IMAGE_PATHS
export const IPC_FILE_VERSION_CHANNEL = IPC_CHANNELS.GET_IMAGE_FILE_VERSIONS
