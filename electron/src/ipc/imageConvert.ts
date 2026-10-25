import { spawn } from "node:child_process"
import { stat, mkdir, readdir, rm, unlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, extname, basename } from "node:path"
import { Worker as ThreadWorker } from "node:worker_threads"
import { app, ipcMain } from "electron"
import { IPC_CHANNELS } from "../types/desktopApi.js"
import {
  HEIC_CONVERSION_TIMEOUT_MS,
  canLoadBundledHeicModules,
  isHeicFileCountAllowed,
  isHeicDimensionsAllowed,
  isHeicInputSizeAllowed,
  isHeicOutputSizeAllowed,
  isHeicTimeoutAllowed,
  MAX_HEIC_FILES_PER_REQUEST,
  MAX_HEIC_INPUT_BYTES,
  MAX_HEIC_OUTPUT_BYTES,
} from "./heicLimits.js"

/** HEIC/HEIF 扩展名集合。 */
const HEIC_EXTENSIONS = new Set([".heic", ".heif"])
export {
  HEIC_CONVERSION_TIMEOUT_MS,
  MAX_HEIC_FILES_PER_REQUEST,
  MAX_HEIC_INPUT_BYTES,
  MAX_HEIC_OUTPUT_BYTES,
} from "./heicLimits.js"

/** 每个主进程使用独立临时目录，退出清理不会误删其他实例的文件。 */
const TEMP_DIR_PREFIX = "camborder-heic-"
const getTempDir = (): string => join(tmpdir(), `${TEMP_DIR_PREFIX}${process.pid}`)
const TEMP_DIR_NAME = new RegExp(`^${TEMP_DIR_PREFIX}(\\d+)$`)

/** 判断文件是否为 HEIC/HEIF 格式。 */
export const isHeicFile = (filePath: string): boolean =>
  HEIC_EXTENSIONS.has(extname(filePath).toLowerCase())

const ensureTempDir = async (): Promise<string> => {
  const dir = getTempDir()
  await mkdir(dir, { recursive: true })
  return dir
}

const generateTempPath = (originalPath: string): string => {
  const base = basename(originalPath, extname(originalPath)).replace(/[^A-Za-z0-9._-]/g, "_")
  const random = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return join(getTempDir(), `${base}-${random}.png`)
}

/** 能力探测只检查随包模块是否可加载，不依赖操作系统扩展。 */
export const isBundledHeicDecoderAvailable = (): boolean => {
  // require 不仅验证路径存在，也验证 asar/包内依赖和 WASM 助手可以被加载。
  return canLoadBundledHeicModules((moduleName) => require(moduleName))
}

const removeIfExists = async (filePath: string): Promise<void> => {
  try {
    await unlink(filePath)
  } catch {
    // 文件可能尚未创建或已由超时清理。
  }
}

/** 判断临时目录所属进程是否仍存活；权限不足时宁可保留，不能误删活动实例。 */
const isProcessAlive = (pid: number): boolean => {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error: unknown) {
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}

/** 清理上次异常退出遗留的临时目录；只匹配本应用自己的 PID 命名目录。 */
export const cleanupStaleHeicTempFiles = async (): Promise<void> => {
  let entries
  try {
    entries = await readdir(tmpdir(), { withFileTypes: true })
  } catch {
    return
  }
  await Promise.all(entries.map(async (entry) => {
    if (!entry.isDirectory()) return
    const match = TEMP_DIR_NAME.exec(entry.name)
    if (match === null) return
    const pid = Number(match[1])
    if (pid === process.pid || isProcessAlive(pid)) return
    try {
      await rm(join(tmpdir(), entry.name), { recursive: true, force: true })
    } catch {
      // 某个遗留目录清理失败不应阻断本次应用启动或图片转换。
    }
  }))
}

/** 在隔离 worker 中运行随包解码助手；超时会终止 worker，不会静默回退。 */
export const convertWithBundledDecoder = async (
  inputPath: string,
  outputPath: string,
  timeoutMs = HEIC_CONVERSION_TIMEOUT_MS
): Promise<boolean> => {
  if (!isBundledHeicDecoderAvailable() || !isHeicTimeoutAllowed(timeoutMs)) {
    await removeIfExists(outputPath)
    return false
  }

  const workerPath = app.isPackaged
    ? join(process.resourcesPath, "app.asar.unpacked", "dist", "ipc", "heicWorker.js")
    : join(__dirname, "heicWorker.js")
  let heicConvertPath: string
  let pngJsPath: string
  try {
    // 主进程先解析包内模块的绝对路径，再传给解包后的 worker；这样生产包中
    // worker 不会因为位于 app.asar.unpacked 而丢失 app.asar 内的依赖搜索路径。
    heicConvertPath = require.resolve("heic-convert")
    pngJsPath = require.resolve("pngjs")
  } catch {
    await removeIfExists(outputPath)
    return false
  }

  return new Promise<boolean>((resolve) => {
    let settled = false
    let worker: ThreadWorker
    try {
      worker = new ThreadWorker(workerPath, {
        workerData: { inputPath, outputPath, heicConvertPath, pngJsPath }
      })
    } catch {
      // worker 文件缺失或打包路径错误时也必须清理调用方预先创建的半成品。
      void removeIfExists(outputPath).finally(() => resolve(false))
      return
    }
    const finish = async (success: boolean): Promise<void> => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (!success) {
        // 先等待 worker 终止，再删除输出，避免解码线程仍在写入时把半成品重新生成。
        try {
          await worker.terminate()
        } catch {
          // worker 已退出时 terminate 可能返回失败；仍继续清理输出。
        }
        await removeIfExists(outputPath)
      }
      resolve(success)
    }
    const timer = setTimeout(() => {
      void finish(false)
    }, timeoutMs)
    worker.on("message", (message: { readonly ok?: boolean; readonly message?: string }) => {
      if (message.ok !== true && typeof message.message === "string") {
        console.error(`[HEIC] 随包解码 worker 失败：${message.message}`)
      }
      void finish(message.ok === true)
    })
    worker.on("error", (error) => {
      console.error("[HEIC] 随包解码 worker 异常", error)
      void finish(false)
    })
    worker.on("exit", (code) => {
      if (code !== 0) {
        console.error(`[HEIC] 随包解码 worker 退出码：${code}`)
        void finish(false)
      }
    })
  })
}

const convertOneHeic = async (inputPath: string): Promise<string | null> => {
  let inputInfo
  try {
    inputInfo = await stat(inputPath)
  } catch {
    return null
  }
  if (!inputInfo.isFile() || !isHeicInputSizeAllowed(inputInfo.size)) {
    return null
  }
  const tempPath = generateTempPath(inputPath)
  try {
    await ensureTempDir()
    const success = await convertWithBundledDecoder(inputPath, tempPath)
    if (!success) {
      await removeIfExists(tempPath)
      return null
    }
    const outputInfo = await stat(tempPath)
    if (!outputInfo.isFile() || !isHeicOutputSizeAllowed(outputInfo.size)) {
      await removeIfExists(tempPath)
      return null
    }
    return tempPath
  } catch {
    await removeIfExists(tempPath)
    return null
  }
}

/** 注册随包 HEIC 解码和系统字体枚举 IPC handler。 */
export const registerImageConvertIpc = (): void => {
  // 应用崩溃或被强制终止后没有 before-quit 机会；启动时只清理已退出
  // 实例留下的目录，当前实例和仍存活实例的临时结果都会保留。
  void cleanupStaleHeicTempFiles()

  ipcMain.handle(
    IPC_CHANNELS.CONVERT_HEIC_FILES,
    async (_event, paths: readonly string[]): Promise<(string | null)[]> => {
      if (!Array.isArray(paths) || paths.length === 0) return []
      if (!isHeicFileCountAllowed(paths.length)) {
        throw new Error(`HEIC 文件数量不能超过 ${MAX_HEIC_FILES_PER_REQUEST}`)
      }
      const results: (string | null)[] = []
      for (const filePath of paths) {
        if (typeof filePath !== "string" || filePath.trim().length === 0) {
          results.push(null)
        } else if (!isHeicFile(filePath)) {
          results.push(filePath)
        } else {
          results.push(await convertOneHeic(filePath))
        }
      }
      return results
    }
  )

  ipcMain.handle(IPC_CHANNELS.PROBE_HEIC_DECODER, async (): Promise<boolean> =>
    isBundledHeicDecoderAvailable())

  /**
   * 系统字体枚举：
   * - macOS：扫描 /Library/Fonts、/System/Library/Fonts、~/Library/Fonts
   * - Windows：扫描 C:\\Windows\\Fonts
   * - Linux：执行 fc-list 命令
   */
  ipcMain.handle(IPC_CHANNELS.LIST_SYSTEM_FONTS, async (): Promise<string[]> => {
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
              const name = basename(entry.name, ext)
                .replace(/[-_](Bold|Italic|Regular|Light|Medium|Semibold|Thin|Black|Oblique|Heavy|Ultra|Condensed|Extended|Narrow|Wide)$/gi, "")
                .replace(/[-_]/g, " ")
                .trim()
              if (name.length > 0) fonts.add(name)
            }
          } catch {
            // 目录不存在或不可读时跳过。
          }
        }
      } else if (platform === "linux") {
        const fcOutput = await new Promise<string>((resolve) => {
          const proc = spawn("fc-list", [":", "family"], { stdio: ["ignore", "pipe", "pipe"] })
          let output = ""
          proc.stdout.on("data", (data) => { output += data.toString() })
          proc.on("close", () => resolve(output))
          proc.on("error", () => resolve(""))
        })
        for (const line of fcOutput.split("\n")) {
          const trimmed = line.trim()
          if (trimmed.length > 0) fonts.add(trimmed)
        }
      }
      return Array.from(fonts).sort((a, b) => a.localeCompare(b))
    } catch (error: unknown) {
      console.error("[系统字体] 枚举失败", error)
      return []
    }
  })
}

/** 清理本主进程产生的 HEIC 临时文件；不会触碰源码或用户照片。 */
export const cleanupHeicTempFiles = async (): Promise<void> => {
  try {
    await rm(getTempDir(), { recursive: true, force: true })
  } catch {
    // 应用退出时尽力清理；失败不会覆盖真正的退出原因。
  }
}
