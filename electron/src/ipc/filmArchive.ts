import { readFile, realpath, stat, writeFile } from "node:fs/promises"
import { extname, isAbsolute, join, relative } from "node:path"
import { app, dialog, ipcMain, shell, BrowserWindow } from "electron"
import { IPC_CHANNELS, type FilmArchiveSelection, type FilmArchiveStatus } from "../types/desktopApi.js"

/**
 * FilmArchive 本机只读关联的桌面壳能力。
 *
 * Electron 只负责目录选择、固定记住白名单根和受控打开；catalog.json 的解析、
 * 文献去重/版本差异与胶片关联全部在 Java 引擎完成。渲染进程依然拿不到文件系统权限。
 */

const CONFIG_FILE = "film-archive.json"
const ALLOWED_DOCUMENT_EXTENSIONS = new Set([
  ".pdf", ".txt", ".html", ".htm", ".md", ".png", ".jpg", ".jpeg", ".tif", ".tiff"
])

type FilmArchiveConfig = {
  readonly libraryPath: string
  readonly catalogPath: string
  readonly selectedAt: number
}

const configPath = (): string => join(app.getPath("userData"), CONFIG_FILE)

/** 判断 candidate 是否位于 root 内（不把 root 本身当作文献）。 */
export const isPathInsideRoot = (candidate: string, root: string): boolean => {
  const relativePath = relative(root, candidate)
  return relativePath.length > 0
    && relativePath !== ".."
    && !relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
    && !isAbsolute(relativePath)
}

export const isAllowedDocumentExtension = (documentPath: string): boolean =>
  ALLOWED_DOCUMENT_EXTENSIONS.has(extname(documentPath).toLowerCase())

const catalogIn = async (root: string): Promise<string | null> => {
  for (const candidate of [
    join(root, "catalog.json"),
    join(root, "Docs", "catalog.json"),
    join(root, "docs", "catalog.json")
  ]) {
    try {
      const info = await stat(candidate)
      if (info.isFile()) return candidate
    } catch {
      // 继续检查下一个候选位置
    }
  }
  return null
}

const readConfig = async (): Promise<FilmArchiveConfig | null> => {
  try {
    const parsed: unknown = JSON.parse(await readFile(configPath(), "utf-8"))
    if (typeof parsed !== "object" || parsed === null) return null
    const value = parsed as Record<string, unknown>
    if (typeof value["libraryPath"] !== "string" || !isAbsolute(value["libraryPath"])) return null
    if (typeof value["catalogPath"] !== "string" || !isAbsolute(value["catalogPath"])) return null
    return {
      libraryPath: value["libraryPath"],
      catalogPath: value["catalogPath"],
      selectedAt: typeof value["selectedAt"] === "number" ? value["selectedAt"] : 0
    }
  } catch {
    return null
  }
}

const persistConfig = async (config: FilmArchiveConfig): Promise<void> => {
  await writeFile(configPath(), JSON.stringify(config, null, 2), "utf-8")
}

/** 注册 FilmArchive IPC。初始化只读固定配置，不扫描目录内容。 */
export const registerFilmArchiveIpc = (): void => {
  let currentRoot: string | null = null
  let ready: Promise<void> | null = null

  const ensureReady = (): Promise<void> => {
    if (ready === null) {
      ready = (async () => {
        const config = await readConfig()
        if (config === null) return
        try {
          const root = await realpath(config.libraryPath)
          const catalog = await catalogIn(root)
          if (catalog !== null) currentRoot = root
        } catch {
          // 目录移走/无权限时保持未注册，不把旧路径当成可用。
        }
      })()
    }
    return ready
  }

  ipcMain.handle(IPC_CHANNELS.GET_FILM_ARCHIVE_STATUS, async (): Promise<FilmArchiveStatus> => {
    await ensureReady()
    return { libraryPath: currentRoot, available: currentRoot !== null }
  })

  ipcMain.handle(
    IPC_CHANNELS.SELECT_FILM_ARCHIVE_FOLDER,
    async (): Promise<FilmArchiveSelection | null> => {
      const e2e = process.env["CAMBORDER_E2E"] === "1" && app.isPackaged
        ? process.env["CAMBORDER_E2E_FILM_ARCHIVE"]
        : undefined
      let selected: string | undefined
      if (e2e !== undefined && isAbsolute(e2e)) {
        selected = e2e
      } else {
        const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
        if (parent === undefined) return null
        const result = await dialog.showOpenDialog(parent, {
          title: "选择 FilmArchive 文件夹",
          properties: ["openDirectory"]
        })
        if (result.canceled || result.filePaths.length === 0) return null
        selected = result.filePaths[0]
      }
      if (selected === undefined) return null
      const root = await realpath(selected)
      const catalog = await catalogIn(root)
      if (catalog === null) {
        throw new Error("所选目录缺少 catalog.json")
      }
      const realCatalog = await realpath(catalog)
      if (!isPathInsideRoot(realCatalog, root)) {
        throw new Error("catalog.json 不在选定目录内")
      }
      currentRoot = root
      await persistConfig({ libraryPath: root, catalogPath: realCatalog, selectedAt: Date.now() })
      return { libraryPath: root, catalogPath: realCatalog }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.OPEN_FILM_REFERENCE_DOCUMENT,
    async (_event, documentPath: string): Promise<boolean> => {
      await ensureReady()
      if (currentRoot === null || typeof documentPath !== "string"
        || documentPath.trim().length === 0 || !isAbsolute(documentPath)
        || !isAllowedDocumentExtension(documentPath)) {
        return false
      }
      try {
        const root = await realpath(currentRoot)
        const resolved = await realpath(documentPath)
        if (!isPathInsideRoot(resolved, root)) return false
        const info = await stat(resolved)
        if (!info.isFile()) return false
        return (await shell.openPath(resolved)).length === 0
      } catch {
        return false
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.OPEN_FILM_REFERENCE_SOURCE,
    async (_event, sourceUrl: string): Promise<boolean> => {
      if (typeof sourceUrl !== "string" || sourceUrl.length === 0) return false
      let url: URL
      try {
        url = new URL(sourceUrl)
      } catch {
        return false
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") return false
      if (url.username.length > 0 || url.password.length > 0) return false
      try {
        await shell.openExternal(url.toString())
        return true
      } catch {
        return false
      }
    }
  )
}
