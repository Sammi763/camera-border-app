import { BrowserWindow, dialog, ipcMain } from "electron"
import { IPC_CHANNELS } from "../types/desktopApi.js"

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
}
