import { spawn } from "node:child_process"
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir, totalmem } from "node:os"
import { createServer } from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { ProcessMemoryRecorder, readProcesses, processTree } from "./process-memory.mjs"

const option = (name) => process.argv[process.argv.indexOf(name) + 1]
if (process.argv.includes("--help")) {
  console.log("用法：node scripts/measure-packaged-memory.mjs --app /绝对路径/Camera\u0020Border.app --film-sample /绝对路径/样片.ARW --output /绝对路径/证据.json [--count 2]")
  process.exit(0)
}
if (process.platform !== "darwin") throw new Error("此安装包测量入口当前只验证 macOS；不冒充其他平台验收")
for (const name of ["--app", "--film-sample", "--output"]) {
  if (!process.argv.includes(name) || !option(name) || !path.isAbsolute(option(name))) throw new Error(`${name} 必须提供绝对路径`)
}
const app = option("--app")
const output = option("--output")
const manifest = JSON.parse(readFileSync(path.join(app, "Contents/Resources/package-manifest.json"), "utf8"))
const temporary = mkdtempSync(path.join(tmpdir(), "camborder-memory-review-"))
const port = await new Promise((resolve, reject) => {
  const server = createServer()
  server.on("error", reject)
  server.listen(0, "127.0.0.1", () => {
    const value = server.address().port
    server.close((error) => error ? reject(error) : resolve(value))
  })
})
const { ELECTRON_RENDERER_URL: _renderer, ...environment } = process.env
const child = spawn(path.join(app, "Contents/MacOS/Camera Border"), [`--user-data-dir=${temporary}`], {
  env: { ...environment, CAMBORDER_ENGINE_PORT: String(port) }, stdio: "ignore"
})
const childExit = new Promise((resolve) => { child.once("exit", resolve); child.once("error", resolve) })
child.on("error", () => {})
const recorder = new ProcessMemoryRecorder(child.pid)
let sampleError = null
const sample = () => { try { recorder.record(readProcesses()) } catch (error) { sampleError ??= String(error) } }
sample()
const timer = setInterval(sample, 100)
const baseUrl = `http://127.0.0.1:${port}`
let perf = null
let status = "FAIL"
try {
  let healthy = false
  for (let attempt = 0; attempt < 180; attempt++) {
    if (child.exitCode !== null || sampleError) throw new Error(sampleError ?? "应用提前退出")
    try { healthy = (await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1000) })).status === 200 } catch {}
    if (healthy) break
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  if (!healthy) throw new Error("随包引擎启动超时")
  mkdirSync(path.dirname(output), { recursive: true })
  const log = []
  perf = spawn(process.execPath, [fileURLToPath(new URL("performance-smoke.mjs", import.meta.url)),
    "--base-url", baseUrl, "--count", process.argv.includes("--count") ? option("--count") : "2",
    "--film-sample", option("--film-sample"), "--film-tuning-count", "4", "--film-export-count", "2"], { stdio: ["ignore", "pipe", "pipe"] })
  for (const stream of [perf.stdout, perf.stderr]) stream.on("data", (chunk) => { log.push(String(chunk)); process.stdout.write(chunk) })
  const code = await new Promise((resolve, reject) => { perf.once("exit", resolve); perf.once("error", reject) })
  writeFileSync(`${output}.log`, log.join(""))
  sample()
  if (code !== 0 || sampleError) throw new Error(sampleError ?? `性能场景退出码 ${code}`)
  for (const role of ["electron", "renderer", "java", "nativeHelper"]) {
    if (recorder.snapshot().roles[role].status !== "MEASURED") throw new Error(`${role} 未观测，不能宣称内存测量完成`)
  }
  status = "PASS"
} finally {
  clearInterval(timer)
  mkdirSync(path.dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify({ status, completedAt: new Date().toISOString(), physicalBytes: totalmem(),
    sixteenGbAcceptance: "NOT_RUN", sampleIntervalMs: 100, sampleError, app, packageCommit: manifest.commit,
    components: manifest.components, memory: recorder.snapshot() }, null, 2)}\n`)
  const descendants = processTree(readProcesses(), child.pid).filter((row) => row.pid !== child.pid)
  perf?.kill()
  child.kill("SIGTERM")
  await Promise.race([childExit, new Promise((resolve) => setTimeout(resolve, 3000))])
  if (child.exitCode === null) child.kill("SIGKILL")
  // 只清理本次应用的、命令未变化的已知后代，不触碰开发引擎。
  const alive = readProcesses()
  for (const row of descendants) if (alive.some((current) => current.pid === row.pid && current.command === row.command)) {
    try { process.kill(row.pid, "SIGTERM") } catch {}
  }
  rmSync(temporary, { recursive: true, force: true })
  console.log(`进程内存证据：${output}；状态=${status}`)
}
