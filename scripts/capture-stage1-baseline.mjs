import { createHash } from "node:crypto"
import { execFile, spawn } from "node:child_process"
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import { generatePhotoManifest } from "./generate-photo-manifest.mjs"
import {
  CdpClient,
  DEFAULT_APP,
  DEFAULT_SAMPLE,
  REQUESTED_WINDOW,
  captureRendererScreenshot,
  clickByText,
  clickTemplateByName,
  ensureInfoCard,
  evaluate,
  getFreePort,
  pngDimensions,
  selectQueueItem,
  sha256File,
  validPng,
  waitFor,
  waitForCanvas,
} from "./capture-stage0-baseline.mjs"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const DEFAULT_SAMPLE_PATH = DEFAULT_SAMPLE
const DEFAULT_ARW_NAMES = [
  "DSC04875.ARW",
  "DSC04876.ARW",
  "DSC04877.ARW",
  "DSC04881.ARW",
  "DSC04882.ARW",
  "DSC04883.ARW"
]
const ARTIFACT_NAMES = ["landscape-default", "arw-vertical", "polaroid", "preview-100-percent"]
const DEFAULT_EXIFTOOL = path.join(ROOT, "professional-tools", "exiftool", "macos", "exiftool")
const execFileAsync = promisify(execFile)

const readArg = (args, name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"))

const writeJson = async (filePath, value) => {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

const isHash = (value) => typeof value === "string" && /^[0-9a-f]{64}$/i.test(value)

const exifValue = (record, suffix) => Object.entries(record ?? {})
  .find(([key]) => key === suffix || key.endsWith(`:${suffix}`))?.[1] ?? null

const parseBitDepth = (value) => {
  const values = Array.isArray(value)
    ? value.flatMap((item) => String(item).match(/\d+/g) ?? []).map(Number)
    : String(value ?? "").match(/\d+/g)?.map(Number) ?? []
  const valid = values.filter((item) => Number.isInteger(item) && item > 0)
  return valid.length === 0 ? null : Math.max(...valid)
}

const readIndependentExifToolRecord = async (exifTool, filePath) => {
  const result = await execFileAsync(exifTool, ["-j", "-a", "-u", "-G1", "-s", "-n", "--", filePath], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  })
  const parsed = JSON.parse(result.stdout)
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed[0] === null || typeof parsed[0] !== "object") {
    throw new Error(`ExifTool 没有返回导出文件事实：${filePath}`)
  }
  return parsed[0]
}

/** 用独立 ExifTool 检查六张 ARW 导出的物理输出，不能以应用回报替代。 */
export const readStage1ExportEvidence = async ({ outputDirectory, sources, exifTool = DEFAULT_EXIFTOOL }) => {
  const records = []
  for (const source of sources) {
    const baseName = path.basename(source.fileName, path.extname(source.fileName))
    const outputPath = path.join(outputDirectory, `${baseName}-border.jpg`)
    try {
      const fileInfo = await stat(outputPath)
      if (!fileInfo.isFile() || fileInfo.size <= 0) {
        records.push({ sourceFileName: source.fileName, outputPath: path.relative(ROOT, outputPath).split(path.sep).join("/"), exists: false })
        continue
      }
      const record = await readIndependentExifToolRecord(exifTool, outputPath)
      records.push({
        sourceFileName: source.fileName,
        outputPath: path.relative(ROOT, outputPath).split(path.sep).join("/"),
        exists: true,
        bytes: fileInfo.size,
        sha256: await sha256File(outputPath),
        format: String(exifValue(record, "FileType") ?? ""),
        orientation: Number(exifValue(record, "Orientation")),
        width: Number(exifValue(record, "ImageWidth") ?? exifValue(record, "ExifImageWidth")),
        height: Number(exifValue(record, "ImageHeight") ?? exifValue(record, "ExifImageHeight")),
        bitDepth: parseBitDepth(exifValue(record, "BitsPerSample") ?? exifValue(record, "BitDepth"))
      })
    } catch (error) {
      records.push({
        sourceFileName: source.fileName,
        outputPath: path.relative(ROOT, outputPath).split(path.sep).join("/"),
        exists: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }
  const status = records.length === sources.length
    && records.every((record) => record.exists === true
      && isHash(record.sha256)
      && record.format.toUpperCase().includes("JPEG")
      && record.orientation === 1
      && Number.isInteger(record.width) && record.width > 0
      && Number.isInteger(record.height) && record.height > 0
      && record.bitDepth === 8)
  return {
    schemaVersion: 1,
    status: status ? "PASS" : "FAIL",
    tool: { path: path.relative(ROOT, path.resolve(exifTool)).split(path.sep).join("/") },
    outputDirectory: path.relative(ROOT, outputDirectory).split(path.sep).join("/"),
    records
  }
}

export const orientedDimensions = (entry) => {
  const dimensions = entry?.pixelDimensions ?? entry?.dimensions
  if (dimensions === null || dimensions === undefined) return null
  const orientation = Number(entry.orientation)
  return orientation >= 5 && orientation <= 8
    ? { width: Number(dimensions.height), height: Number(dimensions.width) }
    : { width: Number(dimensions.width), height: Number(dimensions.height) }
}

const sourceEntriesFor = (manifest, samplePath, arwNames) => {
  const entries = manifest?.files ?? []
  const byName = new Map(entries.map((entry) => [entry.fileName, entry]))
  const sample = byName.get(path.basename(samplePath))
  const arw = arwNames.map((name) => byName.get(name))
  if (sample === undefined || arw.some((entry) => entry === undefined)) {
    throw new Error("photo-manifest.json 没有覆盖阶段 1 的横图或六张 ARW")
  }
  return { sample, arw }
}

const rectExpression = (element) => {
  const rect = element.getBoundingClientRect()
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height
  }
}

/** 读取真实 Renderer 的逻辑像素、backing store、CSS 和照片区域四层几何。 */
export const readStage1Geometry = async (client, {
  scene,
  source,
  templateId,
  expectedMode
}) => await evaluate(client, `(() => {
  const wrapper = document.querySelector('.previewCanvasWrapper')
  const canvas = document.querySelector('canvas.previewCanvas')
  const number = (name) => {
    const value = Number(canvas?.dataset[name])
    return Number.isFinite(value) ? value : null
  }
  const rect = (element) => element === null ? null : (${rectExpression.toString()})(element)
  if (wrapper === null || canvas === null) return { scene: ${JSON.stringify(scene)}, error: '缺少预览 wrapper 或 Canvas' }
  const wrapperRect = rect(wrapper)
  const canvasRect = rect(canvas)
  const logicalWidth = number('previewCanvasLogicalWidth')
  const logicalHeight = number('previewCanvasLogicalHeight')
  const backingWidth = number('previewCanvasBackingWidth') ?? canvas.width
  const backingHeight = number('previewCanvasBackingHeight') ?? canvas.height
  const pixelRatio = number('previewCanvasPixelRatio') ?? (logicalWidth > 0 ? backingWidth / logicalWidth : null)
  const image = {
    x: number('previewImageX'),
    y: number('previewImageY'),
    width: number('previewImageWidth'),
    height: number('previewImageHeight')
  }
  const cssScaleX = logicalWidth > 0 && canvasRect !== null ? canvasRect.width / logicalWidth : null
  const cssScaleY = logicalHeight > 0 && canvasRect !== null ? canvasRect.height / logicalHeight : null
  const displayImage = cssScaleX === null || cssScaleY === null || image.x === null || image.y === null || image.width === null || image.height === null || canvasRect === null
    ? null
    : {
        left: canvasRect.left + image.x * cssScaleX,
        top: canvasRect.top + image.y * cssScaleY,
        width: image.width * cssScaleX,
        height: image.height * cssScaleY
      }
  const naturalCanvas = {
    width: number('previewNaturalCanvasWidth'),
    height: number('previewNaturalCanvasHeight')
  }
  const sourceWidth = number('previewSourceWidth')
  const sourceHeight = number('previewSourceHeight')
  const expectedSource = ${JSON.stringify(orientedDimensions(source))}
  const expectedAspect = expectedSource?.width > 0 && expectedSource?.height > 0
    ? expectedSource.width / expectedSource.height
    : null
  const actualAspect = displayImage?.width > 0 && displayImage?.height > 0
    ? displayImage.width / displayImage.height
    : null
  const aspectError = expectedAspect === null || actualAspect === null
    ? null
    : Math.abs(actualAspect - expectedAspect) / expectedAspect
  const mode = ${JSON.stringify(expectedMode)}
  const centered = wrapperRect === null || canvasRect === null || logicalWidth === null || logicalHeight === null
    ? null
    : {
        x: logicalWidth <= wrapperRect.width ? Math.abs((canvasRect.left - wrapperRect.left) - (wrapperRect.width - logicalWidth) / 2) <= 1 : true,
        y: logicalHeight <= wrapperRect.height ? Math.abs((canvasRect.top - wrapperRect.top) - (wrapperRect.height - logicalHeight) / 2) <= 1 : true
      }
  const oneToOne = mode === 'actual'
    && logicalWidth !== null && logicalHeight !== null
    && naturalCanvas.width !== null && naturalCanvas.height !== null
    && Math.abs(logicalWidth - naturalCanvas.width) <= 1
    && Math.abs(logicalHeight - naturalCanvas.height) <= 1
    && cssScaleX !== null && cssScaleY !== null
    && Math.abs(cssScaleX - 1) <= 0.01
    && Math.abs(cssScaleY - 1) <= 0.01
    && pixelRatio !== null
    && Math.abs(backingWidth / logicalWidth - pixelRatio) <= 0.01
    && Math.abs(backingHeight / logicalHeight - pixelRatio) <= 0.01
  const fitInvariant = mode === 'fit'
    && wrapperRect !== null && logicalWidth !== null && logicalHeight !== null
    && Math.abs(logicalWidth - wrapperRect.width) <= 1
    && Math.abs(logicalHeight - wrapperRect.height) <= 1
  const actualInvariant = mode === 'actual' && oneToOne && centered !== null && centered.x && centered.y
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
      format: ${JSON.stringify(source.format)},
      orientation: ${JSON.stringify(source.orientation)},
      pixelDimensions: ${JSON.stringify(source.pixelDimensions)},
      expectedOrientedDimensions: expectedSource
    },
    templateId: ${JSON.stringify(templateId)},
    activeTemplateEvidence: ${JSON.stringify(templateId)} === 'polaroid' ? activePolaroid : activeInfoCard,
    mode,
    modeLabel: document.querySelector('.previewZoomLabel')?.textContent?.trim() ?? '',
    requestedWindow: ${JSON.stringify(REQUESTED_WINDOW)},
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
      logicalWidth,
      logicalHeight,
      backingWidth,
      backingHeight,
      intrinsicWidth: canvas.width,
      intrinsicHeight: canvas.height,
      pixelRatio,
      cssLogicalScale: { x: cssScaleX, y: cssScaleY }
    },
    naturalCanvas,
    sourceDisplayDimensions: { width: sourceWidth, height: sourceHeight },
    photoCanvas: image,
    photoDisplay: displayImage,
    aspectError,
    fitInvariant,
    oneToOne,
    centered,
    actualInvariant,
    placement: {
      mode: canvas.dataset.previewPlacementMode ?? '',
      rotation: Number(canvas.dataset.previewPlacementRotation),
      cropAllowed: canvas.dataset.previewCropAllowed === 'true',
      cropApplied: canvas.dataset.previewCropApplied === 'true'
    },
    orientationEvidence: {
      orientation: Number(canvas.dataset.previewSourceOrientation ?? 1),
      applied: canvas.dataset.previewOrientationApplied === 'true',
      decodeMode: canvas.dataset.previewSourceDecodeMode ?? ''
    },
    canvasOffset: wrapperRect === null || canvasRect === null ? null : {
      x: canvasRect.left - wrapperRect.left,
      y: canvasRect.top - wrapperRect.top
    },
    previewFileName: document.querySelector('.previewMetaFileName')?.textContent?.trim() ?? '',
    placementStatus: document.querySelector('.previewPlacementStatus')?.textContent?.trim() ?? '',
    engineSyncLabel: document.querySelector('.previewSyncBadge')?.textContent?.trim() ?? '',
    engineSyncClass: document.querySelector('.previewSyncBadge')?.className ?? '',
    sourceDecodeLabel: document.querySelector('.decodeBadge')?.textContent?.trim() ?? ''
  }
})()`)

const artifactRecord = async (filePath) => {
  try {
    const data = await readFile(filePath)
    return {
      path: path.relative(ROOT, filePath).split(path.sep).join("/"),
      exists: true,
      validPng: validPng(data),
      dimensions: pngDimensions(data),
      bytes: data.length,
      sha256: createHash("sha256").update(data).digest("hex")
    }
  } catch {
    return { path: path.relative(ROOT, filePath).split(path.sep).join("/"), exists: false, validPng: false, sha256: null }
  }
}

const sourceSetMatches = (manifest, samplePath, arwPaths) => {
  const expected = [samplePath, ...arwPaths].map((filePath) => path.basename(filePath)).sort()
  const actual = (manifest?.files ?? []).map((entry) => entry.fileName).filter((name) => expected.includes(name)).sort()
  return expected.length === actual.length && expected.every((name, index) => actual[index] === name)
}

const waitForEnginePreviewSynced = async (client, fileName) => await waitFor(
  `${fileName} 的 Java 引擎预览同步完成`,
  () => evaluate(client, `({ fileName: document.querySelector('.previewMetaFileName')?.textContent?.trim() ?? '', label: document.querySelector('.previewSyncBadge')?.textContent?.trim() ?? '' })`),
  (value) => value?.fileName === fileName && value.label === "引擎预览已同步"
)

/** 阶段 1 验收报告只判断证据与方向/几何事实，不替代最终发布闸门。 */
export const buildStage1VerificationReport = ({
  manifest,
  runInfo,
  geometry,
  arwEvidence,
  artifactPaths,
  network,
  sourceSet,
  exportEvidence
}) => {
  const screenshotsValid = artifactPaths.length === ARTIFACT_NAMES.length
    && artifactPaths.every((artifact) => artifact.exists === true && artifact.validPng === true && isHash(artifact.sha256))
  const sceneGeometry = geometry.length === ARTIFACT_NAMES.length
    && geometry.every((item) => item.error === undefined
      && item.photoDisplay?.width > 0 && item.photoDisplay?.height > 0
      && item.aspectError !== null && item.aspectError <= 0.005
      && item.engineSyncLabel === "引擎预览已同步")
  const actual = geometry.find((item) => item.scene === "preview-100-percent")
  const arw = arwEvidence.length === DEFAULT_ARW_NAMES.length
  const arwDirection = arw && arwEvidence.every((item) => item.orientationEvidence?.orientation === 8
    && item.orientationEvidence?.applied === true
    && item.photoDisplay?.height > item.photoDisplay?.width
    && item.aspectError !== null
    && item.aspectError <= 0.005
    && item.canvas?.logicalWidth > 0
    && item.canvas?.logicalHeight > 0
    && item.fitInvariant === true)
  const checks = {
    sourceFileCount: manifest?.fileCount === 15 && manifest?.files?.length === 15,
    sourceSet: sourceSet === true,
    sourceHashes: manifest?.files?.every((entry) => isHash(entry.sha256)) === true,
    arwCount: (manifest?.files ?? []).filter((entry) => entry.format === "ARW").length === 6,
    arwOrientation: (manifest?.files ?? []).filter((entry) => entry.format === "ARW").every((entry) => entry.orientation === 8),
    arwDirection,
    screenshots: screenshotsValid,
    geometry: sceneGeometry,
    canvasBackingSeparated: geometry.every((item) => item.canvas?.logicalWidth > 0
      && item.canvas?.logicalHeight > 0
      && item.canvas?.backingWidth >= item.canvas.logicalWidth
      && item.canvas?.backingHeight >= item.canvas.logicalHeight
      && item.canvas?.cssLogicalScale?.x !== null
      && item.canvas?.cssLogicalScale?.y !== null
      && Math.abs(item.canvas.cssLogicalScale.x - item.canvas.cssLogicalScale.y) <= 0.01),
    actualMode: actual?.mode === "actual"
      && actual.modeLabel === "100%"
      && actual.oneToOne === true
      && actual.actualInvariant === true,
    cropPolicy: geometry.every((item) => item.placement?.mode !== "fit" || item.placement?.cropAllowed === false),
    exportIndependentExifTool: exportEvidence?.status === "PASS"
      && exportEvidence.records?.length === DEFAULT_ARW_NAMES.length
      && exportEvidence.records.every((record) => record.sourceFileName !== undefined
        && record.orientation === 1
        && Number.isInteger(record.width) && Number.isInteger(record.height)
        && record.width > 0 && record.height > 0
        && record.bitDepth === 8
        && isHash(record.sha256)),
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
    kind: "stage1-verification",
    status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
    independentOfFinalReleaseStatus: true,
    checks,
    observations: {
      arwPortraitDisplay: arwDirection,
      actualModeIsPhysicalOneToOne: actual?.oneToOne === true,
      exportIndependentExifTool: exportEvidence?.status ?? "NOT_RUN_IN_STAGE1_CAPTURE",
      finalReleaseReportMayRemainNotReady: true
    },
    artifacts: artifactPaths,
    artifactPaths: artifactPaths.map((artifact) => artifact.path),
    completedAt: new Date().toISOString()
  }
}

const sourceHashes = async (manifest) => Object.fromEntries(await Promise.all(
  (manifest?.files ?? []).map(async (entry) => [entry.relativePath, await sha256File(path.resolve(ROOT, entry.relativePath))])
))

const makeOutputRoot = (args, version, head) => path.resolve(readArg(args, "--output") ?? path.join(
  ROOT,
  ".local",
  "stage1",
  `${version}-${new Date().toISOString().replace(/[-:.]/g, "").replace(/Z$/, "Z")}-${(readArg(args, "--commit") ?? head ?? "current").slice(0, 12)}`
))

const gitValue = async (args) => {
  try {
    const { execFile } = await import("node:child_process")
    const { promisify } = await import("node:util")
    const run = promisify(execFile)
    return (await run("git", ["-C", ROOT, ...args], { encoding: "utf8" })).stdout.trim()
  } catch {
    return null
  }
}

const packageVersion = async () => {
  const packageJson = await readJson(path.join(ROOT, "electron", "package.json"))
  return typeof packageJson.version === "string" ? packageJson.version : "unknown"
}

const main = async () => {
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    throw new Error(`阶段 1 真实视觉基线必须在 macOS arm64 执行，当前为 ${process.platform}-${process.arch}`)
  }
  const args = process.argv.slice(2)
  const version = readArg(args, "--version") ?? await packageVersion()
  const head = readArg(args, "--commit") ?? await gitValue(["rev-parse", "HEAD"]) ?? "current"
  const outputRoot = makeOutputRoot(args, version, head)
  const samplePath = path.resolve(readArg(args, "--sample") ?? DEFAULT_SAMPLE_PATH)
  const arwPaths = DEFAULT_ARW_NAMES.map((name) => path.resolve(readArg(args, `--arw-${name}`) ?? path.join(ROOT, "photos", name)))
  const appPath = path.resolve(readArg(args, "--app") ?? DEFAULT_APP)
  await mkdir(outputRoot, { recursive: true })

  const manifestPath = path.join(outputRoot, "photo-manifest.json")
  const runInfoPath = path.join(outputRoot, "run-info.json")
  const { manifest, runInfo } = await generatePhotoManifest({
    outputPath: manifestPath,
    runInfoPath,
    version
  })
  const { sample, arw } = sourceEntriesFor(manifest, samplePath, DEFAULT_ARW_NAMES)
  const beforeHashes = await sourceHashes(manifest)
  const releaseScope = await readJson(path.join(ROOT, "docs", "release-scope.json"))
  const debugPort = await getFreePort()
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "camera-border-stage1-"))
  const exportDirectory = path.join(outputRoot, "exports")
  await mkdir(exportDirectory, { recursive: true })
  const userData = path.join(temporaryRoot, "user-data")
  const { ELECTRON_RENDERER_URL: _rendererUrl, CAMBORDER_ENGINE_PORT: _enginePort, ...cleanEnv } = process.env
  const environment = {
    ...cleanEnv,
    CAMBORDER_E2E: "1",
    CAMBORDER_E2E_SAMPLE: samplePath,
    CAMBORDER_E2E_EXTRA_SAMPLES: JSON.stringify(arwPaths),
    CAMBORDER_E2E_OUTPUT_DIR: exportDirectory,
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
  const arwEvidence = []
  const requestUrls = []
  const requestDetails = []
  try {
    const targets = await waitFor(
      "Electron CDP 端点",
      () => fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json()),
      (items) => Array.isArray(items) && items.some((item) => item.type === "page" && typeof item.webSocketDebuggerUrl === "string")
    )
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
    await waitFor(
      "阶段 1 固定照片进入队列",
      () => evaluate(client, "[...document.querySelectorAll('.queueItem')].map((item) => item.querySelector('.queueName')?.firstChild?.textContent?.trim() ?? '')"),
      (names) => Array.isArray(names) && names.includes(path.basename(samplePath)) && DEFAULT_ARW_NAMES.every((name) => names.includes(name))
    )
    await waitFor("Java Engine 健康端点", () => evaluate(client, "fetch('/api/health', { cache: 'no-store' }).then((response) => response.status).catch(() => 0)"), (status) => status === 200)

    await selectQueueItem(client, sample.fileName)
    await waitForCanvas(client, sample.fileName)
    await waitForEnginePreviewSynced(client, sample.fileName)
    await ensureInfoCard(client)
    await waitForEnginePreviewSynced(client, sample.fileName)
    geometry.push(await readStage1Geometry(client, { scene: "landscape-default", source: sample, templateId: "photo-info-card", expectedMode: "fit" }))
    await captureRendererScreenshot(client, path.join(outputRoot, "landscape-default.png"))

    await selectQueueItem(client, arw[0].fileName)
    await waitForCanvas(client, arw[0].fileName)
    await waitForEnginePreviewSynced(client, arw[0].fileName)
    geometry.push(await readStage1Geometry(client, { scene: "arw-vertical", source: arw[0], templateId: "photo-info-card", expectedMode: "fit" }))
    await captureRendererScreenshot(client, path.join(outputRoot, "arw-vertical.png"))

    for (let index = 0; index < arw.length; index++) {
      const entry = arw[index]
      await selectQueueItem(client, entry.fileName)
      await waitForCanvas(client, entry.fileName)
      await waitForEnginePreviewSynced(client, entry.fileName)
      arwEvidence.push(await readStage1Geometry(client, {
        scene: `arw-validation-${entry.fileName}`,
        source: entry,
        templateId: "photo-info-card",
        expectedMode: "fit"
      }))
    }

    await selectQueueItem(client, sample.fileName)
    await waitForCanvas(client, sample.fileName)
    await waitForEnginePreviewSynced(client, sample.fileName)
    await clickTemplateByName(client, "Polaroid 拍立得", "Polaroid 模板按钮")
    await waitFor("Polaroid 模板激活", () => evaluate(client, "[...document.querySelectorAll('.templateGalleryCard')].some((card) => card.querySelector('.templateGalleryName')?.textContent?.trim() === 'Polaroid 拍立得' && card.classList.contains('templateGalleryCardActive'))"), (active) => active === true)
    await waitForEnginePreviewSynced(client, sample.fileName)
    geometry.push(await readStage1Geometry(client, { scene: "polaroid", source: sample, templateId: "polaroid", expectedMode: "fit" }))
    await captureRendererScreenshot(client, path.join(outputRoot, "polaroid.png"))

    await ensureInfoCard(client)
    await waitForEnginePreviewSynced(client, sample.fileName)
    await clickByText(client, ".previewViewportBtn", "100%", "100% 预览按钮")
    await waitFor("actual/100% 预览模式", () => evaluate(client, "document.querySelector('.previewZoomLabel')?.textContent?.trim() ?? ''"), (label) => label === "100%")
    geometry.push(await readStage1Geometry(client, { scene: "preview-100-percent", source: sample, templateId: "photo-info-card", expectedMode: "actual" }))
    await captureRendererScreenshot(client, path.join(outputRoot, "preview-100-percent.png"))

    // 只勾选六张 ARW，避免横图样片的既有 IPTC 写回问题掩盖本阶段的方向证据。
    for (const entry of arw) {
      const checked = await evaluate(client, `(() => {
        const checkbox = document.querySelector('input.queueItemCheck[aria-label="批量选中 ${entry.fileName}"]')
        if (!(checkbox instanceof HTMLInputElement)) return false
        if (!checkbox.checked) checkbox.click()
        return checkbox.checked
      })()`)
      if (checked !== true) throw new Error(`无法勾选 ARW：${entry.fileName}`)
    }
    await clickByText(client, ".exportScopeButton", `已选 ${arw.length} 张`, "六张 ARW 导出范围")
    await waitFor(
      "六张 ARW 批量导出按钮",
      () => evaluate(client, `(() => { const button = [...document.querySelectorAll('button.exportDockButton')].find((item) => item.textContent?.trim() === '批量导出已选 ${arw.length} 张'); return button !== undefined && !button.disabled })()`),
      (available) => available === true
    )
    await clickByText(client, ".exportDockButton", `批量导出已选 ${arw.length} 张`, "六张 ARW 批量导出按钮")
    await waitFor(
      "六张 ARW 批量导出完成",
      () => evaluate(client, "document.querySelector('.exportDockStatus')?.textContent?.trim() ?? ''"),
      (status) => status.includes(`批量导出完成：共 ${arw.length} 张`) && status.includes("失败 0"),
      120_000
    )
  } catch (error) {
    const logText = logs.join("")
    throw new Error(`${error instanceof Error ? error.message : String(error)}${logText.length > 0 ? `\nElectron 日志：\n${logText}` : ""}`)
  } finally {
    client?.close()
    if (child.exitCode === null) child.kill("SIGTERM")
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }

  const afterHashes = await sourceHashes(manifest)
  const sourceShaUnchanged = JSON.stringify(beforeHashes) === JSON.stringify(afterHashes)
  const artifacts = await Promise.all(ARTIFACT_NAMES.map((name) => artifactRecord(path.join(outputRoot, `${name}.png`))))
  const exportEvidence = await readStage1ExportEvidence({
    outputDirectory: exportDirectory,
    sources: arw,
    exifTool: path.resolve(ROOT, runInfo.exifTool?.path ?? DEFAULT_EXIFTOOL)
  })
  await writeJson(path.join(outputRoot, "export-evidence.json"), exportEvidence)
  const network = {
    requestCount: requestUrls.length,
    externalRequests: requestUrls.filter((url) => !url.startsWith("app://") && !url.startsWith("data:") && !url.startsWith("blob:")).length,
    uploadRequests: requestDetails.filter((request) => request.method !== "GET" && !request.url.startsWith("app://")).length,
    requests: requestDetails
  }
  runInfo.kind = "stage1-run-info"
  runInfo.stage = 1
  runInfo.head = await gitValue(["rev-parse", "HEAD"])
  runInfo.branch = await gitValue(["branch", "--show-current"])
  runInfo.dirty = (await gitValue(["status", "--porcelain", "--untracked-files=all"]))?.length > 0
  runInfo.sourceSha256BeforeCapture = beforeHashes
  runInfo.sourceSha256AfterCapture = afterHashes
  runInfo.sourceShaUnchanged = sourceShaUnchanged && runInfo.sourceShaUnchanged === true
  runInfo.screenshotSource = {
    kind: "current-checkout-macos-arm64-app",
    executable: appPath,
    packaged: true,
    userData,
    requestedWindow: REQUESTED_WINDOW,
    windowSource: "CDP Renderer viewport"
  }
  runInfo.network = network
  runInfo.releaseScope = releaseScope
  runInfo.arwNames = DEFAULT_ARW_NAMES
  runInfo.exportEvidence = exportEvidence
  await writeJson(runInfoPath, runInfo)
  await writeJson(path.join(outputRoot, "baseline-geometry.json"), {
    schemaVersion: 1,
    source: "current-checkout-macos-arm64-app",
    generatedAt: new Date().toISOString(),
    scenes: geometry,
    arwEvidence,
    exportEvidence
  })

  const issueLines = [
    "# 阶段 1 几何问题基线",
    "",
    "> 本文件只登记当前 checkout 的实际 Renderer 观察；阶段 1 不在证据脚本中修复几何异常。",
    "",
    `- 截图来源：${appPath}`,
    `- 请求窗口：${REQUESTED_WINDOW.width}×${REQUESTED_WINDOW.height}`,
    `- 当前 HEAD：${runInfo.head ?? "?"}`,
    `- 工作树 dirty：${runInfo.dirty ? "是" : "否"}`,
    `- 源文件哈希执行前后相等：${sourceShaUnchanged ? "是" : "否"}`,
    ""
  ]
  for (const item of [...geometry, ...arwEvidence]) {
    const display = item.photoDisplay
    const issues = []
    if (item.error !== undefined) issues.push(item.error)
    if (item.activeTemplateEvidence !== true) issues.push("模板激活状态未能由画廊 DOM 独立确认")
    if (item.source?.format === "ARW" && item.orientationEvidence?.orientation !== 8) issues.push("Renderer 未报告 Orientation=8")
    if (item.source?.format === "ARW" && (display === null || display.height <= display.width)) issues.push("ARW 显示区域没有保持竖向")
    if (item.aspectError !== null && item.aspectError > 0.005) issues.push(`图片区域宽高比误差 ${item.aspectError}`)
    if (item.scene === "preview-100-percent" && item.actualInvariant !== true) issues.push("100% 不是物理 1:1 或未按容器分别居中")
    if (item.engineSyncLabel.includes("失败")) issues.push(`引擎预览状态：${item.engineSyncLabel}`)
    issueLines.push(
      `## ${item.scene}`,
      "",
      `- 源文件：${item.source?.fileName ?? "?"}；Orientation：${item.source?.orientation ?? "?"}；Renderer：${item.orientationEvidence?.orientation ?? "?"}（已处理=${item.orientationEvidence?.applied ? "是" : "否"}）`,
      `- 窗口请求：${item.requestedWindow?.width ?? REQUESTED_WINDOW.width}×${item.requestedWindow?.height ?? REQUESTED_WINDOW.height}`,
      `- 实际外框：${item.window?.outerWidth ?? "?"}×${item.window?.outerHeight ?? "?"}`,
      `- Renderer viewport：${item.rendererViewport?.width ?? "?"}×${item.rendererViewport?.height ?? "?"}`,
      `- Canvas 逻辑：${item.canvas?.logicalWidth ?? "?"}×${item.canvas?.logicalHeight ?? "?"}；backing：${item.canvas?.backingWidth ?? "?"}×${item.canvas?.backingHeight ?? "?"}；CSS：${item.canvas?.css?.width ?? "?"}×${item.canvas?.css?.height ?? "?"}`,
      `- 有向自然 Canvas：${item.naturalCanvas?.width ?? "?"}×${item.naturalCanvas?.height ?? "?"}；照片显示区域：${display === null ? "不可用" : `${display.width}×${display.height} @ ${display.left},${display.top}`}`,
      `- 图片区域宽高比误差：${item.aspectError ?? "?"}；Canvas 偏移：${item.canvasOffset === null ? "?" : `${item.canvasOffset.x},${item.canvasOffset.y}`}`,
      `- 模式：${item.mode}；标签：${item.modeLabel}；放置：${item.placement?.mode ?? "?"}；裁切：${item.placement?.cropApplied ? "已裁切" : "未裁切"}`,
      `- 引擎预览：${item.engineSyncLabel || "无状态徽标"}`,
      `- 问题：${issues.length === 0 ? "无自动化几何异常" : issues.join("；")}`,
      ""
    )
  }
  await writeFile(path.join(outputRoot, "issue-baseline.md"), `${issueLines.join("\n")}\n`, "utf8")

  const verification = buildStage1VerificationReport({
    manifest,
    runInfo,
    geometry,
    arwEvidence,
    artifactPaths: artifacts,
    network,
    sourceSet: sourceSetMatches(manifest, samplePath, arwPaths),
    exportEvidence
  })
  await writeJson(path.join(outputRoot, "verification-report.json"), verification)
  console.log(`[stage1-baseline] 已生成：${outputRoot}`)
  console.log(`[stage1-baseline] verification=${verification.status}；sourceShaUnchanged=${runInfo.sourceShaUnchanged}`)
  if (verification.status !== "PASS") process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`[stage1-baseline] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
