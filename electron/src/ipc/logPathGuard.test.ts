import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { isAllowedLogPath } from "./logPathGuard"

/**
 * OPEN_LOG_FILE 白名单校验测试：
 * 只能打开 userData/logs 下的常规文件；路径穿越、目录外绝对路径、
 * 符号链接指向目录外、目录本身、非普通文件一律拒绝。
 */

let logsRoot: string
let outsideDir: string

beforeAll(() => {
  const workDir = mkdtempSync(join(tmpdir(), "logpath-guard-test-"))
  logsRoot = join(workDir, "logs")
  outsideDir = join(workDir, "outside")
  mkdirSync(logsRoot, { recursive: true })
  mkdirSync(outsideDir, { recursive: true })
  writeFileSync(join(logsRoot, "engine.log"), "engine log")
  writeFileSync(join(logsRoot, "app.log"), "app log")
  writeFileSync(join(outsideDir, "secret.txt"), "secret")
})

afterAll(() => {
  rmSync(join(logsRoot, ".."), { recursive: true, force: true })
})

describe("isAllowedLogPath 日志打开白名单", () => {
  it("正常日志文件（直接位于 logs 下）允许", () => {
    expect(isAllowedLogPath(join(logsRoot, "engine.log"), logsRoot)).toBe(true)
    expect(isAllowedLogPath(join(logsRoot, "app.log"), logsRoot)).toBe(true)
  })

  it("路径穿越（..）拒绝", () => {
    // logs/../outside/secret.txt 经 resolve 后位于 logs 外
    expect(isAllowedLogPath(join(logsRoot, "..", "outside", "secret.txt"), logsRoot)).toBe(false)
  })

  it("路径穿越但最终仍落在 logs 内：允许（resolve 规范化后无害）", () => {
    // sub/../engine.log → logsRoot/engine.log，仍在范围内
    expect(isAllowedLogPath(join(logsRoot, "sub", "..", "engine.log"), logsRoot)).toBe(true)
  })

  it("日志目录外的绝对路径拒绝", () => {
    expect(isAllowedLogPath(join(outsideDir, "secret.txt"), logsRoot)).toBe(false)
  })

  it("直接指向日志目录本身（而非文件）拒绝", () => {
    expect(isAllowedLogPath(logsRoot, logsRoot)).toBe(false)
    expect(isAllowedLogPath(join(logsRoot, "."), logsRoot)).toBe(false)
  })

  it("目录但扩展名伪装成日志文件：拒绝（非普通文件）", () => {
    const fakeDir = join(logsRoot, "not-a-file.log")
    mkdirSync(fakeDir)
    expect(isAllowedLogPath(fakeDir, logsRoot)).toBe(false)
  })

  it("符号链接指向目录外：拒绝", () => {
    const link = join(logsRoot, "evil-link.log")
    try {
      symlinkSync(join(outsideDir, "secret.txt"), link)
    } catch {
      // 平台不支持符号链接时跳过该用例
      return
    }
    expect(isAllowedLogPath(link, logsRoot)).toBe(false)
  })

  it("符号链接指向目录内正常日志：允许（realpath 解析后仍在范围内）", () => {
    const link = join(logsRoot, "inner-link.log")
    try {
      symlinkSync(join(logsRoot, "engine.log"), link)
    } catch {
      return
    }
    expect(isAllowedLogPath(link, logsRoot)).toBe(true)
  })

  it("不存在文件拒绝", () => {
    expect(isAllowedLogPath(join(logsRoot, "missing.log"), logsRoot)).toBe(false)
  })

  it("非字符串 / 空字符串拒绝", () => {
    expect(isAllowedLogPath("", logsRoot)).toBe(false)
    expect(isAllowedLogPath("   ", logsRoot)).toBe(false)
    expect(isAllowedLogPath(null as unknown as string, logsRoot)).toBe(false)
    expect(isAllowedLogPath(undefined as unknown as string, logsRoot)).toBe(false)
    expect(isAllowedLogPath(123 as unknown as string, logsRoot)).toBe(false)
  })

  it("allowedRoot 非法时拒绝", () => {
    expect(isAllowedLogPath(join(logsRoot, "engine.log"), "")).toBe(false)
    expect(isAllowedLogPath(join(logsRoot, "engine.log"), "   ")).toBe(false)
    expect(isAllowedLogPath(join(logsRoot, "engine.log"), null as unknown as string)).toBe(false)
  })
})
