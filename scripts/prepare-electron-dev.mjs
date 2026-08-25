import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

/** 判断当前平台是否需要为本地 Electron 开发运行时做准备。 */
export const shouldPrepareElectronDev = (platform) => platform === "darwin"

/** 根据 Electron npm 包目录计算平台对应的可执行文件路径。 */
export const getElectronBinaryPath = (packageDir, platform) => {
  if (platform === "darwin") {
    return join(packageDir, "dist", "Electron.app", "Contents", "MacOS", "Electron")
  }
  if (platform === "win32") {
    return join(packageDir, "dist", "electron.exe")
  }
  return join(packageDir, "dist", "electron")
}

/** 返回 macOS Electron.app 路径；其他平台不需要签名准备。 */
export const getElectronAppPath = (packageDir, platform) => {
  if (!shouldPrepareElectronDev(platform)) {
    return null
  }
  return join(packageDir, "dist", "Electron.app")
}

const runCommand = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: "inherit", ...options })
  if (result.error !== undefined) {
    throw new Error(`执行 ${command} 失败：${result.error.message}`)
  }
  return result
}

const resolveElectronPackageDir = () => {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  const electronRequire = createRequire(join(repositoryRoot, "electron", "package.json"))
  return dirname(electronRequire.resolve("electron/package.json"))
}

/**
 * 准备本地 Electron 开发运行时。
 *
 * Electron npm 包的 macOS 开发包不是正式发行应用，部分 macOS 版本会拒绝
 * 直接运行其 ad-hoc 签名。这里只处理 node_modules 内的开发副本，不影响
 * electron-builder 的正式签名、公证和发布流程。
 */
export const prepareElectronDev = ({
  platform = process.platform,
  packageDir = resolveElectronPackageDir()
} = {}) => {
  if (!shouldPrepareElectronDev(platform)) {
    return null
  }

  const binaryPath = getElectronBinaryPath(packageDir, platform)
  const appPath = getElectronAppPath(packageDir, platform)
  if (appPath === null) {
    return null
  }

  if (!existsSync(binaryPath)) {
    const installScript = join(packageDir, "install.js")
    console.log("[electron-dev] Electron.app 不完整，正在恢复官方开发运行时…")
    runCommand(process.execPath, [installScript])
  }

  if (!existsSync(binaryPath)) {
    throw new Error(`Electron 开发运行时恢复失败：找不到 ${binaryPath}`)
  }

  // 下载归档可能继承隔离属性；仅清理本地 node_modules 内的 Electron 副本。
  runCommand("xattr", ["-dr", "com.apple.quarantine", appPath], { stdio: "ignore" })

  const verification = runCommand(
    "codesign",
    ["--verify", "--deep", "--strict", appPath],
    { stdio: "ignore" }
  )
  if (verification.status !== 0) {
    console.log("[electron-dev] 正在修复本地 Electron 的 ad-hoc 签名…")
    runCommand("codesign", ["--force", "--deep", "--sign", "-", appPath])
  }

  const finalVerification = runCommand(
    "codesign",
    ["--verify", "--deep", "--strict", appPath],
    { stdio: "ignore" }
  )
  if (finalVerification.status !== 0) {
    throw new Error("Electron 开发运行时签名校验失败，请重新执行 pnpm install")
  }

  return binaryPath
}

const currentFile = fileURLToPath(import.meta.url)
if (process.argv[1] !== undefined && resolve(process.argv[1]) === currentFile) {
  try {
    prepareElectronDev()
  } catch (error) {
    console.error(`[electron-dev] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
