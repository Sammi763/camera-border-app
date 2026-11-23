import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { CdpClient } from "./packaged-e2e.mjs"
import { ProcessMemoryRecorder, readProcesses, processTree } from "./process-memory.mjs"

const [app, output, quality, ...samples] = process.argv.slice(2)
const warmCount = Number(process.env.CAMBORDER_PREVIEW_WARM_COUNT ?? 30)
assert(Number.isInteger(warmCount) && warmCount >= 1 && warmCount <= 100, "热预览次数必须为 1–100")
assert(app && output && ["exact", "interactive"].includes(quality) && samples.length,
  "用法：node scripts/film-preview-performance.mjs <绝对.app路径> <结果.json> <exact|interactive> <样片...>")
const freePort = () => new Promise((resolve) => {
  const server = createServer()
  server.listen(0, "127.0.0.1", () => {
    const { port } = server.address()
    server.close(() => resolve(port))
  })
})
const until = async (fn) => {
  const deadline = Date.now() + 45000
  while (Date.now() < deadline) {
    try {
      const value = await fn()
      if (value) return value
    } catch { /* 启动过程中端口尚未打开。 */ }
    await sleep(200)
  }
  throw new Error("安装副本启动超时")
}

const benchmark = async (sample, iteration) => {
  const userData = mkdtempSync(path.join(tmpdir(), "film-preview-performance-"))
  const debugPort = await freePort()
  const enginePort = await freePort()
  const { ELECTRON_RENDERER_URL: _renderer, ...environment } = process.env
  const child = spawn(path.join(app, "Contents/MacOS/Camera Border"), [
    `--user-data-dir=${userData}`, `--remote-debugging-port=${debugPort}`
  ], { env: { ...environment, CAMBORDER_ENGINE_PORT: String(enginePort) }, stdio: "ignore" })
  const memory = new ProcessMemoryRecorder(child.pid)
  const timer = setInterval(() => memory.record(readProcesses()), 250)
  let client
  try {
    const target = await until(async () => {
      const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()
      return targets.find((entry) => entry.type === "page" && entry.url.startsWith("app://app/"))
    })
    client = await CdpClient.connect(target.webSocketDebuggerUrl)
    const evaluate = async (expression) => {
      const response = await client.call("Runtime.evaluate", {
        expression, awaitPromise: true, returnByValue: true
      }, 1800000)
      if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails))
      return response.result?.value
    }
    await until(() => evaluate('fetch("/api/health").then((r) => r.ok)'))
    const stats = async () => (await fetch(`http://127.0.0.1:${enginePort}/api/film-stage-cache`)).json()
    const cacheBefore = await stats()
    const results = await evaluate(`(async () => {
      const sample = ${JSON.stringify(sample)}, quality = ${JSON.stringify(quality)}
      const api = async (url, body) => {
        const response = await fetch(url, body === undefined ? undefined
          : {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(body)})
        const value = await response.json()
        if (!response.ok) throw Error(JSON.stringify(value))
        return value
      }
      const probe = await api("/api/image-probe", {imagePath:sample})
      const source = probe.recommendedInputSource
      const isFff = source === "flextight-fff"
      const config = {schemaVersion:2, algorithmVersion:"film-color-v2",
        inputSource:source, filmPolarity:isFff ? "color-negative" : "positive",
        positive:{exposureEv:0, rgbBalanceEv:[0,0,0], blackPoint:0, whitePoint:1, saturation:1}}
      if (isFff) {
        config.flextightInput = {device:"flextight", mainImage:"rgb16", colorSpace:"linear-rec2020",
          transferFunction:"linear", bitDepth:16}
        config.negative = {enabled:true, profile:"generic-color-negative-v1", density:{min:0,max:3},
          lightSource:{kind:"camera-white-balance"},
          filmBase:{kind:"roi",stage:"linear-working",roi:{x:0.02,y:0.02,width:0.08,height:0.05}}}
      } else if (source === "camera-raw") {
        config.raw = {whiteBalance:"camera", autoBright:false, gamma:"linear", highlight:"clip", crop:"vendor-inset"}
      } else {
        config.encodedInput = {colorSpace:probe.icc?.present ? "embedded" : "srgb",
          bitDepth:probe.container?.bitDepth === 16 ? 16 : 8, alphaBackground:"white", iccSha256:probe.icc?.sha256 ?? null}
      }
      const recipe = {imagePath:sample, imageProcessing:config, border:{top:10,right:10,bottom:10,left:10,color:"#ffffff"}}
      const image = document.createElement("img")
      image.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;object-fit:contain;z-index:999999;background:black"
      document.body.append(image)
      const frame = async (ev, mode) => {
        config.positive.exposureEv = ev
        const start = performance.now()
        const result = await api("/api/preview", {recipe,maxWidth:1280,maxHeight:1280,previewQuality:mode})
        const generated = performance.now()
        image.src = result.previewUrl
        await image.decode()
        const decoded = performance.now()
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        return {elapsed:performance.now()-start, generateMs:generated-start, loadMs:decoded-generated,
          presentMs:performance.now()-decoded, actualQuality:result.previewQuality ?? "exact", url:result.previewUrl}
      }
      const cold = await frame(0, "exact")
      const firstTune = await frame(0.1, quality)
      const warm = [], warmPhases = []
      for (let index = 0; index < ${iteration === 1 ? warmCount : 0}; index++) {
        const next = await frame((index + 2) / 100, quality)
        if (next.actualQuality !== quality) throw Error("预览实际质量与目标不一致")
        warm.push(next.elapsed)
        warmPhases.push({generateMs:next.generateMs,loadMs:next.loadMs,presentMs:next.presentMs})
      }
      const refined = await frame(0.33, "exact")
      const pixels = await (await fetch(refined.url)).arrayBuffer()
      const exactPngSha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",pixels)),
        n => n.toString(16).padStart(2,"0")).join("")
      return {probe:{width:probe.width,height:probe.height,source},coldMs:cold.elapsed,
        firstTuningMs:firstTune.elapsed,warmMs:warm,warmPhases,refineMs:refined.elapsed,exactPngSha256}
    })()`)
    return { sample, iteration, ...results, cacheBefore, cacheAfter: await stats(), memory: memory.snapshot() }
  } catch (error) {
    try { console.error(readFileSync(path.join(userData, "logs/engine.log"), "utf8").slice(-3500)) } catch {}
    throw error
  } finally {
    clearInterval(timer)
    client?.close()
    const descendants = processTree(readProcesses(), child.pid)
    child.kill("SIGTERM")
    await sleep(600)
    for (const row of descendants.reverse()) {
      try { process.kill(row.pid, "SIGTERM") } catch { /* 已退出。 */ }
    }
    rmSync(userData, { recursive: true, force: true })
  }
}

const runs = []
for (const sample of samples) {
  for (let iteration = 1; iteration <= 3; iteration++) {
    const result = await benchmark(path.resolve(sample), iteration)
    runs.push(result)
    console.log(path.basename(sample), iteration, Math.round(result.coldMs), Math.round(result.refineMs))
    writeFileSync(output, JSON.stringify({ app, quality, memoryIntervalMs: 250, runs }, null, 2))
  }
}
