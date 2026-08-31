import assert from "node:assert/strict"
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs"
import path from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const DEFAULT_QUEUE_COUNT = 100
const THUMBNAIL_CONCURRENCY = 2
const DEFAULT_BASE_URL = "http://127.0.0.1:8099"
const DEFAULT_SAMPLE = path.join(ROOT, "photos", "78330006.jpg")
const REQUEST_TIMEOUT_MS = 30_000
const JOB_TIMEOUT_MS = 10 * 60_000

const sleep = async (ms) => await new Promise((resolve) => setTimeout(resolve, ms))

const parsePositiveInteger = (value, label) => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > DEFAULT_QUEUE_COUNT) {
    throw new Error(`${label} 必须是 1 到 ${DEFAULT_QUEUE_COUNT} 的整数`)
  }
  return parsed
}

const readOption = (name) => {
  const index = process.argv.indexOf(name)
  return index < 0 ? undefined : process.argv[index + 1]
}

const usage = () => {
  console.log("用法：pnpm perf:smoke [--count 100] [--base-url http://127.0.0.1:8099] [--sample /绝对路径/样片.jpg]")
  console.log("前置：本地 Java 引擎已启动。脚本用固定样片模拟 100 项队列、双并发缩略图预览和连续导出。")
}

const fetchJson = async (url, init = {}) => {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`${init.method ?? "GET"} ${url} 返回 ${response.status}：${body}`)
  }
  return await response.json()
}

const plainThumbnailRequest = (imagePath) => ({
  recipe: {
    imagePath,
    border: { top: 0, bottom: 0, left: 0, right: 0, color: "#000000" },
    gradient: null,
    texts: [],
    filmFormat: null,
    autoCrop: false
  },
  maxWidth: 120,
  maxHeight: 120
})

const exportSnapshot = (imagePath, outputPath) => ({
  recipe: {
    imagePath,
    border: { top: 20, bottom: 20, left: 20, right: 20, color: "#ffffff" },
    gradient: null,
    texts: [],
    filmFormat: null,
    autoCrop: false
  },
  export: {
    format: "jpeg",
    outputPath,
    jpegQuality: 92,
    maxWidth: 0,
    maxHeight: 0,
    preserveMetadata: false,
    preserveColorProfile: false,
    preferHighBitDepth: false
  }
})

/** 以和 useThumbnails 相同的 2 并发模型模拟整队列预览。 */
const runWithConcurrency = async (items, concurrency, worker) => {
  let cursor = 0
  const runWorker = async () => {
    while (true) {
      const index = cursor
      cursor++
      if (index >= items.length) return
      await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker))
}

const waitForTerminalJob = async (baseUrl, jobId) => {
  const deadline = Date.now() + JOB_TIMEOUT_MS
  let latest = null
  while (Date.now() < deadline) {
    latest = await fetchJson(`${baseUrl}/api/render-jobs/${encodeURIComponent(jobId)}`)
    if (["completed", "failed", "cancelled"].includes(latest.status)) {
      return latest
    }
    await sleep(250)
  }
  throw new Error(`等待连续导出任务 ${jobId} 超时；最后状态：${JSON.stringify(latest)}`)
}

const main = async () => {
  if (process.argv.includes("--help")) {
    usage()
    return
  }

  const count = parsePositiveInteger(readOption("--count") ?? process.env.CAMBORDER_PERF_COUNT ?? DEFAULT_QUEUE_COUNT, "count")
  const baseUrl = (readOption("--base-url") ?? process.env.CAMBORDER_PERF_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "")
  const samplePath = path.resolve(readOption("--sample") ?? process.env.CAMBORDER_PERF_SAMPLE ?? DEFAULT_SAMPLE)
  if (!existsSync(samplePath) || !statSync(samplePath).isFile()) {
    throw new Error(`找不到性能样片：${samplePath}`)
  }

  const outputDir = mkdtempSync(path.join(tmpdir(), "camborder-performance-smoke-"))
  const queuedPaths = Array.from({ length: count }, () => samplePath)
  const startedAt = Date.now()
  try {
    await fetchJson(`${baseUrl}/api/health`)
    console.log(`[performance-smoke] 已连接引擎：${baseUrl}；队列项：${count}`)

    const previewStartedAt = Date.now()
    let previewsCompleted = 0
    await runWithConcurrency(queuedPaths, THUMBNAIL_CONCURRENCY, async (imagePath) => {
      const preview = await fetchJson(`${baseUrl}/api/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plainThumbnailRequest(imagePath))
      })
      assert.equal(preview.previewAvailable, true, "批量缩略图预览必须返回可访问预览")
      previewsCompleted++
    })
    console.log(`[performance-smoke] 批量预览完成：${previewsCompleted}/${count}，并发=${THUMBNAIL_CONCURRENCY}，耗时=${Date.now() - previewStartedAt}ms`)

    const exportStartedAt = Date.now()
    const snapshots = queuedPaths.map((imagePath, index) =>
      exportSnapshot(imagePath, path.join(outputDir, `queue-${String(index + 1).padStart(3, "0")}.jpg`)))
    const accepted = await fetchJson(`${baseUrl}/api/render-jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: snapshots })
    })
    assert.equal(typeof accepted.jobId, "string", "连续导出必须返回 jobId")
    const terminal = await waitForTerminalJob(baseUrl, accepted.jobId)
    assert.equal(terminal.status, "completed", `连续导出失败：${JSON.stringify(terminal.items ?? terminal)}`)
    assert.equal(terminal.completed, count, "连续导出必须逐项完成")
    assert.equal(Array.isArray(terminal.items), true, "连续导出终态必须返回逐项结果")
    assert.equal(terminal.items.length, count, "连续导出终态逐项结果数量不完整")
    for (const [index, item] of terminal.items.entries()) {
      assert.equal(item.status, "completed", `第 ${index + 1} 项导出失败：${item.error ?? "未知错误"}`)
      assert.equal(existsSync(item.outputPath), true, `第 ${index + 1} 项没有产出文件`)
      assert.equal(statSync(item.outputPath).size > 0, true, `第 ${index + 1} 项产出为空文件`)
    }
    console.log(`[performance-smoke] 连续导出完成：${count}/${count}，jobId=${accepted.jobId}，耗时=${Date.now() - exportStartedAt}ms`)
    console.log(`[performance-smoke] PASS，总耗时=${Date.now() - startedAt}ms`)
  } finally {
    // 仅清理脚本刚创建的专属临时目录，避免 100 张 smoke 产物残留在工作区。
    rmSync(outputDir, { recursive: true, force: true })
  }
}

await main()
