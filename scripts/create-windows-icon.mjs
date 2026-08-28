import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

const COLORS = Object.freeze({
  background: [47, 43, 39, 255],
  paper: [246, 241, 232, 255],
  accent: [166, 107, 76, 255],
  lens: [47, 43, 39, 255]
})

const setPixel = (pixels, size, x, y, color) => {
  if (x < 0 || y < 0 || x >= size || y >= size) return
  const offset = (y * size + x) * 4
  pixels[offset] = color[0]
  pixels[offset + 1] = color[1]
  pixels[offset + 2] = color[2]
  pixels[offset + 3] = color[3]
}

const fillRect = (pixels, size, left, top, right, bottom, color) => {
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) setPixel(pixels, size, x, y, color)
  }
}

const fillCircle = (pixels, size, centerX, centerY, radius, color) => {
  const radiusSquared = radius * radius
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      const dx = x - centerX
      const dy = y - centerY
      if (dx * dx + dy * dy <= radiusSquared) setPixel(pixels, size, x, y, color)
    }
  }
}

const drawCamera = (size) => {
  const pixels = Buffer.alloc(size * size * 4, 0)
  pixels.fill(COLORS.background[0], 0, pixels.length)
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = COLORS.background[0]
    pixels[i + 1] = COLORS.background[1]
    pixels[i + 2] = COLORS.background[2]
    pixels[i + 3] = COLORS.background[3]
  }

  const scale = size / 256
  const px = (value) => Math.round(value * scale)
  fillRect(pixels, size, px(16), px(16), px(239), px(239), COLORS.paper)
  fillRect(pixels, size, px(28), px(28), px(227), px(227), COLORS.background)
  fillRect(pixels, size, px(54), px(82), px(211), px(188), COLORS.paper)
  fillRect(pixels, size, px(78), px(62), px(126), px(88), COLORS.paper)
  fillCircle(pixels, size, px(132), px(135), px(45), COLORS.accent)
  fillCircle(pixels, size, px(132), px(135), px(29), COLORS.lens)
  fillCircle(pixels, size, px(123), px(124), px(8), COLORS.paper)
  return pixels
}

const createDib = (size) => {
  const pixels = drawCamera(size)
  const rowBytes = size * 4
  const maskRowBytes = Math.ceil(size / 32) * 4
  const dib = Buffer.alloc(40 + rowBytes * size + maskRowBytes * size)
  dib.writeUInt32LE(40, 0)
  dib.writeInt32LE(size, 4)
  dib.writeInt32LE(size * 2, 8)
  dib.writeUInt16LE(1, 12)
  dib.writeUInt16LE(32, 14)
  dib.writeUInt32LE(0, 16)
  dib.writeUInt32LE(rowBytes * size, 20)

  let offset = 40
  for (let y = size - 1; y >= 0; y -= 1) {
    for (let x = 0; x < size; x += 1) {
      const pixelOffset = (y * size + x) * 4
      dib[offset++] = pixels[pixelOffset + 2]
      dib[offset++] = pixels[pixelOffset + 1]
      dib[offset++] = pixels[pixelOffset]
      dib[offset++] = pixels[pixelOffset + 3]
    }
  }
  return dib
}

/** 生成不依赖第三方工具的多尺寸 Windows ICO。 */
export const createIco = () => {
  const sizes = [16, 32, 256]
  const images = sizes.map(createDib)
  const headerSize = 6 + sizes.length * 16
  const totalSize = headerSize + images.reduce((sum, image) => sum + image.length, 0)
  const ico = Buffer.alloc(totalSize)
  ico.writeUInt16LE(0, 0)
  ico.writeUInt16LE(1, 2)
  ico.writeUInt16LE(sizes.length, 4)

  let entryOffset = 6
  let imageOffset = headerSize
  images.forEach((image, index) => {
    const size = sizes[index]
    ico.writeUInt8(size === 256 ? 0 : size, entryOffset)
    ico.writeUInt8(size === 256 ? 0 : size, entryOffset + 1)
    ico.writeUInt8(0, entryOffset + 2)
    ico.writeUInt8(0, entryOffset + 3)
    ico.writeUInt16LE(1, entryOffset + 4)
    ico.writeUInt16LE(32, entryOffset + 6)
    ico.writeUInt32LE(image.length, entryOffset + 8)
    ico.writeUInt32LE(imageOffset, entryOffset + 12)
    image.copy(ico, imageOffset)
    entryOffset += 16
    imageOffset += image.length
  })
  return ico
}

const main = async () => {
  const outputPath = process.argv[2] ?? path.resolve("electron/build/icon.ico")
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, createIco())
  console.log(`[icon] 已生成：${outputPath}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`[icon] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
