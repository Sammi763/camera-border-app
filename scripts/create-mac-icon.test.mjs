import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import os from "node:os"

import { createIco } from "./create-windows-icon.mjs"
import { createMacIcon } from "./create-mac-icon.mjs"

test("electron-builder 配置了正式 macOS 图标", () => {
  const builderConfig = readFileSync(path.resolve("electron/electron-builder.yml"), "utf8")
  assert.match(builderConfig, /mac:[\s\S]*?icon:\s*build\/icon\.icns/)

  if (process.platform !== "darwin") {
    return
  }

  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "camera-border-icon-test-"))
  const source = path.join(temporaryRoot, "icon.ico")
  const output = path.join(temporaryRoot, "icon.icns")
  try {
    writeFileSync(source, createIco())
    createMacIcon({ source, output })
    assert.equal(readFileSync(output).subarray(0, 4).toString("ascii"), "icns")
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})
