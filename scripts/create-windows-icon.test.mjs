import test from "node:test"
import assert from "node:assert/strict"

import { createIco } from "./create-windows-icon.mjs"

test("生成包含 Windows 常用尺寸的 ICO", () => {
  const ico = createIco()
  assert.equal(ico.readUInt16LE(0), 0)
  assert.equal(ico.readUInt16LE(2), 1)
  assert.equal(ico.readUInt16LE(4), 3)
  assert.deepEqual(
    [ico.readUInt8(6), ico.readUInt8(22), ico.readUInt8(38)],
    [16, 32, 0]
  )
  assert.ok(ico.length > 1000)

  for (let index = 0; index < 3; index += 1) {
    const entryOffset = 6 + index * 16
    const imageSize = ico.readUInt32LE(entryOffset + 8)
    const imageOffset = ico.readUInt32LE(entryOffset + 12)
    assert.equal(ico.readUInt16LE(entryOffset + 4), 1)
    assert.equal(ico.readUInt16LE(entryOffset + 6), 32)
    assert.ok(imageOffset >= 54)
    assert.ok(imageOffset + imageSize <= ico.length)
  }
})
