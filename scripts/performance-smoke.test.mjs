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

test("性能 smoke 只采集已校验 Java 引擎 PID 的 RSS，禁止回退 Node RSS", () => {
  assert.doesNotMatch(script, /process\.memoryUsage\(\)\.rss/)
  assert.match(script, /enginePid/)
  assert.match(script, /lsof/)
  assert.match(script, /ps/)
  assert.match(script, /camera-border-engine\.jar/)
  assert.match(script, /无法确认 Java 引擎进程|引擎 PID/)
  assert.match(script, /engineRssBaseline/)
  assert.match(script, /engineRssPeak/)
  assert.match(script, /engineRssIdle/)
  assert.match(script, /engineIdleGrowth/)
})

test("性能 smoke 默认按启动基线加 600MB 校验，并执行两轮 100 项队列", () => {
  assert.match(script, /const DEFAULT_QUEUE_COUNT = 100/)
  assert.match(script, /const DEFAULT_MAX_IDLE_GROWTH_MB = 600/)
  assert.match(script, /const PERFORMANCE_ROUNDS = 2/)
  assert.match(script, /for \(let round = 1; round <= PERFORMANCE_ROUNDS; round\+\+\)/)
  assert.match(script, /roundIdleRss/)
  assert.match(script, /roundIdleRss\[1\].*roundIdleRss\[0\]/s)
  assert.match(script, /engineIdleGrowth <= maxIdleGrowthBytes/)
  assert.match(script, /engineRssBaseline=/)
})

test("性能 smoke 的导出产物只写入并清理专属临时目录", () => {
  assert.match(script, /mkdtempSync\(path\.join\(tmpdir\(\), "camborder-performance-smoke-"\)\)/)
  assert.match(script, /rmSync\(outputDir, \{ recursive: true, force: true \}\)/)
})
