import { BrowserWindow } from "electron"
import {
  APP_NAME,
  WINDOW_BACKGROUND_COLOR,
  WINDOW_DEFAULT_HEIGHT,
  WINDOW_DEFAULT_WIDTH,
  WINDOW_MIN_HEIGHT,
  WINDOW_MIN_WIDTH
} from "../config/appConfig.js"
import { rendererUrl } from "../config/devMode.js"
import { preloadPath } from "../paths/paths.js"

/**
 * 创建并返回主窗口。
 *
 * 安全配置保持不变：
 * - contextIsolation: true
 * - nodeIntegration: false
 * - sandbox: false
 *
 * 开发模式加载 Vite dev server，生产模式加载 app:// 协议。
 */
export const createMainWindow = async (): Promise<BrowserWindow> => {
  const window = new BrowserWindow({
    width: WINDOW_DEFAULT_WIDTH,
    height: WINDOW_DEFAULT_HEIGHT,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    backgroundColor: WINDOW_BACKGROUND_COLOR,
    title: APP_NAME,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  await window.loadURL(rendererUrl)
  return window
}
