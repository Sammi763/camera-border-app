import { spawn } from "node:child_process"
import { createReadStream } from "node:fs"
import { mkdir, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, extname, basename } from "node:path"
import { app, ipcMain } from "electron"
import { IPC_CHANNELS } from "../types/desktopApi.js"

/** HEIC/HEIF 扩展名集合。 */
const HEIC_EXTENSIONS = new Set([".heic", ".heif"])

/** 临时文件目录名。 */
const TEMP_DIR_NAME = "camborder-heic"

/** 判断文件是否为 HEIC/HEIF 格式。 */
const isHeicFile = (filePath: string): boolean => {
  return HEIC_EXTENSIONS.has(extname(filePath).toLowerCase())
}

/** 获取 HEIC 转换临时目录路径。 */
const getTempDir = (): string => {
  return join(tmpdir(), TEMP_DIR_NAME)
}

/** 确保临时目录存在。 */
const ensureTempDir = async (): Promise<string> => {
  const dir = getTempDir()
  await mkdir(dir, { recursive: true })
  return dir
}

/** 生成唯一临时文件名。 */
const generateTempPath = (originalPath: string): string => {
  const base = basename(originalPath, extname(originalPath))
  const random = Math.random().toString(36).slice(2, 10)
  return join(getTempDir(), `${base}-${random}.jpg`)
}

/**
 * 使用 macOS sips 命令将 HEIC 转换为 JPEG。
 * sips 是 macOS 内置工具，无需额外依赖。
 */
const convertWithSips = (inputPath: string, outputPath: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const proc = spawn("sips", ["-s", "format", "jpeg", inputPath, "--out", outputPath], {
      stdio: ["ignore", "pipe", "pipe"]
    })
    proc.on("close", (code) => {
      resolve(code === 0)
    })
    proc.on("error", () => {
      resolve(false)
    })
  })
}

/**
 * 注册 HEIC 转换和系统字体枚举 IPC handler。
 */
export const registerImageConvertIpc = (): void => {
  /**
   * HEIC/HEIF 文件转换：
   * - macOS：使用 sips 命令转换为临时 JPEG
   * - 其他平台：返回 null（暂不支持）
   * - 非 HEIC 文件原样返回
   */
  ipcMain.handle(
    IPC_CHANNELS.CONVERT_HEIC_FILES,
    async (_event, paths: readonly string[]): Promise<(string | null)[]> => {
      if (paths.length === 0) {
        return []
      }

      await ensureTempDir()
      const platform = process.platform

      const results: (string | null)[] = []
      for (const filePath of paths) {
        if (!isHeicFile(filePath)) {
          results.push(filePath)
          continue
        }

        if (platform !== "darwin") {
          console.warn(`[HEIC 转换] 当前平台 ${platform} 暂不支持 HEIC 转换，跳过：${filePath}`)
          results.push(null)
          continue
        }

        const tempPath = generateTempPath(filePath)
        const success = await convertWithSips(filePath, tempPath)
        if (success) {
          results.push(tempPath)
        } else {
          console.error(`[HEIC 转换] 转换失败：${filePath}`)
          results.push(null)
        }
      }

      return results
    }
  )

  /**
   * 系统字体枚举：
   * - macOS：扫描 /Library/Fonts、/System/Library/Fonts、~/Library/Fonts
   * - Windows：扫描 C:\Windows\Fonts
   * - Linux：执行 fc-list 命令
   * 返回字体族名称数组（去重排序）。
   */
  ipcMain.handle(
    IPC_CHANNELS.LIST_SYSTEM_FONTS,
    async (): Promise<string[]> => {
      try {
        const fonts = new Set<string>()
        const platform = process.platform

        if (platform === "darwin" || platform === "win32") {
          const fontDirs = platform === "darwin"
            ? ["/Library/Fonts", "/System/Library/Fonts", join(app.getPath("home"), "Library", "Fonts")]
            : ["C:\\Windows\\Fonts"]

          const fontExtensions = new Set([".ttf", ".otf", ".ttc", ".woff", ".woff2"])
          for (const dir of fontDirs) {
            try {
              const entries = await readdir(dir, { withFileTypes: true })
              for (const entry of entries) {
                if (!entry.isFile()) continue
                const ext = extname(entry.name).toLowerCase()
                if (!fontExtensions.has(ext)) continue
                // 从文件名提取字体族名称：去掉扩展名和常见粗细后缀
                const name = basename(entry.name, ext)
                const cleaned = name
                  .replace(/[-_](Bold|Italic|Regular|Light|Medium|Semibold|Thin|Black|Oblique|Heavy|Ultra|Condensed|Extended|Narrow|Wide)$/gi, "")
                  .replace(/[-_]/g, " ")
                  .trim()
                if (cleaned.length > 0) {
                  fonts.add(cleaned)
                }
              }
            } catch {
              // 目录不存在或不可读，跳过
            }
          }
        } else if (platform === "linux") {
          // Linux: 使用 fc-list 命令
          const fcOutput = await new Promise<string>((resolve) => {
            const proc = spawn("fc-list", [":", "family"], { stdio: ["ignore", "pipe", "pipe"] })
            let output = ""
            proc.stdout.on("data", (data) => { output += data.toString() })
            proc.on("close", () => resolve(output))
            proc.on("error", () => resolve(""))
          })
          for (const line of fcOutput.split("\n")) {
            const trimmed = line.trim()
            if (trimmed.length > 0) {
              fonts.add(trimmed)
            }
          }
        }

        return Array.from(fonts).sort((a, b) => a.localeCompare(b))
      } catch (err: unknown) {
        console.error("[系统字体] 枚举失败", err)
        return []
      }
    }
  )
}

/**
 * 清理 HEIC 转换临时目录。
 * 在应用退出时调用。
 */
export const cleanupHeicTempFiles = async (): Promise<void> => {
  try {
    await rm(getTempDir(), { recursive: true, force: true })
  } catch {
    // 忽略清理失败
  }
}
