import test from "node:test"
import assert from "node:assert/strict"
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import {
  collectProtocolDiagnostics,
  findPackagedExecutable,
  hasVisiblePhotoContent,
  independentMetadataFacts,
  isHealthyHttpStatus,
  PHOTO_CONTENT_PIXEL_THRESHOLD,
  readImageDimensions,
  readImageMetadataPresence,
  responsiveLayoutPasses,
  STAGE2_RESPONSIVE_WINDOW_SIZES
} from "./packaged-e2e.mjs"

const makeExecutable = (filePath) => {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, "test executable")
  chmodSync(filePath, 0o755)
}

test("macOS 有旧产物时只选择本次构建的 macos-arch/mac-arch 产物", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "camera-border-packaged-selection-"))
  const oldExecutable = path.join(
    root, "electron", "release", "mac-arm64", "Camera Border.app", "Contents", "MacOS", "Camera Border"
  )
  const currentExecutable = path.join(
    root, "electron", "release", "macos-arm64", "mac-arm64", "Camera Border.app", "Contents", "MacOS", "Camera Border"
  )
  try {
    makeExecutable(oldExecutable)
    makeExecutable(currentExecutable)

    assert.equal(
      findPackagedExecutable({ root, platform: "darwin", arch: "arm64" }),
      realpathSync(currentExecutable)
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("没有当前平台的唯一标准产物时直接失败，不猜测历史目录", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "camera-border-packaged-selection-"))
  const oldExecutable = path.join(
    root, "electron", "release", "mac-arm64", "Camera Border.app", "Contents", "MacOS", "Camera Border"
  )
  try {
    makeExecutable(oldExecutable)
    assert.throws(
      () => findPackagedExecutable({ root, platform: "darwin", arch: "arm64" }),
      /找不到当前 macOS arm64 打包应用/
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("显式覆盖路径必须是当前平台存在的可执行文件", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "camera-border-packaged-selection-"))
  const macApp = path.join(root, "Camera Border.app")
  const macExecutable = path.join(macApp, "Contents", "MacOS", "Camera Border")
  const unrelatedExecutable = path.join(root, "another-executable")
  const windowsExecutable = path.join(root, "Camera Border.exe")
  try {
    makeExecutable(macExecutable)
    makeExecutable(unrelatedExecutable)
    makeExecutable(windowsExecutable)
    assert.equal(
      findPackagedExecutable({ root, platform: "darwin", arch: "arm64", override: macApp }),
      realpathSync(macExecutable)
    )
    assert.throws(
      () => findPackagedExecutable({ root, platform: "darwin", arch: "arm64", override: unrelatedExecutable }),
      /不是有效的当前平台可执行文件/
    )
    assert.throws(
      () => findPackagedExecutable({ root, platform: "darwin", arch: "arm64", override: windowsExecutable }),
      /不是有效的当前平台可执行文件/
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("阶段 6 只有显式安装包来源标记才计入安装后 E2E", () => {
  const source = readFileSync(path.join(process.cwd(), "scripts", "packaged-e2e.mjs"), "utf8")
  assert.match(source, /CAMBORDER_E2E_INSTALLED_FROM_PACKAGE/)
  assert.match(source, /installedFromPackage:/)
})

test("Canvas 像素闸门只接受实际照片区域中的超过阈值非边框像素", () => {
  const drawableImage = { width: 320, height: 180 }

  assert.equal(hasVisiblePhotoContent({ drawableImage, nonBorderPixels: PHOTO_CONTENT_PIXEL_THRESHOLD }), false)
  assert.equal(hasVisiblePhotoContent({ drawableImage, nonBorderPixels: PHOTO_CONTENT_PIXEL_THRESHOLD + 1 }), true)
  assert.equal(hasVisiblePhotoContent({ drawableImage: { width: 0, height: 180 }, nonBorderPixels: 10_000 }), false)
  assert.equal(hasVisiblePhotoContent({ drawableImage: { width: 320, height: 0 }, nonBorderPixels: 10_000 }), false)
})

test("协议诊断只检查实际日志正文，不把 CDP 请求编号误判为 HTTP 403", () => {
  const diagnostics = collectProtocolDiagnostics([
    { entry: { text: "实际响应正常", networkRequestId: "40309.6" } },
    { entry: { text: "服务返回 403" } }
  ])

  assert.equal(diagnostics.includes("40309.6"), false)
  assert.equal(diagnostics.includes("服务返回 403"), true)
})

test("打包健康闸门只接受 app:// 健康端点的 HTTP 200", () => {
  assert.equal(isHealthyHttpStatus(200), true)
  assert.equal(isHealthyHttpStatus(204), false)
  assert.equal(isHealthyHttpStatus(503), false)
  assert.equal(isHealthyHttpStatus("200"), false)
})

test("响应式闸门拒绝预览不足、水平溢出或操作区被裁切", () => {
  const passingMetrics = {
    preview: { width: 520, height: 480 },
    horizontalOverflow: { document: false, workspace: false, queue: false },
    queueActionsComplete: true,
    previewBackground: "gray",
    primaryButtonCount: 1
  }
  assert.equal(responsiveLayoutPasses(passingMetrics), true)
  assert.equal(responsiveLayoutPasses({ ...passingMetrics, preview: { width: 519, height: 480 } }), false)
  assert.equal(responsiveLayoutPasses({
    ...passingMetrics,
    horizontalOverflow: { ...passingMetrics.horizontalOverflow, queue: true }
  }), false)
  assert.equal(responsiveLayoutPasses({ ...passingMetrics, queueActionsComplete: false }), false)
  assert.equal(responsiveLayoutPasses({ ...passingMetrics, primaryButtonCount: 2 }), false)
})

test("阶段 2 响应式验收固定覆盖三个工作台窗口尺寸", () => {
  assert.deepEqual(STAGE2_RESPONSIVE_WINDOW_SIZES, [
    { width: 1200, height: 760 },
    { width: 1400, height: 863 },
    { width: 1920, height: 1080 }
  ])
})

test("导出证据能读取 PNG、JPEG 和 TIFF 的像素尺寸", () => {
  const png = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png)
  png.writeUInt32BE(1600, 16)
  png.writeUInt32BE(1200, 20)

  const jpeg = Buffer.alloc(21)
  jpeg[0] = 0xff
  jpeg[1] = 0xd8
  jpeg[2] = 0xff
  jpeg[3] = 0xc0
  jpeg.writeUInt16BE(17, 4)
  jpeg[6] = 8
  jpeg.writeUInt16BE(1200, 7)
  jpeg.writeUInt16BE(1600, 9)

  const tiff = Buffer.alloc(34)
  tiff[0] = 0x49
  tiff[1] = 0x49
  tiff.writeUInt16LE(42, 2)
  tiff.writeUInt32LE(8, 4)
  tiff.writeUInt16LE(2, 8)
  tiff.writeUInt16LE(256, 10)
  tiff.writeUInt16LE(4, 12)
  tiff.writeUInt32LE(1, 14)
  tiff.writeUInt32LE(1600, 18)
  tiff.writeUInt16LE(257, 22)
  tiff.writeUInt16LE(4, 24)
  tiff.writeUInt32LE(1, 26)
  tiff.writeUInt32LE(1200, 30)

  assert.deepEqual(readImageDimensions(png), { format: "png", width: 1600, height: 1200 })
  assert.deepEqual(readImageDimensions(jpeg), { format: "jpeg", width: 1600, height: 1200 })
  assert.deepEqual(readImageDimensions(tiff), { format: "tiff", width: 1600, height: 1200 })
})

test("真实 Stage4 TIFF 导出证据能读取 EXIF pointer 与 ICC profile tag", () => {
  const fixture = path.join(process.cwd(), "fixtures", "stage4", "real-exif-canon-farmers-nooning.tif")
  assert.deepEqual(readImageMetadataPresence(readFileSync(fixture)), { exif: true, icc: true })
})

test("独立 ExifTool 元数据事实区分分享档位置移除与交付档保留", () => {
  const preserved = independentMetadataFacts({
    "IFD0:Orientation": 1,
    "IFD0:XResolution": 72,
    "IFD0:YResolution": 72,
    "ExifIFD:ColorSpace": 1,
    "XMP-dc:Format": "image/jpeg",
    "IPTC:ApplicationRecordVersion": 2,
    "GPS:GPSLatitude": 44.5,
    "ICC-header:ProfileDescription": "sRGB"
  })
  assert.deepEqual(preserved, {
    exif: true,
    xmp: true,
    iptc: true,
    gps: true,
    icc: true,
    dpi: true,
    orientation: 1,
    colorSpace: 1
  })
  const share = independentMetadataFacts({
    "IFD0:Orientation": 1,
    "IFD0:XResolution": 72,
    "IFD0:YResolution": 72,
    "ExifIFD:ColorSpace": 1,
    "XMP-dc:Format": "image/jpeg",
    "IPTC:ApplicationRecordVersion": 2,
    "ICC-header:ProfileDescription": "sRGB"
  })
  assert.equal(share.gps, false)
})
