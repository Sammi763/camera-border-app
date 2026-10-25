import { deflateSync } from "node:zlib"
import type { PNG } from "pngjs"

export type HeifOrientation = {
  /** 按 HEIF irot 约定，逆时针旋转角度。 */
  readonly rotation: 0 | 90 | 180 | 270
  /** 按 HEIF imir 约定，是否沿垂直轴镜像。 */
  readonly mirror: boolean
}

export type HeifMetadata = {
  readonly orientation: HeifOrientation
  /** 不带 Exif\0\0 前缀的 TIFF 数据，适合写入 PNG eXIf chunk。 */
  readonly exif: Buffer | null
  /** 原始 ICC profile 数据，适合写入 PNG iCCP chunk。 */
  readonly icc: Buffer | null
}

type Box = {
  readonly type: string
  readonly start: number
  readonly end: number
  readonly payloadStart: number
}

type Extent = { readonly offset: number; readonly length: number }

type ItemInfo = {
  readonly type: string
  readonly contentType: string | null
}

const text = (bytes: Uint8Array, start: number, length: number): string =>
  String.fromCharCode(...bytes.slice(start, start + length))

const u16 = (bytes: Uint8Array, offset: number): number =>
  ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0)

const u32 = (bytes: Uint8Array, offset: number): number =>
  ((bytes[offset] ?? 0) * 0x1000000)
  + ((bytes[offset + 1] ?? 0) << 16)
  + ((bytes[offset + 2] ?? 0) << 8)
  + (bytes[offset + 3] ?? 0)

const uint = (bytes: Uint8Array, offset: number, size: number): number => {
  if (size <= 0) return 0
  // HEIF iloc 在 version 1/2 中允许 8 字节 offset/length。这里只把
  // 能精确表示为 JS safe integer 的值交给后续边界校验，超大值按损坏输入处理。
  if (size > 8 || offset < 0 || offset + size > bytes.length) return Number.NaN
  let value = 0
  for (let index = 0; index < size; index += 1) {
    if (value > Number.MAX_SAFE_INTEGER / 256) return Number.NaN
    value = value * 256 + (bytes[offset + index] ?? 0)
  }
  return Number.isSafeInteger(value) ? value : Number.NaN
}

const readBoxes = (bytes: Uint8Array, start: number, end: number): readonly Box[] => {
  const boxes: Box[] = []
  let offset = start
  while (offset + 8 <= end) {
    const declaredSize = u32(bytes, offset)
    const type = text(bytes, offset + 4, 4)
    let headerSize = 8
    let size = declaredSize
    if (declaredSize === 1) {
      if (offset + 16 > end) break
      const high = u32(bytes, offset + 8)
      const low = u32(bytes, offset + 12)
      size = high * 0x100000000 + low
      headerSize = 16
    } else if (declaredSize === 0) {
      size = end - offset
    }
    if (!Number.isSafeInteger(size) || size < headerSize || offset + size > end) break
    boxes.push({ type, start: offset, end: offset + size, payloadStart: offset + headerSize })
    offset += size
  }
  return boxes
}

const fullBoxVersion = (bytes: Uint8Array, box: Box): number => bytes[box.payloadStart] ?? 0

const readNullTerminated = (bytes: Uint8Array, start: number, end: number): { value: string; next: number } => {
  let offset = start
  while (offset < end && bytes[offset] !== 0) offset += 1
  return { value: text(bytes, start, offset - start), next: Math.min(end, offset + 1) }
}

const parseItemInfo = (bytes: Uint8Array, box: Box): ReadonlyMap<number, ItemInfo> => {
  const result = new Map<number, ItemInfo>()
  const version = fullBoxVersion(bytes, box)
  let offset = box.payloadStart + 4
  const childBoxes = readBoxes(bytes, offset + (version >= 2 ? 4 : 2), box.end)
  for (const child of childBoxes) {
    if (child.type !== "infe") continue
    const childVersion = fullBoxVersion(bytes, child)
    if (childVersion < 2) continue
    let cursor = child.payloadStart + 4
    const itemIdSize = childVersion >= 3 ? 4 : 2
    if (cursor + itemIdSize + 2 > child.end) continue
    const itemId = uint(bytes, cursor, itemIdSize)
    cursor += itemIdSize + 2 // item_ID + construction/protection index
    if (cursor + 4 > child.end) continue
    const itemType = text(bytes, cursor, 4)
    cursor += 4
    const itemName = readNullTerminated(bytes, cursor, child.end)
    let contentType: string | null = null
    if (itemType === "mime") {
      const content = readNullTerminated(bytes, itemName.next, child.end)
      contentType = content.value
    }
    result.set(itemId, { type: itemType, contentType })
  }
  return result
}

const parseItemLocations = (bytes: Uint8Array, box: Box): ReadonlyMap<number, readonly Extent[]> => {
  const result = new Map<number, readonly Extent[]>()
  const version = fullBoxVersion(bytes, box)
  let offset = box.payloadStart + 4
  if (offset + 2 > box.end) return result
  const sizes = bytes[offset] ?? 0
  const offsetSize = (sizes >> 4) & 0x0f
  const lengthSize = sizes & 0x0f
  const secondSizes = bytes[offset + 1] ?? 0
  const baseOffsetSize = (secondSizes >> 4) & 0x0f
  const indexSize = secondSizes & 0x0f
  offset += 2
  const countSize = version < 2 ? 2 : 4
  if (offset + countSize > box.end) return result
  const itemCount = uint(bytes, offset, countSize)
  offset += countSize
  for (let item = 0; item < itemCount; item += 1) {
    const itemIdSize = version < 2 ? 2 : 4
    if (offset + itemIdSize + 2 > box.end) break
    const itemId = uint(bytes, offset, itemIdSize)
    offset += itemIdSize
    if (version === 1 || version === 2) offset += 2 // construction_method + reserved bits
    offset += 2 // data_reference_index
    if (offset + baseOffsetSize + 2 > box.end) break
    const baseOffset = uint(bytes, offset, baseOffsetSize)
    offset += baseOffsetSize
    const extentCount = u16(bytes, offset)
    offset += 2
    const extents: Extent[] = []
    for (let extent = 0; extent < extentCount; extent += 1) {
      if (offset + indexSize + offsetSize + lengthSize > box.end) break
      offset += indexSize
      const extentOffset = uint(bytes, offset, offsetSize)
      offset += offsetSize
      const extentLength = uint(bytes, offset, lengthSize)
      offset += lengthSize
      const resolvedOffset = baseOffset + extentOffset
      if (Number.isSafeInteger(baseOffset)
        && Number.isSafeInteger(extentOffset)
        && Number.isSafeInteger(extentLength)
        && Number.isSafeInteger(resolvedOffset)
        && resolvedOffset >= 0
        && extentLength >= 0) {
        extents.push({ offset: resolvedOffset, length: extentLength })
      }
    }
    result.set(itemId, extents)
  }
  return result
}

const parsePrimaryItemId = (bytes: Uint8Array, box: Box): number | null => {
  const version = fullBoxVersion(bytes, box)
  const size = version === 0 ? 2 : 4
  return box.payloadStart + 4 + size <= box.end ? uint(bytes, box.payloadStart + 4, size) : null
}

type ItemProperty =
  | { readonly kind: "rotation"; readonly value: 0 | 90 | 180 | 270 }
  | { readonly kind: "mirror"; readonly value: boolean }
  | { readonly kind: "icc"; readonly value: Buffer }
  | { readonly kind: "other" }

const parseProperties = (bytes: Uint8Array, box: Box): readonly ItemProperty[] => {
  const properties: ItemProperty[] = []
  for (const property of readBoxes(bytes, box.payloadStart, box.end)) {
    if (property.type === "irot" && property.payloadStart < property.end) {
      properties.push({ kind: "rotation", value: (((bytes[property.payloadStart] ?? 0) & 3) * 90) as 0 | 90 | 180 | 270 })
    } else if (property.type === "imir" && property.payloadStart < property.end) {
      properties.push({ kind: "mirror", value: (bytes[property.payloadStart] ?? 0) !== 0 })
    } else if (property.type === "colr" && property.payloadStart + 4 <= property.end) {
      const profileType = text(bytes, property.payloadStart, 4)
      if (profileType === "prof" || profileType === "rICC") {
        const value = Buffer.from(bytes.slice(property.payloadStart + 4, property.end))
        if (value.length > 0) properties.push({ kind: "icc", value })
      }
    } else {
      properties.push({ kind: "other" })
    }
  }
  return properties
}

const parseAssociations = (
  bytes: Uint8Array,
  box: Box,
  primaryItemId: number | null
): readonly number[] => {
  const version = fullBoxVersion(bytes, box)
  const flags = u32(bytes, box.payloadStart) & 0x00ffffff
  const large = (flags & 1) !== 0
  let offset = box.payloadStart + 4
  if (offset + 4 > box.end) return []
  const entryCount = u32(bytes, offset)
  offset += 4
  let fallback: number[] = []
  for (let entry = 0; entry < entryCount; entry += 1) {
    const itemIdSize = version >= 1 ? 4 : 2
    if (offset + itemIdSize + 1 > box.end) break
    const itemId = uint(bytes, offset, itemIdSize)
    offset += itemIdSize
    const associationCount = bytes[offset] ?? 0
    offset += 1
    const propertyIndexes: number[] = []
    for (let association = 0; association < associationCount; association += 1) {
      // ipma 的 property association 在小索引模式下是 1 字节（essential 位
      // + 7 位索引），large_property_index 模式才是 2 字节（1 + 15 位）。
      // 这里不能按 item_ID 的宽度读取，否则合法的 irot/colr 关联会错位。
      const associationSize = large ? 2 : 1
      if (offset + associationSize > box.end) break
      const raw = uint(bytes, offset, associationSize)
      offset += associationSize
      propertyIndexes.push(large ? raw & 0x7fff : raw & 0x7f)
    }
    if (primaryItemId !== null && itemId === primaryItemId) return propertyIndexes
    if (fallback.length === 0) fallback = propertyIndexes
  }
  return fallback
}

const concatExtents = (bytes: Uint8Array, extents: readonly Extent[]): Buffer | null => {
  const chunks: Buffer[] = []
  for (const extent of extents) {
    const end = extent.offset + extent.length
    if (!Number.isSafeInteger(extent.offset)
      || !Number.isSafeInteger(extent.length)
      || !Number.isSafeInteger(end)
      || extent.offset < 0
      || extent.length < 0
      || end > bytes.length) return null
    chunks.push(Buffer.from(bytes.slice(extent.offset, end)))
  }
  return chunks.length === 0 ? null : Buffer.concat(chunks)
}

const findExifTiff = (data: Buffer): Buffer | null => {
  const isTiff = (offset: number): boolean =>
    offset + 4 <= data.length
    && ((data[offset] === 0x49 && data[offset + 1] === 0x49 && data[offset + 2] === 0x2a && data[offset + 3] === 0x00)
      || (data[offset] === 0x4d && data[offset + 1] === 0x4d && data[offset + 2] === 0x00 && data[offset + 3] === 0x2a))
  for (let offset = 0; offset <= Math.min(data.length - 4, 32); offset += 1) {
    if (isTiff(offset)) return data.subarray(offset)
  }
  return null
}

/** 将 Exif Orientation（1-8）转换为像素层需要的旋转/镜像组合。 */
export const heifOrientationFromExifValue = (value: number): HeifOrientation | null => {
  switch (value) {
    case 1: return { rotation: 0, mirror: false }
    case 2: return { rotation: 0, mirror: true }
    case 3: return { rotation: 180, mirror: false }
    case 4: return { rotation: 180, mirror: true }
    case 5: return { rotation: 270, mirror: true }
    case 6: return { rotation: 90, mirror: false }
    case 7: return { rotation: 90, mirror: true }
    case 8: return { rotation: 270, mirror: false }
    default: return null
  }
}

/** 读取 TIFF/Exif 中的 Orientation；损坏或缺失时返回 null。 */
export const readExifOrientation = (data: Buffer): HeifOrientation | null => {
  const tiff = findExifTiff(data)
  if (tiff === null || tiff.length < 8) return null
  const littleEndian = tiff[0] === 0x49 && tiff[1] === 0x49
  const bigEndian = tiff[0] === 0x4d && tiff[1] === 0x4d
  if (!littleEndian && !bigEndian) return null
  const read16 = (offset: number): number | null => {
    if (offset < 0 || offset + 2 > tiff.length) return null
    return littleEndian
      ? (tiff[offset] ?? 0) | ((tiff[offset + 1] ?? 0) << 8)
      : ((tiff[offset] ?? 0) << 8) | (tiff[offset + 1] ?? 0)
  }
  const read32 = (offset: number): number | null => {
    if (offset < 0 || offset + 4 > tiff.length) return null
    return littleEndian
      ? (tiff[offset] ?? 0)
        + (tiff[offset + 1] ?? 0) * 0x100
        + (tiff[offset + 2] ?? 0) * 0x10000
        + (tiff[offset + 3] ?? 0) * 0x1000000
      : (tiff[offset] ?? 0) * 0x1000000
        + (tiff[offset + 1] ?? 0) * 0x10000
        + (tiff[offset + 2] ?? 0) * 0x100
        + (tiff[offset + 3] ?? 0)
  }
  if (read16(2) !== 42) return null
  const ifdOffset = read32(4)
  if (ifdOffset === null || ifdOffset < 8 || ifdOffset + 2 > tiff.length) return null
  const entryCount = read16(ifdOffset)
  if (entryCount === null || entryCount > Math.floor((tiff.length - ifdOffset - 2) / 12)) return null
  for (let entry = 0; entry < entryCount; entry += 1) {
    const entryOffset = ifdOffset + 2 + entry * 12
    if (read16(entryOffset) !== 0x0112) continue
    const type = read16(entryOffset + 2)
    const count = read32(entryOffset + 4)
    if (type === null || count === null || count < 1) return null
    const typeSize = type === 3 ? 2 : type === 4 ? 4 : 0
    if (typeSize === 0 || count > Number.MAX_SAFE_INTEGER / typeSize) return null
    const valueBytes = count * typeSize
    const valueOffset = valueBytes <= 4 ? entryOffset + 8 : read32(entryOffset + 8)
    if (valueOffset === null || valueOffset < 0 || valueOffset + typeSize > tiff.length) return null
    const value = type === 3 ? read16(valueOffset) : read32(valueOffset)
    return value === null ? null : heifOrientationFromExifValue(value)
  }
  return null
}

const extractExifTiff = (data: Buffer): Buffer | null => {
  const tiff = findExifTiff(data)
  return tiff === null ? null : normalizeExifOrientation(tiff)
}

/**
 * HEIF 方向已经在像素层应用后，把 Exif Orientation 归一为 1。
 * 否则下游查看器可能再次旋转，导致“看起来方向被保留”却实际双重旋转。
 * 解析失败时原样返回，不能因为一个损坏的可选字段阻断像素转换。
 */
export const normalizeExifOrientation = (data: Buffer): Buffer => {
  if (data.length < 8) return data
  const littleEndian = data[0] === 0x49 && data[1] === 0x49
  const bigEndian = data[0] === 0x4d && data[1] === 0x4d
  if (!littleEndian && !bigEndian) return data
  const read16 = (offset: number): number => littleEndian
    ? (data[offset] ?? 0) | ((data[offset + 1] ?? 0) << 8)
    : ((data[offset] ?? 0) << 8) | (data[offset + 1] ?? 0)
  const read32 = (offset: number): number => littleEndian
    ? (data[offset] ?? 0)
      | ((data[offset + 1] ?? 0) << 8)
      | ((data[offset + 2] ?? 0) << 16)
      | ((data[offset + 3] ?? 0) * 0x1000000)
    : ((data[offset] ?? 0) * 0x1000000)
      | ((data[offset + 1] ?? 0) << 16)
      | ((data[offset + 2] ?? 0) << 8)
      | (data[offset + 3] ?? 0)
  const write16 = (target: Buffer, offset: number, value: number): void => {
    if (littleEndian) {
      target[offset] = value & 0xff
      target[offset + 1] = (value >>> 8) & 0xff
    } else {
      target[offset] = (value >>> 8) & 0xff
      target[offset + 1] = value & 0xff
    }
  }
  const write32 = (target: Buffer, offset: number, value: number): void => {
    if (littleEndian) {
      target[offset] = value & 0xff
      target[offset + 1] = (value >>> 8) & 0xff
      target[offset + 2] = (value >>> 16) & 0xff
      target[offset + 3] = (value >>> 24) & 0xff
    } else {
      target[offset] = (value >>> 24) & 0xff
      target[offset + 1] = (value >>> 16) & 0xff
      target[offset + 2] = (value >>> 8) & 0xff
      target[offset + 3] = value & 0xff
    }
  }

  if (read16(2) !== 42) return data
  const ifdOffset = read32(4)
  if (!Number.isSafeInteger(ifdOffset) || ifdOffset < 8 || ifdOffset + 2 > data.length) return data
  const entryCount = read16(ifdOffset)
  const entryStart = ifdOffset + 2
  if (entryStart > data.length || entryCount > Math.floor((data.length - entryStart) / 12)) return data

  for (let entry = 0; entry < entryCount; entry += 1) {
    const offset = entryStart + entry * 12
    if (read16(offset) !== 0x0112) continue
    const type = read16(offset + 2)
    const count = read32(offset + 4)
    if (count <= 0) return data
    const typeSize = type === 3 ? 2 : type === 4 ? 4 : 0
    if (typeSize === 0 || count > Number.MAX_SAFE_INTEGER / typeSize) return data
    const valueBytes = count * typeSize
    const valueOffset = valueBytes <= 4 ? offset + 8 : read32(offset + 8)
    if (!Number.isSafeInteger(valueOffset) || valueOffset < 0 || valueOffset + typeSize > data.length) return data
    const result = Buffer.from(data)
    if (type === 3) write16(result, valueOffset, 1)
    else write32(result, valueOffset, 1)
    return result
  }
  return data
}

/** 从 HEIF meta box 提取主图方向、EXIF 和 ICC。损坏/缺失时只返回可用部分。 */
export const extractHeifMetadata = (input: Uint8Array): HeifMetadata => {
  const defaultMetadata: HeifMetadata = {
    orientation: { rotation: 0, mirror: false },
    exif: null,
    icc: null
  }
  const meta = readBoxes(input, 0, input.length).find((box) => box.type === "meta")
  if (meta === undefined || meta.payloadStart + 4 > meta.end) return defaultMetadata

  const children = readBoxes(input, meta.payloadStart + 4, meta.end)
  const primaryId = children.find((box) => box.type === "pitm")
  const primaryItemId = primaryId === undefined ? null : parsePrimaryItemId(input, primaryId)
  const itemInfoBox = children.find((box) => box.type === "iinf")
  const locationsBox = children.find((box) => box.type === "iloc")
  const itemInfo = itemInfoBox === undefined ? new Map<number, ItemInfo>() : parseItemInfo(input, itemInfoBox)
  const locations = locationsBox === undefined ? new Map<number, readonly Extent[]>() : parseItemLocations(input, locationsBox)

  let orientation: HeifOrientation = defaultMetadata.orientation
  let hasItemOrientation = false
  let icc: Buffer | null = null
  const propertyBox = children.find((box) => box.type === "iprp")
  if (propertyBox !== undefined) {
    const ipco = readBoxes(input, propertyBox.payloadStart, propertyBox.end).find((box) => box.type === "ipco")
    const ipma = readBoxes(input, propertyBox.payloadStart, propertyBox.end).find((box) => box.type === "ipma")
    if (ipco !== undefined) {
      const properties = parseProperties(input, ipco)
      const indexes = ipma === undefined ? [] : parseAssociations(input, ipma, primaryItemId)
      const selected = indexes.length > 0 ? indexes : properties.map((_property, index) => index + 1)
      for (const index of selected) {
        const property = properties[index - 1]
        if (property?.kind === "rotation") {
          orientation = { ...orientation, rotation: property.value }
          hasItemOrientation = true
        }
        if (property?.kind === "mirror") {
          orientation = { ...orientation, mirror: property.value }
          hasItemOrientation = true
        }
        if (property?.kind === "icc" && icc === null) icc = property.value
      }
      // 某些 HEIF 写入器省略 ipma；仍保留第一个可用 ICC profile。
      if (icc === null) {
        const profile = properties.find((property) => property.kind === "icc")
        if (profile?.kind === "icc") icc = profile.value
      }
    }
  }

  let exif: Buffer | null = null
  let exifOrientation: HeifOrientation | null = null
  for (const [itemId, info] of itemInfo) {
    if (info.type !== "Exif") continue
    const data = concatExtents(input, locations.get(itemId) ?? [])
    if (data !== null) {
      exifOrientation = readExifOrientation(data)
      exif = extractExifTiff(data)
      if (exif !== null) break
    }
  }
  // 若文件没有显式 irot/imir，则把 Exif Orientation 也应用到像素层；
  // Exif 本身会在写回前归一为 1，避免下游查看器二次旋转。
  if (!hasItemOrientation && exifOrientation !== null) {
    orientation = exifOrientation
  }
  return { orientation, exif, icc }
}

/** 将 HEIF irot/imir 应用于解码后的 RGBA PNG，避免把方向交给操作系统。 */
export const applyHeifOrientation = (source: PNG, orientation: HeifOrientation): PNG => {
  const rotation = orientation.rotation
  const rotated = rotation === 90 || rotation === 270
  // PNG.sync.read 返回的是带 width/height/data 的普通对象，不是 PNG 类实例；
  // 目标只需满足 pngjs 的编码数据契约，不能依赖 source.constructor 创建空 data。
  const target = {
    width: rotated ? source.height : source.width,
    height: rotated ? source.width : source.height,
    data: Buffer.alloc((rotated ? source.height : source.width) * (rotated ? source.width : source.height) * 4)
  } as unknown as PNG
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const mirroredX = orientation.mirror ? source.width - 1 - x : x
      let targetX: number
      let targetY: number
      if (rotation === 90) {
        targetX = y
        targetY = source.width - 1 - mirroredX
      } else if (rotation === 180) {
        targetX = source.width - 1 - mirroredX
        targetY = source.height - 1 - y
      } else if (rotation === 270) {
        targetX = source.height - 1 - y
        targetY = mirroredX
      } else {
        targetX = mirroredX
        targetY = y
      }
      const sourceOffset = (y * source.width + x) * 4
      const targetOffset = (targetY * target.width + targetX) * 4
      source.data.copy(target.data, targetOffset, sourceOffset, sourceOffset + 4)
    }
  }
  return target
}

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

const crc32 = (type: Buffer, data: Buffer): number => {
  let crc = 0xffffffff
  for (const byte of Buffer.concat([type, data])) {
    crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const pngChunk = (typeName: string, data: Buffer): Buffer => {
  const type = Buffer.from(typeName, "ascii")
  const chunk = Buffer.allocUnsafe(12 + data.length)
  chunk.writeUInt32BE(data.length, 0)
  type.copy(chunk, 4)
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(type, data), 8 + data.length)
  return chunk
}

/** 将 EXIF/ICC 作为 PNG 标准 ancillary chunks 写回输出，不改变像素编码。 */
export const injectPngMetadata = (png: Buffer, metadata: HeifMetadata): Buffer => {
  const signature = png.subarray(0, 8)
  if (signature.length !== 8 || signature.toString("hex") !== "89504e470d0a1a0a") return png
  const chunks: Buffer[] = [signature]
  let offset = 8
  let inserted = false
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset)
    const end = offset + 12 + length
    if (end > png.length) return png
    const type = png.toString("ascii", offset + 4, offset + 8)
    const fullChunk = png.subarray(offset, end)
    chunks.push(fullChunk)
    offset = end
    if (type === "IHDR" && !inserted) {
      if (metadata.exif !== null) chunks.push(pngChunk("eXIf", metadata.exif))
      if (metadata.icc !== null) {
        const profileName = Buffer.from("CameraBorder\0", "latin1")
        const profile = Buffer.concat([profileName, Buffer.from([0]), deflateSync(metadata.icc)])
        chunks.push(pngChunk("iCCP", profile))
      }
      inserted = true
    }
    if (type === "IEND") break
  }
  // 没找到 IHDR 时不重建一个被截断的 PNG；调用方仍可明确判断为无元数据注入，
  // 原始解码结果不会被这个辅助函数破坏。
  return inserted ? Buffer.concat(chunks) : png
}
