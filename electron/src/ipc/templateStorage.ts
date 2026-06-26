import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { app, dialog, ipcMain } from "electron"
import { IPC_CHANNELS } from "../types/desktopApi.js"

/** 模板文件存储路径：userData/templates.json */
const getTemplatesFilePath = (): string => {
  return join(app.getPath("userData"), "templates.json")
}

/**
 * 注册模板文件存储相关 IPC handler。
 *
 * 模板 JSON 存储在 app.getPath("userData") 下的 templates.json 文件中。
 * 只读写这一份文件，不暴露任意路径文件读写——
 * 遵循 ARCHITECTURE.md §1（前端不直接操作本地文件系统）。
 */
export const registerTemplateStorageIpc = (): void => {
  ipcMain.handle(IPC_CHANNELS.READ_TEMPLATES, async (): Promise<string> => {
    const filePath = getTemplatesFilePath()

    try {
      const content = await readFile(filePath, "utf-8")
      return content
    } catch (err: unknown) {
      // 区分"文件不存在"和"读取失败"两种情况
      if (isNodeError(err) && err.code === "ENOENT") {
        // 文件不存在，返回空数组 JSON
        return "[]"
      }

      // 文件存在但读取失败（权限、损坏等），输出日志但仍返回兜底值
      console.error(`[模板存储] 读取模板文件失败：${filePath}`, err)
      return "[]"
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.WRITE_TEMPLATES,
    async (_event, json: string): Promise<void> => {
      const filePath = getTemplatesFilePath()

      try {
        await writeFile(filePath, json, "utf-8")
      } catch (err: unknown) {
        console.error(`[模板存储] 写入模板文件失败：${filePath}`, err)
        throw err
      }
    }
  )

  // ---- 模板导出：保存对话框 ------------------------------------------------

  ipcMain.handle(
    IPC_CHANNELS.EXPORT_TEMPLATE_JSON,
    async (_event, defaultFileName: string, json: string): Promise<string | null> => {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: "导出模板",
        defaultPath: defaultFileName,
        filters: [{ name: "相机边框模板", extensions: ["camborder-template.json", "json"] }],
      })

      if (canceled || filePath === undefined) {
        return null
      }

      try {
        await writeFile(filePath, json, "utf-8")
        return filePath
      } catch (err: unknown) {
        console.error(`[模板导出] 写入模板文件失败：${filePath}`, err)
        throw err
      }
    }
  )

  // ---- 模板导入：打开对话框 ------------------------------------------------

  ipcMain.handle(
    IPC_CHANNELS.IMPORT_TEMPLATE_JSON,
    async (): Promise<string | null> => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: "导入模板",
        filters: [{ name: "相机边框模板", extensions: ["camborder-template.json", "json"] }],
        properties: ["openFile"],
      })

      if (canceled || filePaths.length === 0) {
        return null
      }

      const filePath = filePaths[0]
      if (filePath === undefined) {
        return null
      }

      try {
        const content = await readFile(filePath, "utf-8")
        return content
      } catch (err: unknown) {
        console.error(`[模板导入] 读取模板文件失败：${filePath}`, err)
        throw err
      }
    }
  )
}

/** Node 错误类型守卫，用于检查 err.code 等属性。 */
function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error
}
