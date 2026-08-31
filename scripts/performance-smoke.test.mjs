import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const script = await readFile(new URL("./performance-smoke.mjs", import.meta.url), "utf8")

test("性能 smoke 固定模拟 100 项队列、双并发预览与异步连续导出", () => {
  assert.match(script, /const DEFAULT_QUEUE_COUNT = 100/)
  assert.match(script, /const THUMBNAIL_CONCURRENCY = 2/)
  assert.match(script, /runWithConcurrency\(queuedPaths, THUMBNAIL_CONCURRENCY/)
  assert.match(script, /\$\{baseUrl\}\/api\/render-jobs/)
  assert.match(script, /waitForTerminalJob/)
})

test("性能 smoke 的导出产物只写入并清理专属临时目录", () => {
  assert.match(script, /mkdtempSync\(path\.join\(tmpdir\(\), "camborder-performance-smoke-"\)\)/)
  assert.match(script, /rmSync\(outputDir, \{ recursive: true, force: true \}\)/)
})
