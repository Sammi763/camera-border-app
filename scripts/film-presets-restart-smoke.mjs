import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { tmpdir } from "node:os"
import { CdpClient } from "./packaged-e2e.mjs"
const app = process.argv[2], output = process.argv[3]
assert(path.isAbsolute(app) && path.isAbsolute(output))
const userData = mkdtempSync(path.join(tmpdir(), "film-presets-restart-"))
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const port = () => new Promise(r => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)) }) })
const { ELECTRON_RENDERER_URL: _dev, ...env } = process.env
let child, client
async function boot() {
  const debug = await port(), engine = await port()
  child = spawn(path.join(app, "Contents/MacOS/Camera Border"), [`--user-data-dir=${userData}`, `--remote-debugging-port=${debug}`], {
    env: { ...env, CAMBORDER_E2E: "1", CAMBORDER_E2E_USER_DATA_DIR: userData, CAMBORDER_ENGINE_PORT: String(engine) }, stdio: "ignore" })
  for (let n = 0; n < 100; n++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${debug}/json/list`)).json()
      const page = pages.find(p => p.url === "app://app/index.html")
      if (page) {
        const candidate = await CdpClient.connect(page.webSocketDebuggerUrl)
        try {
          const state = await candidate.call("Runtime.evaluate", { expression: "typeof window.desktop?.readFilmColorPresets", returnByValue: true })
          if (state.result?.value === "function") { client = candidate; return }
        } catch {}
        candidate.close()
      }
    } catch {}
    await sleep(300)
  }
  throw new Error("安装包启动超时")
}
async function evaluate(expression) {
  const result = await client.call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
async function stop() {
  client?.close(); client = null
  if (child) {
    const process = child
    process.kill("SIGTERM")
    await Promise.race([new Promise(r => process.once("exit", r)), sleep(4000)])
    if (process.exitCode === null) process.kill("SIGKILL")
    child = null
  }
}
const evidence = { status: "RUNNING", firstPid: null, secondPid: null }
try {
  await boot(); evidence.firstPid = child.pid
  const preset = [{ id: "restart-proof", schemaVersion: 1, name: "重启持久化验收", positive: { exposureEv: .125, rgbBalanceEv: [0, .1, -.1] } }]
  await evaluate(`window.desktop.writeFilmColorPresets(${JSON.stringify(JSON.stringify(preset))})`)
  await stop()
  await boot(); evidence.secondPid = child.pid
  const restored = JSON.parse(await evaluate("window.desktop.readFilmColorPresets()"))
  assert.deepEqual(restored, preset); assert.notEqual(evidence.firstPid, evidence.secondPid)
  evidence.status = "PASS"
} catch (error) { evidence.status = "FAIL"; evidence.error = String(error.stack ?? error); process.exitCode = 1 }
finally { await stop(); rmSync(userData, { recursive: true, force: true }); writeFileSync(output, JSON.stringify(evidence, null, 2)); console.log(evidence) }
