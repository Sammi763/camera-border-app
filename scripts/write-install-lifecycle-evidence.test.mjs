import test from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { listProcessText } from "./write-install-lifecycle-evidence.mjs"

const execFileAsync = promisify(execFile)

test("生命周期证据脚本在当前平台能读取进程列表", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "camera-border-lifecycle-"))
  try {
    assert.equal(typeof listProcessText(process.platform), "string")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("Windows 生命周期查询使用带命令行的 CIM 进程信息", async () => {
  const source = await readFile(new URL("./write-install-lifecycle-evidence.mjs", import.meta.url), "utf8")
  assert.match(source, /powershell\.exe/)
  assert.match(source, /camera-border-engine\.jar/)
  assert.match(source, /PROCESS_QUERY_FAILED/)
})

test("卸载生命周期证据要求用户数据目录保留", async () => {
  const source = await readFile(new URL("./write-install-lifecycle-evidence.mjs", import.meta.url), "utf8")
  assert.match(source, /requiredArg\(args, "--user-data-path"\)/)
  assert.match(source, /userDataPreserved/)
  assert.match(source, /installedPathRemoved && backgroundProcessAbsent && userDataPreserved === true/)
})

test("生命周期脚本对目录删除、进程清理和用户数据保留执行通过/失败判定", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "camera-border-lifecycle-main-"))
  try {
    const script = fileURLToPath(new URL("./write-install-lifecycle-evidence.mjs", import.meta.url))
    const output = path.join(root, "pass.json")
    const userData = path.join(root, "user-data")
    const installedPath = path.join(root, "removed-app")
    await assert.rejects(execFileAsync(process.execPath, [
      script,
      "--output", output,
      "--platform", "darwin",
      "--arch", "arm64",
      "--package-commit", "a".repeat(40),
      "--installed-path", installedPath,
      "--user-data-path", userData
    ]), "用户数据目录不存在时不应通过")
    mkdirSync(userData)
    await execFileAsync(process.execPath, [
      script,
      "--output", output,
      "--platform", "darwin",
      "--arch", "arm64",
      "--package-commit", "a".repeat(40),
      "--installed-path", installedPath,
      "--user-data-path", userData
    ])
    const evidence = JSON.parse(await readFile(output, "utf8"))
    assert.equal(evidence.status, "PASS")
    assert.equal(evidence.userDataPreserved, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("Windows 原生工作流检查与 packaged E2E 相同的 user-data 目录", async () => {
  const workflow = await readFile(new URL("../.github/workflows/windows-package.yml", import.meta.url), "utf8")
  assert.match(workflow, /Camera Border Stage6 User Data\\run-2/)
  assert.doesNotMatch(workflow, /\$userDataRoot\s*=\s*Join-Path \$env:APPDATA "Camera Border"/)
})
