import test from "node:test"
import assert from "node:assert/strict"
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import {
  generatePhotoManifest,
  validateRawEmbeddedJpeg,
  verifySourceHashes
} from "./generate-photo-manifest.mjs"

const execFileAsync = promisify(execFile)

const makeMinimalJpeg = (width = 0x1234, height = 0x5678) => Buffer.from([
  0xff, 0xd8,
  0xff, 0xc0, 0x00, 0x11, 0x08,
  height >> 8, height & 0xff,
  width >> 8, width & 0xff,
  0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
  0xff, 0xd9
])

const makeFakeExifTool = (root) => {
  const tool = path.join(root, "fake-exiftool.mjs")
  const source = `#!/usr/bin/env node
import path from "node:path"
const args = process.argv.slice(2)
if (args.includes("-ver")) { console.log("13.59-test"); process.exit(0) }
const filePath = args.at(-1)
const ext = path.extname(filePath ?? "").toLowerCase()
if (args.includes("-b") && args.includes("-JpgFromRaw")) {
  process.stdout.write(Buffer.from([0xff,0xd8,0xff,0xc0,0x00,0x11,0x08,0x12,0x34,0x56,0x78,0x03,0x01,0x11,0x00,0x02,0x11,0x00,0x03,0x11,0x00,0xff,0xd9]))
  process.exit(0)
}
if (args.includes("-b") && args.includes("-ICC_Profile")) {
  if (ext === ".jpg") process.stdout.write(Buffer.from("test-icc"))
  process.exit(0)
}
const raw = ext === ".arw"
const record = {
  SourceFile: filePath,
  "File:FileType": raw ? "ARW" : ext === ".tif" ? "TIFF" : "JPEG",
  "IFD0:ImageWidth": raw ? 7168 : 5035,
  "IFD0:ImageHeight": raw ? 5120 : 3339,
  "IFD0:Orientation": raw ? 8 : 1,
  "IFD0:BitsPerSample": raw ? 14 : [8, 8, 8],
  "IFD0:XResolution": 240,
  "IFD0:YResolution": 240,
  "IFD0:ResolutionUnit": 2,
  "ExifIFD:DateTimeOriginal": "2026:01:01 00:00:00",
  "XMP-xmp:Rating": 0,
  ...(raw ? { "SubIFD:ImageWidth": 7168, "SubIFD:ImageHeight": 5120, "SubIFD:BitsPerSample": 14, "IFD2:JpgFromRaw": "(Binary data 23 bytes, use -b option to extract)" } : {})
}
console.log(JSON.stringify([record]))
`
  writeFileSync(tool, source, "utf8")
  chmodSync(tool, 0o755)
  return tool
}

const makePhotoFixture = (root) => {
  const names = [
    "78330006.jpg", "78330007.jpg", "78330023.jpg", "78330027.jpg",
    "83750006.TIF", "83750007.TIF", "83750010.TIF", "83750011.TIF", "83750012.TIF",
    "DSC04875.ARW", "DSC04876.ARW", "DSC04877.ARW", "DSC04881.ARW", "DSC04882.ARW", "DSC04883.ARW"
  ]
  for (const name of names) writeFileSync(path.join(root, name), `fixture:${name}`)
  return names
}

test("15 文件清单成功登记，并分开记录 ARW 容器与内嵌 JPEG 位深", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "camera-border-photo-manifest-success-"))
  try {
    makePhotoFixture(root)
    const exifTool = makeFakeExifTool(root)
    const output = path.join(root, "evidence", "photo-manifest.json")
    const runInfoOutput = path.join(root, "evidence", "run-info.json")
    const result = await generatePhotoManifest({ inputRoot: root, outputPath: output, runInfoPath: runInfoOutput, exifTool })
    assert.equal(result.manifest.fileCount, 15)
    assert.equal(result.manifest.files.length, 15)
    const arw = result.manifest.files.filter((entry) => entry.format === "ARW")
    assert.equal(arw.length, 6)
    for (const entry of arw) {
      assert.equal(entry.orientation, 8)
      assert.equal(entry.pixelSource, "embedded-jpeg")
      assert.equal(entry.pixelBitDepth, 8)
      assert.equal(entry.containerBitDepth, 14)
      assert.equal(entry.embeddedJpeg.selector, "JpgFromRaw")
      assert.equal(entry.embeddedJpeg.bitDepth, 8)
      assert.match(entry.sha256, /^[0-9a-f]{64}$/)
    }
    assert.equal(result.runInfo.sourceFileCount, 15)
    assert.equal(result.runInfo.sourceShaUnchanged, true)
    assert.equal(JSON.parse(readFileSync(output, "utf8")).fileCount, 15)
    assert.equal(JSON.parse(readFileSync(runInfoOutput, "utf8")).exifTool.version, "13.59-test")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("缺失或额外照片会阻止 manifest 生成", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "camera-border-photo-manifest-count-"))
  try {
    const names = makePhotoFixture(root)
    const exifTool = makeFakeExifTool(root)
    unlinkSync(path.join(root, names[0]))
    await assert.rejects(generatePhotoManifest({ inputRoot: root, exifTool }), /文件清单数量不符/)
    writeFileSync(path.join(root, names[0]), "restored")
    writeFileSync(path.join(root, "extra.jpg"), "extra")
    await assert.rejects(generatePhotoManifest({ inputRoot: root, exifTool }), /文件清单数量不符/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("ExifTool 不存在时不降级为通过", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "camera-border-photo-manifest-tool-"))
  try {
    makePhotoFixture(root)
    await assert.rejects(
      generatePhotoManifest({ inputRoot: root, exifTool: path.join(root, "missing-exiftool") }),
      /ExifTool 版本读取失败/
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("源文件执行前后 SHA-256 不一致时失败", () => {
  assert.throws(
    () => verifySourceHashes({ "photos/a.jpg": "a".repeat(64) }, { "photos/a.jpg": "b".repeat(64) }),
    /SHA-256 执行前后不一致/
  )
})

test("ARW 缺少 Orientation 或 JpgFromRaw 时失败", () => {
  const jpeg = makeMinimalJpeg()
  assert.throws(
    () => validateRawEmbeddedJpeg({ "IFD0:Orientation": 1, "IFD2:JpgFromRaw": "(Binary data 23 bytes)" }, jpeg),
    /Orientation=8/
  )
  assert.throws(
    () => validateRawEmbeddedJpeg({ "IFD0:Orientation": 8 }, jpeg),
    /JpgFromRaw 元数据入口/
  )
  assert.throws(
    () => validateRawEmbeddedJpeg({ "IFD0:Orientation": 8, "IFD2:JpgFromRaw": "(Binary data 23 bytes)" }, Buffer.alloc(0)),
    /JpgFromRaw 为空/
  )
})

