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

test("正式打包脚本不复制或注入 LibRaw", () => {
  assert.doesNotMatch(script, /LibRaw|libraw|CAMBORDER_LIBRAW_PATH|dist-libraw/)
})
