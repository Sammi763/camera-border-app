import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { CdpClient } from "./packaged-e2e.mjs"
import { ProcessMemoryRecorder, readProcesses, processTree } from "./process-memory.mjs"

const option = (name) => {
  const index = process.argv.indexOf(name)
  return index > 1 ? process.argv[index + 1] : undefined
}
for (const key of ["--app", "--sample", "--output"]) assert(path.isAbsolute(option(key) ?? ""), `${key} 需要绝对路径`)
const { ELECTRON_RENDERER_URL: _renderer, ...cleanEnvironment } = process.env
const app = option("--app"), sample = option("--sample"), output = option("--output")
mkdirSync(output, { recursive: true })
const userData = mkdtempSync(path.join(tmpdir(), "film-color-packaged-"))
const freePort = () => new Promise((resolve) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const port = s.address().port; s.close(() => resolve(port)) }) })
const debugPort = await freePort(), enginePort = await freePort()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let child, client, timer, lastRecipe, failure = null
let record
const evidence = { status: "RUNNING", sample, sourceInterpretation: "显式人工输入域，仅验收处理链路；不宣称 FFF 物理校准", steps: [] }
writeFileSync(path.join(output, "evidence.json"), JSON.stringify(evidence, null, 2))
const evalPage = async (expression) => {
  const result = await client.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, 300000)
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result?.value
}
const wait = async (name, fn, accept = (v) => v, timeout = 180000) => {
  const started = Date.now(); let last
  while (Date.now() - started < timeout) {
    try { last = await fn(); if (accept(last)) return last } catch (e) { last = String(e) }
    await sleep(500)
  }
  throw new Error(`${name}超时：${JSON.stringify(last)}`)
}
const api = async (route, body) => {
  const response = await evalPage(`(async () => {const r = await fetch(${JSON.stringify(route)}, ${JSON.stringify(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })}); return { status: r.status, body: await r.json() }})()`)
  assert(response.status < 300, `${route}: ${JSON.stringify(response)}`)
  return response.body
}
const click = async (text) => assert(await evalPage(`(() => {const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b||b.disabled)return false;b.click();return true})()`), `按钮不可用：${text}`)
try {
  child = spawn(path.join(app, "Contents/MacOS/Camera Border"), [`--user-data-dir=${userData}`, `--remote-debugging-port=${debugPort}`], {
    env: { ...cleanEnvironment, CAMBORDER_ENGINE_PORT: String(enginePort), CAMBORDER_E2E: "1", CAMBORDER_E2E_SAMPLE: sample, CAMBORDER_E2E_EXTRA_SAMPLES: "[]" }, stdio: "ignore"
  })
  record = new ProcessMemoryRecorder(child.pid)
  timer = setInterval(() => { try { record.record(readProcesses()) } catch (e) { failure ??= String(e) } }, 250)
  const targets = await wait("CDP", async () => (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json(), (v) => v.some(t => t.type === "page" && t.url === "app://app/index.html"))
  client = await CdpClient.connect(targets.find(t => t.type === "page" && t.url === "app://app/index.html").webSocketDebuggerUrl)
  console.log("CDP 已连接 app 页面")
  await client.call("Runtime.enable")
  await client.call("Network.enable")
  await client.call("Network.setBlockedURLs", { urls: ["http://*", "https://*"] })
  await wait("应用健康", () => api("/api/health"))
  console.log("应用健康通过")
  client.on("Network.requestWillBeSent", ({ request }) => {
    if (request.url.includes("/api/preview") && request.postData) { try { lastRecipe = JSON.parse(request.postData).recipe } catch {} }
  })
  const probe = await api("/api/image-probe", { imagePath: sample })
  assert(probe.width * probe.height > 80_000_000)
  evidence.probe = probe
  await wait("欢迎页", () => evalPage("document.body.innerText.includes('选择照片')"))
  await click("选择照片")
  await wait("真实文件入队", () => evalPage("document.querySelectorAll('.queueItem').length"), n => n > 0)
  await click("底片")
  await wait("校色入口", () => evalPage("document.body.innerText.includes('开启胶片校色（正片）')"))
  await click("开启胶片校色（正片）")
  await wait("真实 FFF 处理预览", () => evalPage("({ready:!!document.querySelector('[data-testid=film-engine-preview] img[src^=\"/previews/\"]'), text:document.body.innerText.slice(-1400)})"), v => v.ready)
  console.log("已完成阶段"); evidence.steps.push("真实 FFF 经工作台调度产生处理预览")
  assert(lastRecipe?.imageProcessing?.inputSource === "flextight-fff")
  // 切到彩负，沿用 UI 创建的通用近似参数；不伪造设备标定。
  await evalPage("(() => {const s=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='color-negative'));s.value='color-negative';s.dispatchEvent(new Event('change',{bubbles:true}))})()")
  await wait("彩负配方", () => Promise.resolve(lastRecipe), v => v?.imageProcessing?.filmPolarity === "color-negative")
  const recipe = structuredClone(lastRecipe)
  const analysis = await api("/api/image-analysis", { recipe, stage: "current-positive" })
  assert(analysis.stats.pixelCount > 0)
  console.log("已完成阶段"); evidence.steps.push("同配方彩负分析通过")
  const binding = await api("/api/image-analysis", { recipe, purpose: "neutral-balance", roi: { x: .1, y: .1, width: .15, height: .15 } })
  evidence.neutralAvailable = binding.neutralBalance?.available ?? false
  const name = "打包持久化验收"
  await evalPage(`(() => {const i=[...document.querySelectorAll('input')].find(i=>i.parentElement.textContent.includes('配方名称'));Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,${JSON.stringify(name)});i.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await click("保存当前观感")
  await wait("配方写入", () => evalPage("window.desktop.readFilmColorPresets()"), s => JSON.parse(s).some(p => p.name === name))
  await client.call("Page.reload")
  await wait("重启恢复", () => evalPage("document.body.innerText.includes('个人校色配方')"))
  await wait("预设恢复", () => evalPage(`document.body.innerText.includes(${JSON.stringify(name)})`))
  console.log("已完成阶段"); evidence.steps.push("独立观感配方经磁盘存储与页面重载恢复")
  const frozen = { ...recipe, border: { top: 0, bottom: 0, left: 0, right: 0, color: "#ffffff" }, gradient: null, texts: [], logo: null, borderStyle: null }
  const exportPath = path.join(output, "fff-full-size.tif")
  const request = { items: [{ recipe: frozen, sourceVersion: probe.sourceVersion, export: { format: "tiff", tier: "custom", outputPath: exportPath, filmOutput: "tiff16-rec2020", borderlessMaster: true, metadataPolicy: "preserve", maxWidth: 0, maxHeight: 0 } }] }
  request.items.push({ ...structuredClone(request.items[0]), export: { ...request.items[0].export, outputPath: path.join(output, "fff-batch-second.tif") } })
  evidence.preflight = await api("/api/export-preflight", request)
  assert.equal(evidence.preflight.status, "ready", JSON.stringify(evidence.preflight))
  const accepted = await api("/api/render-jobs", request)
  evidence.jobId = accepted.jobId
  const job = await wait("完整导出", () => api(`/api/render-jobs/${accepted.jobId}`), j => ["completed", "failed", "cancelled", "partially-completed"].includes(j.status), 600000)
  evidence.job = job
  assert.equal(job.status, "completed", JSON.stringify(job))
  for (const item of job.items) {
    assert.equal(item.fidelityReport?.output?.width, probe.width)
    assert.equal(item.fidelityReport?.output?.height, probe.height)
    assert.equal(item.fidelityReport?.output?.bitDepth, 16)
    assert.equal(item.fidelityReport?.output?.colorSpace, "linear-rec2020")
  }
  assert(statSync(exportPath).size > 100_000_000)
  assert.equal(job.completed, 2)
  assert(statSync(path.join(output, "fff-batch-second.tif")).size > 100_000_000)
  evidence.job = job
  console.log("已完成阶段"); evidence.steps.push("完整原尺寸 16-bit TIFF 经导出预检、调度、元数据写入与回读核验")
  assert.equal(failure, null)
  evidence.status = "PASS"
} catch (e) { evidence.status = "FAIL"; evidence.error = String(e.stack ?? e); process.exitCode = 1 }
finally {
  clearInterval(timer)
  try { writeFileSync(path.join(output, "engine.log"), readFileSync(path.join(userData, "logs/engine.log"))) } catch {}
  evidence.memory = record?.snapshot()
  writeFileSync(path.join(output, "evidence.json"), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ status: evidence.status, steps: evidence.steps, error: evidence.error, memory: evidence.memory?.observedPeakTreeRssBytes }, null, 2))
  client?.close()
  if (child) {
    const descendants = processTree(readProcesses(), child.pid)
    child.kill("SIGTERM")
    await sleep(1500)
    for (const row of descendants.reverse()) { try { process.kill(row.pid, "SIGTERM") } catch {} }
  }
  rmSync(userData, { recursive: true, force: true })
}
