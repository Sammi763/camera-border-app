import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { createServer } from "node:net"
import { accessSync, constants, copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs"
import path from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const DEFAULT_SAMPLE = path.join(ROOT, "photos", "78330006.jpg")
const DEFAULT_TIMEOUT_MS = 45_000
const UI_PERFORMANCE_QUEUE_COUNT = 100
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

/** 健康闸门只接受页面自身 app:// 请求得到的明确 HTTP 200。 */
export const isHealthyHttpStatus = (status) => Number.isInteger(status) && status === 200

/** 打包验收的布局硬闸门，避免用截图主观判断掩盖可操作区域溢出。 */
export const responsiveLayoutPasses = (metrics) =>
  metrics?.preview?.width >= 520
  && metrics?.preview?.height >= 480
  && metrics?.horizontalOverflow?.document === false
  && metrics?.horizontalOverflow?.workspace === false
  && metrics?.horizontalOverflow?.queue === false
  && metrics?.queueActionsComplete === true
  && ["black", "gray", "white"].includes(metrics?.previewBackground)
  && metrics?.primaryButtonCount === 1

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

/** 通过页面相对路径读取 app://app/api/health，拒绝 UI 文案或 Node 进程指标替代健康判断。 */
const readAppHealthStatus = async (client) => await evaluate(
  client,
  "fetch('/api/health', { cache: 'no-store' }).then((response) => response.status).catch(() => 0)"
)

/** 响应式截图必须建立在引擎已恢复且当前照片仍可导出的真实工作台状态上。 */
const readExportReadiness = async (client) => await evaluate(client, `(() => {
  const button = document.querySelector('.exportDockButton.primaryButton')
  return {
    disabled: button?.matches(':disabled') ?? null,
    title: button?.getAttribute('title') ?? null,
    label: button?.textContent?.trim() ?? null,
    status: document.querySelector('.exportDockStatus')?.textContent?.trim() ?? null
  }
})()`)

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

/** 向真实 Renderer 分发快捷键；Escape 走 document 以覆盖 ModalDrawer 的焦点锁定监听。 */
const dispatchRendererKey = async (client, key, modifiers = {}) => await evaluate(client, `${key === "Escape" ? "document" : "window"}.dispatchEvent(new KeyboardEvent('keydown', {
  key: ${JSON.stringify(key)},
  bubbles: true,
  metaKey: ${modifiers.metaKey === true},
  ctrlKey: ${modifiers.ctrlKey === true},
  shiftKey: ${modifiers.shiftKey === true}
}))`)

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

/** 读取真实滚动容器的可见队列行，用于证明可视范围外没有提前请求缩略图。 */
const readQueueViewport = async (client) => await evaluate(client, `(() => {
  const list = document.querySelector('.queueList');
  if (list === null) return { total: 0, visibleIds: [], visiblePaths: [], scrollTop: 0, clientHeight: 0, scrollHeight: 0 };
  const listRect = list.getBoundingClientRect();
  const visible = [...list.querySelectorAll('[data-queue-item-id]')]
    .filter((row) => {
      const rect = row.getBoundingClientRect();
      return rect.bottom > listRect.top && rect.top < listRect.bottom && rect.right > listRect.left && rect.left < listRect.right;
    })
    .map((row) => ({
      id: row.dataset.queueItemId ?? '',
      path: row.querySelector('.queueSub')?.getAttribute('title') ?? ''
    }));
  return {
    total: list.querySelectorAll('[data-queue-item-id]').length,
    visibleIds: visible.map((item) => item.id),
    visiblePaths: visible.map((item) => item.path),
    scrollTop: list.scrollTop,
    clientHeight: list.clientHeight,
    scrollHeight: list.scrollHeight
  };
})()`)

/** 读取真实打包窗口的布局、溢出和队列底部操作区，供固定尺寸验收使用。 */
const readWorkspaceResponsiveMetrics = async (client) => await evaluate(client, `(() => {
  const rect = (selector) => {
    const element = document.querySelector(selector)
    if (element === null) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
    const value = element.getBoundingClientRect()
    return {
      left: value.left,
      top: value.top,
      right: value.right,
      bottom: value.bottom,
      width: value.width,
      height: value.height
    }
  }
  const overflowsHorizontally = (selector) => {
    const element = document.querySelector(selector)
    return element === null || element.scrollWidth > element.clientWidth + 1
  }
  const queueActions = document.querySelector('.queueActions')
  const queueRect = queueActions?.getBoundingClientRect()
  const queueActionButtons = queueActions === null || queueRect === undefined
    ? []
    : [...queueActions.querySelectorAll('button')].map((button) => {
        const buttonRect = button.getBoundingClientRect()
        const style = getComputedStyle(button)
        return {
          label: button.textContent?.trim() ?? '',
          visible: button.getClientRects().length > 0
            && style.display !== 'none'
            && style.visibility !== 'hidden',
          within: buttonRect.left >= queueRect.left - 1
            && buttonRect.right <= queueRect.right + 1
            && buttonRect.top >= queueRect.top - 1
            && buttonRect.bottom <= queueRect.bottom + 1
        }
      })
  const primaryButtons = [...document.querySelectorAll('.primaryButton')].filter((button) => {
    const style = getComputedStyle(button)
    return button.getClientRects().length > 0
      && style.display !== 'none'
      && style.visibility !== 'hidden'
  })
  const preview = document.querySelector('.previewCanvasWrapper')
  const previewClass = preview?.className ?? ''
  const previewBackground = previewClass.match(/previewBackground(Black|Gray|White)/)?.[1]?.toLowerCase() ?? ''
  return {
    window: { width: window.outerWidth, height: window.outerHeight },
    preview: rect('.previewCanvasWrapper'),
    horizontalOverflow: {
      document: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
        || document.body.scrollWidth > document.body.clientWidth + 1,
      workspace: overflowsHorizontally('.workspace'),
      queue: overflowsHorizontally('.workspaceLeft')
        || overflowsHorizontally('.queuePanel')
        || overflowsHorizontally('.queueList')
    },
    queueActionsComplete: queueActionButtons.length > 0
      && queueActionButtons.every((button) => button.visible && button.within),
    queueActionButtons,
    previewBackground,
    primaryButtonCount: primaryButtons.length
  }
})()`)

/** 读取实际主题文字/控件对比度；预览背景单独读取，确保主题不会污染照片预览。 */
const readThemeContrastMetrics = async (client) => await evaluate(client, `(() => {
  const parseColor = (value) => {
    const match = value.match(/^rgba?\\(([^)]+)\\)$/)
    if (match === null) return null
    const channels = match[1].split(',').slice(0, 3).map((part) => Number(part.trim()))
    return channels.length === 3 && channels.every((channel) => Number.isFinite(channel)) ? channels : null
  }
  const luminance = (value) => {
    const channels = parseColor(value)
    if (channels === null) return null
    const linear = channels.map((channel) => {
      const normalized = channel / 255
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
  }
  const contrast = (foreground, background) => {
    const foregroundLuminance = luminance(foreground)
    const backgroundLuminance = luminance(background)
    if (foregroundLuminance === null || backgroundLuminance === null) return null
    const lighter = Math.max(foregroundLuminance, backgroundLuminance)
    const darker = Math.min(foregroundLuminance, backgroundLuminance)
    return (lighter + 0.05) / (darker + 0.05)
  }
  const style = (selector) => {
    const element = document.querySelector(selector)
    if (element === null) return null
    const computed = getComputedStyle(element)
    return {
      color: computed.color,
      background: computed.backgroundColor,
      accent: computed.getPropertyValue('--accent-primary').trim(),
      onAccent: computed.getPropertyValue('--studio-on-accent').trim()
    }
  }
  const shell = style('.workspaceShell')
  const inspector = style('.workspaceRight')
  const title = style('.workspaceInspectorTitle')
  const button = style('.exportDockButton')
  const input = style('.settingTextInput')
  const dock = style('.workspaceExportDock')
  const preview = style('.previewCanvasWrapper')
  return {
    colors: { shell, inspector, title, button, input, dock, preview },
    states: {
      exportButtonDisabled: document.querySelector('.exportDockButton')?.matches(':disabled') ?? false,
      exportButtonOpacity: document.querySelector('.exportDockButton') === null
        ? null
        : getComputedStyle(document.querySelector('.exportDockButton')).opacity
    },
    contrast: {
      shell: shell === null ? null : contrast(shell.color, shell.background),
      title: title === null || inspector === null ? null : contrast(title.color, inspector.background),
      button: button === null ? null : contrast(button.color, button.background),
      input: input === null ? null : contrast(input.color, input.background),
      dock: dock === null ? null : contrast(dock.color, dock.background)
    }
  }
})()`)

const parseRequestBody = (request) => {
  if (typeof request?.postData !== "string") return null
  try {
    return JSON.parse(request.postData)
  } catch {
    return null
  }
}

/** 只识别队列固定 120px、零边框 recipe 的缩略图请求。 */
const isThumbnailRequest = (request) => {
  const body = parseRequestBody(request)
  return request?.url === "app://app/api/preview"
    && request?.method === "POST"
    && body?.maxWidth === 120
    && body?.maxHeight === 120
    && body?.recipe?.border?.top === 0
    && body?.recipe?.border?.bottom === 0
    && body?.recipe?.border?.left === 0
    && body?.recipe?.border?.right === 0
    && Array.isArray(body?.recipe?.texts)
    && body.recipe.texts.length === 0
}

const thumbnailPathFromRequest = (request) => parseRequestBody(request)?.recipe?.imagePath ?? null

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

const resizeWindowToBounds = async (client, width, height) => {
  await evaluate(client, `window.resizeTo(${width}, ${height})`)
  return await waitFor(
    `${width}×${height} 窗口`,
    () => readRendererWindowBounds(client),
    (bounds) => bounds?.width === width && bounds?.height === height
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
  const configuredArtifactRoot = process.env["CAMBORDER_E2E_ARTIFACT_DIR"]
  const artifactRoot = configuredArtifactRoot === undefined
    ? mkdtempSync(path.join(tmpdir(), "camera-border-packaged-e2e-artifacts-"))
    : path.resolve(configuredArtifactRoot)
  mkdirSync(artifactRoot, { recursive: true })
  const ownsArtifactRoot = configuredArtifactRoot === undefined
  const output = path.resolve(process.env["CAMBORDER_E2E_OUTPUT"] ?? path.join(temporaryRoot, "packaged-e2e-output.png"))
  // 该文件故意不是可解码图片，用于真实验证逐项失败和「重试失败项」路径；不属于产品样片。
  const retryFailureSample = path.join(temporaryRoot, "retry-failure.jpg")
  writeFileSync(retryFailureSample, Buffer.from("not-a-decodable-jpeg"))
  const retryOutputDirectory = mkdtempSync(path.join(temporaryRoot, "retry-output-"))
  const retryOutputCandidates = ["png", "jpg", "tif"].map((extension) =>
    path.join(retryOutputDirectory, `retry-failure-border.${extension}`)
  )
  const uiPerformanceSampleDirectory = path.join(temporaryRoot, "ui-performance-samples")
  mkdirSync(uiPerformanceSampleDirectory, { recursive: true })
  const uiPerformanceSamplePaths = Array.from({ length: UI_PERFORMANCE_QUEUE_COUNT }, (_, index) => {
    const filePath = path.join(uiPerformanceSampleDirectory, `queue-${String(index + 1).padStart(3, "0")}.jpg`)
    try {
      // 同一张约 20MP 样片通过独立硬链接形成 100 个真实文件路径，避免 E2E 伪造请求或注入队列状态。
      linkSync(sample, filePath)
    } catch {
      // 跨文件系统时硬链接不可用，退回到真实文件复制，仍由 preload 扫描目录并导入。
      copyFileSync(sample, filePath)
    }
    return filePath
  })
  assert.equal(uiPerformanceSamplePaths.every((filePath) => existsSync(filePath)), true, "100 项 UI 性能样片准备失败")
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
      CAMBORDER_E2E_QUEUE_DIR: uiPerformanceSampleDirectory,
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
        requestDetails.push({ id: params.requestId, method: params.request?.method, url, postData: params.request?.postData ?? null })
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
    await waitFor("JavaBridge 健康端点 HTTP 200", () => readAppHealthStatus(client), isHealthyHttpStatus)

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
        && (value.src.startsWith("blob:") || value.src.startsWith("app://app/previews/") || value.src.startsWith("data:image/"))
        && value.complete === true
        && value.naturalWidth > 0
        && value.naturalHeight > 0
    )
    assert.equal(
      thumbnail.src.startsWith("blob:") || thumbnail.src.startsWith("app://app/previews/") || thumbnail.src.startsWith("data:image/"),
      true,
      `缩略图不是允许的实际预览地址：${thumbnail.src}`
    )
    assert.equal(thumbnail.complete, true)
    assert.ok(thumbnail.naturalWidth > 0 && thumbnail.naturalHeight > 0, "缩略图没有可解码尺寸")

    await waitFor(
      "导入后自动应用摄影信息卡",
      () => evaluate(client, `(() => {
        const card = [...document.querySelectorAll('.templateGalleryCard')].find((item) =>
          item.querySelector('.templateGalleryName')?.textContent?.trim() === '摄影信息卡'
        );
        return card?.querySelector('.templateGalleryApplyButton')?.textContent?.trim() ?? '';
      })()`),
      (label) => label === "已应用"
    )
    await waitFor(
      "默认摄影信息卡引擎预览已同步",
      () => evaluate(client, "document.querySelector('.previewSyncBadge')?.textContent ?? ''"),
      (text) => text.includes("引擎预览已同步")
    )
    const defaultPreview = await waitForVisiblePreviewPhoto(client, artifactRoot, "默认摄影信息卡-引擎已同步")

    const responsiveEvidence = {}
    for (const nextTheme of ["dark", "warm"]) {
      assert.equal(
        await setFormControlValue(client, 'select[aria-label="界面主题"]', nextTheme, "change"),
        true,
        `无法切换到${nextTheme}主题`
      )
      await waitFor(
        `${nextTheme}主题生效`,
        () => evaluate(client, "document.querySelector('.workspaceShell')?.getAttribute('data-theme') ?? ''"),
        (value) => value === nextTheme
      )
      for (const size of [{ width: 1200, height: 760 }, { width: 1400, height: 920 }]) {
        await resizeWindowToBounds(client, size.width, size.height)
        await waitFor(
          `${nextTheme}主题导出状态可用`,
          async () => ({ healthStatus: await readAppHealthStatus(client), readiness: await readExportReadiness(client) }),
          (value) => isHealthyHttpStatus(value?.healthStatus) && value?.readiness?.disabled === false,
          20_000
        )
        await waitFor(
          `${nextTheme}主题视觉过渡完成`,
          () => readThemeContrastMetrics(client),
          (value) => typeof value?.contrast?.button === "number" && value.contrast.button >= 4.5
        )
        const metrics = await waitFor(
          `${nextTheme} ${size.width}×${size.height} 响应式布局`,
          () => readWorkspaceResponsiveMetrics(client),
          responsiveLayoutPasses
        )
        const contrast = await readThemeContrastMetrics(client)
        const contrastValues = Object.values(contrast.contrast).filter((value) => typeof value === "number")
        assert.ok(contrastValues.length >= 4, `${nextTheme}主题没有取得完整文字对比度指标`)
        assert.equal(
          contrastValues.every((value) => value >= 4.5),
          true,
          `${nextTheme}主题存在低于 AA 的文字/控件对比度：${JSON.stringify(contrast)}`
        )
        const screenshotPath = await captureRendererScreenshot(
          client,
          artifactRoot,
          `${size.width}x${size.height}-${nextTheme}`
        )
        const evidenceKey = `${size.width}x${size.height}-${nextTheme}`
        responsiveEvidence[evidenceKey] = { metrics, contrast, screenshotPath }
        report(`${evidenceKey}：预览=${metrics.preview.width}×${metrics.preview.height}；截图=${screenshotPath}；对比度=${JSON.stringify(contrast.contrast)}`)
      }
    }
    assert.equal(
      await setFormControlValue(client, 'select[aria-label="界面主题"]', "dark", "change"),
      true,
      "无法恢复深色影棚主题"
    )
    await waitFor(
      "恢复深色影棚主题",
      () => evaluate(client, "document.querySelector('.workspaceShell')?.getAttribute('data-theme') ?? ''"),
      (value) => value === "dark"
    )
    await resizeWindowToBounds(client, 1400, 920)
    for (const background of ["black", "gray", "white"]) {
      await clickButton(client, `(() => {
        const button = [...document.querySelectorAll('.workspacePreviewBackgroundButton')].find((item) => item.textContent?.trim() === ${JSON.stringify(background === "black" ? "中性黑" : background === "gray" ? "中性灰" : "中性白")});
        if (button === undefined) return false;
        button.click();
        return true;
      })()`, `${background}预览背景按钮`)
      await waitFor(
        `${background}预览背景生效`,
        () => readWorkspaceResponsiveMetrics(client),
        (metrics) => metrics.previewBackground === background
      )
    }
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('.workspacePreviewBackgroundButton')].find((item) => item.textContent?.trim() === '中性灰');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "恢复中性灰预览背景按钮")

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
      const card = [...document.querySelectorAll('.templateGalleryCard')].find((item) =>
        item.querySelector('.templateGalleryName')?.textContent?.trim() === '全画幅叠字'
      );
      const button = card?.querySelector('button.templateGalleryApplyButton');
      if (button === null || button === undefined || button.textContent?.trim() !== '应用') return false;
      button.click();
      return true;
    })()`, "零边框模板使用按钮")
    await waitFor("零边框模板应用完成", () => evaluate(client, `(() => {
      const card = [...document.querySelectorAll('.templateGalleryCard')].find((item) =>
        item.querySelector('.templateGalleryName')?.textContent?.trim() === '全画幅叠字'
      );
      return card?.querySelector('.templateGalleryApplyButton')?.textContent?.trim() ?? '';
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

    // 真实工作台流程：页签、摄影信息覆盖、资料库、预设管理/应用、用户版式保存，
    // 均经当前 UI 完成；这些动作不会直接调用 Java API。
    await clickButton(client, `(() => {
      const tab = [...document.querySelectorAll('[role="tab"]')].find((item) => item.textContent?.trim() === '摄影信息');
      if (tab === undefined) return false;
      tab.click();
      return true;
    })()`, "摄影信息页签")
    await waitFor(
      "摄影信息页签内容",
      () => evaluate(client, "document.querySelectorAll('[role=tabpanel] .photoIdentityPanelInner').length"),
      (count) => count === 1
    )
    await clickButton(client, `(() => {
      const summary = document.querySelector('.identitySummary');
      if (summary === null) return false;
      summary.click();
      return true;
    })()`, "摄影信息覆盖展开")
    await waitFor("摄影信息编辑区", () => evaluate(client, "Boolean(document.querySelector('.identityEditor'))"), (visible) => visible === true)
    assert.equal(
      await setFormControlValue(client, '.identityEditor input[placeholder="例如：Leica M6"]', "E2E Camera", "input"),
      true,
      "无法修改当前图片摄影信息"
    )
    await waitFor(
      "摄影信息覆盖已保存",
      () => evaluate(client, "document.querySelector('.identityEditor input[placeholder=\"例如：Leica M6\"]')?.value ?? ''"),
      (value) => value === "E2E Camera"
    )

    const assetLibraryOpener = `(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '打开资料库');
      if (button === undefined) return false;
      button.focus();
      button.click();
      return true;
    })()`
    await clickButton(client, assetLibraryOpener, "资料库入口")
    await waitFor("资料库抽屉", () => evaluate(client, "document.querySelector('[role=dialog] .assetPanelInner') !== null"), (visible) => visible === true)
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('[role=dialog] button')].find((item) => item.textContent?.trim() === '新增相机');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "新增相机按钮")
    await waitFor("相机资产编辑器", () => evaluate(client, "Boolean(document.querySelector('[role=dialog] .assetEditor'))"), (visible) => visible === true)
    assert.equal(
      await setFormControlValue(client, '[role=dialog] .assetEditor input[placeholder="例如：Leica"]', "E2E", "input"),
      true,
      "无法填写相机资产品牌"
    )
    assert.equal(
      await setFormControlValue(client, '[role=dialog] .assetEditor input[placeholder="例如：M6"]', "Camera Asset", "input"),
      true,
      "无法填写相机资产型号"
    )
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('[role=dialog] .assetEditorActions button')].find((item) => item.textContent?.trim() === '保存');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "保存相机资产按钮")
    await waitFor(
      "相机资产保存完成",
      () => evaluate(client, "document.querySelector('[role=dialog] .assetItem')?.textContent ?? ''"),
      (text) => text.includes("E2E Camera Asset")
    )
    await dispatchRendererKey(client, "Escape")
    await waitFor("资料库抽屉关闭", () => evaluate(client, "document.querySelector('[role=dialog]') === null"), (closed) => closed === true)
    assert.equal(
      await evaluate(client, "document.activeElement?.textContent?.trim() ?? ''"),
      "打开资料库",
      "资料库抽屉关闭后没有恢复入口焦点"
    )

    const presetLibraryOpener = `(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '管理拍摄信息预设');
      if (button === undefined) return false;
      button.focus();
      button.click();
      return true;
    })()`
    await clickButton(client, presetLibraryOpener, "拍摄信息预设入口")
    await waitFor("拍摄信息预设抽屉", () => evaluate(client, "document.querySelector('[role=dialog] .presetTextComposer') !== null"), (visible) => visible === true)
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('[role=dialog] button')].find((item) => item.textContent?.trim() === '开始录入');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "文字录入预设按钮")
    await waitFor("文字录入预设表单", () => evaluate(client, "Boolean(document.querySelector('[role=dialog] .presetTextComposerForm'))"), (visible) => visible === true)
    assert.equal(
      await setFormControlValue(client, '[role=dialog] .presetTextComposerForm input[placeholder="例如：135 Portra 日常"]', "打包 E2E 预设", "input"),
      true,
      "无法填写打包 E2E 预设名称"
    )
    assert.equal(
      await setFormControlValue(client, '[role=dialog] .presetTextComposerForm select', "6x10", "change"),
      true,
      "无法设置打包 E2E 拍摄画幅"
    )
    assert.equal(
      await setFormControlValue(client, '[role=dialog] .presetTextComposerForm input[placeholder="例如：Leica M6"]', "E2E Preset Camera", "input"),
      true,
      "无法填写打包 E2E 相机"
    )
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('[role=dialog] .presetTextComposerForm button')].find((item) => item.textContent?.trim() === '保存并应用');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "保存摄影预设按钮")
    await waitFor(
      "摄影预设作用域控件",
      () => evaluate(client, "document.querySelectorAll('[role=dialog] .presetScopeSelector button').length"),
      (count) => count === 3
    )
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('[role=dialog] .presetScopeSelector button')].find((item) => item.textContent?.trim() === '全部图片');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "全部图片作用域按钮")
    await waitFor(
      "新摄影预设进入列表",
      () => evaluate(client, "document.querySelector('[role=dialog] .presetItem')?.textContent ?? ''"),
      (text) => text.includes("打包 E2E 预设")
    )
    assert.equal(
      await setFormControlValue(client, '[role=dialog] select[aria-label="选择预设"]', await evaluate(client, "document.querySelector('[role=dialog] select[aria-label=\"选择预设\"] option:not([disabled])')?.value ?? ''"), "change"),
      true,
      "无法选择已保存摄影预设"
    )
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('[role=dialog] button')].find((item) => item.textContent?.trim() === '应用全部');
      if (button === undefined || button.disabled) return false;
      button.click();
      return true;
    })()`, "应用摄影预设到全部图片按钮")
    await waitFor(
      "摄影预设应用到全部图片",
      () => evaluate(client, "document.querySelectorAll('.queueItem .queuePresetIndicator').length"),
      (count) => count === 2
    )
    await dispatchRendererKey(client, "Escape")
    await waitFor("摄影预设抽屉关闭", () => evaluate(client, "document.querySelector('[role=dialog]') === null"), (closed) => closed === true)
    assert.equal(
      await evaluate(client, "document.activeElement?.textContent?.trim() ?? ''"),
      "管理拍摄信息预设",
      "预设抽屉关闭后没有恢复入口焦点"
    )

    await clickButton(client, `(() => {
      const tab = [...document.querySelectorAll('[role="tab"]')].find((item) => item.textContent?.trim() === '样式');
      if (tab === undefined) return false;
      tab.click();
      return true;
    })()`, "样式页签")
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '管理用户版式');
      if (button === undefined) return false;
      button.focus();
      button.click();
      return true;
    })()`, "用户版式管理入口")
    await waitFor("用户版式抽屉", () => evaluate(client, "document.querySelector('[role=dialog] .templateNameInput') !== null"), (visible) => visible === true)
    assert.equal(
      await setFormControlValue(client, '[role=dialog] .templateNameInput', "打包 E2E 版式", "input"),
      true,
      "无法填写用户版式名称"
    )
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('[role=dialog] .templateNameRow button')].find((item) => item.textContent?.trim() === '保存');
      if (button === undefined || button.disabled) return false;
      button.click();
      return true;
    })()`, "保存用户版式按钮")
    await waitFor(
      "用户版式保存完成",
      () => evaluate(client, "document.querySelector('[role=dialog] .templateItem')?.textContent ?? ''"),
      (text) => text.includes("打包 E2E 版式")
    )
    await dispatchRendererKey(client, "Escape")
    await waitFor("用户版式抽屉关闭", () => evaluate(client, "document.querySelector('[role=dialog]') === null"), (closed) => closed === true)

    await clickButton(client, `(() => {
      const tab = [...document.querySelectorAll('[role="tab"]')].find((item) => item.textContent?.trim() === '样式');
      if (tab === undefined) return false;
      tab.click();
      return true;
    })()`, "样式页签")
    await clickButton(client, `(() => {
      const button = document.querySelector('button[aria-label="折叠工作台面板"]');
      if (button === null) return false;
      button.click();
      return true;
    })()`, "折叠右侧面板按钮")
    await waitFor("右侧面板折叠", () => evaluate(client, "document.querySelector('.collapsedRight') !== null"), (collapsed) => collapsed === true)
    await clickButton(client, `(() => {
      const button = document.querySelector('button[aria-label="展开检查器"]');
      if (button === null) return false;
      button.click();
      return true;
    })()`, "展开右侧面板按钮")
    await waitFor("右侧面板恢复", () => evaluate(client, "document.querySelector('.workspaceInspector') !== null"), (visible) => visible === true)

    const activePathBeforeKeyboard = await evaluate(client, "document.querySelector('.queueItem.isActive .queueSub')?.getAttribute('title') ?? ''")
    await dispatchRendererKey(client, "ArrowDown")
    await waitFor(
      "方向键切换队列当前项",
      () => evaluate(client, "document.querySelector('.queueItem.isActive .queueSub')?.getAttribute('title') ?? ''"),
      (value) => value.length > 0 && value !== activePathBeforeKeyboard
    )
    await dispatchRendererKey(client, "ArrowUp")
    await waitFor(
      "方向键切回原当前项",
      () => evaluate(client, "document.querySelector('.queueItem.isActive .queueSub')?.getAttribute('title') ?? ''"),
      (value) => value === activePathBeforeKeyboard
    )
    await dispatchRendererKey(client, " ")
    await waitFor(
      "空格勾选当前项但不切换预览",
      () => evaluate(client, `({
        activePath: document.querySelector('.queueItem.isActive .queueSub')?.getAttribute('title') ?? '',
        checked: (document.querySelector('.queueItem.isActive .queueItemCheck') instanceof HTMLInputElement)
          ? document.querySelector('.queueItem.isActive .queueItemCheck').checked
          : false
      })`),
      (value) => value.activePath === activePathBeforeKeyboard && value.checked === true
    )
    await dispatchRendererKey(client, "f")
    await waitFor("F 键适应预览", () => evaluate(client, "document.querySelector('.previewZoomLabel')?.textContent?.trim() ?? ''"), (value) => value === "适应")
    await dispatchRendererKey(client, "1")
    await waitFor("1 键显示 100%", () => evaluate(client, "document.querySelector('.previewZoomLabel')?.textContent?.trim() ?? ''"), (value) => value === "100%")

    const itemCountBeforeDeleteUndo = await evaluate(client, "document.querySelectorAll('.queueItem').length")
    await dispatchRendererKey(client, "Delete")
    await waitFor("Delete 键删除当前图片", () => evaluate(client, "document.querySelectorAll('.queueItem').length"), (count) => count === itemCountBeforeDeleteUndo - 1)
    await dispatchRendererKey(client, "z", { metaKey: true })
    await waitFor("Cmd/Ctrl+Z 恢复删除", () => evaluate(client, "document.querySelectorAll('.queueItem').length"), (count) => count === itemCountBeforeDeleteUndo)
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('.queueActions button')].find((item) => item.textContent?.trim() === '清空');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "清空队列按钮")
    await waitFor("清空队列", () => evaluate(client, "document.querySelectorAll('.queueItem').length"), (count) => count === 0)
    await dispatchRendererKey(client, "z", { metaKey: true })
    await waitFor("撤销清空队列", () => evaluate(client, "document.querySelectorAll('.queueItem').length"), (count) => count === itemCountBeforeDeleteUndo)

    // 真实逐项失败/重试闸门：首轮导入一个不可解码 JPEG，首轮失败后替换为固定有效样片，
    // 再通过真实 UI 点击「重试失败项」，确保重试请求经过 app:// 代理和托管 JavaBridge。
    await waitFor(
      "批量导出全部图片按钮",
      () => evaluate(client, "(() => { const button = [...document.querySelectorAll('button.exportDockButton')].find((item) => item.textContent?.includes('批量导出 2 张')); return button !== undefined && !button.disabled })()"),
      (available) => available === true
    )
    await clickButton(client, `(() => { const button = [...document.querySelectorAll('button.exportDockButton')].find((item) => item.textContent?.includes('批量导出 2 张')); if (button === undefined || button.disabled) return false; button.click(); return true })()`, "批量导出全部图片按钮")
    let batchFirstRun
    try {
      batchFirstRun = await waitFor(
        "批量导出出现一个真实失败项",
        () => evaluate(client, "document.querySelector('.exportDockStatus')?.textContent ?? ''"),
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
      () => evaluate(client, "document.querySelector('.exportDockStatus')?.textContent ?? ''"),
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
      () => evaluate(client, "(() => { const button = [...document.querySelectorAll('button.exportDockButton')].find((item) => item.textContent?.includes('导出原图')); return button !== undefined && !button.disabled })()"),
      (available) => available === true
    )
    await clickButton(client, `(() => { const button = [...document.querySelectorAll('button.exportDockButton')].find((item) => item.textContent?.includes('导出原图')); if (button === undefined || button.disabled) return false; button.click(); return true })()`, "导出原图按钮")
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

    // 真实 UI 性能闸门：通过 preload 的文件夹选择入口导入 100 个约 20MP 路径，
    // 只观察 CDP 实际发出的 120px 缩略图请求，不向 Java API 直接注入队列。
    const objectUrlProbeInstalled = await evaluate(client, `(() => {
      const urlApi = window.URL;
      if (typeof urlApi.revokeObjectURL !== 'function') return false;
      const revoked = [];
      const nativeRevoke = urlApi.revokeObjectURL.bind(urlApi);
      urlApi.revokeObjectURL = (url) => {
        revoked.push(url);
        nativeRevoke(url);
      };
      window.__camborderE2eObjectUrlProbe = { revoked };
      return true;
    })()`)
    assert.equal(objectUrlProbeInstalled, true, "无法安装打包 E2E object URL 释放探针")
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '清空');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "清空队列按钮（缩略图卸载）")
    await waitFor(
      "队列缩略图范围卸载",
      () => evaluate(client, "document.querySelectorAll('.queueItem').length"),
      (count) => count === 0
    )
    const releasedThumbnailUrlCount = await waitFor(
      "缩略图 object URL 释放",
      () => evaluate(client, "window.__camborderE2eObjectUrlProbe?.revoked?.filter((url) => typeof url === 'string' && url.startsWith('blob:')).length ?? 0"),
      (count) => count > 0
    )

    const uiPerformanceRequestStart = requestDetails.length
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('button')].find((item) => ['选择图片文件夹', '选择文件夹'].includes(item.textContent?.trim()));
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "100 项图片文件夹入口（preload）")
    const importedUiPerformanceQueue = await waitFor(
      "100 项图片通过 preload 文件夹入口进入队列",
      () => evaluate(client, `({
        count: document.querySelectorAll('.queueItem').length,
        label: document.querySelector('.queueCount')?.textContent?.trim() ?? ''
      })`),
      (value) => value.count === UI_PERFORMANCE_QUEUE_COUNT && value.label.includes(`${UI_PERFORMANCE_QUEUE_COUNT} 张图片`),
      120_000
    )
    assert.equal(importedUiPerformanceQueue.count, UI_PERFORMANCE_QUEUE_COUNT)

    const thumbnailRecordsForUiPerformance = () => requestDetails
      .slice(uiPerformanceRequestStart)
      .filter(isThumbnailRequest)
    const initialUiPerformance = await waitFor(
      "首屏可见项目的缩略图请求",
      async () => {
        const viewport = await readQueueViewport(client)
        const thumbnailRecords = thumbnailRecordsForUiPerformance()
        return { viewport, thumbnailRecords }
      },
      (value) => value.viewport.total === UI_PERFORMANCE_QUEUE_COUNT
        && value.viewport.visibleIds.length > 0
        && value.viewport.visibleIds.length < UI_PERFORMANCE_QUEUE_COUNT
        && value.thumbnailRecords.length > 0,
      120_000
    )
    await sleep(700)
    const stableInitialUiPerformance = {
      viewport: await readQueueViewport(client),
      thumbnailRecords: thumbnailRecordsForUiPerformance()
    }
    const initialVisiblePaths = new Set(stableInitialUiPerformance.viewport.visiblePaths)
    const initialThumbnailPaths = [...new Set(stableInitialUiPerformance.thumbnailRecords.map(thumbnailPathFromRequest))]
      .filter((filePath) => typeof filePath === "string")
    assert.ok(initialThumbnailPaths.length > 0, "首屏没有记录实际缩略图请求")
    assert.equal(
      initialThumbnailPaths.every((filePath) => initialVisiblePaths.has(filePath)),
      true,
      `初始视口外图片提前请求缩略图：${JSON.stringify({ initialThumbnailPaths, visiblePaths: [...initialVisiblePaths] })}`
    )
    assert.equal(stableInitialUiPerformance.viewport.visibleIds.length < UI_PERFORMANCE_QUEUE_COUNT, true, "100 项队列没有形成可滚动视口")

    const beforeScrollThumbnailCount = stableInitialUiPerformance.thumbnailRecords.length
    const previousVisibleIds = new Set(stableInitialUiPerformance.viewport.visibleIds)
    await evaluate(client, `(() => {
      const list = document.querySelector('.queueList');
      if (list === null) return false;
      const nextTop = Math.min(list.scrollHeight - list.clientHeight, list.scrollTop + Math.max(1, list.clientHeight * 0.8));
      list.scrollTop = Math.max(0, nextTop);
      list.dispatchEvent(new Event('scroll', { bubbles: true }));
      return list.scrollTop > 0;
    })()`)
    const afterScrollUiPerformance = await waitFor(
      "滚动后新可见项目的缩略图请求",
      async () => {
        const viewport = await readQueueViewport(client)
        const thumbnailRecords = thumbnailRecordsForUiPerformance()
        return {
          viewport,
          thumbnailRecords,
          newThumbnailRecords: thumbnailRecords.slice(beforeScrollThumbnailCount)
        }
      },
      (value) => value.viewport.visibleIds.some((id) => !previousVisibleIds.has(id))
        && value.newThumbnailRecords.some((request) => {
          const filePath = thumbnailPathFromRequest(request)
          return typeof filePath === "string" && !initialVisiblePaths.has(filePath)
        }),
      120_000
    )
    const afterScrollVisiblePaths = new Set(afterScrollUiPerformance.viewport.visiblePaths)
    const scrolledThumbnailPaths = [...new Set(afterScrollUiPerformance.newThumbnailRecords.map(thumbnailPathFromRequest))]
      .filter((filePath) => typeof filePath === "string")
    assert.ok(scrolledThumbnailPaths.length > 0, "滚动后没有记录新缩略图请求")
    assert.equal(
      scrolledThumbnailPaths.every((filePath) => afterScrollVisiblePaths.has(filePath)),
      true,
      `滚动后请求包含不可见图片：${JSON.stringify({ scrolledThumbnailPaths, visiblePaths: [...afterScrollVisiblePaths] })}`
    )
    assert.equal(
      scrolledThumbnailPaths.some((filePath) => !initialVisiblePaths.has(filePath)),
      true,
      `滚动后没有请求首轮视口之外的新项目：${JSON.stringify({
        initialVisiblePaths: [...initialVisiblePaths],
        afterScrollVisiblePaths: [...afterScrollVisiblePaths],
        newThumbnailPaths: scrolledThumbnailPaths
      })}`
    )

    const newlyVisiblePath = afterScrollUiPerformance.viewport.visiblePaths.find((filePath) => !initialVisiblePaths.has(filePath))
    assert.ok(newlyVisiblePath !== undefined, "滚动后未找到新的可见图片用于预览验证")
    await clickButton(client, `(() => {
      const row = [...document.querySelectorAll('.queueItem')].find((item) =>
        item.querySelector('.queueSub')?.getAttribute('title') === ${JSON.stringify(newlyVisiblePath)}
      );
      if (row === undefined) return false;
      row.click();
      return true;
    })()`, "滚动后的新可见图片")
    const uiPerformancePreview = await waitForVisiblePreviewPhoto(client, artifactRoot, "100项滚动后预览")

    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('.queueActions button')].find((item) => item.textContent?.trim() === '全选');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "100 项全选按钮")
    await waitFor(
      "100 项批量导出按钮",
      () => evaluate(client, `(() => {
        const button = [...document.querySelectorAll('button.exportDockButton')].find((item) => item.textContent?.includes('批量导出 ${UI_PERFORMANCE_QUEUE_COUNT} 张'));
        return button !== undefined && !button.disabled;
      })()`),
      (available) => available === true,
      120_000
    )
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('button.exportDockButton')].find((item) => item.textContent?.includes('批量导出 ${UI_PERFORMANCE_QUEUE_COUNT} 张'));
      if (button === undefined || button.disabled) return false;
      button.click();
      return true;
    })()`, "100 项批量导出按钮")
    const uiPerformanceExportResult = await waitFor(
      "100 项真实 UI 批量导出完成",
      () => evaluate(client, "document.querySelector('.exportDockStatus')?.textContent ?? ''"),
      (text) => text.includes("批量导出完成")
        && text.includes(`共 ${UI_PERFORMANCE_QUEUE_COUNT} 张`)
        && text.includes(`成功 ${UI_PERFORMANCE_QUEUE_COUNT}`)
        && text.includes("失败 0"),
      1_200_000
    )
    const uiPerformanceOutputPattern = /^queue-\d{3}-border(?:-\d+)?\.(?:png|jpg|tif)$/
    const uiPerformanceOutputNames = await waitFor(
      "100 项批量导出文件",
      () => readdirSync(retryOutputDirectory).filter((name) => uiPerformanceOutputPattern.test(name)),
      (names) => names.length === UI_PERFORMANCE_QUEUE_COUNT,
      120_000
    )
    assert.equal(uiPerformanceOutputNames.length, UI_PERFORMANCE_QUEUE_COUNT)
    for (const name of uiPerformanceOutputNames) {
      assert.ok(statSync(path.join(retryOutputDirectory, name)).size > 0, `100 项导出文件为空：${name}`)
    }
    const uiPerformanceOutputData = readFileSync(path.join(retryOutputDirectory, uiPerformanceOutputNames[0]))
    assert.notEqual(readImageDimensions(uiPerformanceOutputData), null, "100 项批量导出文件不是可识别图片")

    // 复用真实 100 项队列再次提交并立即取消，保留可核验的取消日志；已完成文件只删除本次 E2E 临时产物。
    for (const name of uiPerformanceOutputNames) {
      unlinkSync(path.join(retryOutputDirectory, name))
    }
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('button.exportDockButton')].find((item) => item.textContent?.includes('批量导出 ${UI_PERFORMANCE_QUEUE_COUNT} 张'));
      if (button === undefined || button.disabled) return false;
      button.click();
      return true;
    })()`, "100 项取消测试批量导出按钮")
    await waitFor(
      "100 项批量导出进入运行态",
      () => evaluate(client, "[...document.querySelectorAll('button.exportDockButton')].some((item) => item.textContent?.includes('批量导出中'))"),
      (running) => running === true,
      120_000
    )
    await clickButton(client, `(() => {
      const button = [...document.querySelectorAll('button.exportDockButton')].find((item) => item.textContent?.trim() === '取消导出');
      if (button === undefined) return false;
      button.click();
      return true;
    })()`, "100 项批量导出取消按钮")
    const uiPerformanceCancellationResult = await waitFor(
      "100 项批量导出取消完成",
      () => evaluate(client, "document.querySelector('.exportDockStatus')?.textContent ?? ''"),
      (text) => text.includes("批量导出已取消") && text.includes(`共 ${UI_PERFORMANCE_QUEUE_COUNT} 张`),
      120_000
    )
    const uiPerformanceThumbnailRecords = thumbnailRecordsForUiPerformance()
    const uiPerformanceEvidence = {
      importedItems: importedUiPerformanceQueue.count,
      initialVisibleItems: stableInitialUiPerformance.viewport.visibleIds.length,
      initialThumbnailRequests: stableInitialUiPerformance.thumbnailRecords.length,
      initialThumbnailUniquePaths: initialThumbnailPaths.length,
      afterScrollVisibleItems: afterScrollUiPerformance.viewport.visibleIds.length,
      scrollThumbnailRequests: afterScrollUiPerformance.newThumbnailRecords.length,
      scrollThumbnailUniquePaths: scrolledThumbnailPaths.length,
      totalThumbnailRequests: uiPerformanceThumbnailRecords.length,
      totalThumbnailUniquePaths: new Set(uiPerformanceThumbnailRecords.map(thumbnailPathFromRequest)).size,
      releasedObjectUrlsAfterClear: releasedThumbnailUrlCount,
      previewCanvas: formatPreviewCanvasMetrics(uiPerformancePreview.metrics),
      exportFiles: uiPerformanceOutputNames.length,
      exportResult: uiPerformanceExportResult,
      cancellationResult: uiPerformanceCancellationResult
    }

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
      () => readAppHealthStatus(client),
      isHealthyHttpStatus,
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
    console.log(`[packaged-e2e] 真实取消运行：${uiPerformanceCancellationResult}`)
    console.log(`[packaged-e2e] 100 项 UI 性能证据：${JSON.stringify(uiPerformanceEvidence)}`)
    console.log(`[packaged-e2e] 四尺寸主题响应式证据：${JSON.stringify(responsiveEvidence)}`)
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
      if (ownsArtifactRoot) {
        rmSync(artifactRoot, { recursive: true, force: true })
      }
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
