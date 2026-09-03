import { afterEach, describe, expect, it, vi } from "vitest"
import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const { workerInstances, WorkerMock } = vi.hoisted(() => {
  const instances: Array<{
    readonly path: string
    readonly options: unknown
    readonly terminate: ReturnType<typeof vi.fn>
    readonly emit: (event: string, ...args: unknown[]) => void
  }> = []

  class FakeWorker {
    readonly path: string
    readonly options: unknown
    readonly terminate = vi.fn(async () => 0)
    private readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>()

    constructor(path: string, options: unknown) {
      this.path = path
      this.options = options
      instances.push(this)
    }

    on(event: string, listener: (...args: unknown[]) => void): this {
      const listeners = this.listeners.get(event) ?? []
      listeners.push(listener)
      this.listeners.set(event, listeners)
      return this
    }

    emit(event: string, ...args: unknown[]): void {
      for (const listener of this.listeners.get(event) ?? []) listener(...args)
    }
  }

  return { workerInstances: instances, WorkerMock: FakeWorker }
})

vi.mock("electron", () => ({
  app: { isPackaged: false, getPath: () => tmpdir() },
  ipcMain: { handle: vi.fn() }
}))

vi.mock("node:worker_threads", () => ({ Worker: WorkerMock }))

import {
  cleanupHeicTempFiles,
  cleanupStaleHeicTempFiles,
  convertWithBundledDecoder,
  isBundledHeicDecoderAvailable
} from "./imageConvert"

const waitForFileCleanup = async (): Promise<void> => {
  await new Promise<void>((resolve) => setImmediate(resolve))
}

afterEach(async () => {
  workerInstances.length = 0
  await cleanupHeicTempFiles()
})

describe("随包 HEIC 解码 worker", () => {
  it("能力探测只依赖随包模块且当前依赖可加载", () => {
    expect(isBundledHeicDecoderAvailable()).toBe(true)
  })

  it("超时会终止 worker 并清理半成品", async () => {
    const outputPath = join(tmpdir(), `camborder-heic-timeout-${process.pid}.png`)
    await writeFile(outputPath, Buffer.from("partial"))

    await expect(convertWithBundledDecoder("/missing.heic", outputPath, 5)).resolves.toBe(false)
    await waitForFileCleanup()

    expect(workerInstances[0]?.terminate).toHaveBeenCalledTimes(1)
    expect(existsSync(outputPath)).toBe(false)
  })

  it("worker 错误同样清理输出文件，不把失败伪装成成功", async () => {
    const outputPath = join(tmpdir(), `camborder-heic-error-${process.pid}.png`)
    await writeFile(outputPath, Buffer.from("partial"))
    const promise = convertWithBundledDecoder("/missing.heic", outputPath, 1_000)
    const worker = workerInstances[0]
    expect(worker).toBeDefined()
    worker?.emit("error", new Error("decoder failed"))

    await expect(promise).resolves.toBe(false)
    await waitForFileCleanup()
    expect(existsSync(outputPath)).toBe(false)
  })

  it("退出清理只删除本主进程的 HEIC 临时目录", async () => {
    const tempDirectory = join(tmpdir(), `camborder-heic-${process.pid}`)
    await mkdir(tempDirectory, { recursive: true })
    await writeFile(join(tempDirectory, "converted.png"), Buffer.from("png"))

    await cleanupHeicTempFiles()

    expect(existsSync(tempDirectory)).toBe(false)
  })

  it("启动清理已退出实例的临时目录，但不清理当前实例目录", async () => {
    const staleDirectory = join(tmpdir(), "camborder-heic-2147483647")
    const currentDirectory = join(tmpdir(), `camborder-heic-${process.pid}`)
    await mkdir(staleDirectory, { recursive: true })
    await mkdir(currentDirectory, { recursive: true })
    await writeFile(join(staleDirectory, "converted.png"), Buffer.from("png"))
    await writeFile(join(currentDirectory, "converted.png"), Buffer.from("png"))

    await cleanupStaleHeicTempFiles()

    expect(existsSync(staleDirectory)).toBe(false)
    expect(existsSync(currentDirectory)).toBe(true)
  })
})
