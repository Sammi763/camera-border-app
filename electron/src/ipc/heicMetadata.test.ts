import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { inflateSync } from "node:zlib"
import { PNG } from "pngjs"
import {
  applyHeifOrientation,
  extractHeifMetadata,
  heifOrientationFromExifValue,
  injectPngMetadata,
  normalizeExifOrientation,
  readExifOrientation
} from "./heicMetadata"

describe("HEIC/HEIF metadata bridge", () => {
  it("读取真实 HEIC 样片的方向、ICC 和 Exif，而不是只验证合成 box", () => {
    const sample = readFileSync(resolve(process.cwd(), "../fixtures/stage4/real-orientation-icc-iphone12pro.heic"))
    const metadata = extractHeifMetadata(sample)

    expect(metadata.orientation).toEqual({ rotation: 270, mirror: false })
    expect(metadata.icc).not.toBeNull()
    expect(metadata.icc?.length).toBe(536)
    expect(metadata.exif).not.toBeNull()
    expect(metadata.exif?.length).toBeGreaterThan(64)
    expect(readExifOrientation(metadata.exif!)).toEqual({ rotation: 0, mirror: false })
  })

  it("损坏或不含 meta 的输入不会伪造元数据", () => {
    expect(extractHeifMetadata(Buffer.from("not-heif"))).toEqual({
      orientation: { rotation: 0, mirror: false },
      exif: null,
      icc: null
    })
  })

  it("把 HEIF 方向变换应用到像素，而不是交给系统扩展", () => {
    const source = new PNG({ width: 2, height: 1 })
    source.data.set([255, 0, 0, 255, 0, 255, 0, 255])

    const rotated = applyHeifOrientation(source, { rotation: 90, mirror: false })

    expect(rotated.width).toBe(1)
    expect(rotated.height).toBe(2)
    expect([...rotated.data.subarray(0, 4)]).toEqual([0, 255, 0, 255])
    expect([...rotated.data.subarray(4, 8)]).toEqual([255, 0, 0, 255])
  })

  it("兼容 PNG.sync.read 的普通对象结果并保留旋转像素", () => {
    const source = new PNG({ width: 2, height: 1 })
    source.data.set([255, 0, 0, 255, 0, 255, 0, 255])
    const decoded = PNG.sync.read(PNG.sync.write(source))

    const rotated = applyHeifOrientation(decoded, { rotation: 90, mirror: false })

    expect(rotated.width).toBe(1)
    expect(rotated.height).toBe(2)
    expect([...rotated.data.subarray(0, 4)]).toEqual([0, 255, 0, 255])
    expect([...rotated.data.subarray(4, 8)]).toEqual([255, 0, 0, 255])
  })

  it("把 EXIF 和 ICC 作为标准 PNG chunk 写入临时结果", () => {
    const source = new PNG({ width: 1, height: 1 })
    source.data.set([12, 34, 56, 255])
    const exif = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08])
    const icc = Buffer.from([1, 2, 3, 4, 5])
    const result = injectPngMetadata(PNG.sync.write(source), {
      orientation: { rotation: 0, mirror: false },
      exif,
      icc
    })

    const chunks = new Map<string, Buffer>()
    let offset = 8
    while (offset + 12 <= result.length) {
      const length = result.readUInt32BE(offset)
      const type = result.toString("ascii", offset + 4, offset + 8)
      chunks.set(type, result.subarray(offset + 8, offset + 8 + length))
      offset += 12 + length
      if (type === "IEND") break
    }
    expect(chunks.get("eXIf")).toEqual(exif)
    const iccChunk = chunks.get("iCCP")!
    expect(iccChunk.subarray(0, 13).toString("latin1")).toBe("CameraBorder\0")
    expect(inflateSync(iccChunk.subarray(14))).toEqual(icc)
  })

  it("按 ipma 的 1 字节属性索引读取主图方向和 ICC", () => {
    const icc = Buffer.from([9, 8, 7, 6])
    const ipco = box("ipco", Buffer.concat([
      box("irot", Buffer.from([1])),
      box("colr", Buffer.concat([Buffer.from("prof", "ascii"), icc]))
    ]))
    // version=0、flags=0 表示每个 property association 使用 1 字节。
    const ipma = box("ipma", Buffer.concat([
      Buffer.alloc(4),
      u32(1),
      u16(1),
      Buffer.from([2, 1, 0x01, 0x02])
    ]))
    const meta = box("meta", Buffer.concat([
      Buffer.alloc(4),
      box("pitm", Buffer.concat([Buffer.alloc(4), u16(1)])),
      box("iprp", Buffer.concat([ipco, ipma]))
    ]))

    expect(extractHeifMetadata(meta)).toEqual({
      orientation: { rotation: 90, mirror: false },
      exif: null,
      icc
    })
  })

  it("没有 IHDR 时保持原始 PNG 字节不变", () => {
    const malformed = Buffer.concat([
      Buffer.from("89504e470d0a1a0a", "hex"),
      box("IEND", Buffer.alloc(0))
    ])
    expect(injectPngMetadata(malformed, {
      orientation: { rotation: 0, mirror: false },
      exif: Buffer.from([1]),
      icc: Buffer.from([2])
    })).toBe(malformed)
  })

  it("像素方向已物理应用后把 Exif Orientation 归一为 1", () => {
    const tiff = Buffer.alloc(26)
    tiff.write("II", 0, 2, "ascii")
    tiff.writeUInt16LE(42, 2)
    tiff.writeUInt32LE(8, 4)
    tiff.writeUInt16LE(1, 8)
    tiff.writeUInt16LE(0x0112, 10)
    tiff.writeUInt16LE(3, 12)
    tiff.writeUInt32LE(1, 14)
    tiff.writeUInt16LE(6, 18)

    const normalized = normalizeExifOrientation(tiff)
    expect(normalized.readUInt16LE(18)).toBe(1)
    expect(tiff.readUInt16LE(18)).toBe(6)
  })

  it("没有 irot/imir 时从 Exif Orientation 推导像素方向", () => {
    const tiff = Buffer.alloc(26)
    tiff.write("II", 0, 2, "ascii")
    tiff.writeUInt16LE(42, 2)
    tiff.writeUInt32LE(8, 4)
    tiff.writeUInt16LE(1, 8)
    tiff.writeUInt16LE(0x0112, 10)
    tiff.writeUInt16LE(3, 12)
    tiff.writeUInt32LE(1, 14)
    tiff.writeUInt16LE(6, 18)

    expect(readExifOrientation(tiff)).toEqual({ rotation: 90, mirror: false })
    expect(heifOrientationFromExifValue(5)).toEqual({ rotation: 270, mirror: true })
    expect(heifOrientationFromExifValue(9)).toBeNull()
  })
})

const u16 = (value: number): Buffer => {
  const result = Buffer.alloc(2)
  result.writeUInt16BE(value, 0)
  return result
}

const u32 = (value: number): Buffer => {
  const result = Buffer.alloc(4)
  result.writeUInt32BE(value, 0)
  return result
}

const box = (type: string, payload: Buffer): Buffer => {
  const result = Buffer.alloc(8 + payload.length)
  result.writeUInt32BE(result.length, 0)
  result.write(type, 4, 4, "ascii")
  payload.copy(result, 8)
  return result
}
