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
