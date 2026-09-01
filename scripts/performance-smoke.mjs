import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs"
import path from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const DEFAULT_QUEUE_COUNT = 100
const PERFORMANCE_ROUNDS = 2
const THUMBNAIL_CONCURRENCY = 2
const DEFAULT_BASE_URL = "http://127.0.0.1:8099"
const DEFAULT_SAMPLE = path.join(ROOT, "photos", "78330006.jpg")
const REQUEST_TIMEOUT_MS = 30_000
const JOB_TIMEOUT_MS = 10 * 60_000
const RSS_SAMPLE_INTERVAL_MS = 250
const DEFAULT_MAX_IDLE_GROWTH_MB = 600

const sleep = async (ms) => await new Promise((resolve) => setTimeout(resolve, ms))

const parsePositiveInteger = (value, label) => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > DEFAULT_QUEUE_COUNT) {
    throw new Error(`${label} 必须是 1 到 ${DEFAULT_QUEUE_COUNT} 的整数`)
  }
  return parsed
}

const parsePositivePid = (value, label) => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} 必须是正整数`)
  }
  return parsed
}

const parseNonNegativeNumber = (value, label) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} 必须是非负数字`)
  }
  return parsed
}

const readOption = (name) => {
  const index = process.argv.indexOf(name)
  return index < 0 ? undefined : process.argv[index + 1]
}

const usage = () => {
  console.log("用法：pnpm perf:smoke [--count 100] [--base-url http://127.0.0.1:8099] [--sample /绝对路径/样片.jpg] [--engine-pid PID] [--max-idle-growth-mb 600]")
  console.log("前置：本地 Java 引擎已启动。脚本通过监听端口确认 Java PID，执行两轮 100 项约 20MP 图片队列，并采集引擎 RSS。")
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

const waitForTerminalJob = async (baseUrl, jobId, onSampleRss) => {
  const deadline = Date.now() + JOB_TIMEOUT_MS
  let latest = null
  while (Date.now() < deadline) {
    onSampleRss()
    latest = await fetchJson(`${baseUrl}/api/render-jobs/${encodeURIComponent(jobId)}`)
    if (["completed", "failed", "cancelled"].includes(latest.status)) {
      onSampleRss()
      return latest
    }
    await sleep(250)
  }
  throw new Error(`等待连续导出任务 ${jobId} 超时；最后状态：${JSON.stringify(latest)}`)
}

const runSystemCommand = (command, args, label) => {
  let result
  try {
    result = spawnSync(command, args, {
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    })
  } catch (error) {
    throw new Error(`${label}失败：${error instanceof Error ? error.message : String(error)}`)
  }
  if (result.error !== undefined || result.status !== 0) {
    const detail = result.error?.message ?? String(result.stderr ?? "").trim()
    throw new Error(`${label}失败：${detail || `退出码 ${result.status}`}`)
  }
  return String(result.stdout ?? "")
}

const parseListeningPids = (output) => [...output.matchAll(/^p(\d+)$/gm)]
  .map((match) => Number.parseInt(match[1], 10))
  .filter((pid) => Number.isInteger(pid) && pid > 0)

const listeningPidsForPort = (port) => {
  const output = runSystemCommand(
    "lsof",
    ["-nP", "-a", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fp"],
    `读取引擎端口 ${port} 的监听 PID`
  )
  const pids = [...new Set(parseListeningPids(output))]
  if (pids.length === 0) {
    throw new Error(`引擎 PID 不存在：端口 ${port} 没有 LISTEN 进程`)
  }
  return pids
}

const processInfoForPid = (pid) => {
  const output = runSystemCommand(
    "ps",
    ["-p", String(pid), "-o", "pid=", "-o", "comm=", "-o", "args="],
    `读取引擎 PID ${pid} 的进程信息`
  )
  const line = output.split(/\r?\n/).map((candidate) => candidate.trim()).find((candidate) => candidate.length > 0)
  if (line === undefined) {
    throw new Error(`无法确认 Java 引擎进程：PID ${pid} 不存在`)
  }
  const fields = line.split(/\s+/)
  const reportedPid = Number.parseInt(fields[0] ?? "", 10)
  const commandLine = fields.slice(1).join(" ")
  if (reportedPid !== pid || commandLine.length === 0) {
    throw new Error(`无法确认 Java 引擎进程：PID ${pid} 的 ps 信息无效：${line}`)
  }
  return { pid, commandLine }
}

const isJavaEngineProcess = (processInfo) => {
  const commandLine = processInfo.commandLine.toLowerCase()
  const isJava = /(?:^|[\s/])java(?:\.exe)?(?:$|\s)/.test(commandLine)
  const isEngine = commandLine.includes("camera-border-engine.jar")
    || commandLine.includes("camborder.app.cameraborderapplication")
  return isJava && isEngine
}

const enginePidFor = (baseUrl, explicitPid) => {
  const parsedUrl = new URL(baseUrl)
  if (parsedUrl.hostname !== "127.0.0.1" && parsedUrl.hostname !== "localhost") {
    throw new Error(`性能 smoke 只允许本机 Java 引擎，收到：${parsedUrl.hostname}`)
  }
  if (parsedUrl.port.length === 0) {
    throw new Error(`性能 smoke 无法从地址确认引擎端口：${baseUrl}`)
  }
  const listeningPids = listeningPidsForPort(parsedUrl.port)
  const candidates = explicitPid === undefined
    ? listeningPids
    : [explicitPid]
  if (explicitPid !== undefined && !listeningPids.includes(explicitPid)) {
    throw new Error(`引擎 PID ${explicitPid} 未监听端口 ${parsedUrl.port}`)
  }
  const validated = candidates
    .map((pid) => processInfoForPid(pid))
    .filter(isJavaEngineProcess)
  if (validated.length !== 1) {
    throw new Error(`无法确认 Java 引擎进程：端口 ${parsedUrl.port} 的候选 PID=${candidates.join(",")}，通过校验=${validated.map((item) => item.pid).join(",") || "无"}`)
  }
  return validated[0]
}

const readEngineRss = (enginePid, phase) => {
  const processInfo = processInfoForPid(enginePid)
  if (!isJavaEngineProcess(processInfo)) {
    throw new Error(`无法确认 Java 引擎进程：PID ${enginePid} 在${phase}不再是 camera-border-engine Java 进程`)
  }
  const output = runSystemCommand(
    "ps",
    ["-p", String(enginePid), "-o", "rss="],
    `采集 Java 引擎 PID ${enginePid} 的 RSS（${phase}）`
  )
  const values = output.trim().split(/\s+/).filter((value) => value.length > 0)
  if (values.length !== 1 || !/^\d+$/.test(values[0])) {
    throw new Error(`引擎 RSS 采集失败：PID ${enginePid} 的 ps rss 输出无效：${output.trim()}`)
  }
  const rssKb = Number(values[0])
  if (!Number.isSafeInteger(rssKb) || rssKb <= 0) {
    throw new Error(`引擎 RSS 采集失败：PID ${enginePid} 的 RSS 不存在或为 0`)
  }
  // macOS/Linux 的 ps rss 单位为 KiB；这里统一换算成字节，禁止使用 Node RSS。
  return { rssBytes: rssKb * 1024, processInfo }
}

class EngineRssSampler {
  constructor(enginePid) {
    this.enginePid = enginePid
    this.baselineBytes = null
    this.peakBytes = 0
    this.samples = []
    this.timer = null
    this.failure = null
  }

  sample(phase) {
    if (this.failure !== null) throw this.failure
    const { rssBytes, processInfo } = readEngineRss(this.enginePid, phase)
    if (this.baselineBytes === null) this.baselineBytes = rssBytes
    this.peakBytes = Math.max(this.peakBytes, rssBytes)
    this.samples.push({ phase, rssBytes })
    return { rssBytes, processInfo }
  }

  start() {
    this.timer = setInterval(() => {
      try {
        this.sample("周期采样")
      } catch (error) {
        this.failure = error instanceof Error ? error : new Error(String(error))
      }
    }, RSS_SAMPLE_INTERVAL_MS)
    this.timer.unref?.()
  }

  assertHealthy() {
    if (this.failure !== null) throw this.failure
  }

  stop() {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }
}

const runRound = async ({ baseUrl, count, samplePath, outputDir, round, sampler }) => {
  const queuedPaths = Array.from({ length: count }, () => samplePath)
  const roundDir = path.join(outputDir, `round-${round}`)
  mkdirSync(roundDir, { recursive: true })
  console.log(`[performance-smoke] 第 ${round}/${PERFORMANCE_ROUNDS} 轮开始：${count} 项；样片字节=${statSync(samplePath).size}`)

  const previewStartedAt = Date.now()
  let previewsCompleted = 0
  await runWithConcurrency(queuedPaths, THUMBNAIL_CONCURRENCY, async (imagePath) => {
    sampler.assertHealthy()
    const preview = await fetchJson(`${baseUrl}/api/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(plainThumbnailRequest(imagePath))
    })
    assert.equal(preview.previewAvailable, true, "批量缩略图预览必须返回可访问预览")
    previewsCompleted++
    sampler.sample(`第 ${round} 轮预览 ${previewsCompleted}/${count}`)
  })
  console.log(`[performance-smoke] 第 ${round} 轮批量预览完成：${previewsCompleted}/${count}，并发=${THUMBNAIL_CONCURRENCY}，耗时=${Date.now() - previewStartedAt}ms`)

  const exportStartedAt = Date.now()
  const snapshots = queuedPaths.map((imagePath, index) =>
    exportSnapshot(imagePath, path.join(roundDir, `queue-${String(index + 1).padStart(3, "0")}.jpg`)))
  const accepted = await fetchJson(`${baseUrl}/api/render-jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: snapshots })
  })
  assert.equal(typeof accepted.jobId, "string", "连续导出必须返回 jobId")
  const terminal = await waitForTerminalJob(baseUrl, accepted.jobId, () => sampler.sample(`第 ${round} 轮导出轮询`))
  assert.equal(terminal.status, "completed", `第 ${round} 轮连续导出失败：${JSON.stringify(terminal.items ?? terminal)}`)
  assert.equal(terminal.completed, count, `第 ${round} 轮连续导出必须逐项完成`)
  assert.equal(Array.isArray(terminal.items), true, `第 ${round} 轮终态必须返回逐项结果`)
  assert.equal(terminal.items.length, count, `第 ${round} 轮终态逐项结果数量不完整`)
  for (const [index, item] of terminal.items.entries()) {
    assert.equal(item.status, "completed", `第 ${round} 轮第 ${index + 1} 项导出失败：${item.error ?? "未知错误"}`)
    assert.equal(existsSync(item.outputPath), true, `第 ${round} 轮第 ${index + 1} 项没有产出文件`)
    assert.equal(statSync(item.outputPath).size > 0, true, `第 ${round} 轮第 ${index + 1} 项产出为空文件`)
  }
  console.log(`[performance-smoke] 第 ${round} 轮连续导出完成：${count}/${count}，jobId=${accepted.jobId}，耗时=${Date.now() - exportStartedAt}ms`)

  await sleep(1_000)
  const idle = sampler.sample(`第 ${round} 轮空闲窗口`)
  console.log(`[performance-smoke] 第 ${round} 轮空闲 RSS：${toMiB(idle.rssBytes)}MiB`)
  return idle.rssBytes
}

const toMiB = (bytes) => (bytes / (1024 * 1024)).toFixed(1)

const main = async () => {
  if (process.argv.includes("--help")) {
    usage()
    return
  }

  const count = parsePositiveInteger(readOption("--count") ?? process.env.CAMBORDER_PERF_COUNT ?? DEFAULT_QUEUE_COUNT, "count")
  const baseUrl = (readOption("--base-url") ?? process.env.CAMBORDER_PERF_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "")
  const samplePath = path.resolve(readOption("--sample") ?? process.env.CAMBORDER_PERF_SAMPLE ?? DEFAULT_SAMPLE)
  const explicitPidValue = readOption("--engine-pid") ?? process.env.CAMBORDER_PERF_ENGINE_PID
  const explicitPid = explicitPidValue === undefined ? undefined : parsePositivePid(explicitPidValue, "engine-pid")
  const maxIdleGrowthMb = parseNonNegativeNumber(
    readOption("--max-idle-growth-mb") ?? process.env.CAMBORDER_PERF_MAX_IDLE_GROWTH_MB ?? DEFAULT_MAX_IDLE_GROWTH_MB,
    "max-idle-growth-mb"
  )
  if (!existsSync(samplePath) || !statSync(samplePath).isFile()) {
    throw new Error(`找不到性能样片：${samplePath}`)
  }

  const outputDir = mkdtempSync(path.join(tmpdir(), "camborder-performance-smoke-"))
  let sampler = null
  const startedAt = Date.now()
  try {
    const engineProcess = enginePidFor(baseUrl, explicitPid)
    const enginePid = engineProcess.pid
    sampler = new EngineRssSampler(enginePid)
    const baseline = sampler.sample("启动基线")
    sampler.start()
    await fetchJson(`${baseUrl}/api/health`)
    sampler.sample("健康检查后")
    console.log(`[performance-smoke] 已连接并确认 Java 引擎：pid=${enginePid}；command=${engineProcess.commandLine}`)
    console.log(`[performance-smoke] 队列项=${count}；轮数=${PERFORMANCE_ROUNDS}；默认样片=${samplePath}`)

    const roundIdleRss = []
    for (let round = 1; round <= PERFORMANCE_ROUNDS; round++) {
      sampler.assertHealthy()
      roundIdleRss.push(await runRound({ baseUrl, count, samplePath, outputDir, round, sampler }))
    }

    sampler.assertHealthy()
    const finalIdle = sampler.sample("最终空闲确认")
    const engineRssBaseline = baseline.rssBytes
    const engineRssPeak = sampler.peakBytes
    const engineRssIdle = finalIdle.rssBytes
    const engineIdleGrowth = engineRssIdle - engineRssBaseline
    const roundIdleGrowth = roundIdleRss[1] - roundIdleRss[0]
    const maxIdleGrowthBytes = maxIdleGrowthMb * 1024 * 1024

    assert.ok(
      engineIdleGrowth <= maxIdleGrowthBytes,
      `引擎 RSS 空闲增长超过启动基线阈值：${toMiB(engineIdleGrowth)}MiB > ${maxIdleGrowthMb}MiB`
    )
    assert.ok(
      roundIdleGrowth <= maxIdleGrowthBytes,
      `两轮空闲 RSS 持续增长超过阈值：${toMiB(roundIdleGrowth)}MiB > ${maxIdleGrowthMb}MiB`
    )

    const evidence = {
      enginePid,
      engineCommand: engineProcess.commandLine,
      engineRssBaseline,
      engineRssPeak,
      engineRssIdle,
      engineIdleGrowth,
      roundIdleRss,
      roundIdleGrowth,
      maxIdleGrowthBytes,
      samplePath,
      count,
      rounds: PERFORMANCE_ROUNDS
    }
    console.log(`[performance-smoke] engineRssBaseline=${engineRssBaseline} bytes (${toMiB(engineRssBaseline)}MiB)`)
    console.log(`[performance-smoke] engineRssPeak=${engineRssPeak} bytes (${toMiB(engineRssPeak)}MiB)`)
    console.log(`[performance-smoke] engineRssIdle=${engineRssIdle} bytes (${toMiB(engineRssIdle)}MiB)`)
    console.log(`[performance-smoke] engineIdleGrowth=${engineIdleGrowth} bytes (${toMiB(engineIdleGrowth)}MiB)`)
    console.log(`[performance-smoke] 两轮空闲 RSS：round1=${toMiB(roundIdleRss[0])}MiB，round2=${toMiB(roundIdleRss[1])}MiB，增长=${toMiB(roundIdleGrowth)}MiB`)
    console.log(`[performance-smoke] 证据 JSON：${JSON.stringify(evidence)}`)
    console.log(`[performance-smoke] PASS，总耗时=${Date.now() - startedAt}ms`)
  } finally {
    sampler?.stop()
    // 仅清理脚本刚创建的专属临时目录，避免两轮 100 项 smoke 产物残留在工作区。
    rmSync(outputDir, { recursive: true, force: true })
  }
}

await main()
