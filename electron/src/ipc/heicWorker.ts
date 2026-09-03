import { parentPort, workerData } from "node:worker_threads"
import { readFile, writeFile } from "node:fs/promises"
import { applyHeifOrientation, extractHeifMetadata, injectPngMetadata } from "./heicMetadata.js"
import {
  isHeicDimensionsAllowed,
  isHeicOutputSizeAllowed,
  readPngDimensions,
} from "./heicLimits.js"

type WorkerData = {
  readonly inputPath: string
  readonly outputPath: string
  readonly heicConvertPath: string
  readonly pngJsPath: string
}

/**
 * 随包 HEIC 解码助手的隔离执行单元。
 * 解码库会在部分图片上同步消耗 CPU，因此放到 worker 后主进程可以可靠执行超时终止。
 */
const run = async (): Promise<void> => {
  const { inputPath, outputPath, heicConvertPath, pngJsPath } = workerData as WorkerData
  // 使用主进程解析出的绝对路径，兼容 app.asar.unpacked 中运行的 worker。
  const convert = require(heicConvertPath) as (options: {
    readonly buffer: Buffer
    readonly format: "PNG"
  }) => Promise<Buffer>
  const { PNG } = require(pngJsPath) as typeof import("pngjs")
  const input = await readFile(inputPath)
  const metadata = extractHeifMetadata(input)
  const decodedPng = await convert({ buffer: input, format: "PNG" })
  if (!isHeicOutputSizeAllowed(decodedPng.length)) {
    throw new Error("HEIC 解码输出超过大小限制")
  }
  const pngDimensions = readPngDimensions(decodedPng)
  if (pngDimensions === null || !isHeicDimensionsAllowed(pngDimensions.width, pngDimensions.height)) {
    throw new Error("HEIC 解码尺寸超过限制")
  }
  const decoded = PNG.sync.read(decodedPng)
  if (!isHeicDimensionsAllowed(decoded.width, decoded.height)) {
    throw new Error("HEIC 解码尺寸超过限制")
  }
  const oriented = applyHeifOrientation(decoded, metadata.orientation)
  const output = injectPngMetadata(PNG.sync.write(oriented), metadata)
  await writeFile(outputPath, output)
  parentPort?.postMessage({ ok: true })
}

void run().catch((error: unknown) => {
  parentPort?.postMessage({
    ok: false,
    message: error instanceof Error ? error.message : "HEIC 解码失败"
  })
})
