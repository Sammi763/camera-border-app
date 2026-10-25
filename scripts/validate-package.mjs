import { createHash } from "node:crypto"
import { readdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { inflateRawSync } from "node:zlib"

const filePath = (root, ...parts) => path.join(root, ...parts)

const requireFile = async (candidate, label) => {
  let info
  try {
    info = await stat(candidate)
  } catch {
    throw new Error(`打包资源缺失：${label}（${candidate}）`)
  }
  if (!info.isFile() || info.size === 0) throw new Error(`打包资源无效：${label}（${candidate}）`)
  return candidate
}

const requireDirectory = async (candidate, label) => {
  let info
  try {
    info = await stat(candidate)
  } catch {
    throw new Error(`打包目录缺失：${label}（${candidate}）`)
  }
  if (!info.isDirectory()) throw new Error(`打包目录无效：${label}（${candidate}）`)
  return candidate
}

const sha256File = async (candidate) => createHash("sha256").update(await readFile(candidate)).digest("hex")

const readJson = async (candidate, label) => {
  await requireFile(candidate, label)
  try {
    return JSON.parse(await readFile(candidate, "utf8"))
  } catch (error) {
    throw new Error(`${label} 不是有效 JSON：${error instanceof Error ? error.message : String(error)}`)
  }
}

const readReleaseProperties = async (candidate) => {
  const content = await readFile(candidate, "utf8")
  return Object.fromEntries(content.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z_]+)="(.*)"$/)
    return match === null ? [] : [[match[1], match[2]]]
  }))
}

const readZipEntry = async (candidate, entryName) => {
  const archive = await readFile(candidate)
  const minimumEndRecordOffset = Math.max(0, archive.length - 65_557)
  let endRecord = -1
  for (let offset = archive.length - 22; offset >= minimumEndRecordOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) {
      endRecord = offset
      break
    }
  }
  if (endRecord < 0) return null
  const entryCount = archive.readUInt16LE(endRecord + 10)
  const centralDirectorySize = archive.readUInt32LE(endRecord + 12)
  const centralDirectoryOffset = archive.readUInt32LE(endRecord + 16)
  let offset = centralDirectoryOffset
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize
  for (let index = 0; index < entryCount && offset + 46 <= centralDirectoryEnd; index += 1) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) return null
    const compression = archive.readUInt16LE(offset + 10)
    const compressedSize = archive.readUInt32LE(offset + 20)
    const nameLength = archive.readUInt16LE(offset + 28)
    const extraLength = archive.readUInt16LE(offset + 30)
    const commentLength = archive.readUInt16LE(offset + 32)
    const localHeaderOffset = archive.readUInt32LE(offset + 42)
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString("utf8")
    if (name === entryName) {
      if (localHeaderOffset + 30 > archive.length || archive.readUInt32LE(localHeaderOffset) !== 0x04034b50) return null
      const localNameLength = archive.readUInt16LE(localHeaderOffset + 26)
      const localExtraLength = archive.readUInt16LE(localHeaderOffset + 28)
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength
      const dataEnd = dataStart + compressedSize
      if (dataStart < 0 || dataEnd > archive.length) return null
      const compressed = archive.subarray(dataStart, dataEnd)
      if (compression === 0) return compressed
      if (compression === 8) return inflateRawSync(compressed)
      return null
    }
    offset += 46 + nameLength + extraLength + commentLength
  }
  return null
}

const readJarManifestValue = async (candidate, key) => {
  const entry = await readZipEntry(candidate, "META-INF/MANIFEST.MF")
  if (entry === null) return null
  const content = entry.toString("latin1")
  const match = content.match(new RegExp(`(?:^|\\r?\\n)${key}: ([^\\r\\n]+)`))
  return match?.[1]?.trim() ?? null
}

const runtimeArchitecture = (value) => value === "aarch64" ? "arm64" : value === "x86_64" ? "x64" : null

const requirePeX64 = async (candidate, label) => {
  const content = await readFile(await requireFile(candidate, label))
  const peOffset = content.length >= 0x40 ? content.readUInt32LE(0x3c) : -1
  const valid = peOffset >= 0 && peOffset + 6 <= content.length
    && content.toString("ascii", peOffset, peOffset + 4) === "PE\0\0"
    && content.readUInt16LE(peOffset + 4) === 0x8664
  if (!valid) throw new Error(`${label} 不是 x64 PE`)
  return candidate
}

const machOArchitectures = (content) => {
  if (content.length < 8) return []
  const magic = content.readUInt32BE(0)
  const cpu = (value) => value === 0x0100000c ? "arm64" : value === 0x01000007 ? "x64" : null
  if (magic === 0xfeedface || magic === 0xfeedfacf
      || magic === 0xcefaedfe || magic === 0xcffaedfe) {
    const little = magic === 0xcefaedfe || magic === 0xcffaedfe
    const value = little ? content.readUInt32LE(4) : content.readUInt32BE(4)
    return [cpu(value)].filter(Boolean)
  }
  if (magic === 0xcafebabe || magic === 0xbebafeca) {
    const little = magic === 0xbebafeca
    const count = little ? content.readUInt32LE(4) : content.readUInt32BE(4)
    const result = []
    for (let index = 0; index < count; index += 1) {
      const offset = 8 + index * 20
      if (offset + 4 > content.length) break
      const value = little ? content.readUInt32LE(offset) : content.readUInt32BE(offset)
      const architecture = cpu(value)
      if (architecture !== null) result.push(architecture)
    }
    return result
  }
  return []
}

const requireMachOArch = async (candidate, arch, label) => {
  const architectures = machOArchitectures(await readFile(await requireFile(candidate, label)))
  if (!architectures.includes(arch)) throw new Error(`${label} 不包含目标 macOS ${arch} 架构`)
  return candidate
}

const javaRelativePath = (platform) => platform === "win32"
  ? ["java-runtime", "bin", "java.exe"]
  : ["java-runtime", "Contents", "Home", "bin", "java"]

const javaReleaseRelativePath = (platform) => platform === "win32"
  ? ["java-runtime", "release"]
  : ["java-runtime", "Contents", "Home", "release"]

const javaNoticeRelativePath = (platform) => platform === "win32"
  ? ["java-runtime", "NOTICE"]
  : ["java-runtime", "Contents", "Home", "NOTICE"]

const javaEngineRelativePath = (installed) => installed
  ? ["java-engine", "camera-border-engine.jar"]
  : ["java-engine.jar"]

const exifToolRelativePath = (platform) => platform === "win32"
  ? ["professional-tools", "exiftool", "win-x64", "exiftool.exe"]
  : ["professional-tools", "exiftool", "macos", "exiftool"]

const validateFonts = async (bundleDir) => {
  const manifestPath = filePath(bundleDir, "professional-tools", "fonts", "fonts.json")
  const manifest = await readJson(manifestPath, "professional-tools/fonts/fonts.json")
  if (!Array.isArray(manifest.fonts) || manifest.fonts.length === 0) throw new Error("随包字体清单为空")
  for (const font of manifest.fonts) {
    if (!font || typeof font.file !== "string" || typeof font.licenseFile !== "string") {
      throw new Error("随包字体清单字段不完整")
    }
    const fontPath = filePath(bundleDir, "professional-tools", "fonts", font.file)
    await requireFile(fontPath, `字体 ${font.file}`)
    if (typeof font.sha256 !== "string" || await sha256File(fontPath) !== font.sha256) {
      throw new Error(`字体 SHA-256 不匹配：${font.file}`)
    }
    await requireFile(filePath(bundleDir, "professional-tools", font.licenseFile), `字体许可证 ${font.licenseFile}`)
  }
  return manifest
}

const validateInstalledHeicResources = async (bundleDir) => {
  await requireFile(
    filePath(bundleDir, "app.asar.unpacked", "dist", "ipc", "heicWorker.js"),
    "app.asar.unpacked/dist/ipc/heicWorker.js"
  )
  const archivePath = filePath(bundleDir, "app.asar")
  await requireFile(archivePath, "app.asar")
  for (const packageName of ["heic-convert", "heic-decode", "libheif-js", "jpeg-js", "pngjs"]) {
    const unpackedPath = filePath(bundleDir, "app.asar.unpacked", "node_modules", packageName, "package.json")
    try {
      await requireFile(unpackedPath, `app.asar.unpacked/node_modules/${packageName}/package.json`)
    } catch {
      const archivedPath = `node_modules/${packageName}/package.json`
      if (!await asarContains(archivePath, archivedPath)) {
        throw new Error(`HEIC 解码助手缺失：${archivedPath}`)
      }
    }
  }
}

const validateBundle = async ({ bundleDir, platform, arch, installed = false }) => {
  await requireDirectory(bundleDir, "runtime-bundle")
  await requireFile(filePath(bundleDir, "frontend", "index.html"), "frontend/index.html")
  const javaEngine = filePath(bundleDir, ...javaEngineRelativePath(installed))
  await requireFile(javaEngine, "Java Engine")
  const javaEngineVersion = await readJarManifestValue(javaEngine, "Implementation-Version")
  if (javaEngineVersion === null) throw new Error("Java Engine 缺少 Implementation-Version")
  const java = filePath(bundleDir, ...javaRelativePath(platform))
  const javaRelease = filePath(bundleDir, ...javaReleaseRelativePath(platform))
  await requireFile(javaRelease, "JRE release")
  await requireFile(filePath(bundleDir, ...javaNoticeRelativePath(platform)), "JRE NOTICE")
  const releaseProperties = await readReleaseProperties(javaRelease)
  const expectedRuntimeArch = arch === "arm64" ? "aarch64" : "x86_64"
  if (releaseProperties.OS_ARCH !== expectedRuntimeArch) {
    throw new Error(`JRE release 架构不匹配：期望 ${expectedRuntimeArch}，实际 ${releaseProperties.OS_ARCH ?? "缺失"}`)
  }
  if (typeof releaseProperties.IMPLEMENTOR !== "string" || typeof releaseProperties.JAVA_RUNTIME_VERSION !== "string") {
    throw new Error("JRE release 缺少 vendor 或 version")
  }
  if (platform === "win32") await requirePeX64(java, "java-runtime/bin/java.exe")
  else await requireMachOArch(java, arch, "java-runtime/Contents/Home/bin/java")

  const exifTool = filePath(bundleDir, ...exifToolRelativePath(platform))
  if (platform === "win32") await requirePeX64(exifTool, "professional-tools/exiftool/win-x64/exiftool.exe")
  else await requireFile(exifTool, "professional-tools/exiftool/macos/exiftool")
  const components = await readJson(
    filePath(bundleDir, "professional-tools", "components.json"),
    "professional-tools/components.json"
  )
  if (!components.components?.exiftool || !components.components?.["twelvemonkeys-imageio"]) {
    throw new Error("professional-components.json 缺少 ExifTool 或 TwelveMonkeys")
  }
  await readJson(filePath(bundleDir, "professional-tools", "heic-components.json"), "professional-tools/heic-components.json")
  await validateFonts(bundleDir)
  const licenses = await requireDirectory(filePath(bundleDir, "professional-tools", "licenses"), "professional-tools/licenses")
  if ((await readdir(licenses)).length === 0) throw new Error("专业组件许可证目录为空")
  await requireFile(filePath(licenses, "THIRD-PARTY-NOTICES.md"), "第三方组件声明")
  await requireFile(filePath(licenses, "ExifTool-LICENSE.txt"), "ExifTool 许可证")
  await requireFile(filePath(licenses, "TwelveMonkeys-LICENSE.txt"), "TwelveMonkeys 许可证")
  if (installed) await validateInstalledHeicResources(bundleDir)
  const javaLegal = filePath(bundleDir, "java-runtime", platform === "win32" ? "legal" : "Contents", ...(platform === "win32" ? [] : ["Home", "legal"]))
  await requireDirectory(javaLegal, "JRE legal")
  return {
    java,
    exifTool,
    components,
    javaEngineVersion,
    javaRuntime: {
      vendor: releaseProperties.IMPLEMENTOR,
      version: releaseProperties.JAVA_RUNTIME_VERSION,
      arch: runtimeArchitecture(releaseProperties.OS_ARCH)
    }
  }
}

const asarContains = async (archivePath, relativePath) => {
  try {
    const archive = await readFile(archivePath)
    if (archive.length < 12) return false
    const headerSize = archive.readUInt32LE(4)
    const headerStart = 8
    const headerEnd = headerStart + headerSize
    if (headerEnd > archive.length) return false
    const headerPickle = archive.subarray(headerStart, headerEnd)
    if (headerPickle.length < 8) return false
    const jsonLength = headerPickle.readUInt32LE(4)
    const jsonStart = 8
    const header = JSON.parse(headerPickle.subarray(jsonStart, jsonStart + jsonLength).toString("utf8"))
    let entries = header.files
    const parts = relativePath.split("/").filter(Boolean)
    for (const [index, part] of parts.entries()) {
      const entry = entries?.[part]
      if (entry === undefined) return false
      if (index === parts.length - 1) return true
      entries = entry.files
      if (entries === undefined) return false
    }
    return false
  } catch {
    return false
  }
}

const findSingle = async (directory, predicate, label) => {
  const matches = []
  const walk = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const candidate = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (predicate(candidate, entry.name)) matches.push(candidate)
        else await walk(candidate)
      } else if (predicate(candidate, entry.name)) matches.push(candidate)
    }
  }
  await walk(directory)
  if (matches.length !== 1) throw new Error(`${label} 必须唯一，当前找到 ${matches.length} 个`)
  return matches[0]
}

const outputResourceRoot = async ({ outputDir, platform, arch }) => {
  if (platform === "win32") return filePath(outputDir, "win-unpacked", "resources")
  const appBundle = await findSingle(outputDir, (candidate, name) => name === "Camera Border.app", "macOS .app")
  return filePath(appBundle, "Contents", "Resources")
}

const findInstaller = async ({ outputDir, platform, version, arch }) => {
  const extension = platform === "win32" ? ".exe" : ".dmg"
  const expected = platform === "win32"
    ? `Camera-Border-Setup-${version}-${arch}${extension}`
    : `Camera-Border-${version}-${arch}${extension}`
  const candidate = filePath(outputDir, expected)
  await requireFile(candidate, expected)
  return candidate
}

const createManifest = async ({ bundleDir, installerPath, platform, arch, version, commit, installed = false }) => {
  const components = await readJson(filePath(bundleDir, "professional-tools", "components.json"), "components.json")
  const javaPath = filePath(bundleDir, ...javaRelativePath(platform))
  const javaEnginePath = filePath(bundleDir, ...javaEngineRelativePath(installed))
  const exifPath = filePath(bundleDir, ...exifToolRelativePath(platform))
  const fontManifest = await readJson(filePath(bundleDir, "professional-tools", "fonts", "fonts.json"), "fonts.json")
  const heicManifest = await readJson(filePath(bundleDir, "professional-tools", "heic-components.json"), "heic-components.json")
  const javaRelease = await readReleaseProperties(filePath(bundleDir, ...javaReleaseRelativePath(platform)))
  const javaEngineVersion = await readJarManifestValue(javaEnginePath, "Implementation-Version")
  if (javaEngineVersion === null) throw new Error("Java Engine 缺少 Implementation-Version")
  const manifest = {
    schemaVersion: 1,
    appName: "Camera Border",
    version,
    appVersion: version,
    platform,
    arch,
    commit: commit || "local",
    installer: installerPath === null ? null : {
      file: path.basename(installerPath),
      bytes: (await stat(installerPath)).size,
      sha256: await sha256File(installerPath)
    },
    components: {
      javaEngine: {
        file: javaEngineRelativePath(installed).join("/"),
        version: javaEngineVersion,
        sha256: await sha256File(javaEnginePath)
      },
      javaRuntime: {
        file: javaRelativePath(platform).join("/"),
        vendor: javaRelease.IMPLEMENTOR,
        version: javaRelease.JAVA_RUNTIME_VERSION,
        arch: runtimeArchitecture(javaRelease.OS_ARCH),
        sha256: await sha256File(javaPath)
      },
      exiftool: {
        file: exifToolRelativePath(platform).join("/"),
        version: components.components.exiftool.version,
        license: components.components.exiftool.license,
        sha256: await sha256File(exifPath)
      },
      twelveMonkeys: components.components["twelvemonkeys-imageio"],
      heic: heicManifest,
      fonts: fontManifest.fonts
    },
    generatedAt: new Date().toISOString()
  }
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
  const platform = readArg(args, "--platform")
  const arch = readArg(args, "--arch")
  const version = readArg(args, "--version")
  const commit = readArg(args, "--commit")
  if (bundleDir === undefined || platform === undefined || arch === undefined) {
    throw new Error("需要 --bundle、--platform 和 --arch")
  }
  await validateBundle({ bundleDir, platform, arch })
  const resourceManifest = await createManifest({ bundleDir, installerPath: null, platform, arch, version, commit })
  await writeFile(filePath(bundleDir, "package-manifest.json"), `${JSON.stringify(resourceManifest, null, 2)}\n`, "utf8")
  if (outputDir !== undefined) {
    if (version === undefined) throw new Error("校验安装包时必须提供 --version")
    const installerPath = await findInstaller({ outputDir, platform, version, arch })
    const resourceRoot = await outputResourceRoot({ outputDir, platform, arch })
    await validateBundle({ bundleDir: resourceRoot, platform, arch, installed: true })
    await requireFile(filePath(resourceRoot, "package-manifest.json"), "安装包内 package-manifest.json")
    const manifest = await createManifest({
      bundleDir: resourceRoot,
      installerPath,
      platform,
      arch,
      version,
      commit,
      installed: true
    })
    const baseName = path.basename(installerPath)
    await writeFile(filePath(outputDir, `${baseName}.sha256`), `${manifest.installer.sha256}  ${baseName}\n`, "utf8")
    await writeFile(filePath(outputDir, `${baseName}.manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
    console.log(JSON.stringify(manifest, null, 2))
  } else {
    console.log(JSON.stringify(resourceManifest, null, 2))
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`[package-check] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}

export { createManifest, validateBundle, machOArchitectures }
