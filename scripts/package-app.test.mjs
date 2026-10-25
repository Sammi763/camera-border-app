import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const script = await readFile(new URL("./package-app.sh", import.meta.url), "utf8")

test("Windows manifest 使用完整 HEAD commit，并拒绝无法核对的版本值", () => {
  assert.match(script, /git -C "\$ROOT" rev-parse HEAD/)
  assert.match(script, /\[\[\s*!?\s*"\$COMMIT"\s*=~\s*\^\[0-9a-fA-F\]\{40\}\$\s*\]\]/)
  assert.doesNotMatch(script, /rev-parse --short HEAD/)
  assert.doesNotMatch(script, /\$\{COMMIT\}-dirty/)
})

test("正式打包脚本携带锁定的专业组件目录", () => {
  assert.match(script, /professional-tools/)
  assert.match(script, /fetch-professional-tools\.sh/)
})

test("正式打包脚本在构建前后都运行跨平台资源清单校验", () => {
  assert.match(script, /validate-package\.mjs/)
  assert.match(script, /--platform "\$TARGET_PLATFORM"/)
  assert.match(script, /--arch "\$ARCH"/)
  assert.match(script, /fetch-fonts\.sh/)
  assert.match(script, /prepare-package-resources\.mjs/)
})

test("正式打包脚本保留 JRE release 元数据供安装包校验", () => {
  assert.match(script, /release 是阶段 6 的随包运行时/)
  assert.doesNotMatch(script, /rm -f .*java-runtime.*release/)
})
