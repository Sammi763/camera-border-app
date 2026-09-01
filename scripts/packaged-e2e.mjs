import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { createServer } from "node:net"
import { accessSync, constants, copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const DEFAULT_SAMPLE = path.join(ROOT, "photos", "78330006.jpg")
const DEFAULT_TIMEOUT_MS = 45_000
export const PHOTO_CONTENT_PIXEL_THRESHOLD = 1000
const EXPECTED_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'"
].join("; ")

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 只有实际可绘制图片区内的非边框像素超过阈值，才算照片内容可见。 */
export const hasVisiblePhotoContent = (metrics) =>
  Number.isFinite(metrics?.drawableImage?.width)
  && Number.isFinite(metrics?.drawableImage?.height)
  && metrics.drawableImage.width > 0
  && metrics.drawableImage.height > 0
  && Number.isFinite(metrics?.nonBorderPixels)
  && metrics.nonBorderPixels > PHOTO_CONTENT_PIXEL_THRESHOLD

/** 输出阶段边界，便于打包 E2E 失败时核对真实应用、JRE 与清理过程。 */
const report = (message) => console.log(`[packaged-e2e] ${message}`)

const normalizePackagedPath = (candidate, platform) => {
  if (platform === "darwin" && candidate.endsWith(".app")) {
    return path.join(candidate, "Contents", "MacOS", "Camera Border")
  }
  return candidate
}

const isRegularFile = (candidate) => {
  try {
    return statSync(candidate).isFile()
  } catch {
    return false
  }
}

const isCurrentPlatformExecutable = (candidate, platform) => {
  if (!isRegularFile(candidate)) {
    return false
  }

  if (platform === "win32") {
    return path.basename(candidate) === "Camera Border.exe"
  }

  if (platform === "darwin") {
    if (
      path.basename(candidate) !== "Camera Border"
      || path.basename(path.dirname(candidate)) !== "MacOS"
      || path.basename(path.dirname(path.dirname(candidate))) !== "Contents"
      || path.extname(candidate).toLowerCase() === ".exe"
    ) {
      return false
    }
    try {
      accessSync(candidate, constants.X_OK)
      return true
    } catch {
      return false
    }
  }

  return false
}

const platformLabel = (platform, arch) => platform === "darwin"
  ? `macOS ${arch}`
  : platform === "win32"
    ? "Windows x64"
    : `${platform} ${arch}`

/** 根据当前宿主架构定位唯一的本次打包产物；不回退历史目录。 */
export const findPackagedExecutable = ({
  root = ROOT,
  platform = process.platform,
  arch = process.arch,
  override = process.env["CAMBORDER_PACKAGED_APP"]
} = {}) => {
  if (platform !== "darwin" && platform !== "win32") {
    throw new Error("打包 E2E 只支持最终平台 macOS arm64/x64 与 Windows x64。")
  }
  if (platform === "darwin" && arch !== "arm64" && arch !== "x64") {
    throw new Error(`打包 E2E 不支持 macOS 架构：${arch}`)
  }

  const explicit = override === undefined
    ? null
    : normalizePackagedPath(path.resolve(override), platform)
  const candidate = explicit ?? (platform === "darwin"
    ? path.join(root, "electron", "release", `macos-${arch}`, `mac-${arch}`, "Camera Border.app", "Contents", "MacOS", "Camera Border")
    : path.join(root, "electron", "release", "win-x64", "win-unpacked", "Camera Border.exe"))

  if (!isCurrentPlatformExecutable(candidate, platform)) {
    if (explicit === null) {
      throw new Error(`找不到当前 ${platformLabel(platform, arch)} 打包应用：${candidate}`)
    }
    throw new Error(`显式打包应用路径不是有效的当前平台可执行文件：${candidate}`)
  }
  return candidate
}

export const resourcesDirectoryFor = (executable) => process.platform === "darwin"
  ? path.resolve(path.dirname(executable), "..", "Resources")
  : path.join(path.dirname(executable), "resources")

const bundledJavaPathFor = (executable) => process.platform === "darwin"
  ? path.join(resourcesDirectoryFor(executable), "java-runtime", "Contents", "Home", "bin", "java")
  : path.join(resourcesDirectoryFor(executable), "java-runtime", "bin", process.platform === "win32" ? "java.exe" : "java")

const getFreePort = async () => await new Promise((resolve, reject) => {
  const server = createServer()
  server.once("error", reject)
  server.listen(0, "127.0.0.1", () => {
    const address = server.address()
    if (address === null || typeof address === "string") {
      server.close()
      reject(new Error("无法获取远程调试端口"))
      return
    }
    server.close((error) => error === undefined ? resolve(address.port) : reject(error))
  })
})

const sha256File = (filePath) => createHash("sha256").update(readFileSync(filePath)).digest("hex")

/** 读取 PNG、JPEG 或 TIFF 的像素尺寸，供打包导出证据验证。 */
export const readImageDimensions = (data) => {
  if (!Buffer.isBuffer(data) || data.length < 10) {
    return null
  }

  const isPositiveDimension = (value) => Number.isInteger(value) && value > 0
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (data.length >= 24 && data.subarray(0, 8).equals(pngSignature)) {
    const width = data.readUInt32BE(16)
    const height = data.readUInt32BE(20)
    return isPositiveDimension(width) && isPositiveDimension(height)
      ? { format: "png", width, height }
      : null
  }

  if (data[0] === 0xff && data[1] === 0xd8) {
    const startOfFrameMarkers = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
      0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
    ])
    let offset = 2
    while (offset + 3 < data.length) {
      if (data[offset] !== 0xff) {
        offset++
        continue
      }
      while (data[offset] === 0xff) {
        offset++
      }
      const marker = data[offset]
      if (marker === undefined) break
      if (marker === 0x01 || marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset++
        continue
      }
      if (offset + 7 >= data.length) break
      const segmentLength = data.readUInt16BE(offset + 1)
      if (segmentLength < 2 || offset + 1 + segmentLength > data.length) break
      if (startOfFrameMarkers.has(marker)) {
        const height = data.readUInt16BE(offset + 4)
        const width = data.readUInt16BE(offset + 6)
        return isPositiveDimension(width) && isPositiveDimension(height)
          ? { format: "jpeg", width, height }
          : null
      }
      offset += segmentLength + 1
    }
    return null
  }

  const littleEndian = data[0] === 0x49 && data[1] === 0x49
  const bigEndian = data[0] === 0x4d && data[1] === 0x4d
  if (!littleEndian && !bigEndian) {
    return null
  }
  const readUint16 = (offset) => littleEndian ? data.readUInt16LE(offset) : data.readUInt16BE(offset)
  const readUint32 = (offset) => littleEndian ? data.readUInt32LE(offset) : data.readUInt32BE(offset)
  if (readUint16(2) !== 42) {
    return null
  }
  const firstIfdOffset = readUint32(4)
  if (firstIfdOffset + 2 > data.length) {
    return null
  }
  const entryCount = readUint16(firstIfdOffset)
  let width = null
  let height = null
  for (let index = 0; index < entryCount; index++) {
    const entryOffset = firstIfdOffset + 2 + index * 12
    if (entryOffset + 12 > data.length) break
    const tag = readUint16(entryOffset)
    const type = readUint16(entryOffset + 2)
    const count = readUint32(entryOffset + 4)
    if ((tag !== 256 && tag !== 257) || count !== 1 || (type !== 3 && type !== 4)) {
      continue
    }
    const value = type === 3 ? readUint16(entryOffset + 8) : readUint32(entryOffset + 8)
    if (tag === 256) width = value
    if (tag === 257) height = value
  }
  return isPositiveDimension(width) && isPositiveDimension(height)
    ? { format: "tiff", width, height }
    : null
}

const isProcessAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false
  }
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const enginePidsFromLog = (log) => [...log.matchAll(/^\[engine-process\] pid=(\d+)$/gm)]
  .map((match) => Number.parseInt(match[1], 10))
  .filter((pid) => Number.isInteger(pid) && pid > 0)

const readEngineLog = (engineLogPath) => existsSync(engineLogPath)
  ? readFileSync(engineLogPath, "utf8")
  : ""

const killExactJavaPid = (pid, reason) => {
  assert.equal(isProcessAlive(pid), true, `${reason}前 Java PID 不存在或已退出：${pid}`)
  process.kill(pid, "SIGTERM")
  console.log(`[packaged-e2e] Java PID ${pid} 已精确发送 SIGTERM（${reason}）`)
}

const isAllowedPageRequest = (url) =>
  url.startsWith("app://app/") || url.startsWith("data:") || url.startsWith("blob:")

export const collectProtocolDiagnostics = (records) => records
  .map((record) => {
    if (typeof record === "string") return record
    if (typeof record?.entry?.text === "string") return record.entry.text
    if (typeof record?.exceptionDetails?.text === "string") return record.exceptionDetails.text
    if (typeof record?.text === "string") return record.text
    if (Array.isArray(record?.args)) {
      return record.args
        .map((argument) => typeof argument?.value === "string" ? argument.value : argument?.description ?? "")
        .join(" ")
    }
    return ""
  })
  .filter((text) => text.length > 0)
  .join("\n")

const assertNoProtocolErrors = (requests, responseDetails, consoleRecords, runtimeExceptions, logEntries) => {
  assert.equal(
    requests.every((url) => isAllowedPageRequest(url)),
    true,
    `页面出现非 app:///data:/blob: 网络请求：\n${requests.join("\n")}`
  )
  assert.equal(
    responseDetails.every((response) => response.status !== 403),
    true,
    `页面出现真实 HTTP 403 响应：\n${JSON.stringify(responseDetails.filter((response) => response.status === 403))}`
  )

  const diagnostics = collectProtocolDiagnostics([
    ...consoleRecords,
    ...runtimeExceptions,
    ...logEntries
  ])
  for (const forbidden of ["Failed to fetch", "CORS", "403", "app://app/app://"]) {
    assert.equal(
      diagnostics.includes(forbidden),
      false,
      `Console/Runtime/Log 出现禁止错误 ${forbidden}：\n${diagnostics}`
    )
  }
}

const fetchJson = async (url) => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`调试端点返回 ${response.status}：${url}`)
  }
  return await response.json()
}

const waitFor = async (description, action, predicate, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  let lastValue
  while (Date.now() < deadline) {
    try {
      const value = await action()
      lastValue = value
      if (predicate(value)) {
        return value
      }
    } catch (error) {
      lastError = error
    }
    await sleep(150)
  }
  const suffix = lastError === null ? "" : `；最近错误：${lastError instanceof Error ? lastError.message : String(lastError)}`
  const valueSuffix = lastValue === undefined ? "" : `；最后值：${JSON.stringify(lastValue)}`
  throw new Error(`等待${description}超时${suffix}${valueSuffix}`)
}

class CdpClient {
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
        if (message.error !== undefined) {
          pending.reject(new Error(message.error.message ?? "CDP 命令失败"))
        } else {
          pending.resolve(message.result ?? {})
        }
        return
      }
      const listeners = this.#listeners.get(message.method) ?? []
      for (const listener of listeners) listener(message.params ?? {})
    })
    socket.addEventListener("error", () => rejectPending(new Error("Electron CDP WebSocket 出错")))
    socket.addEventListener("close", () => rejectPending(new Error("Electron CDP WebSocket 已关闭")))
  }

  static async connect(webSocketUrl) {
    if (typeof WebSocket !== "function") {
      throw new Error("当前 Node 未提供 WebSocket，无法连接 Electron CDP。")
    }
    const socket = new WebSocket(webSocketUrl)
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true })
      socket.addEventListener("error", () => reject(new Error("连接 Electron CDP 失败")), { once: true })
    })
    return new CdpClient(socket)
  }

  on(method, listener) {
    const listeners = this.#listeners.get(method) ?? []
    listeners.push(listener)
    this.#listeners.set(method, listeners)
  }

  call(method, params = {}) {
    const id = ++this.#nextId
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error(`Electron CDP 命令超时：${method}`))
      }, 10_000)
      this.#pending.set(id, { resolve, reject, timeout })
      this.#socket.send(JSON.stringify({ id, method, params }))
    })
  }

  close() {
    this.#socket.close()
  }
}

const evaluate = async (client, expression) => {
  const result = await client.call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  })
  if (result.exceptionDetails !== undefined) {
    throw new Error(result.exceptionDetails.text ?? "页面脚本执行失败")
  }
  return result.result?.value
}

const clickButton = async (client, expression, description) => {
  const clicked = await evaluate(client, expression)
  assert.equal(clicked, true, `未找到${description}`)
}

/** 通过原生 value setter 驱动 React 受控表单，避免测试只修改 DOM 而未更新应用状态。 */
const setFormControlValue = async (client, selector, value, eventName) => await evaluate(client, `(() => {
  const element = document.querySelector(${JSON.stringify(selector)});
  if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLSelectElement)) return false;
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter === undefined) return false;
  setter.call(element, ${JSON.stringify(value)});
  element.dispatchEvent(new Event(${JSON.stringify(eventName)}, { bubbles: true }));
  return element.value === ${JSON.stringify(value)};
})()`)

/** 保存真实 Renderer 截图；路径会写入 E2E 日志，供失败和交接复核。 */
const captureRendererScreenshot = async (client, artifactRoot, label) => {
  const screenshotPath = path.join(artifactRoot, `${label}.png`)
  const result = await client.call("Page.captureScreenshot", { format: "png" })
  assert.equal(typeof result.data, "string", `无法取得 ${label} Renderer 截图`)
  writeFileSync(screenshotPath, Buffer.from(result.data, "base64"))
  return screenshotPath
}

/** 从 Renderer 的实际 Canvas 读取照片区域像素，不把文字或边框当成照片内容。 */
const readPreviewCanvasMetrics = async (client) => await evaluate(client, `(() => {
  const canvas = document.querySelector('canvas.previewCanvas');
  if (canvas === null) {
    return { error: '未找到 canvas.previewCanvas', drawableImage: { width: 0, height: 0 }, nonBorderPixels: 0 };
  }

  const numberFromDataset = (name) => {
    const value = Number(canvas.dataset[name]);
    return Number.isFinite(value) ? value : null;
  };
  const borderColor = canvas.dataset.previewBorderColor ?? '';
  const colorProbe = document.createElement('span');
  colorProbe.style.color = borderColor;
  document.body.append(colorProbe);
  const resolvedColor = getComputedStyle(colorProbe).color;
  colorProbe.remove();
  const colorMatch = resolvedColor.match(/^rgba?\\(([^)]+)\\)$/);
  const borderRgb = colorMatch === null
    ? null
    : colorMatch[1].split(',').slice(0, 3).map((part) => Number(part.trim()));
  const imageX = numberFromDataset('previewImageX');
  const imageY = numberFromDataset('previewImageY');
  const imageWidth = numberFromDataset('previewImageWidth');
  const imageHeight = numberFromDataset('previewImageHeight');
  const wrapperRect = canvas.getBoundingClientRect();
  const common = {
    canvas: {
      width: canvas.width,
      height: canvas.height,
      cssWidth: wrapperRect.width,
      cssHeight: wrapperRect.height
    },
    drawableImage: {
      x: imageX,
      y: imageY,
      width: imageWidth ?? 0,
      height: imageHeight ?? 0
    },
    border: {
      color: borderColor,
      resolvedColor,
      top: canvas.dataset.previewBorderTop ?? '',
      bottom: canvas.dataset.previewBorderBottom ?? '',
      left: canvas.dataset.previewBorderLeft ?? '',
      right: canvas.dataset.previewBorderRight ?? ''
    },
    syncLabel: document.querySelector('.previewSyncBadge')?.textContent?.trim() ?? '',
    insufficientMessage: document.querySelector('.previewAreaInsufficient')?.textContent?.trim() ?? ''
  };
  if (
    borderRgb === null || borderRgb.length !== 3 || borderRgb.some((value) => !Number.isFinite(value))
    || imageX === null || imageY === null || imageWidth === null || imageHeight === null
    || imageWidth <= 0 || imageHeight <= 0
  ) {
    return { ...common, nonBorderPixels: 0, error: 'Canvas 未提供可绘制图片区或可解析的当前边框色' };
  }

  const startX = Math.max(0, Math.floor(imageX));
  const startY = Math.max(0, Math.floor(imageY));
  const endX = Math.min(canvas.width, Math.ceil(imageX + imageWidth));
  const endY = Math.min(canvas.height, Math.ceil(imageY + imageHeight));
  if (endX <= startX || endY <= startY) {
    return { ...common, nonBorderPixels: 0, error: 'Canvas 有效图片区越出画布边界' };
  }

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) {
    return { ...common, nonBorderPixels: 0, error: '无法读取 Canvas 2D 上下文' };
  }
  const pixels = context.getImageData(startX, startY, endX - startX, endY - startY).data;
  const backgroundDistanceThreshold = 16;
  let nonBorderPixels = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const alpha = pixels[offset + 3];
    if (alpha === undefined || alpha < 16) continue;
    const red = pixels[offset] ?? 0;
    const green = pixels[offset + 1] ?? 0;
    const blue = pixels[offset + 2] ?? 0;
    if (
      Math.abs(red - borderRgb[0]) > backgroundDistanceThreshold
      || Math.abs(green - borderRgb[1]) > backgroundDistanceThreshold
      || Math.abs(blue - borderRgb[2]) > backgroundDistanceThreshold
    ) {
      nonBorderPixels++;
    }
  }
  return { ...common, nonBorderPixels, backgroundDistanceThreshold, error: null };
})()`)

const formatPreviewCanvasMetrics = (metrics) => {
  const canvas = metrics.canvas ?? {}
  const drawableImage = metrics.drawableImage ?? {}
  const border = metrics.border ?? {}
  return [
    `Canvas=${canvas.width ?? 0}×${canvas.height ?? 0}（CSS ${canvas.cssWidth ?? 0}×${canvas.cssHeight ?? 0}）`,
    `有效图片区=${drawableImage.width ?? 0}×${drawableImage.height ?? 0} @ ${drawableImage.x ?? "?"},${drawableImage.y ?? "?"}`,
    `边框=${border.color ?? ""} top=${border.top ?? ""} bottom=${border.bottom ?? ""} left=${border.left ?? ""} right=${border.right ?? ""}`,
    `非边框像素=${metrics.nonBorderPixels ?? 0}`,
    `同步=${metrics.syncLabel ?? ""}`,
    `空间提示=${metrics.insufficientMessage ?? ""}`
  ].join("；")
}

const waitForVisiblePreviewPhoto = async (client, artifactRoot, label) => {
  const screenshotPath = await captureRendererScreenshot(client, artifactRoot, label)
  try {
    const metrics = await waitFor(
      `${label}照片内容像素`,
      () => readPreviewCanvasMetrics(client),
      (value) => hasVisiblePhotoContent(value)
    )
    report(`${label}：${formatPreviewCanvasMetrics(metrics)}；截图=${screenshotPath}`)
    return { metrics, screenshotPath }
  } catch (error) {
    const metrics = await readPreviewCanvasMetrics(client).catch(() => null)
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}；${label}截图=${screenshotPath}；${metrics === null ? "无法读取 Canvas 指标" : formatPreviewCanvasMetrics(metrics)}`
    )
  }
}

/**
 * 将窗口请求缩至最小值。
 * Electron 的远程调试协议不提供 Browser.getWindowForTarget，使用页面自身的
 * window.resizeTo 请求实际 BrowserWindow 尺寸，并读取 outerWidth/outerHeight
 * 确认 Electron 已按应用最小值钳制，而不是仅模拟 CSS viewport。
 */
const readRendererWindowBounds = async (client) => await evaluate(
  client,
  "({ width: window.outerWidth, height: window.outerHeight })"
)

const resizeToMinimumWindow = async (client) => {
  const initialBounds = await readRendererWindowBounds(client)
  assert.equal(Number.isFinite(initialBounds?.width) && Number.isFinite(initialBounds?.height), true, "无法取得初始窗口尺寸")
  await evaluate(client, "window.resizeTo(1, 1)")
  const minimumBounds = await waitFor(
    "应用允许的最小窗口尺寸",
    () => readRendererWindowBounds(client),
    (bounds) => Number.isFinite(bounds?.width)
      && Number.isFinite(bounds?.height)
      && bounds.width > 1
      && bounds.height > 1
      && (bounds.width < initialBounds.width || bounds.height < initialBounds.height)
  )
  return { initialBounds, minimumBounds }
}

const restoreWindowBounds = async (client, bounds) => {
  await evaluate(client, `window.resizeTo(${bounds.width}, ${bounds.height})`)
  await waitFor(
    "恢复默认窗口尺寸",
    () => readRendererWindowBounds(client),
    (current) => current?.width === bounds.width && current?.height === bounds.height
  )
}

const waitForDevTools = async (port, child, logs) => await waitFor(
  "Electron 远程调试端点",
  async () => await fetchJson(`http://127.0.0.1:${port}/json/list`),
  (targets) => Array.isArray(targets) && targets.some((target) => target.type === "page"),
  DEFAULT_TIMEOUT_MS
).catch((error) => {
  if (child.exitCode !== null) {
    throw new Error(`${error.message}\nElectron 已退出，日志：\n${logs.join("")}`)
  }
  throw error
})

const run = async () => {
  const executable = findPackagedExecutable()
  assert.equal(existsSync(executable), true, `找不到当前打包应用：${executable}，请先运行 pnpm package`)
  const bundledJava = bundledJavaPathFor(executable)
  assert.equal(existsSync(bundledJava), true, `打包应用缺少随包 JRE：${bundledJava}`)

  const sample = path.resolve(process.env["CAMBORDER_E2E_SAMPLE"] ?? DEFAULT_SAMPLE)
  assert.equal(existsSync(sample), true, `找不到固定 E2E 样片：${sample}`)
  const sourceShaBefore = sha256File(sample)

  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "camera-border-packaged-e2e-"))
  const artifactRoot = mkdtempSync(path.join(tmpdir(), "camera-border-packaged-e2e-artifacts-"))
  const output = path.resolve(process.env["CAMBORDER_E2E_OUTPUT"] ?? path.join(temporaryRoot, "packaged-e2e-output.png"))
  // 该文件故意不是可解码图片，用于真实验证逐项失败和「重试失败项」路径；不属于产品样片。
  const retryFailureSample = path.join(temporaryRoot, "retry-failure.jpg")
  writeFileSync(retryFailureSample, Buffer.from("not-a-decodable-jpeg"))
  const retryOutputDirectory = mkdtempSync(path.join(temporaryRoot, "retry-output-"))
  const retryOutputCandidates = ["png", "jpg", "tif"].map((extension) =>
    path.join(retryOutputDirectory, `retry-failure-border.${extension}`)
  )
  const userData = path.join(temporaryRoot, "user-data")
  rmSync(output, { force: true })

  const debugPort = await getFreePort()
  const enginePort = await getFreePort()
  const logs = []
  const {
    ELECTRON_RENDERER_URL: _rendererUrl,
    CAMBORDER_ENGINE_PORT: _enginePort,
    ...cleanEnv
  } = process.env
  const child = spawn(executable, [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userData}`
  ], {
    cwd: path.dirname(executable),
    env: {
      ...cleanEnv,
      CAMBORDER_E2E: "1",
      CAMBORDER_E2E_SAMPLE: sample,
      CAMBORDER_E2E_RETRY_SAMPLE: retryFailureSample,
      CAMBORDER_E2E_OUTPUT: output,
      CAMBORDER_E2E_OUTPUT_DIR: retryOutputDirectory,
      CAMBORDER_ENGINE_PORT: String(enginePort)
    },
    stdio: ["ignore", "pipe", "pipe"]
  })
  child.stdout.on("data", (chunk) => logs.push(String(chunk)))
  child.stderr.on("data", (chunk) => logs.push(String(chunk)))
  report(`启动当前打包应用：${executable}`)
  report(`临时 userData：${userData}；独立引擎端口：${enginePort}`)
  report(`截图证据目录：${artifactRoot}`)

  let client = null
  const knownJavaPids = new Set()
  const engineLogPath = path.join(userData, "logs", "engine.log")
  try {
    const targets = await waitForDevTools(debugPort, child, logs)
    report(`Electron CDP 已就绪：127.0.0.1:${debugPort}`)
    const pageTarget = targets.find((target) => target.type === "page" && typeof target.webSocketDebuggerUrl === "string")
    assert.notEqual(pageTarget, undefined, "未找到 Electron 页面 CDP target")
    client = await CdpClient.connect(pageTarget.webSocketDebuggerUrl)
    report("已连接 app:// Renderer")
    const requests = []
    const requestDetails = []
    const responseDetails = []
    const failedRequests = []
    const consoleRecords = []
    const runtimeExceptions = []
    const logEntries = []
    client.on("Network.requestWillBeSent", (params) => {
      const url = params.request?.url
      if (typeof url === "string") {
        requests.push(url)
        requestDetails.push({ id: params.requestId, method: params.request?.method, url })
      }
    })
    client.on("Network.responseReceived", (params) => {
      const url = params.response?.url
      if (typeof url === "string") {
        responseDetails.push({ id: params.requestId, status: params.response?.status, url })
      }
    })
    client.on("Network.loadingFailed", (params) => {
      failedRequests.push({ id: params.requestId, errorText: params.errorText, canceled: params.canceled })
    })
    client.on("Runtime.consoleAPICalled", (params) => {
      consoleRecords.push(params)
    })
    client.on("Runtime.exceptionThrown", (params) => {
      runtimeExceptions.push(params)
    })
    client.on("Log.entryAdded", (params) => {
      logEntries.push(params)
    })
    report("启用 CDP Runtime")
    await client.call("Runtime.enable")
    report("启用 CDP Network")
    await client.call("Network.enable")
    report("启用 CDP Log")
    await client.call("Log.enable")

    await waitFor("app:// 页面", () => evaluate(client, "location.href"), (url) => url === "app://app/index.html")
    assert.equal(await evaluate(client, "location.href"), "app://app/index.html")
    assert.equal(await evaluate(client, "window.desktopRuntime?.engine?.managed"), true, "E2E 未运行在托管 JavaBridge 模式")
    const initialLog = await waitFor(
      "随包 JRE 启动记录",
      () => readEngineLog(engineLogPath),
      (log) => log.includes(`java=${bundledJava}`)
        && log.includes("requireBundledRuntime=true")
        && enginePidsFromLog(log).length >= 1
    )
    const firstJavaPid = enginePidsFromLog(initialLog)[0]
    assert.ok(firstJavaPid !== undefined && firstJavaPid > 0, "未记录首个托管 Java PID")
    knownJavaPids.add(firstJavaPid)

    const csp = await evaluate(client, "fetch(location.href).then((response) => response.headers.get('Content-Security-Policy'))")
    assert.equal(csp, EXPECTED_CONTENT_SECURITY_POLICY, "app:// 页面没有收到预期 CSP")
    const externalFetchBlocked = await evaluate(
      client,
      "fetch('https://example.invalid/camborder-csp-probe').then(() => false).catch(() => true)"
    )
    assert.equal(externalFetchBlocked, true, "CSP 没有拦截外网 fetch")
    await sleep(100)
    assert.equal(
      requests.includes("https://example.invalid/camborder-csp-probe"),
      false,
      "CSP 拦截的外网 URL 不应出现在 Network 记录"
    )

    // 通过页面自身的相对请求触发一次可观测的 app:// 健康检查。
    await evaluate(client, "fetch('/api/health').then((response) => response.status)")
    await waitFor("JavaBridge 健康状态", () => evaluate(client, "document.querySelector('.topbarBadge')?.textContent ?? ''"), (text) => text.includes("正常"))

    await clickButton(client, `(() => { const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '选择照片'); if (button === undefined) return false; button.click(); return true })()`, "选择照片按钮")
    await waitFor(
      "固定样片进入队列",
      () => evaluate(client, "[...document.querySelectorAll('.queueItem')].map((item) => item.textContent ?? '').join('\\n')"),
      (text) => text.includes(path.basename(sample)) && text.includes(path.basename(retryFailureSample))
    )
    await waitFor("引擎预览画布", () => evaluate(client, "Boolean(document.querySelector('canvas.previewCanvas'))"), (visible) => visible === true)

    const thumbnail = await waitFor(
      "可解码的实际缩略图",
      () => evaluate(client, `(() => {
        const image = document.querySelector('img.queueThumbImg');
        if (image === null) return null;
        return {
          src: image.currentSrc || image.src,
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight
        };
      })()`),
      (value) => value !== null
        && typeof value.src === "string"
        && (value.src.startsWith("app://app/previews/") || value.src.startsWith("data:image/"))
        && value.complete === true
        && value.naturalWidth > 0
        && value.naturalHeight > 0
    )
    assert.equal(
      thumbnail.src.startsWith("app://app/previews/") || thumbnail.src.startsWith("data:image/"),
      true,
      `缩略图不是允许的实际预览地址：${thumbnail.src}`
    )
    assert.equal(thumbnail.complete, true)
    assert.ok(thumbnail.naturalWidth > 0 && thumbnail.naturalHeight > 0, "缩略图没有可解码尺寸")

    await waitFor(
      "导入后自动应用摄影信息卡",
      () => evaluate(client, `(() => {
        const card = [...document.querySelectorAll('.quickTemplateCard')].find((item) =>
          item.querySelector('.quickTemplateName')?.textContent?.trim() === '摄影信息卡'
        );
        return card?.querySelector('.quickTemplateApplyButton')?.textContent?.trim() ?? '';
      })()`),
      (label) => label === "已应用"
    )
    await waitFor(
      "默认摄影信息卡引擎预览已同步",
      () => evaluate(client, "document.querySelector('.previewSyncBadge')?.textContent ?? ''"),
      (text) => text.includes("引擎预览已同步")
    )
    const defaultPreview = await waitForVisiblePreviewPhoto(client, artifactRoot, "默认摄影信息卡-引擎已同步")

    const minimumWindow = await resizeToMinimumWindow(client)
    report(`最小窗口：${minimumWindow.minimumBounds.width}×${minimumWindow.minimumBounds.height}`)
    await sleep(250)
    const minimumScreenshot = await captureRendererScreenshot(client, artifactRoot, "最小窗口-摄影信息卡")
    const minimumPreview = await waitFor(
      "最小窗口照片可见或预览区域不足提示",
      () => readPreviewCanvasMetrics(client),
      (metrics) => hasVisiblePhotoContent(metrics)
        || typeof metrics.insufficientMessage === "string" && metrics.insufficientMessage.includes("预览区域不足")
    )
    const minimumPhotoVisible = hasVisiblePhotoContent(minimumPreview)
    const minimumHasWarning = typeof minimumPreview.insufficientMessage === "string"
      && minimumPreview.insufficientMessage.includes("预览区域不足")
    assert.equal(
      minimumPreview.syncLabel.includes("引擎预览已同步") && !minimumPhotoVisible && !minimumHasWarning,
      false,
      `最小窗口不能出现“已同步”但纯边框画布；截图=${minimumScreenshot}；${formatPreviewCanvasMetrics(minimumPreview)}`
    )
    report(`最小窗口预览：${formatPreviewCanvasMetrics(minimumPreview)}；截图=${minimumScreenshot}`)
    await restoreWindowBounds(client, minimumWindow.initialBounds)

    const validPreviewUrl = requests.find((url) => url.startsWith("app://app/previews/"))
    assert.notEqual(validPreviewUrl, undefined, "没有记录有效 app:// 预览路由")
    const routeStatus = await evaluate(
      client,
      `(async () => {
        const [valid, bare, malformed] = await Promise.all([
          fetch(${JSON.stringify(validPreviewUrl)}),
          fetch('/previews'),
          fetch('/previews/route-check/extra')
        ]);
        return { valid: valid.status, bare: bare.status, malformed: malformed.status };
      })()`
    )
    assert.equal(routeStatus.valid, 200, "有效 app:// 预览路由未成功")
    assert.ok(routeStatus.bare >= 400, "裸 /previews 路径必须失败")
    assert.ok(routeStatus.malformed >= 400, "畸形 /previews 路径必须失败")

    const previewPostsBeforeTemplate = requests.filter((url) => url === "app://app/api/preview").length
    await clickButton(client, `(() => {
      const card = [...document.querySelectorAll('.quickTemplateCard')].find((item) =>
        item.querySelector('.quickTemplateName')?.textContent?.trim() === '全画幅叠字'
      );
      const button = card?.querySelector('button.quickTemplateApplyButton');
      if (button === null || button === undefined || button.textContent?.trim() !== '使用') return false;
      button.click();
      return true;
    })()`, "零边框模板使用按钮")
    await waitFor("零边框模板应用完成", () => evaluate(client, `(() => {
      const card = [...document.querySelectorAll('.quickTemplateCard')].find((item) =>
        item.querySelector('.quickTemplateName')?.textContent?.trim() === '全画幅叠字'
      );
      return card?.querySelector('.quickTemplateApplyButton')?.textContent?.trim() ?? '';
    })()`), (label) => label === "已应用")
    await waitFor(
      "零边框模板应用后的新引擎预览请求",
      () => requests.filter((url) => url === "app://app/api/preview").length,
      (count) => count > previewPostsBeforeTemplate
    )
    try {
      await waitFor(
        "零边框模板应用后的引擎同步完成",
        () => evaluate(client, "document.querySelector('.previewSyncBadge')?.textContent ?? ''"),
        (text) => text.includes("引擎预览已同步")
      )
    } catch (error) {
      const templateNetwork = {
        requests: requestDetails.slice(-20),
        responses: responseDetails.slice(-20),
        failed: failedRequests.slice(-20)
      }
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}；零边框模板网络诊断：${JSON.stringify(templateNetwork)}`
      )
    }
    const zeroBorderPreview = await waitForVisiblePreviewPhoto(client, artifactRoot, "零边框模板-引擎已同步")

    // 真实逐项失败/重试闸门：首轮导入一个不可解码 JPEG，首轮失败后替换为固定有效样片，
    // 再通过真实 UI 点击「重试失败项」，确保重试请求经过 app:// 代理和托管 JavaBridge。
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '创建摄影预设');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "创建摄影预设按钮")
    await waitFor(
      "摄影预设创建表单",
      () => evaluate(client, "Boolean(document.querySelector('.quickPresetCreateForm'))"),
      (visible) => visible === true
    )
    assert.equal(
      await setFormControlValue(client, '.quickPresetCreateForm input[placeholder="例如：135 Portra 日常"]', "打包 E2E 预设", "input"),
      true,
      "无法填写打包 E2E 预设名称"
    )
    assert.equal(
      await setFormControlValue(client, '.quickPresetCreateForm select', "6x10", "change"),
      true,
      "无法设置打包 E2E 拍摄画幅"
    )
    assert.equal(
      await setFormControlValue(client, '.quickPresetCreateForm input[placeholder="例如：Leica M6"]', "打包 E2E 相机", "input"),
      true,
      "无法填写打包 E2E 相机"
    )
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('.quickPresetCreateForm button')].find((item) => item.textContent?.trim() === '保存并应用');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "保存摄影预设按钮")
    await waitFor(
      "全部图片作用域控件",
      () => evaluate(client, "document.querySelectorAll('.quickScopeSelector button').length"),
      (count) => count === 3
    )
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('.quickScopeSelector button')].find((item) => item.textContent?.trim() === '全部图片');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "全部图片作用域按钮")
    await waitFor(
      "批量导出全部图片按钮",
      () => evaluate(client, "(() => { const button = [...document.querySelectorAll('button.previewExportButton')].find((item) => item.textContent?.includes('批量导出 2 张')); return button !== undefined && !button.disabled })()"),
      (available) => available === true
    )
    await clickButton(client, `(() => { const button = [...document.querySelectorAll('button.previewExportButton')].find((item) => item.textContent?.includes('批量导出 2 张')); if (button === undefined || button.disabled) return false; button.click(); return true })()`, "批量导出全部图片按钮")
    let batchFirstRun
    try {
      batchFirstRun = await waitFor(
        "批量导出出现一个真实失败项",
        () => evaluate(client, "document.querySelector('.previewExportStatus')?.textContent ?? ''"),
        (text) => text.includes("批量导出完成") && text.includes("成功 1") && text.includes("失败 1"),
        120_000
      )
    } catch (error) {
      const renderJobResponses = responseDetails.filter((response) => response.url.includes("/api/render-jobs"))
      const responseBodies = await Promise.all(renderJobResponses.slice(-8).map(async (response) => {
        try {
          const body = await client.call("Network.getResponseBody", { requestId: response.id })
          return { ...response, body: typeof body.body === "string" ? body.body.slice(0, 4000) : "" }
        } catch (bodyError) {
          return { ...response, bodyError: bodyError instanceof Error ? bodyError.message : String(bodyError) }
        }
      }))
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}；render-jobs 网络诊断：${JSON.stringify({
          requests: requestDetails.filter((request) => request.url.includes("/api/render-jobs")).slice(-8),
          responses: responseBodies
        })}`
      )
    }
    assert.equal(
      retryOutputCandidates.some((candidate) => existsSync(candidate)),
      false,
      "首轮失败项不应留下导出文件"
    )
    copyFileSync(sample, retryFailureSample)
    await waitFor(
      "重试失败项按钮",
      () => evaluate(client, "[...document.querySelectorAll('button')].filter((item) => item.textContent?.trim() === '重试失败项').length"),
      (count) => count === 1
    )
    await clickButton(client, `(() => { const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '重试失败项'); if (button === undefined) return false; button.click(); return true })()`, "重试失败项按钮")
    const batchRetryResult = await waitFor(
      "重试失败项完成",
      () => evaluate(client, "document.querySelector('.previewExportStatus')?.textContent ?? ''"),
      (text) => text.includes("批量导出完成") && text.includes("成功 2") && text.includes("失败 0"),
      120_000
    )
    const retryExportOutput = await waitFor(
      "重试失败项导出文件",
      () => retryOutputCandidates.find((candidate) => existsSync(candidate)),
      (candidate) => typeof candidate === "string",
      120_000
    )
    const retryExportData = readFileSync(retryExportOutput)
    const retryExportDimensions = readImageDimensions(retryExportData)
    assert.notEqual(retryExportDimensions, null, "重试失败项输出不是可识别的图片")

    await waitFor(
      "单图导出按钮可用",
      () => evaluate(client, "(() => { const button = [...document.querySelectorAll('button.previewExportButton')].find((item) => item.textContent?.includes('导出原图')); return button !== undefined && !button.disabled })()"),
      (available) => available === true
    )
    await clickButton(client, `(() => { const button = [...document.querySelectorAll('button.previewExportButton')].find((item) => item.textContent?.includes('导出原图')); if (button === undefined || button.disabled) return false; button.click(); return true })()`, "导出原图按钮")
    await waitFor("导出文件写盘", () => existsSync(output), (exists) => exists === true)
    const exportFileSize = await waitFor(
      "导出文件写入完成",
      async () => {
        const firstSize = statSync(output).size
        await sleep(250)
        return { firstSize, secondSize: statSync(output).size }
      },
      (sizes) => sizes.firstSize > 0 && sizes.firstSize === sizes.secondSize
    ).then((sizes) => sizes.secondSize)
    assert.ok(exportFileSize > 0, "导出文件为空")
    const exportData = readFileSync(output)
    const signature = exportData.subarray(0, 8)
    const isJpeg = signature[0] === 0xff && signature[1] === 0xd8
    const isPng = signature.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    const isTiff = (signature[0] === 0x49 && signature[1] === 0x49 && signature[2] === 0x2a && signature[3] === 0x00)
      || (signature[0] === 0x4d && signature[1] === 0x4d && signature[2] === 0x00 && signature[3] === 0x2a)
    assert.equal(isJpeg || isPng || isTiff, true, "导出文件不是受支持的 JPEG/PNG/TIFF")
    const exportDimensions = readImageDimensions(exportData)
    assert.notEqual(exportDimensions, null, "导出文件无法读取像素尺寸")
    const exportExtension = exportDimensions.format === "jpeg" ? "jpg" : exportDimensions.format
    const exportEvidencePath = path.join(artifactRoot, `导出文件.${exportExtension}`)
    copyFileSync(output, exportEvidencePath)
    const sourceShaAfter = sha256File(sample)
    assert.equal(sourceShaAfter, sourceShaBefore, "导出前后源图 SHA-256 不一致")

    assert.ok(requests.some((url) => url === "app://app/api/health"), "健康检查未经过 app:// 代理")
    assert.ok(requests.some((url) => url === "app://app/api/preview"), "预览请求未经过 app:// 代理")
    assert.ok(requests.some((url) => url.startsWith("app://app/previews/")), "预览缩略图未经过 app:// 代理")
    assert.ok(requests.some((url) => url === "app://app/api/render-jobs"), "导出请求未经过 app:// 代理")

    killExactJavaPid(firstJavaPid, "故障恢复闸门")
    const oldJavaState = await waitFor(
      "首个 Java 进程退出",
      () => ({ alive: isProcessAlive(firstJavaPid), log: readEngineLog(engineLogPath) }),
      (value) => value.alive === false && value.log.includes("[engine-exit]")
    )
    assert.equal(oldJavaState.alive, false)
    assert.match(oldJavaState.log, /\[engine-exit\].*signal=SIGTERM|\[engine-exit\].*exit=/)

    const faultUi = await waitFor(
      "唯一引擎故障入口和重试按钮",
      () => evaluate(client, `(() => ({
        failureCount: document.querySelectorAll('.engineStatusBarUnavailable').length,
        retryCount: [...document.querySelectorAll('button')].filter((item) => item.textContent?.trim() === '重试').length
      }))()`),
      (value) => value.failureCount === 1 && value.retryCount === 1
    )
    assert.deepEqual(faultUi, { failureCount: 1, retryCount: 1 })

    await clickButton(client, `(() => { const button = [...document.querySelectorAll('.engineStatusBarUnavailable button')].find((item) => item.textContent?.trim() === '重试'); if (button === undefined) return false; button.click(); return true })()`, "引擎重试按钮")
    const retryLog = await waitFor(
      "新的托管 Java 进程",
      () => readEngineLog(engineLogPath),
      (log) => enginePidsFromLog(log).length >= 2
    )
    const retryPids = enginePidsFromLog(retryLog)
    const secondJavaPid = retryPids[retryPids.length - 1]
    assert.ok(secondJavaPid !== undefined && secondJavaPid > 0, "未记录重试后的 Java PID")
    assert.notEqual(secondJavaPid, firstJavaPid, "重试没有启动新的 Java 进程")
    knownJavaPids.add(secondJavaPid)
    await waitFor(
      "重试后引擎正常",
      () => evaluate(client, "document.querySelector('.topbarBadge')?.textContent ?? ''"),
      (text) => text.includes("正常"),
      20_000
    )
    await waitFor(
      "重试后故障入口消失",
      () => evaluate(client, "document.querySelectorAll('.engineStatusBarUnavailable').length"),
      (count) => count === 0
    )

    await sleep(100)
    assertNoProtocolErrors(requests, responseDetails, consoleRecords, runtimeExceptions, logEntries)

    const lifecycleLog = readEngineLog(engineLogPath)
      .split("\n")
      .filter((line) => line.startsWith("[engine-start]") || line.startsWith("[engine-process]") || line.startsWith("[engine-exit]"))
      .join(" | ")
    console.log(`[packaged-e2e] Java 生命周期日志：${lifecycleLog}`)
    console.log(`[packaged-e2e] Java PID：${firstJavaPid} -> SIGTERM -> ${secondJavaPid}，UI 已恢复引擎正常`)
    console.log(`[packaged-e2e] 源图 SHA-256：${sourceShaBefore} -> ${sourceShaAfter}`)
    console.log(`[packaged-e2e] 导出证据：${exportEvidencePath}；字节=${exportFileSize}；尺寸=${exportDimensions.width}×${exportDimensions.height}；格式=${exportDimensions.format}`)
    console.log(`[packaged-e2e] 默认摄影信息卡 Canvas：${formatPreviewCanvasMetrics(defaultPreview.metrics)}`)
    console.log(`[packaged-e2e] 默认摄影信息卡同步截图：${defaultPreview.screenshotPath}`)
    console.log(`[packaged-e2e] 零边框模板 Canvas：${formatPreviewCanvasMetrics(zeroBorderPreview.metrics)}`)
    console.log(`[packaged-e2e] 真实失败项重试：首轮=${batchFirstRun}；重试后=${batchRetryResult}；输出=${retryExportOutput}；尺寸=${retryExportDimensions.width}×${retryExportDimensions.height}`)
    console.log(`[packaged-e2e] CSP：已收到并拦截外网 fetch；Network 未记录 https://example.invalid/camborder-csp-probe`)
    console.log(`[packaged-e2e] 网络断言：${requests.length} 个请求全部为 app://app/、data: 或 blob:；有效预览路由 200，裸/畸形路由失败`)

    console.log(`[packaged-e2e] 通过：${executable}`)
    console.log(`[packaged-e2e] 托管 JRE：${bundledJava}`)
    console.log(`[packaged-e2e] 引擎端口：${enginePort}（独立临时端口）`)
    console.log(`[packaged-e2e] 导出临时文件：${output}`)
  } finally {
    if (client !== null) {
      try {
        await client.call("Browser.close")
      } catch {
        // 应用已退出时 CDP 会先断开，继续走子进程清理。
      }
      client.close()
    }
    if (child.exitCode === null) {
      child.kill()
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        sleep(5000)
      ])
    }
    const pidsToCleanup = new Set([
      ...knownJavaPids,
      ...enginePidsFromLog(readEngineLog(engineLogPath))
    ])
    for (const pid of pidsToCleanup) {
      if (isProcessAlive(pid)) {
        try {
          process.kill(pid, "SIGTERM")
          console.log(`[packaged-e2e] 清理 Java PID ${pid}：已精确发送 SIGTERM`)
        } catch {
          // 进程可能在检查与发送之间已由 Electron 退出流程回收。
        }
      }
    }
    if (process.env["CAMBORDER_E2E_KEEP_TEMP"] !== "1") {
      rmSync(temporaryRoot, { recursive: true, force: true })
    }
  }
}

const isMainModule = process.argv[1] !== undefined
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMainModule) {
  run().catch((error) => {
    console.error(`[packaged-e2e] 失败：${error instanceof Error ? error.stack ?? error.message : String(error)}`)
    process.exitCode = 1
  })
}
