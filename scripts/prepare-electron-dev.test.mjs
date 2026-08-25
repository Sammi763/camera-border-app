import test from "node:test"
import assert from "node:assert/strict"

import {
  getElectronAppPath,
  getElectronBinaryPath,
  shouldPrepareElectronDev
} from "./prepare-electron-dev.mjs"

test("macOS Electron 路径使用 Electron.app 内的可执行文件", () => {
  const packageDir = "/workspace/node_modules/electron"

  assert.equal(
    getElectronBinaryPath(packageDir, "darwin"),
    "/workspace/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
  )
  assert.equal(
    getElectronAppPath(packageDir, "darwin"),
    "/workspace/node_modules/electron/dist/Electron.app"
  )
})

test("非 macOS 不执行本地签名准备", () => {
  assert.equal(shouldPrepareElectronDev("darwin"), true)
  assert.equal(shouldPrepareElectronDev("win32"), false)
  assert.equal(shouldPrepareElectronDev("linux"), false)
})
