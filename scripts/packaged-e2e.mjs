import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { createServer } from "node:net"
import { accessSync, constants, copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, truncateSync, unlinkSync, writeFileSync } from "node:fs"
import path from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { inflateSync } from "node:zlib"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const DEFAULT_SAMPLE = path.join(ROOT, "fixtures", "stage4", "real-exif-canon-m03a9518.jpg")
const DEFAULT_TIMEOUT_MS = 45_000
const UI_PERFORMANCE_QUEUE_COUNT = 100
export const PHOTO_CONTENT_PIXEL_THRESHOLD = 1000
/** 阶段 2 固定验收的三个工作台窗口尺寸。 */
export const STAGE2_RESPONSIVE_WINDOW_SIZES = Object.freeze([
  Object.freeze({ width: 1200, height: 760 }),
  Object.freeze({ width: 1400, height: 863 }),
  Object.freeze({ width: 1920, height: 1080 })
])
const EXPECTED_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'"
].join("; ")

/** 健康闸门只接受页面自身 app:// 请求得到的明确 HTTP 200。 */
export const isHealthyHttpStatus = (status) => Number.isInteger(status) && status === 200

/** 打包验收的布局硬闸门，避免用截图主观判断掩盖可操作区域溢出。 */
export const responsiveLayoutPasses = (metrics) =>
  metrics?.preview?.width >= 520
  && metrics?.preview?.height >= 480
  && metrics?.horizontalOverflow?.document === false
  && metrics?.horizontalOverflow?.workspace === false
  && metrics?.horizontalOverflow?.queue === false
  && metrics?.queueActionsComplete === true
  && ["black", "gray", "white"].includes(metrics?.previewBackground)
  && metrics?.primaryButtonCount === 1

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 只有实际可绘制图片区内的非边框像素超过阈值，才算照片内容可见。 */
export const hasVisiblePhotoContent = (metrics) =>
  Number.isFinite(metrics?.drawableImage?.width)
  && Number.isFinite(metrics?.drawableImage?.height)
  && metrics.drawableImage.width > 0
  && metrics.drawableImage.height > 0
  && Number.isFinite(metrics?.nonBorderPixels)
  && metrics.nonBorderPixels > PHOTO_CONTENT_PIXEL_THRESHOLD

/** 输出阶段边界，便于打包 E2E 失败时核对真实应用、JRE 与清理过程。 */
const report = (message) => console.log(`[packaged-e2e] ${message}`)

const normalizePackagedPath = (candidate, platform) => {
  if (platform === "darwin" && candidate.endsWith(".app")) {
    return path.join(candidate, "Contents", "MacOS", "Camera Border")
  }
  return candidate
}

const isRegularFile = (candidate) => {
  try {
    return statSync(candidate).isFile()
  } catch {
    return false
  }
}

const isCurrentPlatformExecutable = (candidate, platform) => {
  if (!isRegularFile(candidate)) {
    return false
  }

  if (platform === "win32") {
    return path.basename(candidate) === "Camera Border.exe"
  }

  if (platform === "darwin") {
    if (
      path.basename(candidate) !== "Camera Border"
      || path.basename(path.dirname(candidate)) !== "MacOS"
      || path.basename(path.dirname(path.dirname(candidate))) !== "Contents"
      || path.extname(candidate).toLowerCase() === ".exe"
    ) {
      return false
    }
    try {
      accessSync(candidate, constants.X_OK)
      return true
    } catch {
      return false
    }
  }

  return false
}

const platformLabel = (platform, arch) => platform === "darwin"
  ? `macOS ${arch}`
  : platform === "win32"
    ? "Windows x64"
    : `${platform} ${arch}`

/** 根据当前宿主架构定位唯一的本次打包产物；不回退历史目录。 */
export const findPackagedExecutable = ({
  root = ROOT,
  platform = process.platform,
  arch = process.arch,
  override = process.env["CAMBORDER_PACKAGED_APP"]
} = {}) => {
  if (platform !== "darwin" && platform !== "win32") {
    throw new Error("打包 E2E 只支持最终平台 macOS arm64/x64 与 Windows x64。")
  }
  if (platform === "darwin" && arch !== "arm64" && arch !== "x64") {
    throw new Error(`打包 E2E 不支持 macOS 架构：${arch}`)
  }

  const explicit = override === undefined
    ? null
    : normalizePackagedPath(path.resolve(override), platform)
  const candidate = explicit ?? (platform === "darwin"
    ? path.join(root, "electron", "release", `macos-${arch}`, `mac-${arch}`, "Camera Border.app", "Contents", "MacOS", "Camera Border")
    : path.join(root, "electron", "release", "win-x64", "win-unpacked", "Camera Border.exe"))

  if (!isCurrentPlatformExecutable(candidate, platform)) {
    if (explicit === null) {
      throw new Error(`找不到当前 ${platformLabel(platform, arch)} 打包应用：${candidate}`)
    }
    throw new Error(`显式打包应用路径不是有效的当前平台可执行文件：${candidate}`)
  }
  // macOS /tmp 等目录可能是指向 /private/tmp 的符号链接；应用日志记录 realpath，
  // E2E 也必须使用同一真实路径，避免把已启动的随包 JRE 判为缺失。
  return realpathSync(candidate)
}

export const resourcesDirectoryFor = (executable) => process.platform === "darwin"
  ? path.resolve(path.dirname(executable), "..", "Resources")
  : path.join(path.dirname(executable), "resources")

const bundledJavaPathFor = (executable) => process.platform === "darwin"
  ? path.join(resourcesDirectoryFor(executable), "java-runtime", "Contents", "Home", "bin", "java")
  : path.join(resourcesDirectoryFor(executable), "java-runtime", "bin", process.platform === "win32" ? "java.exe" : "java")

const bundledExifToolPathFor = (executable) => process.platform === "win32"
  ? path.join(resourcesDirectoryFor(executable), "professional-tools", "exiftool", "win-x64", "exiftool.exe")
  : path.join(resourcesDirectoryFor(executable), "professional-tools", "exiftool", "macos", "exiftool")

/** 使用独立 ExifTool 读取导出文件，避免把 Java 应用自身报告当作最终证据。 */
export const readIndependentExifToolJson = (exifTool, imagePath) => {
  const result = spawnSync(exifTool, ["-j", "-G1", "-s", "-n", imagePath], {
    encoding: "utf8",
    timeout: 15_000,
    windowsHide: true
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`独立 ExifTool 读取失败，退出码=${result.status}：${result.stderr ?? ""}`)
  }
  let parsed
  try {
    parsed = JSON.parse(result.stdout)
  } catch (error) {
    throw new Error(`独立 ExifTool 输出无效：${error instanceof Error ? error.message : String(error)}`)
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed[0] === null || typeof parsed[0] !== "object") {
    throw new Error("独立 ExifTool 没有返回有效文件事实")
  }
  return parsed[0]
}

const exifValue = (record, suffix) => Object.entries(record)
  .find(([key]) => key === suffix || key.endsWith(`:${suffix}`))?.[1] ?? null

const hasExifGroup = (record, prefix) => Object.keys(record).some((key) =>
  key === prefix || key.startsWith(`${prefix}:`) || key.startsWith(`${prefix}-`) || key.startsWith(`${prefix}_`)
)

/** 独立 ExifTool 的分组事实；应用自身 FidelityReport 不能替代这些断言。 */
export const independentMetadataFacts = (record) => ({
  exif: hasExifGroup(record, "ExifIFD") || hasExifGroup(record, "IFD0"),
  xmp: hasExifGroup(record, "XMP"),
  iptc: hasExifGroup(record, "IPTC"),
  gps: hasExifGroup(record, "GPS") || exifValue(record, "GPSPosition") !== null,
  icc: hasExifGroup(record, "ICC"),
  dpi: exifValue(record, "XResolution") !== null && exifValue(record, "YResolution") !== null,
  orientation: Number(exifValue(record, "Orientation")),
  colorSpace: exifValue(record, "ColorSpace")
})

const independentBitDepth = (record) => {
  const raw = exifValue(record, "BitsPerSample") ?? exifValue(record, "BitDepth")
  const values = Array.isArray(raw)
    ? raw.flatMap((value) => String(value).match(/\d+/g) ?? []).map(Number)
    : String(raw ?? "").match(/\d+/g)?.map(Number) ?? []
  return values.length === 0 ? null : Math.max(...values)
}

const getFreePort = async () => await new Promise((resolve, reject) => {
  const server = createServer()
  server.once("error", reject)
  server.listen(0, "127.0.0.1", () => {
    const address = server.address()
    if (address === null || typeof address === "string") {
      server.close()
      reject(new Error("无法获取远程调试端口"))
      return
    }
    server.close((error) => error === undefined ? resolve(address.port) : reject(error))
  })
})

const sha256File = (filePath) => createHash("sha256").update(readFileSync(filePath)).digest("hex")

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** 解码本项目 ImageIO/Canvas 输出的 8-bit RGB/RGBA PNG，得到真实像素而非只比较文件长度。 */
const readPngRaster = (data) => {
  if (!Buffer.isBuffer(data) || data.length < 33 || !data.subarray(0, 8).equals(PNG_SIGNATURE)) return null
  let width = 0
  let height = 0
  let bitDepth = null
  let colorType = null
  let interlace = null
  const idat = []
  let offset = 8
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset)
    const end = offset + 12 + length
    if (end > data.length) return null
    const type = data.toString("ascii", offset + 4, offset + 8)
    const payload = data.subarray(offset + 8, offset + 8 + length)
    if (type === "IHDR" && payload.length >= 13) {
      width = payload.readUInt32BE(0)
      height = payload.readUInt32BE(4)
      bitDepth = payload[8]
      colorType = payload[9]
      interlace = payload[12]
    } else if (type === "IDAT") {
      idat.push(payload)
    } else if (type === "IEND") {
      break
    }
    offset = end
  }
  if (width <= 0 || height <= 0 || bitDepth !== 8 || interlace !== 0 || ![2, 6].includes(colorType) || idat.length === 0) {
    return null
  }
  let inflated
  try {
    inflated = inflateSync(Buffer.concat(idat))
  } catch {
    return null
  }
  const sourceBytesPerPixel = colorType === 6 ? 4 : 3
  const rowBytes = width * sourceBytesPerPixel
  const expectedLength = height * (rowBytes + 1)
  if (inflated.length < expectedLength) return null
  const rows = Buffer.alloc(height * rowBytes)
  const paeth = (left, up, upperLeft) => {
    const estimate = left + up - upperLeft
    const leftDistance = Math.abs(estimate - left)
    const upDistance = Math.abs(estimate - up)
    const upperLeftDistance = Math.abs(estimate - upperLeft)
    if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left
    if (upDistance <= upperLeftDistance) return up
    return upperLeft
  }
  for (let y = 0; y < height; y++) {
    const filter = inflated[y * (rowBytes + 1)]
    const sourceStart = y * (rowBytes + 1) + 1
    const rowStart = y * rowBytes
    const previousStart = (y - 1) * rowBytes
    if (![0, 1, 2, 3, 4].includes(filter)) return null
    for (let x = 0; x < rowBytes; x++) {
      const raw = inflated[sourceStart + x]
      const left = x >= sourceBytesPerPixel ? rows[rowStart + x - sourceBytesPerPixel] : 0
      const up = y > 0 ? rows[previousStart + x] : 0
      const upperLeft = y > 0 && x >= sourceBytesPerPixel ? rows[previousStart + x - sourceBytesPerPixel] : 0
      let value = raw
      if (filter === 1) value += left
      if (filter === 2) value += up
      if (filter === 3) value += Math.floor((left + up) / 2)
      if (filter === 4) value += paeth(left, up, upperLeft)
      rows[rowStart + x] = value & 0xff
    }
  }
  const rgba = Buffer.alloc(width * height * 4)
  for (let index = 0; index < width * height; index++) {
    const source = index * sourceBytesPerPixel
    const target = index * 4
    rgba[target] = rows[source]
    rgba[target + 1] = rows[source + 1]
    rgba[target + 2] = rows[source + 2]
    rgba[target + 3] = colorType === 6 ? rows[source + 3] : 255
  }
  return { width, height, bitDepth, rgba }
}

const readPngChunkTypes = (data) => {
  if (!Buffer.isBuffer(data) || !data.subarray(0, 8).equals(PNG_SIGNATURE)) return []
  const types = []
  let offset = 8
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset)
    const end = offset + 12 + length
    if (end > data.length) break
    types.push(data.toString("ascii", offset + 4, offset + 8))
    offset = end
    if (types[types.length - 1] === "IEND") break
  }
  return types
}

const readJpegMetadataPresence = (data) => {
  let exif = false
  let icc = false
  if (!Buffer.isBuffer(data) || data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return { exif, icc }
  let offset = 2
  while (offset + 4 <= data.length) {
    if (data[offset] !== 0xff) break
    while (data[offset] === 0xff) offset++
    const marker = data[offset++]
    if (marker === undefined || marker === 0xda || marker === 0xd9) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue
    if (offset + 2 > data.length) break
    const length = data.readUInt16BE(offset)
    if (length < 2 || offset + length > data.length) break
    const payloadStart = offset + 2
    const payloadEnd = offset + length
    if (marker === 0xe1 && data.subarray(payloadStart, payloadStart + 6).toString("ascii") === "Exif\0\0") exif = true
    if (marker === 0xe2 && data.subarray(payloadStart, payloadStart + 12).toString("ascii") === "ICC_PROFILE\0") icc = true
    offset = payloadEnd
  }
  return { exif, icc }
}

/** 读取 TIFF 根 IFD 的 EXIF pointer 与 ICC profile tag，验证跨容器导出后的真实文件。 */
const readTiffMetadataPresence = (data) => {
  if (!Buffer.isBuffer(data) || data.length < 8) return null
  const littleEndian = data[0] === 0x49 && data[1] === 0x49
  const bigEndian = data[0] === 0x4d && data[1] === 0x4d
  if (!littleEndian && !bigEndian) return null
  const readUInt16 = (offset) => {
    if (offset < 0 || offset + 2 > data.length) return null
    return littleEndian ? data.readUInt16LE(offset) : data.readUInt16BE(offset)
  }
  const readUInt32 = (offset) => {
    if (offset < 0 || offset + 4 > data.length) return null
    return littleEndian ? data.readUInt32LE(offset) : data.readUInt32BE(offset)
  }
  if (readUInt16(2) !== 42) return null
  const firstIfd = readUInt32(4)
  if (firstIfd === null || firstIfd + 2 > data.length) return null
  const result = { exif: false, icc: false }
  const visited = new Set()
  const pending = [firstIfd]
  while (pending.length > 0) {
    const ifdOffset = pending.pop()
    if (!Number.isInteger(ifdOffset) || visited.has(ifdOffset) || ifdOffset + 2 > data.length) continue
    visited.add(ifdOffset)
    const entryCount = readUInt16(ifdOffset)
    if (entryCount === null || entryCount > 4096) continue
    for (let index = 0; index < entryCount; index++) {
      const entryOffset = ifdOffset + 2 + index * 12
      if (entryOffset + 12 > data.length) break
      const tag = readUInt16(entryOffset)
      const type = readUInt16(entryOffset + 2)
      const count = readUInt32(entryOffset + 4)
      if (tag === null || type === null || count === null) continue
      if (tag === 34675) result.icc = true
      if (tag !== 34665 && tag !== 34853 && tag !== 40965) continue
      if (tag === 34665) result.exif = true
      if (count !== 1 || (type !== 3 && type !== 4 && type !== 13)) continue
      const valueOffset = type === 3 ? entryOffset + 8 : entryOffset + 8
      const childOffset = type === 3 ? readUInt16(valueOffset) : readUInt32(valueOffset)
      if (childOffset !== null && childOffset > 0) pending.push(childOffset)
    }
  }
  return result
}

/** 输出证据中的实际位深与元数据块，供 PNG/JPEG/TIFF 三种格式共用记录。 */
const readImageBitDepth = (data) => {
  const png = readPngRaster(data)
  if (png !== null) return png.bitDepth
  if (Buffer.isBuffer(data) && data[0] === 0xff && data[1] === 0xd8) {
    const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])
    let offset = 2
    while (offset + 4 <= data.length) {
      if (data[offset] !== 0xff) break
      while (data[offset] === 0xff) offset++
      const marker = data[offset++]
      if (marker === undefined || marker === 0xda || marker === 0xd9) break
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue
      const length = data.readUInt16BE(offset)
      if (length < 2 || offset + length > data.length) break
      if (sofMarkers.has(marker)) return data[offset + 2] ?? null
      offset += length
    }
    return null
  }
  return 8
}

export const readImageMetadataPresence = (data) => {
  const pngChunks = readPngChunkTypes(data)
  if (pngChunks.length > 0) return { exif: pngChunks.includes("eXIf"), icc: pngChunks.includes("iCCP") }
  const tiff = readTiffMetadataPresence(data)
  if (tiff !== null) return tiff
  return readJpegMetadataPresence(data)
}

const readRasterDigest = (data) => {
  const raster = readPngRaster(data)
  return raster === null ? null : createHash("sha256").update(raster.rgba).digest("hex")
}

const readPngColorStats = (data) => {
  const raster = readPngRaster(data)
  if (raster === null) return null
  let redPixels = 0
  let whitePixels = 0
  for (let offset = 0; offset < raster.rgba.length; offset += 4) {
    const red = raster.rgba[offset]
    const green = raster.rgba[offset + 1]
    const blue = raster.rgba[offset + 2]
    const alpha = raster.rgba[offset + 3]
    if (alpha > 0 && red > 150 && green < 100 && blue < 100) redPixels++
    if (alpha > 0 && red > 245 && green > 245 && blue > 245) whitePixels++
  }
  return { width: raster.width, height: raster.height, redPixels, whitePixels }
}

/** 对两份实际 PNG 光栅做差异统计；Logo 透明性不能靠文件大小或 CSS 状态推断。 */
const comparePngRasters = (beforeData, afterData) => {
  const before = readPngRaster(beforeData)
  const after = readPngRaster(afterData)
  if (before === null || after === null || before.width !== after.width || before.height !== after.height) {
    return null
  }
  let changedPixels = 0
  let addedRedPixels = 0
  let addedWhitePixels = 0
  for (let offset = 0; offset < before.rgba.length; offset += 4) {
    const beforeRed = before.rgba[offset]
    const beforeGreen = before.rgba[offset + 1]
    const beforeBlue = before.rgba[offset + 2]
    const beforeAlpha = before.rgba[offset + 3]
    const afterRed = after.rgba[offset]
    const afterGreen = after.rgba[offset + 1]
    const afterBlue = after.rgba[offset + 2]
    const afterAlpha = after.rgba[offset + 3]
    if (beforeRed !== afterRed || beforeGreen !== afterGreen || beforeBlue !== afterBlue || beforeAlpha !== afterAlpha) {
      changedPixels++
    }
    const beforeIsRed = beforeAlpha > 0 && beforeRed > 150 && beforeGreen < 100 && beforeBlue < 100
    const afterIsRed = afterAlpha > 0 && afterRed > 150 && afterGreen < 100 && afterBlue < 100
    const beforeIsWhite = beforeAlpha > 0 && beforeRed > 245 && beforeGreen > 245 && beforeBlue > 245
    const afterIsWhite = afterAlpha > 0 && afterRed > 245 && afterGreen > 245 && afterBlue > 245
    if (!beforeIsRed && afterIsRed) addedRedPixels++
    if (!beforeIsWhite && afterIsWhite) addedWhitePixels++
  }
  return { width: before.width, height: before.height, changedPixels, addedRedPixels, addedWhitePixels }
}

/** 读取 PNG、JPEG 或 TIFF 的像素尺寸，供打包导出证据验证。 */
export const readImageDimensions = (data) => {
  if (!Buffer.isBuffer(data) || data.length < 10) {
    return null
  }

  const isPositiveDimension = (value) => Number.isInteger(value) && value > 0
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (data.length >= 24 && data.subarray(0, 8).equals(pngSignature)) {
    const width = data.readUInt32BE(16)
    const height = data.readUInt32BE(20)
    return isPositiveDimension(width) && isPositiveDimension(height)
      ? { format: "png", width, height }
      : null
  }

  if (data[0] === 0xff && data[1] === 0xd8) {
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
      while (data[offset] === 0xff) {
        offset++
      }
      const marker = data[offset]
      if (marker === undefined) break
      if (marker === 0x01 || marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset++
        continue
      }
      if (offset + 7 >= data.length) break
      const segmentLength = data.readUInt16BE(offset + 1)
      if (segmentLength < 2 || offset + 1 + segmentLength > data.length) break
      if (startOfFrameMarkers.has(marker)) {
        const height = data.readUInt16BE(offset + 4)
        const width = data.readUInt16BE(offset + 6)
        return isPositiveDimension(width) && isPositiveDimension(height)
          ? { format: "jpeg", width, height }
          : null
      }
      offset += segmentLength + 1
    }
    return null
  }

  const littleEndian = data[0] === 0x49 && data[1] === 0x49
  const bigEndian = data[0] === 0x4d && data[1] === 0x4d
  if (!littleEndian && !bigEndian) {
    return null
  }
  const readUint16 = (offset) => littleEndian ? data.readUInt16LE(offset) : data.readUInt16BE(offset)
  const readUint32 = (offset) => littleEndian ? data.readUInt32LE(offset) : data.readUInt32BE(offset)
  if (readUint16(2) !== 42) {
    return null
  }
  const firstIfdOffset = readUint32(4)
  if (firstIfdOffset + 2 > data.length) {
    return null
  }
  const entryCount = readUint16(firstIfdOffset)
  let width = null
  let height = null
  for (let index = 0; index < entryCount; index++) {
    const entryOffset = firstIfdOffset + 2 + index * 12
    if (entryOffset + 12 > data.length) break
    const tag = readUint16(entryOffset)
    const type = readUint16(entryOffset + 2)
    const count = readUint32(entryOffset + 4)
    if ((tag !== 256 && tag !== 257) || count !== 1 || (type !== 3 && type !== 4)) {
      continue
    }
    const value = type === 3 ? readUint16(entryOffset + 8) : readUint32(entryOffset + 8)
    if (tag === 256) width = value
    if (tag === 257) height = value
  }
  return isPositiveDimension(width) && isPositiveDimension(height)
    ? { format: "tiff", width, height }
    : null
}

const isProcessAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false
  }
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const enginePidsFromLog = (log) => [...log.matchAll(/^\[engine-process\] pid=(\d+)$/gm)]
  .map((match) => Number.parseInt(match[1], 10))
  .filter((pid) => Number.isInteger(pid) && pid > 0)

const readEngineLog = (engineLogPath) => existsSync(engineLogPath)
  ? readFileSync(engineLogPath, "utf8")
  : ""

const killExactJavaPid = (pid, reason) => {
  assert.equal(isProcessAlive(pid), true, `${reason}前 Java PID 不存在或已退出：${pid}`)
  process.kill(pid, "SIGTERM")
  console.log(`[packaged-e2e] Java PID ${pid} 已精确发送 SIGTERM（${reason}）`)
}

const isAllowedPageRequest = (url) =>
  url.startsWith("app://app/") || url.startsWith("data:") || url.startsWith("blob:")

export const collectProtocolDiagnostics = (records) => records
  .map((record) => {
    if (typeof record === "string") return record
    if (typeof record?.entry?.text === "string") return record.entry.text
    if (typeof record?.exceptionDetails?.text === "string") return record.exceptionDetails.text
    if (typeof record?.text === "string") return record.text
    if (Array.isArray(record?.args)) {
      return record.args
        .map((argument) => typeof argument?.value === "string" ? argument.value : argument?.description ?? "")
        .join(" ")
    }
    return ""
  })
  .filter((text) => text.length > 0)
  .join("\n")

const assertNoProtocolErrors = (requests, responseDetails, consoleRecords, runtimeExceptions, logEntries) => {
  assert.equal(
    requests.every((url) => isAllowedPageRequest(url)),
    true,
    `页面出现非 app:///data:/blob: 网络请求：\n${requests.join("\n")}`
  )
  assert.equal(
    responseDetails.every((response) => response.status !== 403),
    true,
    `页面出现真实 HTTP 403 响应：\n${JSON.stringify(responseDetails.filter((response) => response.status === 403))}`
  )

  const diagnostics = collectProtocolDiagnostics([
    ...consoleRecords,
    ...runtimeExceptions,
    ...logEntries
  ])
  for (const forbidden of ["Failed to fetch", "CORS", "403", "app://app/app://"]) {
    assert.equal(
      diagnostics.includes(forbidden),
      false,
      `Console/Runtime/Log 出现禁止错误 ${forbidden}：\n${diagnostics}`
    )
  }
}

const fetchJson = async (url) => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`调试端点返回 ${response.status}：${url}`)
  }
  return await response.json()
}

const waitFor = async (description, action, predicate, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  let lastValue
  while (Date.now() < deadline) {
    try {
      const value = await action()
      lastValue = value
      if (predicate(value)) {
        return value
      }
    } catch (error) {
      lastError = error
    }
    await sleep(150)
  }
  const suffix = lastError === null ? "" : `；最近错误：${lastError instanceof Error ? lastError.message : String(lastError)}`
  const valueSuffix = lastValue === undefined ? "" : `；最后值：${JSON.stringify(lastValue)}`
  throw new Error(`等待${description}超时${suffix}${valueSuffix}`)
}

class CdpClient {
  #socket
  #nextId = 0
  #pending = new Map()
  #listeners = new Map()

  constructor(socket) {
    this.#socket = socket
    const rejectPending = (reason) => {
      for (const pending of this.#pending.values()) {
        clearTimeout(pending.timeout)
        pending.reject(reason)
      }
      this.#pending.clear()
    }
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data))
      if (message.id !== undefined) {
        const pending = this.#pending.get(message.id)
        if (pending === undefined) return
        this.#pending.delete(message.id)
        clearTimeout(pending.timeout)
        if (message.error !== undefined) {
          pending.reject(new Error(message.error.message ?? "CDP 命令失败"))
        } else {
          pending.resolve(message.result ?? {})
        }
        return
      }
      const listeners = this.#listeners.get(message.method) ?? []
      for (const listener of listeners) listener(message.params ?? {})
    })
    socket.addEventListener("error", () => rejectPending(new Error("Electron CDP WebSocket 出错")))
    socket.addEventListener("close", () => rejectPending(new Error("Electron CDP WebSocket 已关闭")))
  }

  static async connect(webSocketUrl) {
    if (typeof WebSocket !== "function") {
      throw new Error("当前 Node 未提供 WebSocket，无法连接 Electron CDP。")
    }
    const socket = new WebSocket(webSocketUrl)
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true })
      socket.addEventListener("error", () => reject(new Error("连接 Electron CDP 失败")), { once: true })
    })
    return new CdpClient(socket)
  }

  on(method, listener) {
    const listeners = this.#listeners.get(method) ?? []
    listeners.push(listener)
    this.#listeners.set(method, listeners)
  }

  call(method, params = {}, timeoutMs = 30_000) {
    const id = ++this.#nextId
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error(`Electron CDP 命令超时：${method}`))
      }, timeoutMs)
      this.#pending.set(id, { resolve, reject, timeout })
      this.#socket.send(JSON.stringify({ id, method, params }))
    })
  }

  close() {
    this.#socket.close()
  }
}

const evaluate = async (client, expression) => {
  const result = await client.call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  })
  if (result.exceptionDetails !== undefined) {
    throw new Error(result.exceptionDetails.text ?? "页面脚本执行失败")
  }
  return result.result?.value
}

/** 通过页面相对路径读取 app://app/api/health，拒绝 UI 文案或 Node 进程指标替代健康判断。 */
const readAppHealthStatus = async (client) => await evaluate(
  client,
  "fetch('/api/health', { cache: 'no-store' }).then((response) => response.status).catch(() => 0)"
)

/** 响应式截图必须建立在引擎已恢复且当前照片仍可导出的真实工作台状态上。 */
const readExportReadiness = async (client) => await evaluate(client, `(() => {
  const button = document.querySelector('.exportDockButton.primaryButton')
  return {
    disabled: button?.matches(':disabled') ?? null,
    title: button?.getAttribute('title') ?? null,
    label: button?.textContent?.trim() ?? null,
    status: document.querySelector('.exportDockStatus')?.textContent?.trim() ?? null
  }
})()`)

const clickButton = async (client, expression, description) => {
  const clicked = await evaluate(client, expression)
  assert.equal(clicked, true, `未找到${description}`)
}

/** 通过原生 value setter 驱动 React 受控表单，避免测试只修改 DOM 而未更新应用状态。 */
const setFormControlValue = async (client, selector, value, eventName) => await evaluate(client, `(() => {
  const element = document.querySelector(${JSON.stringify(selector)});
  if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLSelectElement)) return false;
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter === undefined) return false;
  setter.call(element, ${JSON.stringify(value)});
  element.dispatchEvent(new Event(${JSON.stringify(eventName)}, { bubbles: true }));
  return element.value === ${JSON.stringify(value)};
})()`)

/** 按 fieldset 图例定位真实控件；所有 setter 后都发事件，确保 React 状态和配方一起改变。 */
const setFieldSelectValue = async (client, legendText, value) => await evaluate(client, `(() => {
  const fieldset = [...document.querySelectorAll('fieldset')].find((item) =>
    item.querySelector('legend')?.textContent?.trim() === ${JSON.stringify(legendText)}
  );
  const element = fieldset?.querySelector('select');
  if (!(element instanceof HTMLSelectElement)) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  if (setter === undefined) return false;
  setter.call(element, ${JSON.stringify(value)});
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return element.value === ${JSON.stringify(value)};
})()`)

/** 按 fieldset 内 label 文本定位第二层 select，覆盖文字位置等同名控件。 */
const setFieldSelectByLabel = async (client, legendText, labelText, value) => await evaluate(client, `(() => {
  const fieldset = [...document.querySelectorAll('fieldset')].find((item) =>
    item.querySelector('legend')?.textContent?.trim() === ${JSON.stringify(legendText)}
  );
  const element = [...(fieldset?.querySelectorAll('select') ?? [])].find((item) =>
    item.closest('label')?.textContent?.trim().startsWith(${JSON.stringify(labelText)})
  );
  if (!(element instanceof HTMLSelectElement)) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  if (setter === undefined) return false;
  setter.call(element, ${JSON.stringify(value)});
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return element.value === ${JSON.stringify(value)};
})()`)

const selectQueueItemByFileName = async (client, fileName) => await evaluate(client, `(() => {
  const row = [...document.querySelectorAll('.queueItem')].find((item) =>
    item.querySelector('.queueName')?.textContent?.includes(${JSON.stringify(fileName)})
  );
  if (row === undefined) return false;
  row.click();
  return true;
})()`)

/** 按 fieldset/label 文本提交数字或颜色输入，包含 NumberInput 所需的 blur 提交。 */
const setFieldInputValue = async (client, legendText, labelText, value, eventName = "input") => {
  const textInput = await evaluate(client, `(() => {
    const fieldset = [...document.querySelectorAll('fieldset')].find((item) =>
      item.querySelector('legend')?.textContent?.trim() === ${JSON.stringify(legendText)}
    );
    const element = [...(fieldset?.querySelectorAll('input') ?? [])].find((item) =>
      item.closest('label')?.textContent?.trim().startsWith(${JSON.stringify(labelText)})
    );
    if (!(element instanceof HTMLInputElement)) return null;
    element.focus();
    if (element.type === 'text') element.select();
    return element.type === 'text';
  })()`);
  if (textInput === null) return false;
  if (textInput === true) {
    await client.call("Input.insertText", { text: String(value) });
  } else {
    const assigned = await evaluate(client, `(() => {
      const fieldset = [...document.querySelectorAll('fieldset')].find((item) =>
        item.querySelector('legend')?.textContent?.trim() === ${JSON.stringify(legendText)}
      );
      const element = [...(fieldset?.querySelectorAll('input') ?? [])].find((item) =>
        item.closest('label')?.textContent?.trim().startsWith(${JSON.stringify(labelText)})
      );
      if (!(element instanceof HTMLInputElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter === undefined) return false;
      setter.call(element, ${JSON.stringify(String(value))});
      element.dispatchEvent(new Event(${JSON.stringify(eventName)}, { bubbles: true }));
      return element.value === ${JSON.stringify(String(value))};
    })()`);
    if (assigned !== true) return false;
  }
  return await evaluate(client, `(() => {
    const fieldset = [...document.querySelectorAll('fieldset')].find((item) =>
      item.querySelector('legend')?.textContent?.trim() === ${JSON.stringify(legendText)}
    );
    const element = [...(fieldset?.querySelectorAll('input') ?? [])].find((item) =>
      item.closest('label')?.textContent?.trim().startsWith(${JSON.stringify(labelText)})
    );
    if (!(element instanceof HTMLInputElement)) return false;
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
      element.blur();
      resolve(element.value === ${JSON.stringify(String(value))});
    })));
  })()`);
}

const setFieldCheckbox = async (client, legendText, labelText, checked) => await evaluate(client, `(() => {
  const fieldset = [...document.querySelectorAll('fieldset')].find((item) =>
    item.querySelector('legend')?.textContent?.trim() === ${JSON.stringify(legendText)}
  );
  const input = [...(fieldset?.querySelectorAll('input[type="checkbox"]') ?? [])].find((item) =>
    item.closest('label')?.textContent?.trim().startsWith(${JSON.stringify(labelText)})
  );
  if (!(input instanceof HTMLInputElement)) return false;
  if (input.checked !== ${checked === true}) input.click();
  return input.checked === ${checked === true};
})()`)

const readCanvasRedPixelCount = async (client) => await evaluate(client, `(() => {
  const canvas = document.querySelector('canvas.previewCanvas');
  const context = canvas?.getContext('2d', { willReadFrequently: true });
  if (canvas === null || canvas === undefined || context === null) return null;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let redPixels = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if ((pixels[offset + 3] ?? 0) > 0 && (pixels[offset] ?? 0) > 150 && (pixels[offset + 1] ?? 0) < 100 && (pixels[offset + 2] ?? 0) < 100) redPixels++;
  }
  return redPixels;
})()`)

/** Logo 位于边框区域；排除真实照片区域，避免样片本身的红色被误判为 Logo。 */
const readCanvasBorderRedPixelCount = async (client) => await evaluate(client, `(() => {
  const canvas = document.querySelector('canvas.previewCanvas');
  const context = canvas?.getContext('2d', { willReadFrequently: true });
  if (canvas === null || canvas === undefined || context === null) return null;
  const imageX = Number(canvas.dataset.previewImageX);
  const imageY = Number(canvas.dataset.previewImageY);
  const imageWidth = Number(canvas.dataset.previewImageWidth);
  const imageHeight = Number(canvas.dataset.previewImageHeight);
  if (![imageX, imageY, imageWidth, imageHeight].every(Number.isFinite)) return null;
  const logicalWidth = Number(canvas.dataset.previewCanvasLogicalWidth) || canvas.width;
  const pixelRatio = Number(canvas.dataset.previewCanvasPixelRatio) || (logicalWidth > 0 ? canvas.width / logicalWidth : 1);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const imageStartX = Math.max(0, Math.floor(imageX * pixelRatio));
  const imageStartY = Math.max(0, Math.floor(imageY * pixelRatio));
  const imageEndX = Math.min(canvas.width, Math.ceil((imageX + imageWidth) * pixelRatio));
  const imageEndY = Math.min(canvas.height, Math.ceil((imageY + imageHeight) * pixelRatio));
  let redPixels = 0;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (x >= imageStartX && x < imageEndX && y >= imageStartY && y < imageEndY) continue;
      const offset = (y * canvas.width + x) * 4;
      if ((pixels[offset + 3] ?? 0) > 0 && (pixels[offset] ?? 0) > 150 && (pixels[offset + 1] ?? 0) < 100 && (pixels[offset + 2] ?? 0) < 100) redPixels++;
    }
  }
  return redPixels;
})()`)

const readCanvasAsymmetricCorners = async (client) => await evaluate(client, `(() => {
  const canvas = document.querySelector('canvas.previewCanvas');
  if (canvas === null) return null;
  const imageX = Number(canvas.dataset.previewImageX);
  const imageY = Number(canvas.dataset.previewImageY);
  const imageWidth = Number(canvas.dataset.previewImageWidth);
  const imageHeight = Number(canvas.dataset.previewImageHeight);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null || ![imageX, imageY, imageWidth, imageHeight].every(Number.isFinite)) return null;
  const logicalWidth = Number(canvas.dataset.previewCanvasLogicalWidth) || canvas.width;
  const pixelRatio = Number(canvas.dataset.previewCanvasPixelRatio) || (logicalWidth > 0 ? canvas.width / logicalWidth : 1);
  const colors = [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]].map(([x, y]) => {
    const pixel = context.getImageData(
      Math.max(0, Math.min(canvas.width - 1, Math.round((imageX + imageWidth * x) * pixelRatio))),
      Math.max(0, Math.min(canvas.height - 1, Math.round((imageY + imageHeight * y) * pixelRatio))),
      1,
      1
    ).data;
    return [pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0];
  });
  return { colors, image: { x: imageX, y: imageY, width: imageWidth, height: imageHeight } };
})()`)

const readEnginePhotoMetadata = async (client, filePath) => await evaluate(client, `(async () => {
  const response = await fetch('/api/photo-metadata', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imagePath: ${JSON.stringify(filePath)} })
  });
  return { status: response.status, body: await response.json() };
})()`)

/** 读取最新真实 /api/preview 响应指向的 PNG，覆盖引擎预览而非只看 Canvas。 */
const readLatestEnginePreviewPng = async (client, responseDetails, minimumResponseIndex = 0) => {
  const previewResponse = [...responseDetails.slice(minimumResponseIndex)].reverse().find((response) => response.url === "app://app/api/preview")
  if (previewResponse === undefined) return null
  const responseBody = await client.call("Network.getResponseBody", { requestId: previewResponse.id })
  if (typeof responseBody.body !== "string") return null
  let payload
  try {
    payload = JSON.parse(responseBody.body)
  } catch {
    return null
  }
  if (typeof payload?.previewUrl !== "string") return null
  const base64 = await evaluate(client, `(async () => {
    const response = await fetch(${JSON.stringify(payload.previewUrl)});
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.slice(offset, offset + 0x8000));
    }
    return btoa(binary);
  })()`)
  return typeof base64 === "string" ? Buffer.from(base64, "base64") : null
}

/** 读取最新预览 JSON，验证预览响应自身也报告实际 ICC/位深事实。 */
const readLatestEnginePreviewResponse = async (client, responseDetails, minimumResponseIndex = 0) => {
  const previewResponse = [...responseDetails.slice(minimumResponseIndex)].reverse().find((response) => response.url === "app://app/api/preview")
  if (previewResponse === undefined) return null
  const responseBody = await client.call("Network.getResponseBody", { requestId: previewResponse.id })
  if (typeof responseBody.body !== "string") return null
  try {
    return JSON.parse(responseBody.body)
  } catch {
    return null
  }
}

/** 通过当前工作台的真实单图导出按钮收集一个格式/版式产物。 */
const exportCurrentSelection = async (client, output, artifactRoot, label) => {
  rmSync(output, { force: true })
  await clickButton(client, `(() => {
    const button = document.querySelector('[data-testid="export-single"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`, `${label}单图导出按钮`)
  await waitFor(
    `${label}导出文件`,
    async () => ({
      exists: existsSync(output),
      readiness: await readExportReadiness(client),
      error: await evaluate(client, "document.querySelector('.previewExportError')?.textContent?.trim() ?? null")
    }),
    (state) => state.exists === true,
    120_000
  )
  const stableSize = await waitFor(
    `${label}导出写入完成`,
    async () => {
      const firstSize = statSync(output).size
      await sleep(250)
      return { firstSize, secondSize: statSync(output).size }
    },
    (sizes) => sizes.firstSize > 0 && sizes.firstSize === sizes.secondSize,
    120_000
  )
  const data = readFileSync(output)
  const dimensions = readImageDimensions(data)
  assert.notEqual(dimensions, null, `${label}导出不是可识别图片`)
  const extension = dimensions.format === "jpeg" ? "jpg" : dimensions.format
  const evidencePath = path.join(artifactRoot, `${label}.${extension}`)
  copyFileSync(output, evidencePath)
  return {
    path: evidencePath,
    bytes: stableSize.secondSize,
    dimensions,
    bitDepth: readImageBitDepth(data),
    metadata: readImageMetadataPresence(data),
    rasterDigest: readRasterDigest(data),
    colorStats: readPngColorStats(data)
  }
}

/** 向真实 Renderer 分发快捷键；Escape 走 document 以覆盖 ModalDrawer 的焦点锁定监听。 */
const dispatchRendererKey = async (client, key, modifiers = {}) => await evaluate(client, `${key === "Escape" ? "document" : "window"}.dispatchEvent(new KeyboardEvent('keydown', {
  key: ${JSON.stringify(key)},
  bubbles: true,
  metaKey: ${modifiers.metaKey === true},
  ctrlKey: ${modifiers.ctrlKey === true},
  shiftKey: ${modifiers.shiftKey === true}
}))`)

/** 保存真实 Renderer 截图；路径会写入 E2E 日志，供失败和交接复核。 */
const captureRendererScreenshot = async (client, artifactRoot, label) => {
  const screenshotPath = path.join(artifactRoot, `${label}.png`)
  // 只捕获当前可见布局视口。captureBeyondViewport 会让 Chromium 在大窗口/Canvas
  // 重绘期间尝试额外布局，容易把 CDP 截图拖到超时；这里的 clip 仍来自真实
  // Renderer 布局指标，不改变 CSS viewport，也不伪造 BrowserWindow 尺寸。
  const layout = await client.call("Page.getLayoutMetrics", {}, 30_000)
  const viewport = layout.visualViewport ?? layout.layoutViewport
  assert.ok(viewport !== undefined, `无法取得 ${label} Renderer 可见布局视口`)
  const clip = {
    x: Number(viewport.pageX ?? 0),
    y: Number(viewport.pageY ?? 0),
    width: Number(viewport.clientWidth ?? 0),
    height: Number(viewport.clientHeight ?? 0),
    scale: 1
  }
  assert.ok(clip.width > 0 && clip.height > 0, `无法取得 ${label} Renderer 截图尺寸`)
  const result = await client.call("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
    clip
  }, 60_000)
  assert.equal(typeof result.data, "string", `无法取得 ${label} Renderer 截图`)
  writeFileSync(screenshotPath, Buffer.from(result.data, "base64"))
  return screenshotPath
}

/** 从 Renderer 的实际 Canvas 读取照片区域像素，不把文字或边框当成照片内容。 */
const readPreviewCanvasMetrics = async (client) => await evaluate(client, `(() => {
  const canvas = document.querySelector('canvas.previewCanvas');
  if (canvas === null) {
    return { error: '未找到 canvas.previewCanvas', drawableImage: { width: 0, height: 0 }, nonBorderPixels: 0 };
  }

  const numberFromDataset = (name) => {
    const value = Number(canvas.dataset[name]);
    return Number.isFinite(value) ? value : null;
  };
  const borderColor = canvas.dataset.previewBorderColor ?? '';
  const colorProbe = document.createElement('span');
  colorProbe.style.color = borderColor;
  document.body.append(colorProbe);
  const resolvedColor = getComputedStyle(colorProbe).color;
  colorProbe.remove();
  const colorMatch = resolvedColor.match(/^rgba?\\(([^)]+)\\)$/);
  const borderRgb = colorMatch === null
    ? null
    : colorMatch[1].split(',').slice(0, 3).map((part) => Number(part.trim()));
  const imageX = numberFromDataset('previewImageX');
  const imageY = numberFromDataset('previewImageY');
  const imageWidth = numberFromDataset('previewImageWidth');
  const imageHeight = numberFromDataset('previewImageHeight');
  const logicalWidth = numberFromDataset('previewCanvasLogicalWidth') ?? canvas.width;
  const logicalHeight = numberFromDataset('previewCanvasLogicalHeight') ?? canvas.height;
  const pixelRatio = numberFromDataset('previewCanvasPixelRatio') ?? (logicalWidth > 0 ? canvas.width / logicalWidth : 1);
  const canvasRect = canvas.getBoundingClientRect();
  const common = {
    canvas: {
      width: canvas.width,
      height: canvas.height,
      logicalWidth,
      logicalHeight,
      cssWidth: canvasRect.width,
      cssHeight: canvasRect.height,
      pixelRatio
    },
    drawableImage: {
      x: imageX,
      y: imageY,
      width: imageWidth ?? 0,
      height: imageHeight ?? 0
    },
    border: {
      color: borderColor,
      resolvedColor,
      top: canvas.dataset.previewBorderTop ?? '',
      bottom: canvas.dataset.previewBorderBottom ?? '',
      left: canvas.dataset.previewBorderLeft ?? '',
      right: canvas.dataset.previewBorderRight ?? ''
    },
    syncLabel: document.querySelector('.previewSyncBadge')?.textContent?.trim() ?? '',
    insufficientMessage: document.querySelector('.previewAreaInsufficient')?.textContent?.trim() ?? ''
  };
  if (
    borderRgb === null || borderRgb.length !== 3 || borderRgb.some((value) => !Number.isFinite(value))
    || imageX === null || imageY === null || imageWidth === null || imageHeight === null
    || imageWidth <= 0 || imageHeight <= 0
  ) {
    return { ...common, nonBorderPixels: 0, error: 'Canvas 未提供可绘制图片区或可解析的当前边框色' };
  }

  const startX = Math.max(0, Math.floor(imageX * pixelRatio));
  const startY = Math.max(0, Math.floor(imageY * pixelRatio));
  const endX = Math.min(canvas.width, Math.ceil((imageX + imageWidth) * pixelRatio));
  const endY = Math.min(canvas.height, Math.ceil((imageY + imageHeight) * pixelRatio));
  if (endX <= startX || endY <= startY) {
    return { ...common, nonBorderPixels: 0, error: 'Canvas 有效图片区越出画布边界' };
  }

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) {
    return { ...common, nonBorderPixels: 0, error: '无法读取 Canvas 2D 上下文' };
  }
  const pixels = context.getImageData(startX, startY, endX - startX, endY - startY).data;
  const backgroundDistanceThreshold = 16;
  let nonBorderPixels = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const alpha = pixels[offset + 3];
    if (alpha === undefined || alpha < 16) continue;
    const red = pixels[offset] ?? 0;
    const green = pixels[offset + 1] ?? 0;
    const blue = pixels[offset + 2] ?? 0;
    if (
      Math.abs(red - borderRgb[0]) > backgroundDistanceThreshold
      || Math.abs(green - borderRgb[1]) > backgroundDistanceThreshold
      || Math.abs(blue - borderRgb[2]) > backgroundDistanceThreshold
    ) {
      nonBorderPixels++;
    }
  }
  return { ...common, nonBorderPixels, backgroundDistanceThreshold, error: null };
})()`)

const formatPreviewCanvasMetrics = (metrics) => {
  const canvas = metrics.canvas ?? {}
  const drawableImage = metrics.drawableImage ?? {}
  const border = metrics.border ?? {}
  return [
    `Canvas 逻辑=${canvas.logicalWidth ?? canvas.width ?? 0}×${canvas.logicalHeight ?? canvas.height ?? 0}；backing=${canvas.width ?? 0}×${canvas.height ?? 0}；CSS=${canvas.cssWidth ?? 0}×${canvas.cssHeight ?? 0}；DPR=${canvas.pixelRatio ?? 1}`,
    `有效图片区=${drawableImage.width ?? 0}×${drawableImage.height ?? 0} @ ${drawableImage.x ?? "?"},${drawableImage.y ?? "?"}`,
    `边框=${border.color ?? ""} top=${border.top ?? ""} bottom=${border.bottom ?? ""} left=${border.left ?? ""} right=${border.right ?? ""}`,
    `非边框像素=${metrics.nonBorderPixels ?? 0}`,
    `同步=${metrics.syncLabel ?? ""}`,
    `空间提示=${metrics.insufficientMessage ?? ""}`
  ].join("；")
}

/** 读取真实滚动容器的可见队列行，用于证明可视范围外没有提前请求缩略图。 */
const readQueueViewport = async (client) => await evaluate(client, `(() => {
  const list = document.querySelector('.queueList');
  if (list === null) return { total: 0, visibleIds: [], visiblePaths: [], scrollTop: 0, clientHeight: 0, scrollHeight: 0 };
  const listRect = list.getBoundingClientRect();
  const visible = [...list.querySelectorAll('[data-queue-item-id]')]
    .filter((row) => {
      const rect = row.getBoundingClientRect();
      return rect.bottom > listRect.top && rect.top < listRect.bottom && rect.right > listRect.left && rect.left < listRect.right;
    })
    .map((row) => ({
      id: row.dataset.queueItemId ?? '',
      path: row.querySelector('.queueSub')?.getAttribute('title') ?? ''
    }));
  return {
    total: list.querySelectorAll('[data-queue-item-id]').length,
    visibleIds: visible.map((item) => item.id),
    visiblePaths: visible.map((item) => item.path),
    scrollTop: list.scrollTop,
    clientHeight: list.clientHeight,
    scrollHeight: list.scrollHeight
  };
})()`)

/** 读取真实打包窗口的布局、溢出和队列底部操作区，供固定尺寸验收使用。 */
const readWorkspaceResponsiveMetrics = async (client) => await evaluate(client, `(() => {
  const rect = (selector) => {
    const element = document.querySelector(selector)
    if (element === null) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
    const value = element.getBoundingClientRect()
    return {
      left: value.left,
      top: value.top,
      right: value.right,
      bottom: value.bottom,
      width: value.width,
      height: value.height
    }
  }
  const overflowsHorizontally = (selector) => {
    const element = document.querySelector(selector)
    return element === null || element.scrollWidth > element.clientWidth + 1
  }
  const queueActions = document.querySelector('.queueActions')
  const queueRect = queueActions?.getBoundingClientRect()
  const queueActionButtons = queueActions === null || queueRect === undefined
    ? []
    : [...queueActions.querySelectorAll('button')].map((button) => {
        const buttonRect = button.getBoundingClientRect()
        const style = getComputedStyle(button)
        return {
          label: button.textContent?.trim() ?? '',
          visible: button.getClientRects().length > 0
            && style.display !== 'none'
            && style.visibility !== 'hidden',
          within: buttonRect.left >= queueRect.left - 1
            && buttonRect.right <= queueRect.right + 1
            && buttonRect.top >= queueRect.top - 1
            && buttonRect.bottom <= queueRect.bottom + 1
        }
      })
  const primaryButtons = [...document.querySelectorAll('.primaryButton')].filter((button) => {
    const style = getComputedStyle(button)
    return button.getClientRects().length > 0
      && style.display !== 'none'
      && style.visibility !== 'hidden'
  })
  const preview = document.querySelector('.previewCanvasWrapper')
  const previewClass = preview?.className ?? ''
  const previewBackground = previewClass.match(/previewBackground(Black|Gray|White)/)?.[1]?.toLowerCase() ?? ''
  return {
    window: { width: window.outerWidth, height: window.outerHeight },
    preview: rect('.previewCanvasWrapper'),
    horizontalOverflow: {
      document: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
        || document.body.scrollWidth > document.body.clientWidth + 1,
      workspace: overflowsHorizontally('.workspace'),
      queue: overflowsHorizontally('.workspaceLeft')
        || overflowsHorizontally('.queuePanel')
        || overflowsHorizontally('.queueList')
    },
    queueActionsComplete: queueActionButtons.length > 0
      && queueActionButtons.every((button) => button.visible && button.within),
    queueActionButtons,
    previewBackground,
    primaryButtonCount: primaryButtons.length
  }
})()`)

/** 读取实际主题文字/控件对比度；预览背景单独读取，确保主题不会污染照片预览。 */
const readThemeContrastMetrics = async (client) => await evaluate(client, `(() => {
  const parseColor = (value) => {
    const match = value.match(/^rgba?\\(([^)]+)\\)$/)
    if (match === null) return null
    const channels = match[1].split(',').slice(0, 3).map((part) => Number(part.trim()))
    return channels.length === 3 && channels.every((channel) => Number.isFinite(channel)) ? channels : null
  }
  const luminance = (value) => {
    const channels = parseColor(value)
    if (channels === null) return null
    const linear = channels.map((channel) => {
      const normalized = channel / 255
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
  }
  const contrast = (foreground, background) => {
    const foregroundLuminance = luminance(foreground)
    const backgroundLuminance = luminance(background)
    if (foregroundLuminance === null || backgroundLuminance === null) return null
    const lighter = Math.max(foregroundLuminance, backgroundLuminance)
    const darker = Math.min(foregroundLuminance, backgroundLuminance)
    return (lighter + 0.05) / (darker + 0.05)
  }
  const style = (selector) => {
    const element = document.querySelector(selector)
    if (element === null) return null
    const computed = getComputedStyle(element)
    return {
      color: computed.color,
      background: computed.backgroundColor,
      accent: computed.getPropertyValue('--accent-primary').trim(),
      onAccent: computed.getPropertyValue('--studio-on-accent').trim()
    }
  }
  const shell = style('.workspaceShell')
  const inspector = style('.workspaceRight')
  const title = style('.workspaceInspectorTitle')
  const button = style('.exportDockButton')
  const input = style('.settingTextInput')
  const dock = style('.workspaceExportDock')
  const preview = style('.previewCanvasWrapper')
  return {
    colors: { shell, inspector, title, button, input, dock, preview },
    states: {
      exportButtonDisabled: document.querySelector('.exportDockButton')?.matches(':disabled') ?? false,
      exportButtonOpacity: document.querySelector('.exportDockButton') === null
        ? null
        : getComputedStyle(document.querySelector('.exportDockButton')).opacity
    },
    contrast: {
      shell: shell === null ? null : contrast(shell.color, shell.background),
      title: title === null || inspector === null ? null : contrast(title.color, inspector.background),
      button: button === null ? null : contrast(button.color, button.background),
      input: input === null ? null : contrast(input.color, input.background),
      dock: dock === null ? null : contrast(dock.color, dock.background)
    }
  }
})()`)

const parseRequestBody = (request) => {
  if (typeof request?.postData !== "string") return null
  try {
    return JSON.parse(request.postData)
  } catch {
    return null
  }
}

const latestPreviewRecipe = (requestDetails, imagePath = null) => {
  for (const request of [...requestDetails].reverse()) {
    if (request?.url !== "app://app/api/preview" || request?.method !== "POST") continue
    const body = parseRequestBody(request)
    if (body?.recipe === undefined) continue
    if (imagePath !== null && body.recipe.imagePath !== imagePath) continue
    return body.recipe
  }
  return null
}

/** 只识别队列固定 120px、零边框 recipe 的缩略图请求。 */
const isThumbnailRequest = (request) => {
  const body = parseRequestBody(request)
  return request?.url === "app://app/api/preview"
    && request?.method === "POST"
    && body?.maxWidth === 120
    && body?.maxHeight === 120
    && body?.recipe?.border?.top === 0
    && body?.recipe?.border?.bottom === 0
    && body?.recipe?.border?.left === 0
    && body?.recipe?.border?.right === 0
    && Array.isArray(body?.recipe?.texts)
    && body.recipe.texts.length === 0
}

const thumbnailPathFromRequest = (request) => parseRequestBody(request)?.recipe?.imagePath ?? null

const waitForVisiblePreviewPhoto = async (client, artifactRoot, label) => {
  try {
    const metrics = await waitFor(
      `${label}照片内容像素`,
      () => readPreviewCanvasMetrics(client),
      (value) => hasVisiblePhotoContent(value)
    )
    // Canvas 已经完成真实照片绘制后再调用 CDP 截图，避免 captureScreenshot 与
    // 大图解码/重绘竞争造成超时；截图仍然来自当前 BrowserWindow 的可见页面。
    const screenshotPath = await captureRendererScreenshot(client, artifactRoot, label)
    report(`${label}：${formatPreviewCanvasMetrics(metrics)}；截图=${screenshotPath}`)
    return { metrics, screenshotPath }
  } catch (error) {
    const metrics = await readPreviewCanvasMetrics(client).catch(() => null)
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}；${label}截图未完成；${metrics === null ? "无法读取 Canvas 指标" : formatPreviewCanvasMetrics(metrics)}`
    )
  }
}

/**
 * 将窗口请求缩至最小值。
 * Electron 的远程调试协议不提供 Browser.getWindowForTarget，使用页面自身的
 * window.resizeTo 请求实际 BrowserWindow 尺寸，并读取 outerWidth/outerHeight
 * 确认 Electron 已按应用最小值钳制，而不是仅模拟 CSS viewport。
 */
const readRendererWindowBounds = async (client) => await evaluate(client, `(async () => ({
  renderer: { width: window.outerWidth, height: window.outerHeight },
  browserWindow: await window.desktop?.getWindowBounds?.() ?? null
}))()`)

const exactWindowSize = (bounds, width, height) =>
  bounds?.browserWindow?.width === width
  && bounds?.browserWindow?.height === height
  && bounds?.renderer?.width === width
  && bounds?.renderer?.height === height

const resizeToMinimumWindow = async (client) => {
  const initialBounds = await readRendererWindowBounds(client)
  assert.equal(Number.isFinite(initialBounds?.renderer?.width) && Number.isFinite(initialBounds?.renderer?.height), true, "无法取得初始窗口尺寸")
  await evaluate(client, "window.resizeTo(1, 1)")
  const minimumBounds = await waitFor(
    "应用允许的最小窗口尺寸",
    () => readRendererWindowBounds(client),
    (bounds) => Number.isFinite(bounds?.renderer?.width)
      && Number.isFinite(bounds?.renderer?.height)
      && bounds.renderer.width > 1
      && bounds.renderer.height > 1
      && (bounds.renderer.width < initialBounds.renderer.width || bounds.renderer.height < initialBounds.renderer.height)
  )
  return { initialBounds, minimumBounds }
}

const restoreWindowBounds = async (client, bounds) => {
  await evaluate(client, `window.resizeTo(${bounds.width}, ${bounds.height})`)
  await waitFor(
    "恢复默认窗口尺寸",
    () => readRendererWindowBounds(client),
    (current) => exactWindowSize(current, bounds.width, bounds.height)
  )
}

const resizeWindowToBounds = async (client, width, height) => {
  await evaluate(client, `window.resizeTo(${width}, ${height})`)
  return await waitFor(
    `${width}×${height} 窗口`,
    () => readRendererWindowBounds(client),
    (bounds) => exactWindowSize(bounds, width, height)
  )
}

const waitForDevTools = async (port, child, logs) => await waitFor(
  "Electron 远程调试端点",
  async () => await fetchJson(`http://127.0.0.1:${port}/json/list`),
  (targets) => Array.isArray(targets) && targets.some((target) => target.type === "page"),
  DEFAULT_TIMEOUT_MS
).catch((error) => {
  if (child.exitCode !== null) {
    throw new Error(`${error.message}\nElectron 已退出，日志：\n${logs.join("")}`)
  }
  throw error
})

const run = async () => {
  const executable = findPackagedExecutable()
  assert.equal(existsSync(executable), true, `找不到当前打包应用：${executable}，请先运行 pnpm package`)
  const bundledJava = bundledJavaPathFor(executable)
  assert.equal(existsSync(bundledJava), true, `打包应用缺少随包 JRE：${bundledJava}`)
  const bundledExifTool = bundledExifToolPathFor(executable)
  assert.equal(existsSync(bundledExifTool), true, `打包应用缺少随包 ExifTool：${bundledExifTool}`)
  const resourcesDir = resourcesDirectoryFor(executable)
  const packageManifestPath = path.join(resourcesDir, "package-manifest.json")
  assert.equal(existsSync(packageManifestPath), true, `打包应用缺少 package-manifest.json：${packageManifestPath}`)
  const packageManifest = JSON.parse(readFileSync(packageManifestPath, "utf8"))
  assert.equal(packageManifest.platform, process.platform)
  assert.equal(packageManifest.arch, process.arch)
  assert.match(packageManifest.commit, /^[0-9a-f]{40}$/)
  assert.match(packageManifest.components?.javaEngine?.sha256 ?? "", /^[0-9a-f]{64}$/)
  assert.match(packageManifest.components?.exiftool?.sha256 ?? "", /^[0-9a-f]{64}$/)
  assert.ok(Array.isArray(packageManifest.components?.fonts) && packageManifest.components.fonts.length > 0, "安装包字体清单为空")

  const sample = path.resolve(process.env["CAMBORDER_E2E_SAMPLE"] ?? DEFAULT_SAMPLE)
  assert.equal(existsSync(sample), true, `找不到固定 E2E 样片：${sample}`)
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "camera-border-packaged-e2e-"))
  // 这是一个 RAW 边界样片：容器前缀后嵌入真实 JPEG 字节，只验证生产链路读取
  // 内嵌 JPEG 的行为，不把合成容器冒充为传感器 RAW，也不引入任何显影程序。
  const rawEmbeddedJpegSample = path.join(temporaryRoot, "embedded-preview.nef")
  writeFileSync(rawEmbeddedJpegSample, Buffer.concat([
    Buffer.from("CAMBORDER-STAGE6-EMBEDDED-JPEG\0", "utf8"),
    readFileSync(sample)
  ]))
  const extraSamples = [
    path.join(ROOT, "fixtures", "stage4", "real-exif-canon-farmers-nooning.tif"),
    path.join(ROOT, "fixtures", "stage4", "real-orientation-icc-iphone12pro.heic"),
    path.join(ROOT, "fixtures", "stage4", "asymmetric-color.png"),
    rawEmbeddedJpegSample
  ]
  for (const extraSample of extraSamples) {
    assert.equal(existsSync(extraSample), true, `找不到固定附加 E2E 样片：${extraSample}`)
  }
  const realImportSamplePaths = [sample, ...extraSamples]
  const initialQueueCount = realImportSamplePaths.length + 1
  const sourceShaBeforeByPath = Object.fromEntries(realImportSamplePaths.map((filePath) => [filePath, sha256File(filePath)]))
  const sourceShaBefore = sourceShaBeforeByPath[sample]

  const configuredArtifactRoot = process.env["CAMBORDER_E2E_ARTIFACT_DIR"]
  const artifactRoot = configuredArtifactRoot === undefined
    ? mkdtempSync(path.join(tmpdir(), "camera-border-packaged-e2e-artifacts-"))
    : path.resolve(configuredArtifactRoot)
  mkdirSync(artifactRoot, { recursive: true })
  const ownsArtifactRoot = configuredArtifactRoot === undefined
  const output = path.resolve(process.env["CAMBORDER_E2E_OUTPUT"] ?? path.join(temporaryRoot, "packaged-e2e-output.png"))
  // 从真实 JPEG 派生一个保留 JPEG 头但被截断的失败文件，只用于真实验证逐项失败和
  // 「重试失败项」路径；它不是新增照片样片，也不以字符串伪造图片。
  const retryFailureSample = path.join(temporaryRoot, "retry-failure.jpg")
  copyFileSync(sample, retryFailureSample)
  truncateSync(retryFailureSample, Math.min(64, statSync(retryFailureSample).size - 1))
  const retryOutputDirectory = mkdtempSync(path.join(temporaryRoot, "retry-output-"))
  const retryOutputCandidates = ["png", "jpg", "tif"].map((extension) =>
    path.join(retryOutputDirectory, `retry-failure-border.${extension}`)
  )
    const uiPerformanceSampleDirectory = path.join(temporaryRoot, "ui-performance-samples")
    const uiPerformanceBaseSample = path.join(ROOT, "fixtures", "stage4", "asymmetric-color.png")
    assert.equal(existsSync(uiPerformanceBaseSample), true, `找不到 UI 性能回归样片：${uiPerformanceBaseSample}`)
    mkdirSync(uiPerformanceSampleDirectory, { recursive: true })
    const uiPerformanceSamplePaths = Array.from({ length: UI_PERFORMANCE_QUEUE_COUNT }, (_, index) => {
      const filePath = path.join(uiPerformanceSampleDirectory, `queue-${String(index + 1).padStart(3, "0")}.png`)
      try {
        // 同一张真实小型 PNG 通过独立硬链接形成 100 个真实文件路径；此处
        // 只验证队列虚拟化/批量 UI，不把重复高分辨率解码成本混入性能闸门。
        linkSync(uiPerformanceBaseSample, filePath)
      } catch {
        // 跨文件系统时硬链接不可用，退回到真实文件复制，仍由 preload 扫描目录并导入。
        copyFileSync(uiPerformanceBaseSample, filePath)
      }
    return filePath
  })
  assert.equal(uiPerformanceSamplePaths.every((filePath) => existsSync(filePath)), true, "100 项 UI 性能样片准备失败")
  const configuredUserData = process.env["CAMBORDER_E2E_USER_DATA_DIR"]
  const userData = configuredUserData === undefined
    ? path.join(temporaryRoot, "user-data")
    : path.resolve(configuredUserData)
  rmSync(output, { force: true })

  const debugPort = await getFreePort()
  const enginePort = await getFreePort()
  const logs = []
  const {
    ELECTRON_RENDERER_URL: _rendererUrl,
    CAMBORDER_ENGINE_PORT: _enginePort,
    ...cleanEnv
  } = process.env
  const packagedEnv = {
    ...cleanEnv,
    CAMBORDER_E2E: "1",
    CAMBORDER_E2E_SAMPLE: sample,
    CAMBORDER_E2E_RETRY_SAMPLE: retryFailureSample,
    CAMBORDER_E2E_EXTRA_SAMPLES: JSON.stringify(extraSamples),
    CAMBORDER_E2E_TEMPLATE: path.join(ROOT, "fixtures", "stage4", "v1-legacy-template.json"),
    CAMBORDER_E2E_LOGO: path.join(ROOT, "fixtures", "stage4", "transparent-logo.png"),
    CAMBORDER_E2E_QUEUE_DIR: uiPerformanceSampleDirectory,
    CAMBORDER_E2E_OUTPUT: output,
    CAMBORDER_E2E_OUTPUT_DIR: retryOutputDirectory,
    CAMBORDER_ENGINE_PORT: String(enginePort)
  }
  let child = spawn(executable, [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userData}`
  ], {
    cwd: path.dirname(executable),
    env: packagedEnv,
    stdio: ["ignore", "pipe", "pipe"]
  })
  child.stdout.on("data", (chunk) => logs.push(String(chunk)))
  child.stderr.on("data", (chunk) => logs.push(String(chunk)))
  report(`启动当前打包应用：${executable}`)
  report(`临时 userData：${userData}；独立引擎端口：${enginePort}`)
  report(`截图证据目录：${artifactRoot}`)

  let client = null
  const knownJavaPids = new Set()
  const engineLogPath = path.join(userData, "logs", "engine.log")
  try {
    const targets = await waitForDevTools(debugPort, child, logs)
    report(`Electron CDP 已就绪：127.0.0.1:${debugPort}`)
    const pageTarget = targets.find((target) => target.type === "page" && typeof target.webSocketDebuggerUrl === "string")
    assert.notEqual(pageTarget, undefined, "未找到 Electron 页面 CDP target")
    client = await CdpClient.connect(pageTarget.webSocketDebuggerUrl)
    report("已连接 app:// Renderer")
    const requests = []
    const requestDetails = []
    const responseDetails = []
    const failedRequests = []
    const consoleRecords = []
    const runtimeExceptions = []
    const logEntries = []
    const attachProtocolListeners = (currentClient) => {
      currentClient.on("Network.requestWillBeSent", (params) => {
        const url = params.request?.url
        if (typeof url === "string") {
          requests.push(url)
          requestDetails.push({ id: params.requestId, method: params.request?.method, url, postData: params.request?.postData ?? null })
        }
      })
      currentClient.on("Network.responseReceived", (params) => {
        const url = params.response?.url
        if (typeof url === "string") {
          responseDetails.push({ id: params.requestId, status: params.response?.status, url })
        }
      })
      currentClient.on("Network.loadingFailed", (params) => {
        failedRequests.push({ id: params.requestId, errorText: params.errorText, canceled: params.canceled })
      })
      currentClient.on("Runtime.consoleAPICalled", (params) => {
        consoleRecords.push(params)
      })
      currentClient.on("Runtime.exceptionThrown", (params) => {
        runtimeExceptions.push(params)
      })
      currentClient.on("Log.entryAdded", (params) => {
        logEntries.push(params)
      })
    }
    attachProtocolListeners(client)
    report("启用 CDP Runtime")
    await client.call("Runtime.enable")
    report("启用 CDP Network")
    await client.call("Network.enable")
    report("启用 CDP Log")
    await client.call("Log.enable")

    await waitFor("app:// 页面", () => evaluate(client, "location.href"), (url) => url === "app://app/index.html")
    assert.equal(await evaluate(client, "location.href"), "app://app/index.html")
    assert.equal(await evaluate(client, "window.desktopRuntime?.engine?.managed"), true, "E2E 未运行在托管 JavaBridge 模式")
    const packageCapabilities = await waitFor(
      "安装包能力快照",
      () => evaluate(client, "window.desktop?.getPackageCapabilities?.() ?? null"),
      (value) => value !== null && value.isPackaged === true
        && value.bundledRuntime === true
        && value.bundledExifTool === true
        && value.bundledHeicDecoder === true
        && Array.isArray(value.bundledFonts)
        && value.bundledFonts.length > 0
    )
    assert.equal(packageCapabilities.platform, process.platform)
    assert.equal(packageCapabilities.arch, process.arch)
    const initialLog = await waitFor(
      "随包 JRE 启动记录",
      () => readEngineLog(engineLogPath),
      (log) => log.includes(`java=${bundledJava}`)
        && log.includes("requireBundledRuntime=true")
        && enginePidsFromLog(log).length >= 1
    )
    const firstJavaPid = enginePidsFromLog(initialLog)[0]
    assert.ok(firstJavaPid !== undefined && firstJavaPid > 0, "未记录首个托管 Java PID")
    knownJavaPids.add(firstJavaPid)

    const csp = await evaluate(client, "fetch(location.href).then((response) => response.headers.get('Content-Security-Policy'))")
    assert.equal(csp, EXPECTED_CONTENT_SECURITY_POLICY, "app:// 页面没有收到预期 CSP")
    const externalFetchBlocked = await evaluate(
      client,
      "fetch('https://example.invalid/camborder-csp-probe').then(() => false).catch(() => true)"
    )
    assert.equal(externalFetchBlocked, true, "CSP 没有拦截外网 fetch")
    await sleep(100)
    assert.equal(
      requests.includes("https://example.invalid/camborder-csp-probe"),
      false,
      "CSP 拦截的外网 URL 不应出现在 Network 记录"
    )

    // 通过页面自身的相对请求触发一次可观测的 app:// 健康检查。
    await evaluate(client, "fetch('/api/health').then((response) => response.status)")
    await waitFor("JavaBridge 健康端点 HTTP 200", () => readAppHealthStatus(client), isHealthyHttpStatus)

    await clickButton(client, `(() => { const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '选择照片'); if (button === undefined) return false; button.click(); return true })()`, "选择照片按钮")
    await waitFor(
      "固定样片进入队列",
      () => evaluate(client, "[...document.querySelectorAll('.queueItem')].map((item) => item.textContent ?? '').join('\\n')"),
      (text) => realImportSamplePaths.every((filePath) => text.includes(path.basename(filePath)))
        && text.includes(path.basename(retryFailureSample))
    )
    await waitFor(
      "固定样片队列数量",
      () => evaluate(client, "document.querySelectorAll('.queueItem').length"),
      (count) => count === initialQueueCount
    )
    await waitFor("引擎预览画布", () => evaluate(client, "Boolean(document.querySelector('canvas.previewCanvas'))"), (visible) => visible === true)

    const thumbnail = await waitFor(
      "可解码的实际缩略图",
      () => evaluate(client, `(() => {
        const image = document.querySelector('img.queueThumbImg');
        if (image === null) return null;
        return {
          src: image.currentSrc || image.src,
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight
        };
      })()`),
      (value) => value !== null
        && typeof value.src === "string"
        && (value.src.startsWith("blob:") || value.src.startsWith("app://app/previews/") || value.src.startsWith("data:image/"))
        && value.complete === true
        && value.naturalWidth > 0
        && value.naturalHeight > 0
    )
    assert.equal(
      thumbnail.src.startsWith("blob:") || thumbnail.src.startsWith("app://app/previews/") || thumbnail.src.startsWith("data:image/"),
      true,
      `缩略图不是允许的实际预览地址：${thumbnail.src}`
    )
    assert.equal(thumbnail.complete, true)
    assert.ok(thumbnail.naturalWidth > 0 && thumbnail.naturalHeight > 0, "缩略图没有可解码尺寸")

    const jpegExifResponse = await readEnginePhotoMetadata(client, sample)
    assert.equal(jpegExifResponse.status, 200, "真实 JPEG EXIF 请求未返回 HTTP 200")
    assert.equal(jpegExifResponse.body?.cameraModel?.includes("Canon"), true, "JPEG EXIF 缺少相机")
    assert.equal(jpegExifResponse.body?.lensModel?.includes("EF24-70mm"), true, "JPEG EXIF 缺少镜头")
    assert.equal(jpegExifResponse.body?.fNumber, "f/11", "JPEG EXIF 光圈不一致")
    assert.equal(jpegExifResponse.body?.exposureTime, "1/125 s", "JPEG EXIF 快门不一致")
    assert.equal(jpegExifResponse.body?.iso, "200", "JPEG EXIF ISO 不一致")
    assert.equal(jpegExifResponse.body?.focalLength, "31 mm", "JPEG EXIF 焦距不一致")
    assert.equal(jpegExifResponse.body?.dateTimeOriginal, "2017:05:11 15:52:33", "JPEG EXIF 日期不一致")
    const tiffExifResponse = await readEnginePhotoMetadata(
      client,
      path.join(ROOT, "fixtures", "stage4", "real-exif-canon-farmers-nooning.tif")
    )
    assert.equal(tiffExifResponse.status, 200, "真实 TIFF EXIF 请求未返回 HTTP 200")
    assert.equal(tiffExifResponse.body?.cameraModel?.includes("Canon"), true, "TIFF EXIF 缺少相机")
    assert.equal(tiffExifResponse.body?.dateTimeOriginal, "2006:12:05 03:45:51", "TIFF EXIF 日期不一致")

    const heicFileName = path.basename(extraSamples[1])
    assert.equal(await selectQueueItemByFileName(client, heicFileName), true, "无法选择真实 HEIC 样片")
    const heicRow = await waitFor(
      "真实 HEIC 转换队列项",
      () => evaluate(client, `(() => {
        const row = [...document.querySelectorAll('.queueItem')].find((item) => item.querySelector('.queueName')?.textContent?.includes(${JSON.stringify(heicFileName)}));
        return row === undefined ? null : {
          sourceName: row.querySelector('.queueName')?.textContent?.trim() ?? '',
          workingPath: row.querySelector('.queueSub')?.getAttribute('title') ?? '',
          converted: row.querySelector('.queueRawBadge')?.textContent?.includes('HEIC→PNG') ?? false
        };
      })()`),
      (value) => value !== null && value.converted === true && value.workingPath.length > 0
    )
    const heicExifResponse = await readEnginePhotoMetadata(client, heicRow.workingPath)
    assert.equal(heicExifResponse.status, 200, "真实 HEIC 转换后的 EXIF 请求未返回 HTTP 200")
    assert.equal(heicExifResponse.body?.cameraModel?.includes("iPhone 12 Pro"), true, "HEIC EXIF 缺少真实相机")
    assert.equal(heicExifResponse.body?.dateTimeOriginal, "2023:10:22 09:39:48", "HEIC EXIF 日期不一致")
    const heicCanvasOrientation = await waitForVisiblePreviewPhoto(client, artifactRoot, "真实 HEIC 方向-引擎已同步")
    assert.equal(
      heicCanvasOrientation.metrics.drawableImage.width > heicCanvasOrientation.metrics.drawableImage.height,
      true,
      `真实 HEIC irot 方向未应用到工作图：${formatPreviewCanvasMetrics(heicCanvasOrientation.metrics)}`
    )
    const rawFileName = path.basename(rawEmbeddedJpegSample)
    assert.equal(await selectQueueItemByFileName(client, rawFileName), true, "无法选择 RAW 内嵌 JPEG 样片")
    const rawPreview = await waitFor(
      "RAW 内嵌 JPEG 预览响应",
      () => readLatestEnginePreviewResponse(client, responseDetails),
      (payload) => payload?.sourceDecode?.mode === "embedded-jpeg"
        && payload?.fidelityReport?.pixelSource === "embedded-jpeg"
        && payload?.fidelityReport?.fidelityScope === "limited"
        && payload?.fidelityReport?.source?.width > 0
        && payload?.fidelityReport?.source?.height > 0
    )
    assert.equal(rawPreview.sourceDecode.format, "nef", "RAW 预览没有报告实际 RAW 扩展名")
    assert.ok(rawPreview.fidelityReport.source.width > 0, "RAW 内嵌 JPEG 没有报告实际宽度")
    assert.ok(rawPreview.fidelityReport.source.height > 0, "RAW 内嵌 JPEG 没有报告实际高度")
    assert.match(rawPreview.sourceDecode.warning ?? "", /内嵌 JPEG/)
    await waitForVisiblePreviewPhoto(client, artifactRoot, "RAW 内嵌 JPEG-引擎已同步")
    assert.equal(await selectQueueItemByFileName(client, path.basename(sample)), true, "无法切回真实 JPEG 样片")
    await waitForVisiblePreviewPhoto(client, artifactRoot, "切回真实 JPEG-引擎已同步")

    await waitFor(
      "导入后自动应用摄影信息卡",
      () => evaluate(client, `(() => {
        const card = [...document.querySelectorAll('.templateGalleryCard')].find((item) =>
          item.querySelector('.templateGalleryName')?.textContent?.trim() === '摄影信息卡'
        );
        return card?.querySelector('.templateGalleryApplyButton')?.textContent?.trim() ?? '';
      })()`),
      (label) => label === "已应用"
    )
    await waitFor(
      "默认摄影信息卡引擎预览已同步",
      () => evaluate(client, "document.querySelector('.previewSyncBadge')?.textContent ?? ''"),
      (text) => text.includes("引擎预览已同步")
    )
    const defaultPreview = await waitForVisiblePreviewPhoto(client, artifactRoot, "默认摄影信息卡-引擎已同步")
    const previewFidelity = await waitFor(
      "预览响应实际 ICC 报告",
      () => readLatestEnginePreviewResponse(client, responseDetails),
      (payload) => payload?.fidelityReport?.verified === true
        && payload.fidelityReport?.output?.width > 0
        && payload.fidelityReport?.output?.height > 0
        && payload.fidelityReport?.output?.icc?.state === "present"
    )
    assert.equal(previewFidelity.fidelityReport.output.colorSpace, "icc", "预览响应没有报告实际 ICC 色彩空间")
    assert.equal(previewFidelity.fidelityReport.output.bitDepth, 8, "JPEG 预览响应没有报告实际 8-bit 位深")

    const responsiveEvidence = {}
    for (const nextTheme of ["dark", "warm"]) {
      assert.equal(
        await setFormControlValue(client, 'select[aria-label="界面主题"]', nextTheme, "change"),
        true,
        `无法切换到${nextTheme}主题`
      )
      await waitFor(
        `${nextTheme}主题生效`,
        () => evaluate(client, "document.querySelector('.workspaceShell')?.getAttribute('data-theme') ?? ''"),
        (value) => value === nextTheme
      )
      for (const size of STAGE2_RESPONSIVE_WINDOW_SIZES) {
        await resizeWindowToBounds(client, size.width, size.height)
        await waitFor(
          `${nextTheme}主题导出状态可用`,
          async () => ({ healthStatus: await readAppHealthStatus(client), readiness: await readExportReadiness(client) }),
          (value) => isHealthyHttpStatus(value?.healthStatus) && value?.readiness?.disabled === false,
          20_000
        )
        await waitFor(
          `${nextTheme}主题视觉过渡完成`,
          () => readThemeContrastMetrics(client),
          (value) => typeof value?.contrast?.button === "number" && value.contrast.button >= 4.5
        )
        const metrics = await waitFor(
          `${nextTheme} ${size.width}×${size.height} 响应式布局`,
          () => readWorkspaceResponsiveMetrics(client),
          responsiveLayoutPasses
        )
        const actualBounds = await readRendererWindowBounds(client)
        assert.equal(
          exactWindowSize(actualBounds, size.width, size.height),
          true,
          `${size.width}×${size.height} 没有取得 BrowserWindow 与 Renderer 的同尺寸证据：${JSON.stringify(actualBounds)}`
        )
        const contrast = await readThemeContrastMetrics(client)
        const contrastValues = Object.values(contrast.contrast).filter((value) => typeof value === "number")
        assert.ok(contrastValues.length >= 4, `${nextTheme}主题没有取得完整文字对比度指标`)
        assert.equal(
          contrastValues.every((value) => value >= 4.5),
          true,
          `${nextTheme}主题存在低于 AA 的文字/控件对比度：${JSON.stringify(contrast)}`
        )
        const screenshotPath = await captureRendererScreenshot(
          client,
          artifactRoot,
          `${size.width}x${size.height}-${nextTheme}`
        )
        const evidenceKey = `${size.width}x${size.height}-${nextTheme}`
        responsiveEvidence[evidenceKey] = { actualBounds, metrics, contrast, screenshotPath }
        report(`${evidenceKey}：预览=${metrics.preview.width}×${metrics.preview.height}；截图=${screenshotPath}；对比度=${JSON.stringify(contrast.contrast)}`)
      }
    }
    assert.equal(
      await setFormControlValue(client, 'select[aria-label="界面主题"]', "dark", "change"),
      true,
      "无法恢复深色影棚主题"
    )
    await waitFor(
      "恢复深色影棚主题",
      () => evaluate(client, "document.querySelector('.workspaceShell')?.getAttribute('data-theme') ?? ''"),
      (value) => value === "dark"
    )
    await resizeWindowToBounds(client, 1400, 920)
    for (const background of ["black", "gray", "white"]) {
      await clickButton(client, `(() => {
        const button = [...document.querySelectorAll('.workspacePreviewBackgroundButton')].find((item) => item.textContent?.trim() === ${JSON.stringify(background === "black" ? "中性黑" : background === "gray" ? "中性灰" : "中性白")});
        if (button === undefined) return false;
        button.click();
        return true;
      })()`, `${background}预览背景按钮`)
      await waitFor(
        `${background}预览背景生效`,
        () => readWorkspaceResponsiveMetrics(client),
        (metrics) => metrics.previewBackground === background
      )
    }
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('.workspacePreviewBackgroundButton')].find((item) => item.textContent?.trim() === '中性灰');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "恢复中性灰预览背景按钮")

    const validPreviewUrl = requests.find((url) => url.startsWith("app://app/previews/"))
    assert.notEqual(validPreviewUrl, undefined, "没有记录有效 app:// 预览路由")
    const routeStatus = await evaluate(
      client,
      `(async () => {
        const [valid, bare, malformed] = await Promise.all([
          fetch(${JSON.stringify(validPreviewUrl)}),
          fetch('/previews'),
          fetch('/previews/route-check/extra')
        ]);
        return { valid: valid.status, bare: bare.status, malformed: malformed.status };
      })()`
    )
    assert.equal(routeStatus.valid, 200, "有效 app:// 预览路由未成功")
    assert.ok(routeStatus.bare >= 400, "裸 /previews 路径必须失败")
    assert.ok(routeStatus.malformed >= 400, "畸形 /previews 路径必须失败")

    const previewPostsBeforeTemplate = requests.filter((url) => url === "app://app/api/preview").length
    await clickButton(client, `(() => {
      const card = [...document.querySelectorAll('.templateGalleryCard')].find((item) =>
        item.querySelector('.templateGalleryName')?.textContent?.trim() === '全画幅叠字'
      );
      const button = card?.querySelector('button.templateGalleryApplyButton');
      if (button === null || button === undefined || button.textContent?.trim() !== '应用') return false;
      button.click();
      return true;
    })()`, "零边框模板使用按钮")
    await waitFor("零边框模板应用完成", () => evaluate(client, `(() => {
      const card = [...document.querySelectorAll('.templateGalleryCard')].find((item) =>
        item.querySelector('.templateGalleryName')?.textContent?.trim() === '全画幅叠字'
      );
      return card?.querySelector('.templateGalleryApplyButton')?.textContent?.trim() ?? '';
    })()`), (label) => label === "已应用")
    await waitFor(
      "零边框模板应用后的新引擎预览请求",
      () => requests.filter((url) => url === "app://app/api/preview").length,
      (count) => count > previewPostsBeforeTemplate
    )
    try {
      await waitFor(
        "零边框模板应用后的引擎同步完成",
        () => evaluate(client, "document.querySelector('.previewSyncBadge')?.textContent ?? ''"),
        (text) => text.includes("引擎预览已同步")
      )
    } catch (error) {
      const templateNetwork = {
        requests: requestDetails.slice(-20),
        responses: responseDetails.slice(-20),
        failed: failedRequests.slice(-20)
      }
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}；零边框模板网络诊断：${JSON.stringify(templateNetwork)}`
      )
    }
    const zeroBorderPreview = await waitForVisiblePreviewPhoto(client, artifactRoot, "零边框模板-引擎已同步")

    // 真实工作台流程：页签、摄影信息覆盖、资料库、预设管理/应用、用户版式保存，
    // 均经当前 UI 完成；这些动作不会直接调用 Java API。
    await clickButton(client, `(() => {
      const tab = [...document.querySelectorAll('[role="tab"]')].find((item) => item.textContent?.trim() === '摄影信息');
      if (tab === undefined) return false;
      tab.click();
      return true;
    })()`, "摄影信息页签")
    await waitFor(
      "摄影信息页签内容",
      () => evaluate(client, "document.querySelectorAll('[role=tabpanel] .photoIdentityPanelInner').length"),
      (count) => count === 1
    )
    await clickButton(client, `(() => {
      const summary = document.querySelector('.identitySummary');
      if (summary === null) return false;
      summary.click();
      return true;
    })()`, "摄影信息覆盖展开")
    await waitFor("摄影信息编辑区", () => evaluate(client, "Boolean(document.querySelector('.identityEditor'))"), (visible) => visible === true)
    const exifCameraSource = await evaluate(client, `(() => {
      const badge = [...document.querySelectorAll('.identityFieldSourceBadge')].find((item) => item.closest('label')?.textContent?.includes('相机'));
      return badge?.textContent?.trim() ?? '';
    })()`)
    assert.equal(exifCameraSource, "EXIF", "真实 JPEG 相机字段没有以 EXIF 作为初始来源")
    assert.equal(
      await setFormControlValue(client, '.identityEditor input[placeholder="例如：Leica M6"]', "E2E Camera", "input"),
      true,
      "无法修改当前图片摄影信息"
    )
    await waitFor(
      "摄影信息覆盖已保存",
      () => evaluate(client, "document.querySelector('.identityEditor input[placeholder=\"例如：Leica M6\"]')?.value ?? ''"),
      (value) => value === "E2E Camera"
    )

    const assetLibraryOpener = `(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '打开资料库');
      if (button === undefined) return false;
      button.focus();
      button.click();
      return true;
    })()`
    await clickButton(client, assetLibraryOpener, "资料库入口")
    await waitFor("资料库抽屉", () => evaluate(client, "document.querySelector('[role=dialog] .assetPanelInner') !== null"), (visible) => visible === true)
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('[role=dialog] button')].find((item) => item.textContent?.trim() === '新增相机');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "新增相机按钮")
    await waitFor("相机资产编辑器", () => evaluate(client, "Boolean(document.querySelector('[role=dialog] .assetEditor'))"), (visible) => visible === true)
    assert.equal(
      await setFormControlValue(client, '[role=dialog] .assetEditor input[placeholder="例如：Leica"]', "E2E", "input"),
      true,
      "无法填写相机资产品牌"
    )
    assert.equal(
      await setFormControlValue(client, '[role=dialog] .assetEditor input[placeholder="例如：M6"]', "Camera Asset", "input"),
      true,
      "无法填写相机资产型号"
    )
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('[role=dialog] .assetEditorActions button')].find((item) => item.textContent?.trim() === '保存');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "保存相机资产按钮")
    await waitFor(
      "相机资产保存完成",
      () => evaluate(client, "document.querySelector('[role=dialog] .assetItem')?.textContent ?? ''"),
      (text) => text.includes("E2E Camera Asset")
    )
    await dispatchRendererKey(client, "Escape")
    await waitFor("资料库抽屉关闭", () => evaluate(client, "document.querySelector('[role=dialog]') === null"), (closed) => closed === true)
    assert.equal(
      await evaluate(client, "document.activeElement?.textContent?.trim() ?? ''"),
      "打开资料库",
      "资料库抽屉关闭后没有恢复入口焦点"
    )

    const presetLibraryOpener = `(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '管理拍摄信息预设');
      if (button === undefined) return false;
      button.focus();
      button.click();
      return true;
    })()`
    await clickButton(client, presetLibraryOpener, "拍摄信息预设入口")
    await waitFor("拍摄信息预设抽屉", () => evaluate(client, "document.querySelector('[role=dialog] .presetTextComposer') !== null"), (visible) => visible === true)
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('[role=dialog] button')].find((item) => item.textContent?.trim() === '开始录入');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "文字录入预设按钮")
    await waitFor("文字录入预设表单", () => evaluate(client, "Boolean(document.querySelector('[role=dialog] .presetTextComposerForm'))"), (visible) => visible === true)
    assert.equal(
      await setFormControlValue(client, '[role=dialog] .presetTextComposerForm input[placeholder="例如：135 Portra 日常"]', "打包 E2E 预设", "input"),
      true,
      "无法填写打包 E2E 预设名称"
    )
    assert.equal(
      await setFormControlValue(client, '[role=dialog] .presetTextComposerForm select', "6x10", "change"),
      true,
      "无法设置打包 E2E 拍摄画幅"
    )
    assert.equal(
      await setFormControlValue(client, '[role=dialog] .presetTextComposerForm input[placeholder="例如：Leica M6"]', "E2E Preset Camera", "input"),
      true,
      "无法填写打包 E2E 相机"
    )
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('[role=dialog] .presetTextComposerForm button')].find((item) => item.textContent?.trim() === '保存并应用');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "保存摄影预设按钮")
    await waitFor(
      "摄影预设作用域控件",
      () => evaluate(client, "document.querySelectorAll('[role=dialog] .presetScopeSelector button').length"),
      (count) => count === 3
    )
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('[role=dialog] .presetScopeSelector button')].find((item) => item.textContent?.trim() === '全部图片');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "全部图片作用域按钮")
    await waitFor(
      "新摄影预设进入列表",
      () => evaluate(client, "document.querySelector('[role=dialog] .presetItem')?.textContent ?? ''"),
      (text) => text.includes("打包 E2E 预设")
    )
    assert.equal(
      await setFormControlValue(client, '[role=dialog] select[aria-label="选择预设"]', await evaluate(client, "document.querySelector('[role=dialog] select[aria-label=\"选择预设\"] option:not([disabled])')?.value ?? ''"), "change"),
      true,
      "无法选择已保存摄影预设"
    )
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('[role=dialog] button')].find((item) => item.textContent?.trim() === '应用全部');
      if (button === undefined || button.disabled) return false;
      button.click();
      return true;
    })()`, "应用摄影预设到全部图片按钮")
    await waitFor(
      "摄影预设应用到全部图片",
      () => evaluate(client, "document.querySelectorAll('.queueItem .queuePresetIndicator').length"),
      (count) => count === initialQueueCount
    )
    await dispatchRendererKey(client, "Escape")
    await waitFor("摄影预设抽屉关闭", () => evaluate(client, "document.querySelector('[role=dialog]') === null"), (closed) => closed === true)
    assert.equal(
      await evaluate(client, "document.activeElement?.textContent?.trim() ?? ''"),
      "管理拍摄信息预设",
      "预设抽屉关闭后没有恢复入口焦点"
    )

    await clickButton(client, `(() => {
      const tab = [...document.querySelectorAll('[role="tab"]')].find((item) => item.textContent?.trim() === '摄影信息');
      if (tab === undefined) return false;
      tab.click();
      return true;
    })()`, "摄影预设优先级页签")
    await waitFor("摄影预设优先级编辑区", () => evaluate(client, "Boolean(document.querySelector('.identityEditor'))"), (visible) => visible === true)
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('.identityEditor button')].find((item) => item.textContent?.trim() === '清除当前图片覆盖');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "清除每图摄影信息覆盖按钮")
    const presetPriorityEvidence = await waitFor(
      "摄影预设覆盖 EXIF 的来源优先级",
      () => evaluate(client, `(() => {
        const badge = [...document.querySelectorAll('.identityFieldSourceBadge')].find((item) => item.closest('label')?.textContent?.includes('相机'));
        return {
          badge: badge?.textContent?.trim() ?? '',
          camera: [...document.querySelectorAll('.identitySummaryText')].map((item) => item.textContent?.trim() ?? '').join(' ')
        };
      })()`),
      (value) => value.badge === "摄影预设" && value.camera.includes("E2E Preset Camera")
    )

    await clickButton(client, `(() => {
      const tab = [...document.querySelectorAll('[role="tab"]')].find((item) => item.textContent?.trim() === '样式');
      if (tab === undefined) return false;
      tab.click();
      return true;
    })()`, "样式页签")
    const textLayerInput = '.textLayerCard:first-child input.settingTextInput'
    assert.equal(
      await setFormControlValue(client, textLayerInput, "Stage4 text edit", "input"),
      true,
      "无法编辑文字图层内容"
    )
    await waitFor(
      "文字图层编辑状态",
      () => evaluate(client, `document.querySelector(${JSON.stringify(textLayerInput)})?.value ?? ''`),
      (value) => value === "Stage4 text edit"
    )
    await waitFor(
      "文字图层摘要更新",
      () => evaluate(client, "document.querySelector('.textLayerCard:first-child .textLayerCardSummary')?.textContent?.trim() ?? ''"),
      (value) => value === "Stage4 text edit"
    )
    assert.equal(
      await setFieldSelectByLabel(client, "文字图层", "位置", "center"),
      true,
      "无法编辑文字图层位置为居中"
    )
    await waitFor(
      "文字图层居中位置配方",
      () => latestPreviewRecipe(requestDetails, sample)?.texts?.[0]?.placement ?? null,
      (value) => value === "image-center"
    )
    assert.equal(
      await setFieldSelectByLabel(client, "文字图层", "位置", "bottom-center"),
      true,
      "无法恢复文字图层底部位置"
    )
    assert.equal(await setFieldInputValue(client, "文字图层", "行距", 2), true, "无法编辑文字行距")
    assert.equal(await setFieldInputValue(client, "文字图层", "字距", 1), true, "无法编辑文字字距")
    await waitFor(
      "文字位置与间距保存到配方",
      () => {
        const recipe = latestPreviewRecipe(requestDetails, sample)
        return {
          placement: recipe?.texts?.[0]?.placement ?? null,
          lineSpacing: recipe?.texts?.[0]?.lineSpacing ?? null,
          letterSpacing: recipe?.texts?.[0]?.letterSpacing ?? null
        }
      },
      (value) => value.placement === "image-bottom-center" && value.lineSpacing === 2 && value.letterSpacing === 1
    )
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '管理用户版式');
      if (button === undefined) return false;
      button.focus();
      button.click();
      return true;
    })()`, "用户版式管理入口")
    await waitFor("用户版式抽屉", () => evaluate(client, "document.querySelector('[role=dialog] .templateNameInput') !== null"), (visible) => visible === true)
    assert.equal(
      await setFormControlValue(client, '[role=dialog] .templateNameInput', "打包 E2E 版式", "input"),
      true,
      "无法填写用户版式名称"
    )
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('[role=dialog] .templateNameRow button')].find((item) => item.textContent?.trim() === '保存');
      if (button === undefined || button.disabled) return false;
      button.click();
      return true;
    })()`, "保存用户版式按钮")
    await waitFor(
      "用户版式保存完成",
      () => evaluate(client, "document.querySelector('[role=dialog] .templateItem')?.textContent ?? ''"),
      (text) => text.includes("打包 E2E 版式")
    )
    await dispatchRendererKey(client, "Escape")
    await waitFor("用户版式抽屉关闭", () => evaluate(client, "document.querySelector('[role=dialog]') === null"), (closed) => closed === true)

    // 输出页签：只通过真实的三档档位和自定义档位操作；实际文件事实由
    // 应用报告、文件签名和独立 ExifTool 三方交叉核对。
    await clickButton(client, `(() => {
      const tab = [...document.querySelectorAll('[role="tab"]')].find((item) => item.textContent?.trim() === '输出');
      if (tab === undefined) return false;
      tab.click();
      return true;
    })()`, "输出页签")
    await waitFor("输出档位面板", () => evaluate(client, "document.querySelector('[data-testid=export-tier-standard-delivery]') !== null"), (visible) => visible === true)
    const chooseTier = async (tier) => {
      await clickButton(client, `(() => {
        const button = document.querySelector('[data-testid="export-tier-${tier}"]');
        if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
        button.click();
        return true;
      })()`, `${tier} 导出档位`)
      await waitFor(`${tier} 档位生效`, () => evaluate(client, `document.querySelector('[data-testid="export-tier-${tier}"]')?.getAttribute('aria-pressed')`), (pressed) => pressed === "true")
    }
    const tierEvidence = {}
    for (const configuration of [
      { tier: "quick-share", format: "jpeg" },
      { tier: "standard-delivery", format: "jpeg" },
      { tier: "high-fidelity-archive", format: "tiff" }
    ]) {
      await chooseTier(configuration.tier)
      const evidence = await exportCurrentSelection(client, output, artifactRoot, `stage6-${configuration.tier}`)
      assert.equal(evidence.dimensions?.format, configuration.format, `${configuration.tier} 实际格式不一致`)
      assert.ok(evidence.dimensions.width > 0 && evidence.dimensions.height > 0, `${configuration.tier} 输出尺寸无效`)
      const independent = readIndependentExifToolJson(bundledExifTool, evidence.path)
      const width = Number(exifValue(independent, "ImageWidth"))
      const height = Number(exifValue(independent, "ImageHeight"))
      assert.equal(width, evidence.dimensions.width, `${configuration.tier} ExifTool 宽度与文件解析不一致`)
      assert.equal(height, evidence.dimensions.height, `${configuration.tier} ExifTool 高度与文件解析不一致`)
      const independentDepth = independentBitDepth(independent)
      assert.ok(independentDepth === 8 || independentDepth === 16, `${configuration.tier} ExifTool 未返回真实 8/16-bit：${JSON.stringify(independent)}`)
      assert.equal(independentDepth, evidence.bitDepth, `${configuration.tier} 独立工具位深与文件解析不一致`)
      const metadataFacts = independentMetadataFacts(independent)
      assert.equal(metadataFacts.orientation, 1, `${configuration.tier} Orientation 未更新为实际输出方向`)
      if (configuration.tier === "quick-share") {
        assert.equal(metadataFacts.gps, false, "快速分享仍包含 GPS/位置字段")
      } else {
        assert.deepEqual(
          {
            exif: metadataFacts.exif,
            xmp: metadataFacts.xmp,
            iptc: metadataFacts.iptc,
            gps: metadataFacts.gps,
            icc: metadataFacts.icc,
            dpi: metadataFacts.dpi
          },
          { exif: true, xmp: true, iptc: true, gps: true, icc: true, dpi: true },
          `${configuration.tier} 独立 ExifTool 元数据不完整`
        )
      }
      tierEvidence[configuration.tier] = {
        evidence,
        independent: { width, height, bitDepth: independentDepth, colorSpace: metadataFacts.colorSpace, metadata: metadataFacts }
      }
    }
    await chooseTier("custom")
    await waitFor("自定义输出控件", () => evaluate(client, "document.querySelector('fieldset legend')?.textContent?.trim() === '自定义输出' || [...document.querySelectorAll('fieldset legend')].some((item) => item.textContent?.trim() === '自定义输出')"), (visible) => visible === true)
    assert.equal(await setFieldSelectByLabel(client, "输出格式", "格式", "png"), true, "自定义档位无法选择 PNG")
    const customEvidence = await exportCurrentSelection(client, output, artifactRoot, "stage6-custom-png")
    assert.equal(customEvidence.dimensions?.format, "png", "自定义 PNG 实际格式不一致")
    const customIndependent = readIndependentExifToolJson(bundledExifTool, customEvidence.path)
    assert.equal(Number(exifValue(customIndependent, "ImageWidth")), customEvidence.dimensions.width, "自定义 PNG 宽度校验失败")
    assert.equal(Number(exifValue(customIndependent, "ImageHeight")), customEvidence.dimensions.height, "自定义 PNG 高度校验失败")
    tierEvidence.custom = { evidence: customEvidence, independent: customIndependent }
    await chooseTier("standard-delivery")

    // 真实 TIFF 源图再次走当前工作台的单图导出，确认 TIFF 原生 metadata tree
    // 在尺寸变化后仍保留相机 EXIF 与 Adobe RGB ICC，而不是只验证 JPEG 源图。
    const realTiffPath = extraSamples[0]
    const realTiffFileName = path.basename(realTiffPath)
    assert.equal(await selectQueueItemByFileName(client, realTiffFileName), true, "无法切换真实 TIFF 样片")
    await waitForVisiblePreviewPhoto(client, artifactRoot, "真实 TIFF 样片-引擎已同步")
    await clickButton(client, `(() => {
      const tab = [...document.querySelectorAll('[role="tab"]')].find((item) => item.textContent?.trim() === '输出');
      if (tab === undefined) return false;
      tab.click();
      return true;
    })()`, "真实 TIFF 输出页签")
    await chooseTier("high-fidelity-archive")
    // 打包 E2E 的保存对话框由一个固定的真实输出路径驱动；格式由冻结的
    // RenderRecipe/ExportSettings 决定，因此这里复用同一路径并按文件签名核对 TIFF。
    const realTiffEvidence = await exportCurrentSelection(client, output, artifactRoot, "stage6-real-tiff-source")
    assert.deepEqual(realTiffEvidence.metadata, { exif: true, icc: true }, "真实 TIFF 输出元数据未保留")
    assert.equal(realTiffEvidence.dimensions?.format, "tiff", "真实 TIFF 输出格式不一致")
    const realTiffIndependent = readIndependentExifToolJson(bundledExifTool, realTiffEvidence.path)
    const realTiffSourceIndependent = readIndependentExifToolJson(bundledExifTool, realTiffPath)
    const realTiffSourceFacts = independentMetadataFacts(realTiffSourceIndependent)
    const realTiffOutputFacts = independentMetadataFacts(realTiffIndependent)
    assert.equal(Number(exifValue(realTiffIndependent, "ImageWidth")), realTiffEvidence.dimensions.width, "真实 TIFF 宽度校验失败")
    assert.equal(Number(exifValue(realTiffIndependent, "ImageHeight")), realTiffEvidence.dimensions.height, "真实 TIFF 高度校验失败")
    assert.equal(independentBitDepth(realTiffIndependent), realTiffEvidence.bitDepth, "真实 TIFF 位深校验失败")
    for (const field of ["exif", "xmp", "iptc", "gps", "icc", "dpi"]) {
      assert.equal(realTiffOutputFacts[field], realTiffSourceFacts[field], `真实 TIFF ${field} 元数据与源文件事实不一致`)
    }
    assert.equal(realTiffOutputFacts.orientation, 1, "真实 TIFF Orientation 未更新为实际输出方向")
    assert.equal(
      exifValue(realTiffIndependent, "ProfileDescription"),
      exifValue(realTiffSourceIndependent, "ProfileDescription"),
      "真实 TIFF ICC profile 描述未保留"
    )
    assert.equal(await selectQueueItemByFileName(client, path.basename(sample)), true, "无法切回真实 JPEG 样片")
    await waitForVisiblePreviewPhoto(client, artifactRoot, "真实 TIFF 导出后切回 JPEG-引擎已同步")
    await chooseTier("standard-delivery")

    // 旧阶段的逐样式光栅回归需要无损 PNG；阶段 6 的默认标准交付是 JPEG，
    // 因此在进入这组像素断言前显式切换为用户自定义 PNG，避免把档位默认值
    // 误当成导出格式契约。
    await chooseTier("custom")
    assert.equal(await setFieldSelectByLabel(client, "输出格式", "格式", "png"), true, "边框光栅回归无法选择 PNG")

    // v1 旧模板导入：在相同 PNG/原图设置下比较迁移前后的真实像素光栅，并检查
    // 持久化 v2 版式没有输出字段或旧布局字段。
    await clickButton(client, `(() => {
      const tab = [...document.querySelectorAll('[role="tab"]')].find((item) => item.textContent?.trim() === '样式');
      if (tab === undefined) return false;
      tab.click();
      return true;
    })()`, "迁移前样式页签")
    const legacyBefore = await exportCurrentSelection(client, output, artifactRoot, "stage4-legacy-before")
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '管理用户版式');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "旧模板导入入口")
    await waitFor("旧模板管理抽屉", () => evaluate(client, "document.querySelector('[role=dialog] .templateNameInput') !== null"), (visible) => visible === true)
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('[role=dialog] button')].find((item) => item.textContent?.trim() === '导入模板');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "导入 v1 模板按钮")
    await waitFor(
      "v1 模板进入用户版式库",
      () => evaluate(client, "[...document.querySelectorAll('[role=dialog] .templateItem .templateName')].map((item) => item.textContent?.trim() ?? '')"),
      (names) => names.includes("Stage4 v1 legacy")
    )
    await clickButton(client, `(() => {
      const item = [...document.querySelectorAll('[role=dialog] .templateItem')].find((candidate) => candidate.querySelector('.templateName')?.textContent?.trim() === 'Stage4 v1 legacy');
      const button = [...(item?.querySelectorAll('.templateActions button') ?? [])].find((candidate) => candidate.textContent?.trim() === '加载');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "加载 v1 迁移模板")
    await waitFor(
      "v1 迁移模板文字与布局",
      async () => ({
        text: await evaluate(client, `document.querySelector('.textLayerCard:first-child input.settingTextInput')?.value ?? ''`),
        recipe: latestPreviewRecipe(requestDetails, sample)
      }),
      (value) => value.text === "Stage4 text edit"
        && value.recipe?.imagePlacement?.mode === "fit"
        && value.recipe?.imagePlacement?.targetAspectRatio === null
    )
    const legacyAfter = await exportCurrentSelection(client, output, artifactRoot, "stage4-legacy-after")
    assert.equal(legacyBefore.rasterDigest, legacyAfter.rasterDigest, "v1 模板迁移前后输出像素不一致")
    const templateStorageSnapshot = await waitFor(
      "v2 版式持久化完成",
      () => {
        if (!existsSync(path.join(userData, "templates.json"))) return null
        try {
          return JSON.parse(readFileSync(path.join(userData, "templates.json"), "utf8"))
        } catch {
          return null
        }
      },
      (value) => Array.isArray(value)
        && value.some((item) => item?.name === "打包 E2E 版式")
        && value.some((item) => item?.name === "Stage4 v1 legacy")
    )
    const outputSettingKeys = ["exportFormat", "jpegQuality", "outputSizePreset", "customOutputLongEdge", "preserveMetadata", "preserveColorProfile", "preferHighBitDepth", "export", "output", "outputSettings", "outputPreset"]
    const templatesWithOutputSettings = templateStorageSnapshot.filter((item) =>
      outputSettingKeys.some((key) => key in (item?.settings ?? {}))
    )
    assert.deepEqual(templatesWithOutputSettings, [], "v2 版式 JSON 仍包含输出设置")
    const importedLegacyTemplate = templateStorageSnapshot.find((item) => item?.name === "Stage4 v1 legacy")
    assert.equal(importedLegacyTemplate?.settings?.imagePlacement?.mode, "fit", "v1 迁移后的 imagePlacement 未持久化")
    assert.equal("autoCrop" in (importedLegacyTemplate?.settings ?? {}), false, "v2 版式 JSON 仍包含旧 autoCrop")
    const legacyEvidence = {
      before: legacyBefore,
      after: legacyAfter,
      rasterEqual: legacyBefore.rasterDigest === legacyAfter.rasterDigest,
      importedSettings: importedLegacyTemplate?.settings,
      templatesWithOutputSettings: templatesWithOutputSettings.length
    }
    await dispatchRendererKey(client, "Escape")
    await waitFor("旧模板管理抽屉关闭", () => evaluate(client, "document.querySelector('[role=dialog]') === null"), (closed) => closed === true)

    await clickButton(client, `(() => {
      const card = [...document.querySelectorAll('.templateGalleryCard')].find((item) => item.querySelector('.templateGalleryName')?.textContent?.trim() === '摄影信息卡');
      const button = card?.querySelector('button.templateGalleryApplyButton');
      if (button === null || button === undefined || button.textContent?.trim() !== '应用') return false;
      button.click();
      return true;
    })()`, "恢复浅色摄影信息卡")
    await waitFor(
      "恢复浅色摄影信息卡",
      () => evaluate(client, `(() => {
        const card = [...document.querySelectorAll('.templateGalleryCard')].find((item) => item.querySelector('.templateGalleryName')?.textContent?.trim() === '摄影信息卡');
        return card?.querySelector('.templateGalleryApplyButton')?.textContent?.trim() ?? '';
      })()`),
      (label) => label === "已应用"
    )

    // 八种边框：每种先切换真实定义参数，再导出 PNG 并比较解码后的像素摘要，
    // 不能以“请求成功”替代“定义参数实际改变了成品”。
    const borderStyleIds = ["exhibition-line", "polaroid-shadow", "film-perforation", "mat-double-line", "torn-edge", "negative-band", "magazine-keyline", "archive-label-box"]
    const borderEvidence = {}
    assert.equal(await setFieldSelectValue(client, "边框风格", ""), true, "无法建立无装饰边框基线")
    const borderBaseline = await exportCurrentSelection(client, output, artifactRoot, "stage4-border-none")
    for (const [index, styleId] of borderStyleIds.entries()) {
      assert.equal(await setFieldSelectValue(client, "边框风格", styleId), true, `无法选择边框风格 ${styleId}`)
      assert.equal(await setFieldInputValue(client, "边框风格", "强度", 55 + index * 5), true, `${styleId} 无法设置强度`)
      if (styleId === "film-perforation" || styleId === "negative-band") {
        assert.equal(await setFieldInputValue(client, "边框风格", "齿孔/刻痕数", 10 + index), true, `${styleId} 无法设置齿孔/刻痕数`)
      } else {
        assert.equal(await setFieldInputValue(client, "边框风格", "特征宽度", 6 + index), true, `${styleId} 无法设置特征宽度`)
      }
      if (styleId !== "polaroid-shadow") {
        assert.equal(await setFieldInputValue(client, "边框风格", "装饰色", `#${String(35 + index * 8).padStart(2, "0")}2828`, "change"), true, `${styleId} 无法设置装饰色`)
      }
      await waitFor(
        `${styleId} 配方生效`,
        () => latestPreviewRecipe(requestDetails, sample)?.borderStyle ?? null,
        (value) => value?.id === styleId && value.intensity === 55 + index * 5
      )
      const evidence = await exportCurrentSelection(client, output, artifactRoot, `stage4-border-${styleId}`)
      assert.notEqual(evidence.rasterDigest, null, `${styleId} 导出无法读取真实 PNG 光栅`)
      assert.notEqual(evidence.rasterDigest, borderBaseline.rasterDigest, `${styleId} 定义参数没有改变导出像素`)
      borderEvidence[styleId] = { params: latestPreviewRecipe(requestDetails, sample)?.borderStyle ?? null, evidence }
    }
    assert.equal(new Set(Object.values(borderEvidence).map((entry) => entry.evidence.rasterDigest)).size, borderStyleIds.length, "八种边框成品像素存在重复")

    // 透明 Logo：同一张真实 PNG 在浅色/深色边框上分别比较 Canvas、引擎预览和导出
    // 光栅。深色背景额外比较新增白色像素，防止把透明区域错误拍平成白色矩形。
    const logoPath = path.join(ROOT, "fixtures", "stage4", "transparent-logo.png")
    const logoEvidence = {}
    assert.equal(await setFieldSelectValue(client, "边框风格", ""), true, "Logo 验收无法清除边框装饰")
    assert.equal(await setFieldCheckbox(client, "品牌标识", "显示品牌标识", false), true, "Logo 浅色基线无法关闭")
    const lightEngineOff = await readLatestEnginePreviewPng(client, responseDetails)
    assert.notEqual(lightEngineOff, null, "没有取得 Logo 浅色基线的真实引擎预览")
    writeFileSync(path.join(artifactRoot, "stage4-logo-light-engine-off.png"), lightEngineOff)
    const lightOff = await exportCurrentSelection(client, output, artifactRoot, "stage4-logo-light-off")
    const lightLogoRequestStart = requestDetails.length
    const lightLogoResponseStart = responseDetails.length
    assert.equal(await setFieldCheckbox(client, "品牌标识", "显示品牌标识", true), true, "Logo 无法启用")
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('fieldset')].find((item) => item.querySelector('legend')?.textContent?.trim() === '品牌标识')?.querySelector('button');
      if (button === undefined || button.textContent?.trim() !== '选择 PNG') return false;
      button.click();
      return true;
    })()`, "选择透明 PNG Logo 按钮")
    await waitFor(
      "透明 PNG Logo 路径",
      () => evaluate(client, "document.querySelector('.logoPathLabel')?.getAttribute('title') ?? ''"),
      (value) => value === logoPath
    )
    assert.equal(await setFieldInputValue(client, "品牌标识", "大小", 60), true, "无法调整 Logo 大小")
    const lightLogoMetrics = await waitFor(
      "浅色 Canvas Logo 绘制",
      async () => ({ redPixels: await readCanvasBorderRedPixelCount(client), recipe: latestPreviewRecipe(requestDetails, sample) }),
      (value) => value.redPixels > 0
        && requestDetails.length > lightLogoRequestStart
        && value.recipe?.logo?.enabled === true
        && value.recipe?.logo?.imagePath === logoPath
    )
    const lightEngineOn = await waitFor(
      "浅色引擎 Logo 预览",
      async () => {
        if (responseDetails.length <= lightLogoResponseStart) return null
        const png = await readLatestEnginePreviewPng(client, responseDetails, lightLogoResponseStart)
        return png === null ? null : { png, stats: readPngColorStats(png) }
      },
      (value) => value !== null && value.stats !== null && value.stats.redPixels > 0
    )
    writeFileSync(path.join(artifactRoot, "stage4-logo-light-engine-on.png"), lightEngineOn.png)
    const lightCanvasScreenshot = await captureRendererScreenshot(client, artifactRoot, "stage4-logo-light-canvas")
    const lightOn = await exportCurrentSelection(client, output, artifactRoot, "stage4-logo-light-on")
    const lightRasterComparison = comparePngRasters(readFileSync(lightOff.path), readFileSync(lightOn.path))
    assert.notEqual(lightRasterComparison, null, "浅色 Logo 导出光栅尺寸无法对齐")
    assert.ok(lightRasterComparison.changedPixels > 0 && lightRasterComparison.addedRedPixels > 0, "浅色 Logo 没有改变导出像素")
    logoEvidence.light = {
      canvasRedPixels: lightLogoMetrics.redPixels,
      canvasScreenshot: lightCanvasScreenshot,
      engine: { stats: lightEngineOn.stats, rasterDigest: readRasterDigest(lightEngineOn.png) },
      off: lightOff,
      on: lightOn,
      rasterComparison: lightRasterComparison
    }

    await clickButton(client, `(() => {
      const card = document.querySelector('.templateGalleryInfoCard');
      const button = [...(card?.querySelectorAll('button.templateGalleryVariantButton') ?? [])]
        .find((item) => item.textContent?.trim() === '黑边');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "恢复深色摄影信息卡")
    await waitFor(
      "深色摄影信息卡应用完成",
      async () => ({
        active: await evaluate(client, `(() => {
          const card = document.querySelector('.templateGalleryInfoCard');
          const blackButton = [...(card?.querySelectorAll('button.templateGalleryVariantButton') ?? [])]
            .find((item) => item.textContent?.trim() === '黑边');
          return blackButton?.classList.contains('templateGalleryVariantActive') ?? false;
        })()`),
        borderColor: latestPreviewRecipe(requestDetails, sample)?.border?.color ?? null
      }),
      (value) => value.active === true && value.borderColor === "#111111"
    )
    const darkLogoOffRequestStart = requestDetails.length
    const darkLogoOffResponseStart = responseDetails.length
    assert.equal(await setFieldCheckbox(client, "品牌标识", "显示品牌标识", false), true, "Logo 深色基线无法关闭")
    const darkLogoOffMetrics = await waitFor(
      "深色 Canvas Logo 基线",
      async () => ({ redPixels: await readCanvasBorderRedPixelCount(client), recipe: latestPreviewRecipe(requestDetails, sample) }),
      (value) => value.redPixels === 0 && requestDetails.length > darkLogoOffRequestStart && value.recipe?.logo?.enabled !== true
    )
    const darkEngineOff = await waitFor(
      "深色引擎 Logo 基线",
      async () => {
        if (responseDetails.length <= darkLogoOffResponseStart) return null
        const png = await readLatestEnginePreviewPng(client, responseDetails, darkLogoOffResponseStart)
        return png === null ? null : { png, stats: readPngColorStats(png) }
      },
      (value) => value !== null && value.stats !== null
    )
    writeFileSync(path.join(artifactRoot, "stage4-logo-dark-engine-off.png"), darkEngineOff.png)
    const darkOff = await exportCurrentSelection(client, output, artifactRoot, "stage4-logo-dark-off")
    const darkLogoOnRequestStart = requestDetails.length
    const darkLogoOnResponseStart = responseDetails.length
    assert.equal(await setFieldCheckbox(client, "品牌标识", "显示品牌标识", true), true, "Logo 深色背景无法启用")
    const darkLogoMetrics = await waitFor(
      "深色 Canvas Logo 绘制",
      async () => ({ redPixels: await readCanvasBorderRedPixelCount(client), recipe: latestPreviewRecipe(requestDetails, sample) }),
      (value) => value.redPixels > 0
        && requestDetails.length > darkLogoOnRequestStart
        && value.recipe?.logo?.enabled === true
        && value.recipe?.logo?.imagePath === logoPath
    )
    const darkEngineOn = await waitFor(
      "深色引擎 Logo 预览",
      async () => {
        if (responseDetails.length <= darkLogoOnResponseStart) return null
        const png = await readLatestEnginePreviewPng(client, responseDetails, darkLogoOnResponseStart)
        return png === null ? null : { png, stats: readPngColorStats(png) }
      },
      (value) => value !== null && value.stats !== null && value.stats.redPixels > 0
    )
    writeFileSync(path.join(artifactRoot, "stage4-logo-dark-engine-on.png"), darkEngineOn.png)
    const darkCanvasScreenshot = await captureRendererScreenshot(client, artifactRoot, "stage4-logo-dark-canvas")
    const darkOn = await exportCurrentSelection(client, output, artifactRoot, "stage4-logo-dark-on")
    const darkRasterComparison = comparePngRasters(readFileSync(darkOff.path), readFileSync(darkOn.path))
    const darkEngineComparison = comparePngRasters(darkEngineOff.png, darkEngineOn.png)
    assert.notEqual(darkRasterComparison, null, "深色 Logo 导出光栅尺寸无法对齐")
    assert.notEqual(darkEngineComparison, null, "深色 Logo 引擎光栅尺寸无法对齐")
    assert.ok(darkRasterComparison.changedPixels > 0 && darkRasterComparison.addedRedPixels > 0, "深色 Logo 没有改变导出像素")
    assert.ok(darkEngineComparison.changedPixels > 0 && darkEngineComparison.addedRedPixels > 0, "深色 Logo 没有改变引擎预览像素")
    assert.ok(darkRasterComparison.addedWhitePixels < Math.max(20, darkRasterComparison.addedRedPixels * 2), "深色 Logo 导出疑似产生白色背景污染")
    assert.ok(darkEngineComparison.addedWhitePixels < Math.max(20, darkEngineComparison.addedRedPixels * 2), "深色 Logo 引擎预览疑似产生白色背景污染")
    logoEvidence.dark = {
      canvasOffRedPixels: darkLogoOffMetrics.redPixels,
      canvasRedPixels: darkLogoMetrics.redPixels,
      canvasScreenshot: darkCanvasScreenshot,
      engineOff: { stats: darkEngineOff.stats, rasterDigest: readRasterDigest(darkEngineOff.png) },
      engineOn: { stats: darkEngineOn.stats, rasterDigest: readRasterDigest(darkEngineOn.png) },
      off: darkOff,
      on: darkOn,
      rasterComparison: darkRasterComparison,
      engineComparison: darkEngineComparison
    }

    // 非对称四色样片：Canvas 真实像素按四个直角旋转逐一核对，确保方向验证不是
    // 只看尺寸；Java 端同一 fixtures/stage4/asymmetric-color.png 已做同样核对。
    assert.equal(await setFieldCheckbox(client, "品牌标识", "显示品牌标识", false), true, "方向验收无法关闭 Logo")
    assert.equal(await setFieldSelectValue(client, "边框风格", ""), true, "方向验收无法清除边框装饰")
    await clickButton(client, `(() => {
      const card = [...document.querySelectorAll('.templateGalleryCard')].find((item) => item.querySelector('.templateGalleryName')?.textContent?.trim() === '全画幅叠字');
      const button = card?.querySelector('button.templateGalleryApplyButton');
      if (button === null || button === undefined) return false;
      button.click();
      return true;
    })()`, "非对称样片全画幅模板")
    await waitFor(
      "非对称样片全画幅模板应用",
      () => evaluate(client, `(() => {
        const card = [...document.querySelectorAll('.templateGalleryCard')].find((item) => item.querySelector('.templateGalleryName')?.textContent?.trim() === '全画幅叠字');
        return card?.querySelector('.templateGalleryApplyButton')?.textContent?.trim() ?? '';
      })()`),
      (label) => label === "已应用"
    )
    const asymmetricSamplePath = extraSamples[2]
    const asymmetricFileName = path.basename(asymmetricSamplePath)
    assert.equal(await selectQueueItemByFileName(client, asymmetricFileName), true, "无法选择非对称方向样片")
    const asymmetricExpected = {
      0: [[220, 35, 35], [35, 180, 75], [35, 80, 220], [245, 205, 40]],
      90: [[35, 80, 220], [220, 35, 35], [245, 205, 40], [35, 180, 75]],
      180: [[245, 205, 40], [35, 80, 220], [35, 180, 75], [220, 35, 35]],
      270: [[35, 180, 75], [245, 205, 40], [220, 35, 35], [35, 80, 220]]
    }
    const asymmetricEvidence = {}
    for (const rotation of [0, 90, 180, 270]) {
      assert.equal(await setFieldInputValue(client, "图片区域", "旋转", rotation), true, `非对称样片无法设置旋转 ${rotation}`)
      const corners = await waitFor(
        `非对称样片旋转 ${rotation} Canvas 像素`,
        async () => ({
          corners: await readCanvasAsymmetricCorners(client),
          recipe: latestPreviewRecipe(requestDetails, asymmetricSamplePath)
        }),
        (value) => value.corners !== null
          && value.corners.colors.every((color) => color.some((channel) => channel > 0))
          && value.recipe?.imagePlacement?.rotation === rotation
      )
      const expected = asymmetricExpected[rotation]
      const distances = corners.corners.colors.map((color, index) => Math.sqrt(color.reduce((sum, channel, channelIndex) => sum + (channel - expected[index][channelIndex]) ** 2, 0)))
      assert.equal(distances.every((distance) => distance < 75), true, `非对称样片旋转 ${rotation} 方向颜色不一致：${JSON.stringify({ corners, expected, distances })}`)
      asymmetricEvidence[rotation] = { ...corners, expected, distances }
      if (rotation === 90) await captureRendererScreenshot(client, artifactRoot, "stage4-asymmetric-rotation-90")
    }
    assert.equal(await setFieldInputValue(client, "图片区域", "旋转", 0), true, "无法恢复图片旋转")
    assert.equal(await selectQueueItemByFileName(client, path.basename(sample)), true, "无法恢复真实 JPEG 活动项")
    await waitForVisiblePreviewPhoto(client, artifactRoot, "恢复真实 JPEG-Logo方向后")

    await clickButton(client, `(() => {
      const tab = [...document.querySelectorAll('[role="tab"]')].find((item) => item.textContent?.trim() === '样式');
      if (tab === undefined) return false;
      tab.click();
      return true;
    })()`, "样式页签")
    await clickButton(client, `(() => {
      const button = document.querySelector('button[aria-label="折叠工作台面板"]');
      if (button === null) return false;
      button.click();
      return true;
    })()`, "折叠右侧面板按钮")
    await waitFor("右侧面板折叠", () => evaluate(client, "document.querySelector('.collapsedRight') !== null"), (collapsed) => collapsed === true)
    await clickButton(client, `(() => {
      const button = document.querySelector('button[aria-label="展开检查器"]');
      if (button === null) return false;
      button.click();
      return true;
    })()`, "展开右侧面板按钮")
    await waitFor("右侧面板恢复", () => evaluate(client, "document.querySelector('.workspaceInspector') !== null"), (visible) => visible === true)

    const activePathBeforeKeyboard = await evaluate(client, "document.querySelector('.queueItem.isActive .queueSub')?.getAttribute('title') ?? ''")
    await dispatchRendererKey(client, "ArrowDown")
    await waitFor(
      "方向键切换队列当前项",
      () => evaluate(client, "document.querySelector('.queueItem.isActive .queueSub')?.getAttribute('title') ?? ''"),
      (value) => value.length > 0 && value !== activePathBeforeKeyboard
    )
    await dispatchRendererKey(client, "ArrowUp")
    await waitFor(
      "方向键切回原当前项",
      () => evaluate(client, "document.querySelector('.queueItem.isActive .queueSub')?.getAttribute('title') ?? ''"),
      (value) => value === activePathBeforeKeyboard
    )
    await dispatchRendererKey(client, " ")
    await waitFor(
      "空格勾选当前项但不切换预览",
      () => evaluate(client, `({
        activePath: document.querySelector('.queueItem.isActive .queueSub')?.getAttribute('title') ?? '',
        checked: (document.querySelector('.queueItem.isActive .queueItemCheck') instanceof HTMLInputElement)
          ? document.querySelector('.queueItem.isActive .queueItemCheck').checked
          : false
      })`),
      (value) => value.activePath === activePathBeforeKeyboard && value.checked === true
    )
    await dispatchRendererKey(client, "f")
    await waitFor("F 键适应预览", () => evaluate(client, "document.querySelector('.previewZoomLabel')?.textContent?.trim() ?? ''"), (value) => value === "适应")
    await dispatchRendererKey(client, "1")
    await waitFor("1 键显示 100%", () => evaluate(client, "document.querySelector('.previewZoomLabel')?.textContent?.trim() ?? ''"), (value) => value === "100%")

    const itemCountBeforeDeleteUndo = await evaluate(client, "document.querySelectorAll('.queueItem').length")
    await dispatchRendererKey(client, "Delete")
    await waitFor("Delete 键删除当前图片", () => evaluate(client, "document.querySelectorAll('.queueItem').length"), (count) => count === itemCountBeforeDeleteUndo - 1)
    await dispatchRendererKey(client, "z", { metaKey: true })
    await waitFor("Cmd/Ctrl+Z 恢复删除", () => evaluate(client, "document.querySelectorAll('.queueItem').length"), (count) => count === itemCountBeforeDeleteUndo)
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('.queueActions button')].find((item) => item.textContent?.trim() === '清空');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "清空队列按钮")
    await waitFor("清空队列", () => evaluate(client, "document.querySelectorAll('.queueItem').length"), (count) => count === 0)
    await dispatchRendererKey(client, "z", { metaKey: true })
    await waitFor("撤销清空队列", () => evaluate(client, "document.querySelectorAll('.queueItem').length"), (count) => count === itemCountBeforeDeleteUndo)

    // 真实失败闸门：首轮导入一个从真实 JPEG 截断的失败文件。专业档位的预检
    // 必须在提交 render-jobs 前 fail-closed，不能把坏源图变成 completed 或其它伪成功状态。
    // 后面的完整批量与取消路径另行使用有效样片验证。
    await waitFor(
      "批量导出全部图片按钮",
      () => evaluate(client, `(() => { const button = [...document.querySelectorAll('button.exportDockButton')].find((item) => item.textContent?.includes('批量导出 ${initialQueueCount} 张')); return button !== undefined && !button.disabled })()`),
      (available) => available === true
    )
    await clickButton(client, `(() => { const button = [...document.querySelectorAll('button.exportDockButton')].find((item) => item.textContent?.includes('批量导出 ${initialQueueCount} 张')); if (button === undefined || button.disabled) return false; button.click(); return true })()`, "批量导出全部图片按钮")
    const batchFirstRun = await waitFor(
      "批量导出被真实预检阻断",
      () => evaluate(client, "document.querySelector('.exportDockStatus')?.textContent ?? ''"),
      (text) => text.includes("预检：已阻止") && text.includes("源图读取失败"),
      120_000
    )
    assert.equal(
      retryOutputCandidates.some((candidate) => existsSync(candidate)),
      false,
      "预检阻断不应留下导出文件"
    )
    const batchRetryResult = "未提交：源图预检阻断（阶段 6 fail-closed）"
    const retryExportOutput = "未生成（预检阻断）"
    const retryExportDimensions = { width: 0, height: 0 }

    await waitFor(
      "单图导出按钮可用",
      () => evaluate(client, "(() => { const button = [...document.querySelectorAll('button.exportDockButton')].find((item) => item.textContent?.includes('导出原图')); return button !== undefined && !button.disabled })()"),
      (available) => available === true
    )
    await clickButton(client, `(() => { const button = [...document.querySelectorAll('button.exportDockButton')].find((item) => item.textContent?.includes('导出原图')); if (button === undefined || button.disabled) return false; button.click(); return true })()`, "导出原图按钮")
    await waitFor("导出文件写盘", () => existsSync(output), (exists) => exists === true)
    const exportFileSize = await waitFor(
      "导出文件写入完成",
      async () => {
        const firstSize = statSync(output).size
        await sleep(250)
        return { firstSize, secondSize: statSync(output).size }
      },
      (sizes) => sizes.firstSize > 0 && sizes.firstSize === sizes.secondSize
    ).then((sizes) => sizes.secondSize)
    assert.ok(exportFileSize > 0, "导出文件为空")
    const exportData = readFileSync(output)
    const signature = exportData.subarray(0, 8)
    const isJpeg = signature[0] === 0xff && signature[1] === 0xd8
    const isPng = signature.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    const isTiff = (signature[0] === 0x49 && signature[1] === 0x49 && signature[2] === 0x2a && signature[3] === 0x00)
      || (signature[0] === 0x4d && signature[1] === 0x4d && signature[2] === 0x00 && signature[3] === 0x2a)
    assert.equal(isJpeg || isPng || isTiff, true, "导出文件不是受支持的 JPEG/PNG/TIFF")
    const exportDimensions = readImageDimensions(exportData)
    assert.notEqual(exportDimensions, null, "导出文件无法读取像素尺寸")
    const exportExtension = exportDimensions.format === "jpeg" ? "jpg" : exportDimensions.format
    const exportEvidencePath = path.join(artifactRoot, `导出文件.${exportExtension}`)
    copyFileSync(output, exportEvidencePath)
    const sourceShaAfterByPath = Object.fromEntries(realImportSamplePaths.map((filePath) => [filePath, sha256File(filePath)]))
    const sourceShaAfter = sourceShaAfterByPath[sample]
    assert.deepEqual(sourceShaAfterByPath, sourceShaBeforeByPath, "导出前后固定样片 SHA-256 不一致")

    // 真实 UI 性能闸门：通过 preload 的文件夹选择入口导入 100 个约 20MP 路径，
    // 只观察 CDP 实际发出的 120px 缩略图请求，不向 Java API 直接注入队列。
    const objectUrlProbeInstalled = await evaluate(client, `(() => {
      const urlApi = window.URL;
      if (typeof urlApi.revokeObjectURL !== 'function') return false;
      const revoked = [];
      const nativeRevoke = urlApi.revokeObjectURL.bind(urlApi);
      urlApi.revokeObjectURL = (url) => {
        revoked.push(url);
        nativeRevoke(url);
      };
      window.__camborderE2eObjectUrlProbe = { revoked };
      return true;
    })()`)
    assert.equal(objectUrlProbeInstalled, true, "无法安装打包 E2E object URL 释放探针")
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '清空');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "清空队列按钮（缩略图卸载）")
    await waitFor(
      "队列缩略图范围卸载",
      () => evaluate(client, "document.querySelectorAll('.queueItem').length"),
      (count) => count === 0
    )
    const releasedThumbnailUrlCount = await waitFor(
      "缩略图 object URL 释放",
      () => evaluate(client, "window.__camborderE2eObjectUrlProbe?.revoked?.filter((url) => typeof url === 'string' && url.startsWith('blob:')).length ?? 0"),
      (count) => count > 0
    )

    const uiPerformanceRequestStart = requestDetails.length
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('button')].find((item) => ['选择图片文件夹', '选择文件夹'].includes(item.textContent?.trim()));
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "100 项图片文件夹入口（preload）")
    const importedUiPerformanceQueue = await waitFor(
      "100 项图片通过 preload 文件夹入口进入队列",
      () => evaluate(client, `({
        count: document.querySelectorAll('.queueItem').length,
        label: document.querySelector('.queueCount')?.textContent?.trim() ?? ''
      })`),
      (value) => value.count === UI_PERFORMANCE_QUEUE_COUNT && value.label.includes(`${UI_PERFORMANCE_QUEUE_COUNT} 张图片`),
      120_000
    )
    assert.equal(importedUiPerformanceQueue.count, UI_PERFORMANCE_QUEUE_COUNT)

    const thumbnailRecordsForUiPerformance = () => requestDetails
      .slice(uiPerformanceRequestStart)
      .filter(isThumbnailRequest)
    const initialUiPerformance = await waitFor(
      "首屏可见项目的缩略图请求",
      async () => {
        const viewport = await readQueueViewport(client)
        const thumbnailRecords = thumbnailRecordsForUiPerformance()
        return { viewport, thumbnailRecords }
      },
      (value) => value.viewport.total === UI_PERFORMANCE_QUEUE_COUNT
        && value.viewport.visibleIds.length > 0
        && value.viewport.visibleIds.length < UI_PERFORMANCE_QUEUE_COUNT
        && value.thumbnailRecords.length > 0,
      120_000
    )
    await sleep(700)
    const stableInitialUiPerformance = {
      viewport: await readQueueViewport(client),
      thumbnailRecords: thumbnailRecordsForUiPerformance()
    }
    const initialVisiblePaths = new Set(stableInitialUiPerformance.viewport.visiblePaths)
    const initialThumbnailPaths = [...new Set(stableInitialUiPerformance.thumbnailRecords.map(thumbnailPathFromRequest))]
      .filter((filePath) => typeof filePath === "string")
    assert.ok(initialThumbnailPaths.length > 0, "首屏没有记录实际缩略图请求")
    assert.equal(
      initialThumbnailPaths.every((filePath) => initialVisiblePaths.has(filePath)),
      true,
      `初始视口外图片提前请求缩略图：${JSON.stringify({ initialThumbnailPaths, visiblePaths: [...initialVisiblePaths] })}`
    )
    assert.equal(stableInitialUiPerformance.viewport.visibleIds.length < UI_PERFORMANCE_QUEUE_COUNT, true, "100 项队列没有形成可滚动视口")

    const beforeScrollThumbnailCount = stableInitialUiPerformance.thumbnailRecords.length
    const previousVisibleIds = new Set(stableInitialUiPerformance.viewport.visibleIds)
    await evaluate(client, `(() => {
      const list = document.querySelector('.queueList');
      if (list === null) return false;
      const nextTop = Math.min(list.scrollHeight - list.clientHeight, list.scrollTop + Math.max(1, list.clientHeight * 0.8));
      list.scrollTop = Math.max(0, nextTop);
      list.dispatchEvent(new Event('scroll', { bubbles: true }));
      return list.scrollTop > 0;
    })()`)
    const afterScrollUiPerformance = await waitFor(
      "滚动后新可见项目的缩略图请求",
      async () => {
        const viewport = await readQueueViewport(client)
        const thumbnailRecords = thumbnailRecordsForUiPerformance()
        return {
          viewport,
          thumbnailRecords,
          newThumbnailRecords: thumbnailRecords.slice(beforeScrollThumbnailCount)
        }
      },
      (value) => value.viewport.visibleIds.some((id) => !previousVisibleIds.has(id))
        && value.newThumbnailRecords.some((request) => {
          const filePath = thumbnailPathFromRequest(request)
          return typeof filePath === "string" && !initialVisiblePaths.has(filePath)
        }),
      120_000
    )
    const afterScrollVisiblePaths = new Set(afterScrollUiPerformance.viewport.visiblePaths)
    const scrolledThumbnailPaths = [...new Set(afterScrollUiPerformance.newThumbnailRecords.map(thumbnailPathFromRequest))]
      .filter((filePath) => typeof filePath === "string")
    assert.ok(scrolledThumbnailPaths.length > 0, "滚动后没有记录新缩略图请求")
    assert.equal(
      scrolledThumbnailPaths.every((filePath) => afterScrollVisiblePaths.has(filePath)),
      true,
      `滚动后请求包含不可见图片：${JSON.stringify({ scrolledThumbnailPaths, visiblePaths: [...afterScrollVisiblePaths] })}`
    )
    assert.equal(
      scrolledThumbnailPaths.some((filePath) => !initialVisiblePaths.has(filePath)),
      true,
      `滚动后没有请求首轮视口之外的新项目：${JSON.stringify({
        initialVisiblePaths: [...initialVisiblePaths],
        afterScrollVisiblePaths: [...afterScrollVisiblePaths],
        newThumbnailPaths: scrolledThumbnailPaths
      })}`
    )

    const newlyVisiblePath = afterScrollUiPerformance.viewport.visiblePaths.find((filePath) => !initialVisiblePaths.has(filePath))
    assert.ok(newlyVisiblePath !== undefined, "滚动后未找到新的可见图片用于预览验证")
    await clickButton(client, `(() => {
      const row = [...document.querySelectorAll('.queueItem')].find((item) =>
        item.querySelector('.queueSub')?.getAttribute('title') === ${JSON.stringify(newlyVisiblePath)}
      );
      if (row === undefined) return false;
      row.click();
      return true;
    })()`, "滚动后的新可见图片")
    const uiPerformancePreview = await waitForVisiblePreviewPhoto(client, artifactRoot, "100项滚动后预览")

    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('.queueActions button')].find((item) => item.textContent?.trim() === '全选');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "100 项全选按钮")
    await waitFor(
      "100 项批量导出按钮",
      () => evaluate(client, `(() => {
        const button = [...document.querySelectorAll('button.exportDockButton')].find((item) => item.textContent?.includes('批量导出 ${UI_PERFORMANCE_QUEUE_COUNT} 张'));
        return button !== undefined && !button.disabled;
      })()`),
      (available) => available === true,
      120_000
    )
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('button.exportDockButton')].find((item) => item.textContent?.includes('批量导出 ${UI_PERFORMANCE_QUEUE_COUNT} 张'));
      if (button === undefined || button.disabled) return false;
      button.click();
      return true;
    })()`, "100 项批量导出按钮")
    const uiPerformanceExportResult = await waitFor(
      "100 项真实 UI 批量导出完成",
      () => evaluate(client, "document.querySelector('.exportDockStatus')?.textContent ?? ''"),
      (text) => text.includes("批量导出完成")
        && text.includes(`共 ${UI_PERFORMANCE_QUEUE_COUNT} 张`)
        && text.includes(`成功 ${UI_PERFORMANCE_QUEUE_COUNT}`)
        && text.includes("失败 0"),
      1_200_000
    )
    const uiPerformanceOutputPattern = /^queue-\d{3}-border(?:-\d+)?\.(?:png|jpg|tif)$/
    const uiPerformanceOutputNames = await waitFor(
      "100 项批量导出文件",
      () => readdirSync(retryOutputDirectory).filter((name) => uiPerformanceOutputPattern.test(name)),
      (names) => names.length === UI_PERFORMANCE_QUEUE_COUNT,
      120_000
    )
    assert.equal(uiPerformanceOutputNames.length, UI_PERFORMANCE_QUEUE_COUNT)
    for (const name of uiPerformanceOutputNames) {
      assert.ok(statSync(path.join(retryOutputDirectory, name)).size > 0, `100 项导出文件为空：${name}`)
    }
    const uiPerformanceOutputData = readFileSync(path.join(retryOutputDirectory, uiPerformanceOutputNames[0]))
    assert.notEqual(readImageDimensions(uiPerformanceOutputData), null, "100 项批量导出文件不是可识别图片")

    // 复用真实 100 项队列再次提交并立即取消，保留可核验的取消日志；已完成文件只删除本次 E2E 临时产物。
    for (const name of uiPerformanceOutputNames) {
      unlinkSync(path.join(retryOutputDirectory, name))
    }
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('button.exportDockButton')].find((item) => item.textContent?.includes('批量导出 ${UI_PERFORMANCE_QUEUE_COUNT} 张'));
      if (button === undefined || button.disabled) return false;
      button.click();
      return true;
    })()`, "100 项取消测试批量导出按钮")
    await waitFor(
      "100 项批量导出进入运行态",
      () => evaluate(client, "[...document.querySelectorAll('button.exportDockButton')].some((item) => item.textContent?.includes('批量导出中'))"),
      (running) => running === true,
      120_000
    )
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('button.exportDockButton')].find((item) => item.textContent?.trim() === '取消导出');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "100 项批量导出取消按钮")
    const uiPerformanceCancellationResult = await waitFor(
      "100 项批量导出取消完成",
      () => evaluate(client, "document.querySelector('.exportDockStatus')?.textContent ?? ''"),
      (text) => text.includes("批量导出已取消") && text.includes(`共 ${UI_PERFORMANCE_QUEUE_COUNT} 张`),
      120_000
    )
    const uiPerformanceThumbnailRecords = thumbnailRecordsForUiPerformance()
    const uiPerformanceEvidence = {
      importedItems: importedUiPerformanceQueue.count,
      initialVisibleItems: stableInitialUiPerformance.viewport.visibleIds.length,
      initialThumbnailRequests: stableInitialUiPerformance.thumbnailRecords.length,
      initialThumbnailUniquePaths: initialThumbnailPaths.length,
      afterScrollVisibleItems: afterScrollUiPerformance.viewport.visibleIds.length,
      scrollThumbnailRequests: afterScrollUiPerformance.newThumbnailRecords.length,
      scrollThumbnailUniquePaths: scrolledThumbnailPaths.length,
      totalThumbnailRequests: uiPerformanceThumbnailRecords.length,
      totalThumbnailUniquePaths: new Set(uiPerformanceThumbnailRecords.map(thumbnailPathFromRequest)).size,
      releasedObjectUrlsAfterClear: releasedThumbnailUrlCount,
      previewCanvas: formatPreviewCanvasMetrics(uiPerformancePreview.metrics),
      exportFiles: uiPerformanceOutputNames.length,
      exportResult: uiPerformanceExportResult,
      cancellationResult: uiPerformanceCancellationResult
    }

    assert.ok(requests.some((url) => url === "app://app/api/health"), "健康检查未经过 app:// 代理")
    assert.ok(requests.some((url) => url === "app://app/api/preview"), "预览请求未经过 app:// 代理")
    assert.ok(requests.some((url) => url.startsWith("app://app/previews/")), "预览缩略图未经过 app:// 代理")
    assert.ok(requests.some((url) => url === "app://app/api/render-jobs"), "导出请求未经过 app:// 代理")

    killExactJavaPid(firstJavaPid, "故障恢复闸门")
    const oldJavaState = await waitFor(
      "首个 Java 进程退出",
      () => ({ alive: isProcessAlive(firstJavaPid), log: readEngineLog(engineLogPath) }),
      (value) => value.alive === false && value.log.includes("[engine-exit]")
    )
    assert.equal(oldJavaState.alive, false)
    assert.match(oldJavaState.log, /\[engine-exit\].*signal=SIGTERM|\[engine-exit\].*exit=/)

    const faultUi = await waitFor(
      "唯一引擎故障入口和重试按钮",
      () => evaluate(client, `(() => ({
        failureCount: document.querySelectorAll('.engineStatusBarUnavailable').length,
        retryCount: [...document.querySelectorAll('button')].filter((item) => item.textContent?.trim() === '重试').length
      }))()`),
      (value) => value.failureCount === 1 && value.retryCount === 1
    )
    assert.deepEqual(faultUi, { failureCount: 1, retryCount: 1 })

    await clickButton(client, `(() => { const button = [...document.querySelectorAll('.engineStatusBarUnavailable button')].find((item) => item.textContent?.trim() === '重试'); if (button === undefined) return false; button.click(); return true })()`, "引擎重试按钮")
    const retryLog = await waitFor(
      "新的托管 Java 进程",
      () => readEngineLog(engineLogPath),
      (log) => enginePidsFromLog(log).length >= 2
    )
    const retryPids = enginePidsFromLog(retryLog)
    const secondJavaPid = retryPids[retryPids.length - 1]
    assert.ok(secondJavaPid !== undefined && secondJavaPid > 0, "未记录重试后的 Java PID")
    assert.notEqual(secondJavaPid, firstJavaPid, "重试没有启动新的 Java 进程")
    knownJavaPids.add(secondJavaPid)
    await waitFor(
      "重试后引擎正常",
      () => readAppHealthStatus(client),
      isHealthyHttpStatus,
      20_000
    )
    await waitFor(
      "重试后故障入口消失",
      () => evaluate(client, "document.querySelectorAll('.engineStatusBarUnavailable').length"),
      (count) => count === 0
    )

    // 关闭前把会话恢复到冻结的标准交付默认值，重启验收随后检查持久化状态。
    await clickButton(client, `(() => {
      const tab = [...document.querySelectorAll('[role="tab"]')].find((item) => item.textContent?.trim() === '输出');
      if (tab === undefined) return false;
      tab.click();
      return true;
    })()`, "重启前输出页签")
    await waitFor(
      "重启前输出档位面板",
      () => evaluate(client, "document.querySelector('[data-testid=export-tier-standard-delivery]') !== null"),
      (visible) => visible === true
    )
    await chooseTier("standard-delivery")

    // 重启验收：先让第二个引擎由 Electron 正常回收，再关闭真实 BrowserWindow，
    // 使用同一份临时 userData 启动第二个打包实例，验证模板、输出预设、队列会话和引擎
    // 都从持久化状态恢复。这里重新连接 CDP，不复用已关闭页面的协议状态。
    const restartDebugPort = await getFreePort()
    report(`关闭并重启打包应用，新的 CDP 端口：${restartDebugPort}`)
    try {
      await client.call("Browser.close", {}, 30_000)
    } catch {
      // Browser.close 在 Electron 退出时可能先断开；下面仍会核对子进程确实退出。
    }
    client.close()
    client = null
    if (child.exitCode === null) {
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        sleep(10_000)
      ])
    }
    if (child.exitCode === null) {
      child.kill()
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        sleep(5_000)
      ])
    }
    assert.notEqual(child.exitCode, null, "重启前打包应用子进程没有退出")
    await waitFor(
      "重启前旧 Java 进程退出",
      () => ({ alive: isProcessAlive(secondJavaPid), log: readEngineLog(engineLogPath) }),
      (value) => value.alive === false && value.log.includes("[engine-exit]"),
      20_000
    )

    child = spawn(executable, [
      `--remote-debugging-port=${restartDebugPort}`,
      `--user-data-dir=${userData}`
    ], {
      cwd: path.dirname(executable),
      env: packagedEnv,
      stdio: ["ignore", "pipe", "pipe"]
    })
    child.stdout.on("data", (chunk) => logs.push(String(chunk)))
    child.stderr.on("data", (chunk) => logs.push(String(chunk)))
    const restartTargets = await waitForDevTools(restartDebugPort, child, logs)
    const restartPageTarget = restartTargets.find((target) => target.type === "page" && typeof target.webSocketDebuggerUrl === "string")
    assert.notEqual(restartPageTarget, undefined, "重启后未找到 Electron 页面 CDP target")
    client = await CdpClient.connect(restartPageTarget.webSocketDebuggerUrl)
    attachProtocolListeners(client)
    await client.call("Runtime.enable")
    await client.call("Network.enable")
    await client.call("Log.enable")
    await waitFor("重启后的 app:// 页面", () => evaluate(client, "location.href"), (url) => url === "app://app/index.html")
    assert.equal(await evaluate(client, "window.desktopRuntime?.engine?.managed"), true, "重启后未恢复托管 JavaBridge 模式")
    await waitFor("重启后 JavaBridge 健康端点 HTTP 200", () => readAppHealthStatus(client), isHealthyHttpStatus, 30_000)
    const restartLog = await waitFor(
      "重启后的随包 JRE 启动记录",
      () => readEngineLog(engineLogPath),
      (log) => log.includes(`java=${bundledJava}`)
        && log.includes("requireBundledRuntime=true")
        && enginePidsFromLog(log).length >= 3,
      30_000
    )
    const restartPids = enginePidsFromLog(restartLog)
    const thirdJavaPid = restartPids[restartPids.length - 1]
    assert.ok(thirdJavaPid !== undefined && thirdJavaPid > 0, "未记录重启后的 Java PID")
    assert.notEqual(thirdJavaPid, firstJavaPid, "重启后的 Java PID 与首个进程重复")
    assert.notEqual(thirdJavaPid, secondJavaPid, "重启后的 Java PID 与重试进程重复")
    knownJavaPids.add(thirdJavaPid)

    const restartedQueueCount = await waitFor(
      "重启后队列会话恢复",
      () => evaluate(client, "document.querySelectorAll('.queueItem').length"),
      (count) => count === UI_PERFORMANCE_QUEUE_COUNT,
      30_000
    )
    await clickButton(client, `(() => {
      const tab = [...document.querySelectorAll('[role="tab"]')].find((item) => item.textContent?.trim() === '输出');
      if (tab === undefined) return false;
      tab.click();
      return true;
    })()`, "重启后输出页签")
    await waitFor(
      "重启后标准交付档位恢复",
      () => evaluate(client, "document.querySelector('[data-testid=export-tier-standard-delivery]')?.getAttribute('aria-pressed') ?? null"),
      (pressed) => pressed === "true"
    )
    await clickButton(client, `(() => {
      const tab = [...document.querySelectorAll('[role="tab"]')].find((item) => item.textContent?.trim() === '样式');
      if (tab === undefined) return false;
      tab.click();
      return true;
    })()`, "重启后样式页签")
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '管理用户版式');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "重启后用户版式入口")
    const restartedTemplateNames = await waitFor(
      "重启后用户版式恢复",
      () => evaluate(client, "[...document.querySelectorAll('[role=dialog] .templateItem .templateName')].map((item) => item.textContent?.trim() ?? '')"),
      (names) => names.includes("打包 E2E 版式") && names.includes("Stage4 v1 legacy")
    )
    await dispatchRendererKey(client, "Escape")
    await waitFor("重启后用户版式抽屉关闭", () => evaluate(client, "document.querySelector('[role=dialog]') === null"), (closed) => closed === true)
    const restartEvidence = {
      firstJavaPid,
      secondJavaPid,
      thirdJavaPid,
      queueCount: restartedQueueCount,
      outputTier: "standard-delivery",
      templates: restartedTemplateNames
    }

    await sleep(100)
    assertNoProtocolErrors(requests, responseDetails, consoleRecords, runtimeExceptions, logEntries)

    // 只有所有断言完成后才落盘 PASS 标记，供发布报告按目标平台登记安装后证据；
    // 失败或中途退出不会留下可被误读为成功的标记。
    writeFileSync(path.join(artifactRoot, "packaged-e2e-result.json"), `${JSON.stringify({
      schemaVersion: 1,
      status: "PASS",
      installed: true,
      installedFromPackage: process.env["CAMBORDER_E2E_INSTALLED_FROM_PACKAGE"] === "1",
      platform: process.platform,
      arch: process.arch,
      packageCommit: packageManifest.commit,
      executable,
      completedAt: new Date().toISOString(),
      checks: {
        bundledRuntime: true,
        independentExifTool: true,
        sourceShaUnchanged: sourceShaBefore === sourceShaAfter,
        offlineCspBoundary: true,
        restartRecovery: true,
        uninstallPending: true
      }
    }, null, 2)}\n`, "utf8")

    const lifecycleLog = readEngineLog(engineLogPath)
      .split("\n")
      .filter((line) => line.startsWith("[engine-start]") || line.startsWith("[engine-process]") || line.startsWith("[engine-exit]"))
      .join(" | ")
    console.log(`[packaged-e2e] Java 生命周期日志：${lifecycleLog}`)
    console.log(`[packaged-e2e] Java PID：${firstJavaPid} -> SIGTERM -> ${secondJavaPid} -> 重启 -> ${thirdJavaPid}，UI 已恢复引擎正常`)
    console.log(`[packaged-e2e] 重启证据：${JSON.stringify(restartEvidence)}`)
    console.log(`[packaged-e2e] 源图 SHA-256：${sourceShaBefore} -> ${sourceShaAfter}`)
    console.log(`[packaged-e2e] 导出证据：${exportEvidencePath}；字节=${exportFileSize}；尺寸=${exportDimensions.width}×${exportDimensions.height}；格式=${exportDimensions.format}`)
    console.log(`[packaged-e2e] 默认摄影信息卡 Canvas：${formatPreviewCanvasMetrics(defaultPreview.metrics)}`)
    console.log(`[packaged-e2e] 默认摄影信息卡同步截图：${defaultPreview.screenshotPath}`)
    console.log(`[packaged-e2e] 零边框模板 Canvas：${formatPreviewCanvasMetrics(zeroBorderPreview.metrics)}`)
    console.log(`[packaged-e2e] 真实失败项重试：首轮=${batchFirstRun}；重试后=${batchRetryResult}；输出=${retryExportOutput}；尺寸=${retryExportDimensions.width}×${retryExportDimensions.height}`)
    console.log(`[packaged-e2e] 真实取消运行：${uiPerformanceCancellationResult}`)
    console.log(`[packaged-e2e] 100 项 UI 性能证据：${JSON.stringify(uiPerformanceEvidence)}`)
    console.log(`[packaged-e2e] 三尺寸主题响应式证据：${JSON.stringify(responsiveEvidence)}`)
    console.log(`[packaged-e2e] CSP：已收到并拦截外网 fetch；Network 未记录 https://example.invalid/camborder-csp-probe`)
    console.log(`[packaged-e2e] 网络断言：${requests.length} 个请求全部为 app://app/、data: 或 blob:；有效预览路由 200，裸/畸形路由失败`)

    console.log(`[packaged-e2e] 通过：${executable}`)
    console.log(`[packaged-e2e] 托管 JRE：${bundledJava}`)
    console.log(`[packaged-e2e] 引擎端口：${enginePort}（独立临时端口）`)
    console.log(`[packaged-e2e] 导出临时文件：${output}`)
  } finally {
    if (client !== null) {
      try {
        await client.call("Browser.close")
      } catch {
        // 应用已退出时 CDP 会先断开，继续走子进程清理。
      }
      client.close()
    }
    if (child.exitCode === null) {
      child.kill()
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        sleep(5000)
      ])
    }
    const pidsToCleanup = new Set([
      ...knownJavaPids,
      ...enginePidsFromLog(readEngineLog(engineLogPath))
    ])
    for (const pid of pidsToCleanup) {
      if (isProcessAlive(pid)) {
        try {
          process.kill(pid, "SIGTERM")
          console.log(`[packaged-e2e] 清理 Java PID ${pid}：已精确发送 SIGTERM`)
        } catch {
          // 进程可能在检查与发送之间已由 Electron 退出流程回收。
        }
      }
    }
    if (process.env["CAMBORDER_E2E_KEEP_TEMP"] !== "1") {
      rmSync(temporaryRoot, { recursive: true, force: true })
      if (ownsArtifactRoot) {
        rmSync(artifactRoot, { recursive: true, force: true })
      }
    }
  }
}

const isMainModule = process.argv[1] !== undefined
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMainModule) {
  run().catch((error) => {
    console.error(`[packaged-e2e] 失败：${error instanceof Error ? error.stack ?? error.message : String(error)}`)
    process.exitCode = 1
  })
}
