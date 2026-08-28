import { existsSync, statSync } from "node:fs"
import { extname, isAbsolute } from "node:path"
import { ipcMain, nativeImage } from "electron"
import { IPC_CHANNELS, type LocalImagePreview } from "../types/desktopApi.js"
import { MAX_DIMENSION_CAP, resolvePreviewTargetSize } from "./previewTargetSize.js"

/**
 * 本地图片预览 IPC：
 * 渲染进程传入绝对路径 + 最大宽高，主进程用 Electron `nativeImage`
 * 读取并缩放，返回 dataURL + 尺寸。
 *
 * 设计原则：
 * - 任何错误（参数非法、文件不存在、扩展名不支持、解码失败、nativeImage 抛错）
 *   一律返回 null，不向渲染进程抛出异常；
 * - 仅接受绝对路径、常规文件、支持的栅格格式，避免越权与意外；
 * - 缩放规则：同时遵守 maxWidth 与 maxHeight、保持纵横比、不放大原图、
 *   最大边长封顶 2048（见 previewTargetSize.ts）；
 * - 内存风险控制：优先使用 `nativeImage.createThumbnailFromPath` 原生缩略图器，
 *   它按目标尺寸解码、不加载全尺寸位图，避免超大原图在缩放前占用明显内存；
 *   失败时回退 `createFromPath` + 按纯函数计算的目标宽度缩放；
 * - 所有 IO 在主进程完成，渲染进程不获得文件系统权限。
 */

/** 支持的栅格扩展名（与桌面壳文件对话框白名单保持一致；不含 HEIC/RAW）。 */
const SUPPORTED_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"
])

/** 单张预览的最小有效边长。 */
const MIN_DIMENSION = 1

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= MIN_DIMENSION && Number.isInteger(value)

/** createThumbnailFromPath 返回值的结构（与 Electron NativeImage 对齐）。 */
export type ThumbnailImage = {
  readonly isEmpty: () => boolean
  readonly getSize: () => { width: number; height: number }
  readonly toDataURL: () => string
}

/**
 * 注册 LOAD_LOCAL_IMAGE_PREVIEW IPC handler。
 * 任何失败返回 null，渲染进程据此降级。
 */
export const registerLocalImagePreviewIpc = (): void => {
  ipcMain.handle(
    IPC_CHANNELS.LOAD_LOCAL_IMAGE_PREVIEW,
    async (_event, imagePath: unknown, maxWidth: unknown, maxHeight: unknown): Promise<LocalImagePreview | null> => {
      // 1) 参数校验
      if (!isNonEmptyString(imagePath)) {
        return null
      }
      if (!isAbsolute(imagePath)) {
        // 仅允许绝对路径，避免相对路径越权
        return null
      }
      if (!isPositiveInteger(maxWidth) || !isPositiveInteger(maxHeight)) {
        return null
      }
      // 2) 扩展名白名单（RAW/HEIC 等由系统缩略图无法解码的格式直接拒绝）
      const ext = extname(imagePath).toLowerCase()
      if (!SUPPORTED_EXTENSIONS.has(ext)) {
        return null
      }
      // 3) 文件存在且为常规文件
      if (!existsSync(imagePath)) {
        return null
      }
      try {
        const info = statSync(imagePath)
        if (!info.isFile()) {
          return null
        }
      } catch {
        return null
      }
      // 4) 目标最大盒（请求值先封顶，防 OOM/失真）
      const reqWidth = Math.min(maxWidth, MAX_DIMENSION_CAP)
      const reqHeight = Math.min(maxHeight, MAX_DIMENSION_CAP)

      // 5) 主路径：原生缩略图器（低内存、按目标盒缩放、保持纵横比、不放大）
      const thumbnail = nativeImage.createThumbnailFromPath as
        | ((path: string, size: { width: number; height: number }) => Promise<ThumbnailImage>)
        | undefined
      if (thumbnail !== undefined) {
        try {
          const image = await thumbnail(imagePath, { width: reqWidth, height: reqHeight })
          if (!image.isEmpty()) {
            const size = image.getSize()
            return {
              dataUrl: image.toDataURL(),
              width: size.width,
              height: size.height
            }
          }
        } catch {
          // 缩略图器不可用/失败：落入 createFromPath 兜底
        }
      }

      // 6) 兜底路径：createFromPath 解码 → 纯函数计算目标尺寸（同时遵守两约束、不放大、封顶）
      try {
        const image = nativeImage.createFromPath(imagePath)
        if (image.isEmpty()) {
          return null
        }
        const natural = image.getSize()
        const target = resolvePreviewTargetSize(
          natural.width, natural.height, maxWidth, maxHeight, MAX_DIMENSION_CAP
        )
        if (target === null) {
          return null
        }
        // 只传宽度让 nativeImage 保持纵横比缩放（height 按同比例自动跟随 target.height）
        const resized = target.width < natural.width
          ? image.resize({ width: target.width, quality: "good" })
          : image
        const finalSize = resized.getSize()
        return {
          dataUrl: resized.toDataURL(),
          width: finalSize.width,
          height: finalSize.height
        }
      } catch {
        return null
      }
    }
  )
}

export const IPC_LOCAL_IMAGE_PREVIEW_CHANNEL = IPC_CHANNELS.LOAD_LOCAL_IMAGE_PREVIEW
