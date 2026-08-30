import test from "node:test"
import assert from "node:assert/strict"
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { findPackagedExecutable } from "./packaged-e2e.mjs"

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
      currentExecutable
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
      macExecutable
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
