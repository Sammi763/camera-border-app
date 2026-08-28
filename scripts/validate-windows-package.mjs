import { createHash } from "node:crypto"
import { readdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"

const REQUIRED_BUNDLE_FILES = Object.freeze({
  frontend: ["frontend", "index.html"],
  engineJar: ["java-engine.jar"],
  javaExecutable: ["java-runtime", "bin", "java.exe"]
})

const filePath = (root, parts) => path.join(root, ...parts)

const requireFile = async (candidate, label) => {
  let info
  try {
    info = await stat(candidate)
  } catch {
    throw new Error(`Windows 打包资源缺失：${label}（${candidate}）`)
  }
  if (!info.isFile() || info.size === 0) {
    throw new Error(`Windows 打包资源无效：${label}（${candidate}）`)
  }
  return candidate
}

const requireX64PeFile = async (candidate, label) => {
  await requireFile(candidate, label)
  let content
  try {
    content = await readFile(candidate)
  } catch {
    throw new Error(`Windows 打包资源无法读取：${label}（${candidate}）`)
  }

  const peOffset = content.length >= 0x40 ? content.readUInt32LE(0x3c) : -1
  const hasPeSignature = peOffset >= 0 && peOffset + 6 <= content.length && content.toString("ascii", peOffset, peOffset + 4) === "PE\0\0"
  const machine = hasPeSignature ? content.readUInt16LE(peOffset + 4) : 0
  if (machine !== 0x8664) {
    throw new Error(`Windows 打包资源不是有效的 x64 PE：${label}（${candidate}）`)
  }
  return candidate
}

/** 校验待复制到 extraResources 的 Windows 资源目录。 */
export const validateWindowsBundle = async (bundleDir) => ({
  frontend: await requireFile(filePath(bundleDir, REQUIRED_BUNDLE_FILES.frontend), "frontend/index.html"),
  engineJar: await requireFile(filePath(bundleDir, REQUIRED_BUNDLE_FILES.engineJar), "java-engine.jar"),
  javaExecutable: await requireX64PeFile(
    filePath(bundleDir, REQUIRED_BUNDLE_FILES.javaExecutable),
    "java-runtime/bin/java.exe"
  )
})

/** 校验 electron-builder 生成的 win-unpacked 资源目录。 */
export const validateWindowsUnpacked = async (unpackedDir) => {
  const resourcesDir = path.join(unpackedDir, "resources")
  await requireX64PeFile(path.join(unpackedDir, "Camera Border.exe"), "Camera Border.exe")
  await requireFile(path.join(resourcesDir, "frontend", "index.html"), "resources/frontend/index.html")
  await requireFile(
    path.join(resourcesDir, "java-engine", "camera-border-engine.jar"),
    "resources/java-engine/camera-border-engine.jar"
  )
  await requireX64PeFile(
    path.join(resourcesDir, "java-runtime", "bin", "java.exe"),
    "resources/java-runtime/bin/java.exe"
  )
  return true
}

/**
 * 查找唯一的 Windows NSIS 安装器。
 * 输出目录中如果残留旧 exe，直接失败，避免把错误版本发给测试用户。
 */
export const findWindowsInstaller = async (outputDir, version) => {
  const names = (await readdir(outputDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".exe"))
    .map((entry) => entry.name)
  const expectedName = `Camera-Border-Setup-${version}-x64.exe`
  if (names.length !== 1 || names[0] !== expectedName) {
    throw new Error(
      `Windows 安装包必须是唯一的 ${expectedName}，当前找到：${names.join(", ") || "无"}`
    )
  }
  return path.join(outputDir, expectedName)
}

const sha256File = async (filePathValue) => {
  const content = await readFile(filePathValue)
  return createHash("sha256").update(content).digest("hex")
}

/** 生成供人工核对和上传的 Windows 构建清单。 */
export const createWindowsManifest = async ({ installerPath, version, commit, outputDir }) => {
  const info = await stat(installerPath)
  const manifest = {
    appName: "Camera Border",
    version,
    platform: "win32",
    arch: "x64",
    installer: {
      file: path.basename(installerPath),
      bytes: info.size,
      sha256: await sha256File(installerPath)
    },
    commit: commit || "local",
    // 签名状态由调用方/环境决定：FORCE_UNSIGNED=1 强制未签名；CSC_LINK+CSC_KEY_PASSWORD 表示正式签名。
    // 未签名测试包在 manifest 中明确标记 signed=false，发布前会替换为真实签名证据。
    signed: process.env.FORCE_UNSIGNED === "1" || process.env.FORCE_UNSIGNED === "true"
      ? false
      : Boolean(process.env.CSC_LINK && process.env.CSC_KEY_PASSWORD),
    signed: false,
    installerType: "nsis",
    generatedAt: new Date().toISOString()
  }
  const manifestPath = path.join(outputDir, `Camera-Border-Setup-${version}-x64.manifest.json`)
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  await writeFile(
    `${installerPath}.sha256`,
    `${manifest.installer.sha256}  ${path.basename(installerPath)}\n`,
    "utf8"
  )
  return manifest
}

const readArg = (args, name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const main = async () => {
  const args = process.argv.slice(2)
  const bundleDir = readArg(args, "--bundle")
  const outputDir = readArg(args, "--output")
  const version = readArg(args, "--version")
  const commit = readArg(args, "--commit")

  if (bundleDir !== undefined) {
    console.log(JSON.stringify(await validateWindowsBundle(bundleDir), null, 2))
  }
  if (outputDir !== undefined) {
    if (version === undefined) {
      throw new Error("校验安装包时必须提供 --version")
    }
    const installerPath = await findWindowsInstaller(outputDir, version)
    await validateWindowsUnpacked(path.join(outputDir, "win-unpacked"))
    const manifest = await createWindowsManifest({ installerPath, version, commit, outputDir })
    console.log(JSON.stringify(manifest, null, 2))
  }
  if (bundleDir === undefined && outputDir === undefined) {
    throw new Error("至少需要提供 --bundle 或 --output")
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`[package-check] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
