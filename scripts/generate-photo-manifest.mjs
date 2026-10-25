import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const DEFAULT_INPUT = path.join(ROOT, "photos")
const DEFAULT_EXIFTOOL = path.join(ROOT, "professional-tools", "exiftool", "macos", "exiftool")
const DEFAULT_EXPECTED_COUNT = 15
const execFileAsync = promisify(execFile)

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".tif", ".tiff", ".arw"])

const readArg = (args, name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const relativePhotoPath = (inputRoot, filePath) => path.relative(ROOT, filePath).split(path.sep).join("/")

const extensionFormat = (extension, exifRecord) => {
  const type = String(exifValue(exifRecord, "FileType") ?? "").toUpperCase()
  if (type.includes("ARW")) return "ARW"
  if (type.includes("TIFF") || type === "TIF") return "TIFF"
  if (type.includes("JPEG") || type === "JPG") return "JPEG"
  if (extension === ".arw") return "ARW"
  if (extension === ".tif" || extension === ".tiff") return "TIFF"
  return "JPEG"
}

const exifValue = (record, suffix) => Object.entries(record ?? {})
  .find(([key]) => key === suffix || key.endsWith(`:${suffix}`))?.[1] ?? null

const keysForGroup = (record, group) => Object.keys(record ?? {})
  .filter((key) => key === group || key.startsWith(`${group}:`) || key.startsWith(`${group}-`) || key.startsWith(`${group}_`))

const hasGroup = (record, groups) => groups.some((group) => keysForGroup(record, group).length > 0)

const parseDimensions = (width, height) => {
  const parsedWidth = Number(width)
  const parsedHeight = Number(height)
  if (!Number.isInteger(parsedWidth) || parsedWidth <= 0 || !Number.isInteger(parsedHeight) || parsedHeight <= 0) {
    return null
  }
  return { width: parsedWidth, height: parsedHeight }
}

const parseBitDepth = (value) => {
  const values = Array.isArray(value)
    ? value.flatMap((item) => String(item).match(/\d+/g) ?? []).map(Number)
    : String(value ?? "").match(/\d+/g)?.map(Number) ?? []
  const valid = values.filter((item) => Number.isInteger(item) && item > 0)
  return valid.length === 0 ? null : Math.max(...valid)
}

const parseBinaryByteCount = (value) => {
  const match = String(value ?? "").match(/Binary data (\d+) bytes/i)
  return match === null ? null : Number.parseInt(match[1], 10)
}

const readJpegDimensions = (data) => {
  if (!Buffer.isBuffer(data) || data.length < 10 || data[0] !== 0xff || data[1] !== 0xd8) return null
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
  ])
  let offset = 2
  while (offset + 3 < data.length) {
    if (data[offset] !== 0xff) {
      offset++
      continue
    }
    while (offset < data.length && data[offset] === 0xff) offset++
    const marker = data[offset]
    if (marker === undefined) break
    if (marker === 0x01 || marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset++
      continue
    }
    if (offset + 3 >= data.length) break
    const segmentLength = data.readUInt16BE(offset + 1)
    if (segmentLength < 2 || offset + segmentLength + 1 > data.length) break
    if (startOfFrameMarkers.has(marker)) {
      const height = data.readUInt16BE(offset + 4)
      const width = data.readUInt16BE(offset + 6)
      return parseDimensions(width, height)
    }
    offset += segmentLength + 1
  }
  return null
}

const runText = async (executable, args, description) => {
  try {
    const result = await execFileAsync(executable, args, {
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
      windowsHide: true
    })
    return result.stdout
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`${description}失败：${detail}`)
  }
}

const runBinary = async (executable, args, description) => {
  try {
    const result = await execFileAsync(executable, args, {
      encoding: "buffer",
      maxBuffer: 128 * 1024 * 1024,
      windowsHide: true
    })
    return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`${description}失败：${detail}`)
  }
}

const readExifRecord = async (exifTool, filePath) => {
  const output = await runText(exifTool, ["-j", "-a", "-u", "-G1", "-s", "-n", "--", filePath], `ExifTool 读取 ${filePath}`)
  let parsed
  try {
    parsed = JSON.parse(output)
  } catch (error) {
    throw new Error(`ExifTool 输出不是有效 JSON：${error instanceof Error ? error.message : String(error)}`)
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed[0] === null || typeof parsed[0] !== "object") {
    throw new Error(`ExifTool 没有返回 ${filePath} 的文件事实`)
  }
  return parsed[0]
}

const readExifToolVersion = async (exifTool) => (await runText(exifTool, ["-ver"], "ExifTool 版本读取")).trim()

const readIccProfile = async (exifTool, filePath) => {
  const data = await runBinary(exifTool, ["-b", "-ICC_Profile", "--", filePath], `ICC Profile 读取 ${filePath}`)
  return { present: data.length > 0, bytes: data.length }
}

/** 校验 RAW 的容器事实与独立 JpgFromRaw 二进制，拒绝缺方向或空内嵌 JPEG。 */
export const validateRawEmbeddedJpeg = (record, embeddedData) => {
  const orientation = Number(exifValue(record, "Orientation"))
  if (orientation !== 8) throw new Error("ARW 缺少要求的 Orientation=8")
  const selectorValue = exifValue(record, "JpgFromRaw")
  if (parseBinaryByteCount(selectorValue) === null) throw new Error("ARW 缺少 JpgFromRaw 元数据入口")
  if (!Buffer.isBuffer(embeddedData) || embeddedData.length === 0) throw new Error("ARW 的 JpgFromRaw 为空")
  if (embeddedData[0] !== 0xff || embeddedData[1] !== 0xd8) throw new Error("ARW 的 JpgFromRaw 不是 JPEG")
  const dimensions = readJpegDimensions(embeddedData)
  if (dimensions === null) throw new Error("ARW 的 JpgFromRaw JPEG 缺少有效像素尺寸")
  return dimensions
}

/** 只接受文件集合与哈希事实，防止执行器把额外文件或缺失文件静默吞掉。 */
export const listPhotoFiles = async (inputRoot, expectedCount = DEFAULT_EXPECTED_COUNT) => {
  const entries = await readdir(inputRoot, { withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(inputRoot, entry.name))
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right), undefined, { numeric: true, sensitivity: "base" }))
  if (files.length !== expectedCount) {
    throw new Error(`照片文件清单数量不符：期望 ${expectedCount}，实际 ${files.length}`)
  }
  return files
}

const hashFile = async (filePath) => createHash("sha256").update(await readFile(filePath)).digest("hex")

/** 重新读取全部源文件并比较执行前后哈希；任何不一致都必须使基线失败。 */
export const verifySourceHashes = (before, after) => {
  const paths = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort()
  const mismatches = paths.filter((filePath) => !/^[0-9a-f]{64}$/i.test(before?.[filePath] ?? "")
    || before?.[filePath]?.toLowerCase() !== after?.[filePath]?.toLowerCase())
  if (mismatches.length > 0) throw new Error(`源照片 SHA-256 执行前后不一致：${mismatches.join("、")}`)
  return true
}

const buildMetadataSummary = (record, icc) => {
  const exifKeys = [...new Set([
    ...keysForGroup(record, "IFD0"),
    ...keysForGroup(record, "IFD1"),
    ...keysForGroup(record, "ExifIFD"),
    ...keysForGroup(record, "SubIFD")
  ])]
  const xmpKeys = keysForGroup(record, "XMP")
  const iptcKeys = keysForGroup(record, "IPTC")
  const gpsKeys = keysForGroup(record, "GPS")
  const xResolution = exifValue(record, "XResolution")
  const yResolution = exifValue(record, "YResolution")
  const resolutionUnit = exifValue(record, "ResolutionUnit")
  const dpiPresent = xResolution !== null && yResolution !== null
  const gpsPresent = gpsKeys.length > 0 || exifValue(record, "GPSPosition") !== null
  return {
    exif: { present: exifKeys.length > 0, fieldCount: exifKeys.length },
    xmp: { present: xmpKeys.length > 0, fieldCount: xmpKeys.length },
    iptc: { present: iptcKeys.length > 0, fieldCount: iptcKeys.length },
    gps: { present: gpsPresent, fieldCount: gpsKeys.length },
    dpi: {
      present: dpiPresent,
      x: dpiPresent ? Number(xResolution) : null,
      y: dpiPresent ? Number(yResolution) : null,
      unit: dpiPresent ? resolutionUnit : null
    },
    icc: {
      present: icc.present,
      bytes: icc.bytes,
      profileName: exifValue(record, "ProfileDescription")
    },
    selected: {
      make: exifValue(record, "Make"),
      model: exifValue(record, "Model"),
      dateTimeOriginal: exifValue(record, "DateTimeOriginal"),
      colorSpace: exifValue(record, "ColorSpace")
    }
  }
}

/** 构造一条不包含二进制元数据原文的 manifest 记录，GPS 只登记存在性。 */
export const buildPhotoEntry = async (filePath, inputRoot, exifTool) => {
  const record = await readExifRecord(exifTool, filePath)
  const extension = path.extname(filePath).toLowerCase()
  const format = extensionFormat(extension, record)
  const containerDimensions = parseDimensions(exifValue(record, "ImageWidth"), exifValue(record, "ImageHeight"))
  if (containerDimensions === null) throw new Error(`无法读取 ${filePath} 的实际像素尺寸`)
  const containerBitDepth = parseBitDepth(exifValue(record, "BitsPerSample") ?? exifValue(record, "BitDepth"))
  const orientation = Number(exifValue(record, "Orientation"))
  const icc = await readIccProfile(exifTool, filePath)
  const metadataSummary = buildMetadataSummary(record, icc)
  const relativePath = relativePhotoPath(inputRoot, filePath)

  if (format === "ARW") {
    const embeddedData = await runBinary(exifTool, ["-b", "-JpgFromRaw", "--", filePath], `JpgFromRaw 抽取 ${filePath}`)
    const pixelDimensions = validateRawEmbeddedJpeg(record, embeddedData)
    const pixelBitDepth = 8
    return {
      fileName: path.basename(filePath),
      relativePath,
      extension,
      format,
      dimensions: pixelDimensions,
      pixelDimensions,
      orientation: Number.isFinite(orientation) ? orientation : null,
      pixelBitDepth,
      metadataSummary,
      sha256: await hashFile(filePath),
      containerDimensions,
      containerBitDepth,
      pixelSource: "embedded-jpeg",
      embeddedJpeg: {
        present: true,
        selector: "JpgFromRaw",
        bytes: embeddedData.length,
        format: "JPEG",
        width: pixelDimensions.width,
        height: pixelDimensions.height,
        bitDepth: pixelBitDepth
      }
    }
  }

  const pixelDimensions = containerDimensions
  return {
    fileName: path.basename(filePath),
    relativePath,
    extension,
    format,
    dimensions: pixelDimensions,
    pixelDimensions,
    orientation: Number.isFinite(orientation) ? orientation : null,
    pixelBitDepth: containerBitDepth,
    metadataSummary,
    sha256: await hashFile(filePath),
    containerDimensions: null,
    containerBitDepth: null,
    pixelSource: "source-pixels",
    embeddedJpeg: null
  }
}

const gitValue = async (args) => {
  try {
    return (await runText("git", ["-C", ROOT, ...args], `git ${args.join(" ")}`)).trim()
  } catch {
    return null
  }
}

const packageVersion = async () => {
  try {
    const packageJson = JSON.parse(await readFile(path.join(ROOT, "electron", "package.json"), "utf8"))
    return typeof packageJson.version === "string" ? packageJson.version : "unknown"
  } catch {
    return "unknown"
  }
}

const outputJson = async (filePath, value) => {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

export const generatePhotoManifest = async ({
  inputRoot = DEFAULT_INPUT,
  outputPath,
  runInfoPath,
  exifTool = DEFAULT_EXIFTOOL,
  expectedCount = DEFAULT_EXPECTED_COUNT,
  version
} = {}) => {
  const resolvedInput = path.resolve(inputRoot)
  const files = await listPhotoFiles(resolvedInput, expectedCount)
  const before = Object.fromEntries(await Promise.all(files.map(async (filePath) => [relativePhotoPath(resolvedInput, filePath), await hashFile(filePath)])))
  const exifToolVersion = await readExifToolVersion(exifTool)
  const entries = []
  for (const filePath of files) entries.push(await buildPhotoEntry(filePath, resolvedInput, exifTool))
  const after = Object.fromEntries(await Promise.all(files.map(async (filePath) => [relativePhotoPath(resolvedInput, filePath), await hashFile(filePath)])))
  verifySourceHashes(before, after)
  const generatedAt = new Date().toISOString()
  const manifest = {
    schemaVersion: 1,
    generatedAt,
    sourceRoot: path.relative(ROOT, resolvedInput).split(path.sep).join("/"),
    expectedFileCount: expectedCount,
    fileCount: entries.length,
    files: entries
  }
  const info = {
    schemaVersion: 1,
    kind: "stage0-run-info",
    generatedAt,
    version: version ?? await packageVersion(),
    head: await gitValue(["rev-parse", "HEAD"]),
    branch: await gitValue(["branch", "--show-current"]),
    dirty: (await gitValue(["status", "--porcelain", "--untracked-files=all"]))?.length > 0,
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    inputRoot: resolvedInput,
    sourceFileCount: files.length,
    sourceSha256Before: before,
    sourceSha256After: after,
    sourceShaUnchanged: true,
    exifTool: {
      path: path.relative(ROOT, path.resolve(exifTool)).split(path.sep).join("/"),
      version: exifToolVersion
    }
  }
  if (outputPath !== undefined) await outputJson(path.resolve(outputPath), manifest)
  if (runInfoPath !== undefined) await outputJson(path.resolve(runInfoPath), info)
  return { manifest, runInfo: info }
}

const main = async () => {
  const args = process.argv.slice(2)
  const outputPath = readArg(args, "--output")
  const runInfoPath = readArg(args, "--run-info-output") ?? (outputPath === undefined ? undefined : path.join(path.dirname(path.resolve(outputPath)), "run-info.json"))
  if (outputPath === undefined) throw new Error("必须提供 --output <photo-manifest.json>")
  const result = await generatePhotoManifest({
    inputRoot: readArg(args, "--input") ?? DEFAULT_INPUT,
    outputPath,
    runInfoPath,
    exifTool: readArg(args, "--exiftool") ?? DEFAULT_EXIFTOOL,
    expectedCount: Number.parseInt(readArg(args, "--expected-count") ?? String(DEFAULT_EXPECTED_COUNT), 10),
    version: readArg(args, "--version")
  })
  console.log(`[photo-manifest] 已登记 ${result.manifest.fileCount} 个源文件：${path.resolve(outputPath)}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`[photo-manifest] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}

export {
  DEFAULT_EXIFTOOL,
  parseBitDepth,
  parseDimensions,
  readJpegDimensions
}
