import { BrowserWindow, ipcMain } from "electron"
import { IPC_CHANNELS, type WindowBounds } from "../types/desktopApi.js"

/**
 * 注册只读窗口状态 IPC。
 *
 * 渲染进程只能取得发送请求的 BrowserWindow 外框尺寸；不暴露屏幕枚举、
 * 原生窗口句柄或任意窗口控制能力，避免把布局验收 API 变成系统能力逃逸口。
 */
export const registerWindowStateIpc = (): void => {
  ipcMain.handle(IPC_CHANNELS.GET_WINDOW_BOUNDS, (event): WindowBounds | null => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window === null) {
      return null
    }
    const bounds = window.getBounds()
    return {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    }
  })
}
