import { app, ipcMain } from "electron"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { engineJarPath, javaRuntimeDir, professionalToolsDir } from "../paths/paths.js"
import { resolveBundledExifToolExecutable, resolveBundledJavaExecutable } from "../engine/engineRuntime.js"
import { isBundledHeicDecoderAvailable } from "./imageConvert.js"
import { IPC_CHANNELS, type PackageCapabilities } from "../types/desktopApi.js"

/** 返回安全的安装包能力摘要，不把资源路径交给渲染进程。 */
export const readPackageCapabilities = (): PackageCapabilities => {
  const fontsPath = path.join(professionalToolsDir, "fonts", "fonts.json")
  let bundledFonts: string[] = []
  try {
    const parsed = JSON.parse(readFileSync(fontsPath, "utf8")) as { fonts?: Array<{ family?: string; file?: string }> }
    bundledFonts = (parsed.fonts ?? [])
      .filter((font) => typeof font.family === "string" && typeof font.file === "string"
        && existsSync(path.join(professionalToolsDir, "fonts", font.file)))
      .map((font) => font.family as string)
  } catch {
    bundledFonts = []
  }
  const runtimeRoot = process.platform === "darwin"
    ? path.join(javaRuntimeDir, "Contents", "Home")
    : javaRuntimeDir
  const bundledRuntime = existsSync(engineJarPath)
    && resolveBundledJavaExecutable() !== null
    && existsSync(path.join(runtimeRoot, "release"))
    && existsSync(path.join(runtimeRoot, "NOTICE"))
  return {
    isPackaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch,
    bundledRuntime,
    bundledExifTool: resolveBundledExifToolExecutable() !== null,
    bundledHeicDecoder: isBundledHeicDecoderAvailable(),
    bundledFonts
  }
}

export const registerPackageCapabilitiesIpc = (): void => {
  ipcMain.handle(IPC_CHANNELS.GET_PACKAGE_CAPABILITIES, () => readPackageCapabilities())
}
