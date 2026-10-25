import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const script = await readFile(new URL("./smoke-test-windows.ps1", import.meta.url), "utf8")

test("NSIS 安装路径带空格时 /D= 参数显式保留双引号", () => {
  assert.match(script, /\$installArguments\s*=\s*"\/S \/D=`"\$installDir`""/)
  assert.match(script, /-ArgumentList\s+\$installArguments/)
})

test("冒烟失败时 finally 清理匹配的 Java 引擎进程", () => {
  assert.match(script, /function\s+Stop-JavaEngineProcesses\s*\{[\s\S]*?Stop-Process/)
  assert.match(script, /\$smokeSucceeded\s*=\s*\$false/)
  assert.match(script, /try\s*\{\s*\$installer\s*=\s*Find-Installer/)
  assert.match(script, /if\s*\(-not\s+\$smokeSucceeded\)\s*\{[\s\S]*?Stop-JavaEngineProcesses/)
})

test("安装后校验 manifest、专业组件、许可证和 HEIC worker", () => {
  assert.match(script, /package-manifest\.json/)
  assert.match(script, /professional-tools\\components\.json/)
  assert.match(script, /professional-tools\\heic-components\.json/)
  assert.match(script, /professional-tools\\licenses\\THIRD-PARTY-NOTICES\.md/)
  assert.match(script, /app\.asar\.unpacked\\dist\\ipc\\heicWorker\.js/)
})

test("支持干净机前置条件检查和固定安装目录", () => {
  assert.match(script, /\$RequireNoSystemDependencies/)
  assert.match(script, /\$InstallDirectory/)
  assert.match(script, /function\s+Assert-NoSystemDependencies/)
  assert.match(script, /Get-Command \$command/)
  for (const command of ["java.exe", "exiftool.exe", "node.exe", "pnpm.cmd", "mvn.cmd", "python.exe"]) {
    assert.match(script, new RegExp(`"${command.replace(".", "\\.")}"`))
  }
  assert.match(script, /Get-AppxPackage -AllUsers/)
  assert.match(script, /HEIF\|HEIC/)
  assert.match(script, /随包 worker/)
})
