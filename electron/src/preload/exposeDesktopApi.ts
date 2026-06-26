import { contextBridge, ipcRenderer } from "electron"
import { APP_NAME } from "../config/appConfig.js"
import { engineBaseUrl, engineManaged } from "../config/devMode.js"
import {
  IPC_CHANNELS,
  type DesktopApi,
  type DesktopRuntime,
  type ImageSourceResult
} from "../types/desktopApi.js"

/**
 * 构建并暴露桌面运行时信息和能力到渲染进程。
 *
 * 暴露两个全局对象：
 * - window.desktopRuntime：启动时静态配置（应用名、平台、引擎 URL）
 * - window.desktop：经筛选的安全能力（图片选择、导出路径选择、目录选择、模板读写）
 *
 * 开发模式下 engine.managed = false，表示引擎由外部（IDEA）管理。
 */
export const exposeDesktopApi = (): void => {
  const runtime: DesktopRuntime = {
    appName: APP_NAME,
    platform: process.platform,
    engine: {
      managed: engineManaged,
      baseUrl: engineBaseUrl
    }
  }

  const api: DesktopApi = {
    selectImages: (): Promise<string[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SELECT_IMAGES),
    selectImageSources: (): Promise<ImageSourceResult | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SELECT_IMAGE_SOURCES),
    selectImageFiles: (): Promise<readonly string[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SELECT_IMAGE_FILES),
    selectImageFolder: (): Promise<ImageSourceResult | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SELECT_IMAGE_FOLDER),
    selectExportPath: (defaultFileName: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SELECT_EXPORT_PATH, defaultFileName),
    selectExportDirectory: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SELECT_EXPORT_DIRECTORY),
    readTemplates: (): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.READ_TEMPLATES),
    writeTemplates: (json: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.WRITE_TEMPLATES, json),
    readAssets: (): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.READ_ASSETS),
    writeAssets: (json: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.WRITE_ASSETS, json),
    readRolls: (): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.READ_ROLLS),
    writeRolls: (json: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.WRITE_ROLLS, json),
    exportTemplateJson: (defaultFileName: string, json: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPORT_TEMPLATE_JSON, defaultFileName, json),
    importTemplateJson: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.IMPORT_TEMPLATE_JSON)
  }

  contextBridge.exposeInMainWorld("desktopRuntime", runtime)
  contextBridge.exposeInMainWorld("desktop", api)
}
