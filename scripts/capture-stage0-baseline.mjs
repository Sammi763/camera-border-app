import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { createServer } from "node:net"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
export const DEFAULT_APP = path.join(
  ROOT,
  "electron",
  "release",
  "macos-arm64",
  "mac-arm64",
  "Camera Border.app",
  "Contents",
  "MacOS",
  "Camera Border"
)
export const DEFAULT_SAMPLE = path.join(ROOT, "photos", "78330006.jpg")
export const DEFAULT_ARW = path.join(ROOT, "photos", "DSC04875.ARW")
// 与 electron/src/config/appConfig.ts 的 BrowserWindow 默认请求尺寸一致；实际外框另行从 Renderer 读取。
export const REQUESTED_WINDOW = { width: 1400, height: 920 }
export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const readArg = (args, name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

export const sha256File = async (filePath) => createHash("sha256").update(await readFile(filePath)).digest("hex")

export const getFreePort = async () => await new Promise((resolve, reject) => {
  const server = createServer()
  server.once("error", reject)
  server.listen(0, "127.0.0.1", () => {
    const address = server.address()
    if (address === null || typeof address === "string") {
      server.close()
      reject(new Error("无法获取 CDP 端口"))
      return
    }
    server.close((error) => error === undefined ? resolve(address.port) : reject(error))
  })
})

const fetchJson = async (url) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`调试端点返回 ${response.status}：${url}`)
  return await response.json()
}

export const waitFor = async (description, action, predicate, timeoutMs = 120_000) => {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  let lastValue
  while (Date.now() < deadline) {
    try {
      lastValue = await action()
      if (predicate(lastValue)) return lastValue
    } catch (error) {
      lastError = error
    }
    await sleep(200)
  }
  const errorText = lastError === null ? "" : `；最近错误：${lastError instanceof Error ? lastError.message : String(lastError)}`
  const valueText = lastValue === undefined ? "" : `；最后值：${JSON.stringify(lastValue)}`
  throw new Error(`等待${description}超时${errorText}${valueText}`)
}

export class CdpClient {
  #socket
  #nextId = 0
  #pending = new Map()
  #listeners = new Map()

  constructor(socket) {
    this.#socket = socket
    const rejectPending = (reason) => {
      for (const pending of this.#pending.values()) {
        clearTimeout(pending.timeout)
        pending.reject(reason)
      }
      this.#pending.clear()
    }
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data))
      if (message.id !== undefined) {
        const pending = this.#pending.get(message.id)
        if (pending === undefined) return
        this.#pending.delete(message.id)
        clearTimeout(pending.timeout)
        if (message.error !== undefined) pending.reject(new Error(message.error.message ?? "CDP 命令失败"))
        else pending.resolve(message.result ?? {})
        return
      }
      for (const listener of this.#listeners.get(message.method) ?? []) listener(message.params ?? {})
    })
    socket.addEventListener("error", () => rejectPending(new Error("Electron CDP WebSocket 出错")))
    socket.addEventListener("close", () => rejectPending(new Error("Electron CDP WebSocket 已关闭")))
  }

  static async connect(webSocketUrl) {
    if (typeof WebSocket !== "function") throw new Error("当前 Node 未提供 WebSocket，无法连接 Electron CDP")
    const socket = new WebSocket(webSocketUrl)
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true })
      socket.addEventListener("error", () => reject(new Error("连接 Electron CDP 失败")), { once: true })
    })
    return new CdpClient(socket)
  }

  on(method, listener) {
    this.#listeners.set(method, [...(this.#listeners.get(method) ?? []), listener])
  }

  call(method, params = {}, timeoutMs = 30_000) {
    const id = ++this.#nextId
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error(`Electron CDP 命令超时：${method}`))
      }, timeoutMs)
      this.#pending.set(id, { resolve, reject, timeout })
      this.#socket.send(JSON.stringify({ id, method, params }))
    })
  }

  close() {
    this.#socket.close()
  }
}

export const evaluate = async (client, expression) => {
  const result = await client.call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  })
  if (result.exceptionDetails !== undefined) throw new Error(result.exceptionDetails.text ?? "页面脚本执行失败")
  return result.result?.value
}

export const normalizeAppPath = (candidate) => candidate.endsWith(".app")
  ? path.join(candidate, "Contents", "MacOS", "Camera Border")
  : candidate

export const validPng = (data) => {
  if (!Buffer.isBuffer(data) || data.length < 33 || !data.subarray(0, 8).equals(PNG_SIGNATURE)) return false
  const length = data.readUInt32BE(8)
  if (data.toString("ascii", 12, 16) !== "IHDR" || length < 13 || data.length < 16 + length) return false
  return data.readUInt32BE(16) > 0 && data.readUInt32BE(20) > 0
}

export const pngDimensions = (data) => validPng(data)
  ? { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
  : null

/** 只捕获 CDP 报告的当前可见 Renderer viewport，不改 CSS、不裁剪照片内容。 */
export const captureRendererScreenshot = async (client, outputPath) => {
  const layout = await client.call("Page.getLayoutMetrics", {}, 30_000)
  const viewport = layout.visualViewport ?? layout.layoutViewport
  if (viewport === undefined) throw new Error("无法取得 Renderer 可见布局视口")
  const clip = {
    x: Number(viewport.pageX ?? 0),
    y: Number(viewport.pageY ?? 0),
    width: Number(viewport.clientWidth ?? 0),
    height: Number(viewport.clientHeight ?? 0),
    scale: 1
  }
  if (clip.width <= 0 || clip.height <= 0) throw new Error("Renderer 可见布局视口尺寸无效")
  const result = await client.call("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
    clip
  }, 60_000)
  if (typeof result.data !== "string") throw new Error("CDP 没有返回 PNG 截图")
  const data = Buffer.from(result.data, "base64")
  if (!validPng(data)) throw new Error("CDP 截图不是有效 PNG")
  await writeFile(outputPath, data)
  return { path: outputPath, bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") }
}

const readRect = (element) => {
  const rect = element.getBoundingClientRect()
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
}

/** 记录 Renderer 实际布局几何，照片/边框偏移均来自当前 Canvas dataset 与 DOM rect。 */
export const readBaselineGeometry = async (client, { scene, source, templateId, expectedMode }) => await evaluate(client, `(() => {
  const wrapper = document.querySelector('.previewCanvasWrapper')
  const canvas = document.querySelector('canvas.previewCanvas')
  const queueRow = [...document.querySelectorAll('.queueItem')].find((item) => item.classList.contains('queueItemActive'))
  const number = (name) => {
    const value = Number(canvas?.dataset[name])
    return Number.isFinite(value) ? value : null
  }
  const rect = (element) => element === null ? null : (${readRect.toString()})(element)
  if (wrapper === null || canvas === null) return { scene: ${JSON.stringify(scene)}, error: '缺少预览 wrapper 或 Canvas' }
  const wrapperRect = rect(wrapper)
  const canvasRect = rect(canvas)
  const border = {
    top: number('previewBorderTop'),
    bottom: number('previewBorderBottom'),
    left: number('previewBorderLeft'),
    right: number('previewBorderRight')
  }
  const image = {
    x: number('previewImageX'),
    y: number('previewImageY'),
    width: number('previewImageWidth'),
    height: number('previewImageHeight')
  }
  const cssScaleX = canvas.width > 0 ? canvasRect.width / canvas.width : null
  const cssScaleY = canvas.height > 0 ? canvasRect.height / canvas.height : null
  const displayImage = cssScaleX === null || cssScaleY === null || image.x === null || image.y === null || image.width === null || image.height === null
    ? null
    : {
        left: canvasRect.left + image.x * cssScaleX,
        top: canvasRect.top + image.y * cssScaleY,
        width: image.width * cssScaleX,
        height: image.height * cssScaleY
      }
  const naturalCanvas = image.width === null || image.height === null
    ? null
    : {
        width: Math.round(image.width + (border.left ?? 0) + (border.right ?? 0)),
        height: Math.round(image.height + (border.top ?? 0) + (border.bottom ?? 0))
      }
  const scale = wrapperRect === null || wrapperRect.width <= 0 || wrapperRect.height <= 0
    ? null
    : {
        x: canvas.width / wrapperRect.width,
        y: canvas.height / wrapperRect.height
      }
  const expectedActualScale = naturalCanvas === null || wrapperRect === null
    ? null
    : Math.max(naturalCanvas.width / wrapperRect.width, naturalCanvas.height / wrapperRect.height)
  const actualInvariant = ${JSON.stringify(expectedMode)} === 'actual'
    && naturalCanvas !== null
    && expectedActualScale !== null
    && scale !== null
    // actual 模式按自然尺寸计算 scale；较长轴与自然尺寸相等，另一轴可以因视口比例留出空白。
    && Math.abs(scale.x - expectedActualScale) <= 0.01
    && Math.abs(scale.y - expectedActualScale) <= 0.01
    && canvas.width + 1 >= naturalCanvas.width
    && canvas.height + 1 >= naturalCanvas.height
  const activePolaroid = [...document.querySelectorAll('.templateGalleryCard')].some((card) =>
    card.querySelector('.templateGalleryName')?.textContent?.trim() === 'Polaroid 拍立得'
      && card.classList.contains('templateGalleryCardActive')
  )
  const activeInfoCard = document.querySelector('.templateGalleryInfoCard')?.classList.contains('templateGalleryCardActive') ?? false
  return {
    scene: ${JSON.stringify(scene)},
    source: {
      fileName: ${JSON.stringify(source.fileName)},
      relativePath: ${JSON.stringify(source.relativePath)},
      pixelDimensions: ${JSON.stringify(source.pixelDimensions)},
      orientation: ${JSON.stringify(source.orientation)},
      format: ${JSON.stringify(source.format)}
    },
    templateId: ${JSON.stringify(templateId)},
    activeTemplateEvidence: ${JSON.stringify(templateId)} === 'polaroid' ? activePolaroid : activeInfoCard,
    mode: ${JSON.stringify(expectedMode)},
    modeLabel: document.querySelector('.previewZoomLabel')?.textContent?.trim() ?? '',
    requestedWindow: ${JSON.stringify(REQUESTED_WINDOW)},
    actualInvariant,
    window: {
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio
    },
    rendererViewport: {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight
    },
    previewWrapper: wrapperRect,
    canvas: {
      css: canvasRect,
      intrinsicWidth: canvas.width,
      intrinsicHeight: canvas.height
    },
    naturalCanvas,
    scale,
    photoDisplay: displayImage,
    photoCanvas: image,
    border,
    canvasOffset: wrapperRect === null || canvasRect === null ? null : {
      x: canvasRect.left - wrapperRect.left,
      y: canvasRect.top - wrapperRect.top
    },
    previewFileName: document.querySelector('.previewMetaFileName')?.textContent?.trim() ?? '',
    queueSourcePath: queueRow?.querySelector('.queueSub')?.getAttribute('title') ?? null,
    engineSyncLabel: document.querySelector('.previewSyncBadge')?.textContent?.trim() ?? '',
    engineSyncClass: document.querySelector('.previewSyncBadge')?.className ?? '',
    sourceDecodeLabel: document.querySelector('.decodeBadge')?.textContent?.trim() ?? ''
  }
})()`)

export const clickByText = async (client, selector, text, description) => {
  const clicked = await evaluate(client, `(() => {
    const element = [...document.querySelectorAll(${JSON.stringify(selector)})].find((item) => item.textContent?.trim() === ${JSON.stringify(text)})
    if (!(element instanceof HTMLElement)) return false
    element.click()
    return true
  })()`)
  assert.equal(clicked, true, `未找到${description}`)
}

export const clickTemplateByName = async (client, name, description) => {
  const clicked = await evaluate(client, `(() => {
    const card = [...document.querySelectorAll('.templateGalleryCard')].find((item) =>
      item.querySelector('.templateGalleryName')?.textContent?.trim() === ${JSON.stringify(name)}
    )
    const button = card?.querySelector('.templateGalleryApplyButton')
    if (!(button instanceof HTMLElement)) return false
    button.click()
    return true
  })()`)
  assert.equal(clicked, true, `未找到${description}`)
}

export const ensureInfoCard = async (client) => {
  const active = await evaluate(client, "document.querySelector('.templateGalleryInfoCard')?.classList.contains('templateGalleryCardActive') ?? false")
  if (active !== true) await clickByText(client, ".templateGalleryInfoCard .templateGalleryApplyButton", "应用", "默认摄影信息卡")
  await waitFor("默认摄影信息卡激活", () => evaluate(client, "document.querySelector('.templateGalleryInfoCard')?.classList.contains('templateGalleryCardActive') ?? false"), (value) => value === true)
}

export const selectQueueItem = async (client, fileName) => {
  const selected = await evaluate(client, `(() => {
    const row = [...document.querySelectorAll('.queueItem')].find((item) => item.querySelector('.queueName')?.firstChild?.textContent?.trim() === ${JSON.stringify(fileName)})
    if (!(row instanceof HTMLElement)) return false
    row.click()
    return true
  })()`)
  assert.equal(selected, true, `无法选择队列项：${fileName}`)
}

export const waitForCanvas = async (client, fileName) => await waitFor(
  `${fileName} 的 Canvas 照片区域`,
  () => evaluate(client, `(() => {
    const canvas = document.querySelector('canvas.previewCanvas')
    if (canvas === null) return null
    return {
      fileName: document.querySelector('.previewMetaFileName')?.textContent?.trim() ?? '',
      width: Number(canvas.dataset.previewImageWidth),
      height: Number(canvas.dataset.previewImageHeight),
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      sync: document.querySelector('.previewSyncBadge')?.textContent?.trim() ?? ''
    }
  })()`),
  (value) => value !== null
    && value.fileName === fileName
    && value.width > 0
    && value.height > 0
    && value.canvasWidth > 0
    && value.canvasHeight > 0
)

export const waitForPreviewSettled = async (client, fileName) => await waitFor(
  `${fileName} 的引擎预览完成或失败`,
  () => evaluate(client, `(() => ({
    fileName: document.querySelector('.previewMetaFileName')?.textContent?.trim() ?? '',
    label: document.querySelector('.previewSyncBadge')?.textContent?.trim() ?? ''
  }))()`),
  (value) => value !== null && value.fileName === fileName && !value.label.includes("正在同步")
)

export const writeJson = async (filePath, value) => {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

const isHash = (value) => typeof value === "string" && /^[0-9a-f]{64}$/i.test(value)

/** 阶段 0 验收只验证基线证据完整性；几何异常写入 issue-baseline，不改产品。 */
export const buildStage0VerificationReport = ({ manifest, runInfo, geometry, artifactPaths, network }) => {
  const arw = manifest?.files?.filter((entry) => entry.format === "ARW") ?? []
  const screenshotsValid = artifactPaths.every((artifact) => artifact.exists === true && artifact.validPng === true && isHash(artifact.sha256))
  const geometryComplete = geometry.length === 4 && geometry.every((item) => item.error === undefined)
  const actualRecord = geometry.find((item) => item.scene === "preview-100-percent")
  const checks = {
    sourceFileCount: manifest?.fileCount === 15 && manifest?.files?.length === 15,
    sourceHashes: manifest?.files?.every((entry) => isHash(entry.sha256)) === true,
    arwOrientation: arw.length === 6 && arw.every((entry) => entry.orientation === 8),
    arwEmbeddedJpeg: arw.length === 6 && arw.every((entry) => entry.embeddedJpeg?.present === true
      && entry.embeddedJpeg.selector === "JpgFromRaw"
      && Number(entry.embeddedJpeg.bytes) > 0),
    rawBitDepthSeparated: arw.length === 6 && arw.every((entry) => entry.containerBitDepth === 14
      && entry.pixelBitDepth === 8
      && entry.pixelSource === "embedded-jpeg"),
    screenshots: screenshotsValid,
    geometry: geometryComplete,
    actualMode: actualRecord?.mode === "actual"
      && actualRecord.modeLabel === "100%"
      && actualRecord.actualInvariant === true,
    sourceHashesUnchanged: runInfo?.sourceShaUnchanged === true,
    releaseScope: runInfo?.releaseScope?.formalTargets?.length === 1
      && runInfo.releaseScope.formalTargets[0] === "darwin-arm64"
      && runInfo.releaseScope.targetPolicies?.["darwin-x64"]?.releaseBlocking === false
      && runInfo.releaseScope.targetPolicies?.["win32-x64"]?.releaseStatus === "SIMULATED",
    noExternalRequests: network?.externalRequests === 0,
    noUploadRequests: network?.uploadRequests === 0
  }
  return {
    schemaVersion: 1,
    kind: "stage0-verification",
    status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
    independentOfFinalReleaseStatus: true,
    checks,
    observations: {
      arwPortraitDisplay: geometry.find((item) => item.scene === "arw-vertical")?.photoDisplay?.height
        > geometry.find((item) => item.scene === "arw-vertical")?.photoDisplay?.width,
      finalReleaseReportMayRemainNotReady: true
    },
    artifacts: artifactPaths,
    artifactPaths: artifactPaths.map((artifact) => artifact.path),
    completedAt: new Date().toISOString()
  }
}

const readSourceEntries = async (manifestPath, samplePath, arwPath) => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
  const find = (filePath) => manifest.files.find((entry) => entry.fileName === path.basename(filePath))
  const sample = find(samplePath)
  const arw = find(arwPath)
  if (sample === undefined || arw === undefined) throw new Error("manifest 没有覆盖截图使用的源文件")
  return { manifest, sample, arw }
}

const main = async () => {
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    throw new Error(`阶段 0 视觉基线必须在 macOS arm64 执行，当前为 ${process.platform}-${process.arch}`)
  }
  const args = process.argv.slice(2)
  const outputRoot = path.resolve(readArg(args, "--output") ?? path.join(ROOT, ".local", "stage0", `${readArg(args, "--version") ?? "0.1.0"}-${new Date().toISOString().replace(/[-:.]/g, "").replace(/Z$/, "Z")}-${(readArg(args, "--commit") ?? "current").slice(0, 12)}`))
  const manifestPath = path.resolve(readArg(args, "--manifest") ?? path.join(outputRoot, "photo-manifest.json"))
  const runInfoPath = path.resolve(readArg(args, "--run-info") ?? path.join(outputRoot, "run-info.json"))
  const appPath = normalizeAppPath(path.resolve(readArg(args, "--app") ?? DEFAULT_APP))
  const samplePath = path.resolve(readArg(args, "--sample") ?? DEFAULT_SAMPLE)
  const arwPath = path.resolve(readArg(args, "--arw") ?? DEFAULT_ARW)
  await mkdir(outputRoot, { recursive: true })
  const { manifest, sample, arw } = await readSourceEntries(manifestPath, samplePath, arwPath)
  const beforeHashes = Object.fromEntries(await Promise.all(manifest.files.map(async (entry) => [entry.relativePath, await sha256File(path.resolve(ROOT, entry.relativePath))])))
  const debugPort = await getFreePort()
  const temporaryRoot = await (async () => {
    const prefix = path.join(os.tmpdir(), "camera-border-stage0-")
    const { mkdtemp } = await import("node:fs/promises")
    return await mkdtemp(prefix)
  })()
  const userData = path.join(temporaryRoot, "user-data")
  const { ELECTRON_RENDERER_URL: _rendererUrl, CAMBORDER_ENGINE_PORT: _enginePort, ...cleanEnv } = process.env
  const environment = {
    ...cleanEnv,
    CAMBORDER_E2E: "1",
    CAMBORDER_E2E_SAMPLE: samplePath,
    CAMBORDER_E2E_EXTRA_SAMPLES: JSON.stringify([arwPath]),
    CAMBORDER_E2E_USER_DATA_DIR: userData
  }
  const logs = []
  const child = spawn(appPath, [`--remote-debugging-port=${debugPort}`, `--user-data-dir=${userData}`], {
    cwd: path.dirname(appPath),
    env: environment,
    stdio: ["ignore", "pipe", "pipe"]
  })
  child.stdout.on("data", (chunk) => logs.push(String(chunk)))
  child.stderr.on("data", (chunk) => logs.push(String(chunk)))
  let client = null
  const geometry = []
  const requestUrls = []
  const requestDetails = []
  try {
    const targets = await waitFor("Electron CDP 端点", () => fetchJson(`http://127.0.0.1:${debugPort}/json/list`), (items) => Array.isArray(items) && items.some((item) => item.type === "page" && typeof item.webSocketDebuggerUrl === "string"))
    const page = targets.find((item) => item.type === "page" && typeof item.webSocketDebuggerUrl === "string")
    client = await CdpClient.connect(page.webSocketDebuggerUrl)
    client.on("Network.requestWillBeSent", (params) => {
      const url = params.request?.url
      if (typeof url === "string") {
        requestUrls.push(url)
        requestDetails.push({ url, method: params.request?.method ?? "GET" })
      }
    })
    await client.call("Runtime.enable")
    await client.call("Page.enable")
    await client.call("Network.enable")
    await waitFor("app 页面", () => evaluate(client, "location.href"), (url) => url === "app://app/index.html")
    await waitFor("托管 Java Engine", () => evaluate(client, "window.desktopRuntime?.engine?.managed === true"), (managed) => managed === true)
    await waitFor("选择照片按钮", () => evaluate(client, "Boolean([...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '选择照片'))"), (visible) => visible === true)
    await clickByText(client, "button", "选择照片", "选择照片按钮")
    await waitFor("两张固定基线照片进入队列", () => evaluate(client, "[...document.querySelectorAll('.queueItem')].map((item) => item.querySelector('.queueName')?.firstChild?.textContent?.trim() ?? '')"), (names) => Array.isArray(names) && names.includes(path.basename(samplePath)) && names.includes(path.basename(arwPath)))
    await waitFor("Java Engine 健康端点", () => evaluate(client, "fetch('/api/health', { cache: 'no-store' }).then((response) => response.status).catch(() => 0)"), (status) => status === 200)

    await selectQueueItem(client, sample.fileName)
    await waitForCanvas(client, sample.fileName)
    await waitForPreviewSettled(client, sample.fileName)
    await ensureInfoCard(client)
    await waitForPreviewSettled(client, sample.fileName)
    geometry.push(await readBaselineGeometry(client, { scene: "landscape-default", source: sample, templateId: "photo-info-card", expectedMode: "fit" }))
    await captureRendererScreenshot(client, path.join(outputRoot, "landscape-default.png"))

    await selectQueueItem(client, arw.fileName)
    await waitForCanvas(client, arw.fileName)
    await waitForPreviewSettled(client, arw.fileName)
    geometry.push(await readBaselineGeometry(client, { scene: "arw-vertical", source: arw, templateId: "photo-info-card", expectedMode: "fit" }))
    await captureRendererScreenshot(client, path.join(outputRoot, "arw-vertical.png"))

    await selectQueueItem(client, sample.fileName)
    await waitForCanvas(client, sample.fileName)
    await waitForPreviewSettled(client, sample.fileName)
    await clickTemplateByName(client, "Polaroid 拍立得", "Polaroid 模板按钮")
    await waitFor("Polaroid 模板激活", () => evaluate(client, "[...document.querySelectorAll('.templateGalleryCard')].some((card) => card.querySelector('.templateGalleryName')?.textContent?.trim() === 'Polaroid 拍立得' && card.classList.contains('templateGalleryCardActive'))"), (active) => active === true)
    await waitForPreviewSettled(client, sample.fileName)
    geometry.push(await readBaselineGeometry(client, { scene: "polaroid", source: sample, templateId: "polaroid", expectedMode: "fit" }))
    await captureRendererScreenshot(client, path.join(outputRoot, "polaroid.png"))

    await ensureInfoCard(client)
    await waitForPreviewSettled(client, sample.fileName)
    await clickByText(client, ".previewViewportBtn", "100%", "100% 预览按钮")
    await waitFor("actual/100% 预览模式", () => evaluate(client, "document.querySelector('.previewZoomLabel')?.textContent?.trim() ?? ''"), (label) => label === "100%")
    geometry.push(await readBaselineGeometry(client, { scene: "preview-100-percent", source: sample, templateId: "photo-info-card", expectedMode: "actual" }))
    await captureRendererScreenshot(client, path.join(outputRoot, "preview-100-percent.png"))
  } catch (error) {
    const logText = logs.join("")
    throw new Error(`${error instanceof Error ? error.message : String(error)}${logText.length > 0 ? `\nElectron 日志：\n${logText}` : ""}`)
  } finally {
    client?.close()
    if (child.exitCode === null) child.kill("SIGTERM")
    await sleep(1_000)
  }

  const afterHashes = Object.fromEntries(await Promise.all(manifest.files.map(async (entry) => [entry.relativePath, await sha256File(path.resolve(ROOT, entry.relativePath))])))
  const sourceShaUnchanged = JSON.stringify(beforeHashes) === JSON.stringify(afterHashes)
  const screenshotNames = ["landscape-default", "arw-vertical", "polaroid", "preview-100-percent"]
  const artifacts = await Promise.all(screenshotNames.map(async (name) => {
    const filePath = path.join(outputRoot, `${name}.png`)
    const data = await readFile(filePath)
    return { path: path.relative(ROOT, filePath), exists: true, validPng: validPng(data), dimensions: pngDimensions(data), bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") }
  }))
  const network = {
    requestCount: requestUrls.length,
    externalRequests: requestUrls.filter((url) => !url.startsWith("app://") && !url.startsWith("data:") && !url.startsWith("blob:")).length,
    uploadRequests: requestDetails.filter((request) => request.method !== "GET" && !request.url.startsWith("app://")).length,
    requests: requestDetails
  }
  const runInfo = JSON.parse(await readFile(runInfoPath, "utf8"))
  runInfo.sourceSha256BeforeCapture = beforeHashes
  runInfo.sourceSha256AfterCapture = afterHashes
  runInfo.sourceShaUnchanged = sourceShaUnchanged && runInfo.sourceShaUnchanged === true
  runInfo.screenshotSource = {
    kind: "current-checkout-macos-arm64-app",
    executable: appPath,
    packaged: true,
    userData: userData,
    requestedWindow: REQUESTED_WINDOW,
    windowSource: "CDP Renderer viewport"
  }
  runInfo.network = network
  runInfo.releaseScope = JSON.parse(await readFile(path.join(ROOT, "docs", "release-scope.json"), "utf8"))
  await writeJson(runInfoPath, runInfo)
  await writeJson(path.join(outputRoot, "baseline-geometry.json"), {
    schemaVersion: 1,
    source: "current-checkout-macos-arm64-app",
    generatedAt: new Date().toISOString(),
    scenes: geometry
  })
  const issueLines = [
    "# 阶段 0 几何问题基线",
    "",
    "> 本文件只记录当前 checkout 的实际 Renderer 几何观察，不在阶段 0 修复产品行为。",
    "",
    `- 截图来源：${appPath}`,
    `- 请求窗口：${REQUESTED_WINDOW.width}×${REQUESTED_WINDOW.height}`,
    `- 源文件哈希执行前后相等：${sourceShaUnchanged ? "是" : "否"}`,
    ""
  ]
  for (const item of geometry) {
    const display = item.photoDisplay
    const issues = []
    if (item.error !== undefined) issues.push(item.error)
    if (item.activeTemplateEvidence !== true) issues.push("模板激活状态未能由画廊 DOM 独立确认")
    if (item.scene === "arw-vertical" && display !== null && display.height <= display.width) issues.push("Orientation=8 的 ARW 当前显示区域没有呈竖向；保留截图供后续阶段处理")
    if (item.scene === "preview-100-percent" && item.actualInvariant !== true) issues.push("100% 标签与 Canvas 自然像素几何不一致")
    if (item.engineSyncLabel.includes("失败")) issues.push(`引擎预览状态：${item.engineSyncLabel}；截图保留当前即时预览结果`)
    issueLines.push(`## ${item.scene}`, "", `- 窗口请求：${item.requestedWindow?.width ?? REQUESTED_WINDOW.width}×${item.requestedWindow?.height ?? REQUESTED_WINDOW.height}`, `- 实际外框：${item.window?.outerWidth ?? "?"}×${item.window?.outerHeight ?? "?"}`, `- Renderer viewport：${item.rendererViewport?.width ?? "?"}×${item.rendererViewport?.height ?? "?"}`, `- Canvas：${item.canvas?.intrinsicWidth ?? "?"}×${item.canvas?.intrinsicHeight ?? "?"}（CSS ${item.canvas?.css?.width ?? "?"}×${item.canvas?.css?.height ?? "?"}）`, `- 自然 Canvas：${item.naturalCanvas?.width ?? "?"}×${item.naturalCanvas?.height ?? "?"}；实际 scale：${item.scale === null ? "?" : `${item.scale.x}×${item.scale.y}`}`, `- 照片显示区域：${display === null ? "不可用" : `${display.width}×${display.height} @ ${display.left},${display.top}`}`, `- 模式：${item.mode}；标签：${item.modeLabel}`, `- 引擎预览：${item.engineSyncLabel || "无状态徽标"}`, `- 问题：${issues.length === 0 ? "无自动化几何异常" : issues.join("；")}`, "")
  }
  await writeFile(path.join(outputRoot, "issue-baseline.md"), `${issueLines.join("\n")}\n`, "utf8")
  const verification = buildStage0VerificationReport({ manifest, runInfo, geometry, artifactPaths: artifacts, network })
  await writeJson(path.join(outputRoot, "verification-report.json"), verification)
  console.log(`[stage0-baseline] 已生成：${outputRoot}`)
  console.log(`[stage0-baseline] verification=${verification.status}；sourceShaUnchanged=${runInfo.sourceShaUnchanged}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`[stage0-baseline] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
