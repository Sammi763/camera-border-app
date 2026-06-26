import { readdir } from "node:fs/promises"
import { extname, join } from "node:path"
import { BrowserWindow, dialog, ipcMain } from "electron"
import { IPC_CHANNELS, type ImageSourceResult } from "../types/desktopApi.js"

const IMAGE_FILTERS = [
  {
    name: "图片",
    extensions: ["jpg", "jpeg", "png", "webp", "tif", "tiff", "bmp"]
  }
]

/** 根据默认文件名扩展名选择导出格式过滤器。 */
const getExportFilters = (defaultFileName: string): Electron.FileFilter[] => {
  const ext = defaultFileName.split(".").pop()?.toLowerCase() ?? "png"
  if (ext === "jpg" || ext === "jpeg") {
    return [{ name: "JPEG", extensions: ["jpg", "jpeg"] }]
  }
  return [{ name: "PNG", extensions: ["png"] }]
}

/**
 * 注册原生文件选择相关 IPC handler。
 *
 * 渲染进程不直接操作文件系统——通过 IPC 请求主进程打开系统对话框，
 * 仅返回绝对路径。遵循 ARCHITECTURE.md §1（前端不直接操作本地文件系统）。
 */
export const registerFileDialogIpc = (): void => {
  ipcMain.handle(IPC_CHANNELS.SELECT_IMAGES, async (): Promise<string[]> => {
    const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

    if (parent === undefined) {
      return []
    }

    const result = await dialog.showOpenDialog(parent, {
      title: "选择图片",
      properties: ["openFile", "multiSelections"],
      filters: IMAGE_FILTERS
    })

    if (result.canceled) {
      return []
    }

    return result.filePaths
  })

  /**
   * 导出保存路径选择对话框。
   * 返回用户选择的绝对路径；取消时返回 null。
   */
  ipcMain.handle(
    IPC_CHANNELS.SELECT_EXPORT_PATH,
    async (_event, defaultFileName: string): Promise<string | null> => {
      const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

      if (parent === undefined) {
        return null
      }

      const result = await dialog.showSaveDialog(parent, {
        title: "导出原图成品",
        defaultPath: defaultFileName,
        filters: getExportFilters(defaultFileName)
      })

      if (result.canceled || result.filePath === undefined) {
        return null
      }

      return result.filePath
    }
  )

  /**
   * 导出目录选择对话框。
   * 返回用户选择的目录绝对路径；取消时返回 null。
   */
  ipcMain.handle(
    IPC_CHANNELS.SELECT_EXPORT_DIRECTORY,
    async (): Promise<string | null> => {
      const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

      if (parent === undefined) {
        return null
      }

      const result = await dialog.showOpenDialog(parent, {
        title: "选择导出目录",
        properties: ["openDirectory", "createDirectory"]
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      return result.filePaths[0] ?? null
    }
  )

  // ---- 图片来源选择（文件或文件夹） ----------------------------------------

  /** 支持的图片扩展名（小写）。 */
  const SUPPORTED_IMAGE_EXTENSIONS = new Set([
    ".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".bmp"
  ])

  const isSupportedImage = (filePath: string): boolean => {
    return SUPPORTED_IMAGE_EXTENSIONS.has(extname(filePath).toLowerCase())
  }

  /**
   * 扫描目录内（非递归）所有支持的图片文件，按文件名自然排序。
   * 忽略子目录和非图片文件。
   */
  const scanDirectoryImages = async (dirPath: string): Promise<string[]> => {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true })
      const imageFiles = entries
        .filter((entry) => entry.isFile() && isSupportedImage(entry.name))
        .map((entry) => join(dirPath, entry.name))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
      return imageFiles
    } catch (err: unknown) {
      console.error(`[文件对话框] 扫描目录失败：${dirPath}`, err)
      return []
    }
  }

  ipcMain.handle(
    IPC_CHANNELS.SELECT_IMAGE_SOURCES,
    async (): Promise<ImageSourceResult | null> => {
      const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

      if (parent === undefined) {
        return null
      }

      const result = await dialog.showOpenDialog(parent, {
        title: "选择图片文件或文件夹",
        properties: ["openFile", "openDirectory", "multiSelections"],
        filters: IMAGE_FILTERS
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      const firstPath = result.filePaths[0]

      // 判断选中的是文件夹还是文件
      // Electron 的 showOpenDialog 选中文件夹时，filePaths 里是目录路径
      // 选中文件时，filePaths 里是文件路径
      // 需要通过 extname 判断：有扩展名的是文件，否则是目录
      const hasExtension = firstPath !== undefined && extname(firstPath).length > 0

      if (hasExtension) {
        // 选中的是文件
        return {
          kind: "files",
          paths: result.filePaths.filter((p) => isSupportedImage(p))
        }
      }

      // 选中的是文件夹（取第一个）
      if (firstPath === undefined) {
        return null
      }
      const images = await scanDirectoryImages(firstPath)
      return {
        kind: "directory",
        paths: images
      }
    }
  )

  // ---- 独立图片文件选择（仅文件，多选） ------------------------------------

  ipcMain.handle(
    IPC_CHANNELS.SELECT_IMAGE_FILES,
    async (): Promise<string[]> => {
      const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

      if (parent === undefined) {
        return []
      }

      const result = await dialog.showOpenDialog(parent, {
        title: "选择图片文件",
        properties: ["openFile", "multiSelections"],
        filters: IMAGE_FILTERS
      })

      if (result.canceled) {
        return []
      }

      return result.filePaths.filter((p) => isSupportedImage(p))
    }
  )

  // ---- 独立图片文件夹选择（仅目录） ----------------------------------------

  ipcMain.handle(
    IPC_CHANNELS.SELECT_IMAGE_FOLDER,
    async (): Promise<ImageSourceResult | null> => {
      const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

      if (parent === undefined) {
        return null
      }

      const result = await dialog.showOpenDialog(parent, {
        title: "选择图片文件夹",
        properties: ["openDirectory"]
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      const dirPath = result.filePaths[0]
      if (dirPath === undefined) {
        return null
      }

      const images = await scanDirectoryImages(dirPath)
      return {
        kind: "directory",
        paths: images
      }
    }
  )
}
