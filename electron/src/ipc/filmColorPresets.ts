import { mkdir, readFile, rename, writeFile, unlink } from "node:fs/promises"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { app, ipcMain } from "electron"
import { IPC_CHANNELS } from "../types/desktopApi.js"

/** 校色预设仅访问固定文件；读失败向上传递，防止空列表覆盖旧数据。 */
export const registerFilmColorPresetsIpc = (): void => {
  const target = (): string => join(app.getPath("userData"), "film-color-presets.json")
  ipcMain.handle(IPC_CHANNELS.READ_FILM_COLOR_PRESETS, async (): Promise<string> => {
    try { return await readFile(target(), "utf8") } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "[]"
      throw error
    }
  })
  ipcMain.handle(IPC_CHANNELS.WRITE_FILM_COLOR_PRESETS, async (_event, json: unknown): Promise<void> => {
    if (typeof json !== "string" || Buffer.byteLength(json, "utf8") > 4 * 1024 * 1024) throw new Error("校色预设大小或类型不合法")
    const parsed: unknown = JSON.parse(json)
    if (!Array.isArray(parsed) || parsed.length > 500) throw new Error("校色预设必须是数量受限的数组")
    await mkdir(app.getPath("userData"), { recursive: true })
    const temporary = `${target()}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, json, { encoding: "utf8", flag: "wx" })
      await rename(temporary, target())
    } finally { await unlink(temporary).catch(() => undefined) }
  })
}
