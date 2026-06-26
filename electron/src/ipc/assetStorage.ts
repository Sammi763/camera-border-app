import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { app, ipcMain } from "electron"
import { IPC_CHANNELS } from "../types/desktopApi.js"

/** 摄影资产库文件存储路径：userData/assets.json */
const getAssetsFilePath = (): string => {
  return join(app.getPath("userData"), "assets.json")
}

/** Roll 胶卷数据文件存储路径：userData/rolls.json */
const getRollsFilePath = (): string => {
  return join(app.getPath("userData"), "rolls.json")
}

/**
 * 通用文件读取：文件不存在时返回 "[]"，读取失败时 console.error 并返回 "[]"。
 */
const readJsonFile = async (filePath: string, label: string): Promise<string> => {
  try {
    const content = await readFile(filePath, "utf-8")
    return content
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return "[]"
    }
    console.error(`[${label}] 读取文件失败：${filePath}`, err)
    return "[]"
  }
}

/**
 * 通用文件写入：写入前确保目录存在，失败时 console.error 并向上抛错。
 */
const writeJsonFile = async (filePath: string, json: string, label: string): Promise<void> => {
  try {
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, json, "utf-8")
  } catch (err: unknown) {
    console.error(`[${label}] 写入文件失败：${filePath}`, err)
    throw err
  }
}

/**
 * 注册摄影资产库和 Roll 胶卷数据的存储 IPC handler。
 *
 * 数据存储在 app.getPath("userData") 下的 assets.json 和 rolls.json 文件中。
 * 只读写固定文件，不暴露任意路径文件读写——
 * 遵循 ARCHITECTURE.md §1（前端不直接操作本地文件系统）。
 *
 * Electron 只做字符串读写，JSON 校验交给前端。
 */
export const registerAssetStorageIpc = (): void => {
  // ---- 摄影资产库 ----
  ipcMain.handle(IPC_CHANNELS.READ_ASSETS, async (): Promise<string> => {
    return readJsonFile(getAssetsFilePath(), "摄影资产库")
  })

  ipcMain.handle(
    IPC_CHANNELS.WRITE_ASSETS,
    async (_event, json: string): Promise<void> => {
      await writeJsonFile(getAssetsFilePath(), json, "摄影资产库")
    }
  )

  // ---- Roll 胶卷 ----
  ipcMain.handle(IPC_CHANNELS.READ_ROLLS, async (): Promise<string> => {
    return readJsonFile(getRollsFilePath(), "Roll 胶卷")
  })

  ipcMain.handle(
    IPC_CHANNELS.WRITE_ROLLS,
    async (_event, json: string): Promise<void> => {
      await writeJsonFile(getRollsFilePath(), json, "Roll 胶卷")
    }
  )
}

/** Node 错误类型守卫，用于检查 err.code 等属性。 */
function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error
}
