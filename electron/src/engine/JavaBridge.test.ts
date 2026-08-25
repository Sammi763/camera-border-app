import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { chmodSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { JavaBridge } from "./JavaBridge"
import type { EngineConfig } from "./engineConfig"

/**
 * JavaBridge 进程行为测试。
 *
 * 用一个带 shebang 的 Node 脚本伪装「随包 java 可执行文件」，
 * 验证：打包模式缺运行时的诊断、日志目录自动创建、健康探测超时进入
 * unhealthy、重试终止旧进程并重启、dispose 终止子进程。
 */

const TEST_PORT = 59973
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`

let workDir: string

/** 生成可执行的假 java：忽略 -jar 参数；boom=立即退出(1)，其余打印启动行后保持存活。 */
const writeFakeJava = (dir: string, mode: string): string => {
  const lines =
    mode === "boom"
      ? [
          "#!/usr/bin/env node",
          "// 测试用假引擎：立即异常退出"
        ]
      : [
          "#!/usr/bin/env node",
          "// 测试用假引擎：忽略 -jar <jar> 参数，打印启动行后保持存活",
          "console.log('[fake-engine] started pid=' + process.pid);",
          "setInterval(() => {}, 1000);"
        ]
  const exePath = join(dir, `fake-java-${mode}.mjs`)
  writeFileSync(exePath, lines.join("\n") + "\n")
  chmodSync(exePath, 0o755)
  return exePath
}

const makeConfig = (overrides: Partial<EngineConfig>): EngineConfig => ({
  baseUrl: BASE_URL,
  jarPath: join(workDir, "engine.jar"),
  cwd: workDir,
  readyTimeoutMs: 500,
  requireBundledRuntime: true,
  ...overrides
})

const isAlive = (pid: number): boolean => {
  try {
      process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "javabridge-test-"))
  // 假 jar（只做存在性检查）
  writeFileSync(join(workDir, "engine.jar"), "fake-jar")
})

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true })
})

describe("JavaBridge（进程控制与诊断分类）", () => {
  it("打包模式缺随包运行时：不 spawn，直接 runtime-missing", async () => {
    const bridge = new JavaBridge(makeConfig({
      javaExecutablePath: join(workDir, "does-not-exist", "java")
    }))
    bridge.start()

    const state = bridge.getState()
    expect(state.kind).toBe("crashed")
    expect(bridge.getFailureReason()).toBe("runtime-missing")
    expect(bridge.getLogWarning()).toBeNull()
    await bridge.dispose()
  })

  it("启动前自动创建日志目录，stdout/stderr 写入 engine.log", async () => {
    const logPath = join(workDir, "nested", "logs", "engine.log")
    expect(existsSync(logPath)).toBe(false)

    const fakeJava = writeFakeJava(workDir, "serve")
    const bridge = new JavaBridge(makeConfig({
      javaExecutablePath: fakeJava,
      logPath
    }))
    bridge.start()
    expect(bridge.getState().kind).toBe("running")

    // 轮询等待子进程输出到达日志文件（避免固定 600ms 等待在 CI 慢机器上偶发失败）
    const deadline = Date.now() + 5000
    let content = ""
    while (Date.now() < deadline) {
      if (existsSync(logPath)) {
        content = readFileSync(logPath, "utf8")
        if (content.includes("[fake-engine] started")) {
          break
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    expect(content).toContain("[fake-engine] started")

    // dispose 现在会等待子进程完全关闭（含 stdio drain）再 flush 日志
    await bridge.dispose()

    expect(existsSync(logPath)).toBe(true)
    const finalContent = readFileSync(logPath, "utf8")
    expect(finalContent).toContain("[fake-engine] started")
    expect(bridge.getLogWarning()).toBeNull()
  }, 15000)

  it("健康探测超时：状态进入 unhealthy（health-timeout），不再保持 running", async () => {
    const fakeJava = writeFakeJava(workDir, "serve")
    const bridge = new JavaBridge(makeConfig({
      javaExecutablePath: fakeJava,
      readyTimeoutMs: 400
    }))
    bridge.start()
    const runningState = bridge.getState()
    expect(runningState.kind).toBe("running")

    const ready = await bridge.waitForReady()
    expect(ready).toBe(false)

    const state = bridge.getState()
    expect(state.kind).toBe("unhealthy")
    if (state.kind === "unhealthy") {
      expect(state.reason).toBe("health-timeout")
    }
    expect(bridge.getFailureReason()).toBe("health-timeout")
    await bridge.dispose()
  })

  it("重试：终止旧进程（含 unhealthy 存活进程），重新启动新进程", async () => {
    const fakeJava = writeFakeJava(workDir, "serve")
    const bridge = new JavaBridge(makeConfig({
      javaExecutablePath: fakeJava,
      readyTimeoutMs: 400
    }))
    bridge.start()
    await bridge.waitForReady()
    const unhealthy = bridge.getState()
    expect(unhealthy.kind).toBe("unhealthy")

    const oldPid = unhealthy.kind === "unhealthy" ? unhealthy.pid : -1
    expect(oldPid).toBeGreaterThan(0)
    expect(isAlive(oldPid)).toBe(true)

    // retry 现在会等待旧进程真正退出（SIGTERM -> 宽限期 -> SIGKILL）后再 spawn
    await bridge.retry()

    const newState = bridge.getState()
    expect(newState.kind).toBe("running")
    const newPid = newState.kind === "running" ? newState.pid : -1
    expect(newPid).toBeGreaterThan(0)
    expect(newPid).not.toBe(oldPid)
    // 旧进程必须已终止（不能残留占用资源）
    expect(isAlive(oldPid)).toBe(false)
    expect(bridge.getFailureReason()).not.toBe("health-timeout")
    await bridge.dispose()
  }, 20000)

  it("dispose：终止子进程回到 stopped", async () => {
    const fakeJava = writeFakeJava(workDir, "serve")
    const bridge = new JavaBridge(makeConfig({ javaExecutablePath: fakeJava }))
    bridge.start()
    const state = bridge.getState()
    const pid = state.kind === "running" ? state.pid : -1
    expect(pid).toBeGreaterThan(0)

    await bridge.dispose()
    expect(bridge.getState().kind).toBe("stopped")
    expect(isAlive(pid)).toBe(false)
  })

  it("快速 dispose：日志流必须先等子进程完全关闭（含 stdio drain）再 flush", async () => {
    // 回归：之前 #disposeChild() 顺序是「先关日志流再 kill 子进程」，
    // 仍在传输的 stdout 数据会写入已关闭的流，导致日志丢失。
    // 新顺序：先 SIGTERM -> 等待 child 'close'（stdio drain）-> 再 flush 日志。
    const logPath = join(workDir, "fast-dispose", "engine.log")
    const fakeJava = writeFakeJava(workDir, "serve")
    const bridge = new JavaBridge(makeConfig({
      javaExecutablePath: fakeJava,
      logPath
    }))
    bridge.start()
    expect(bridge.getState().kind).toBe("running")
    // 轮询等待数据到达日志文件（不依赖固定时间，避免 CI 慢机器偶发失败）
    const deadline = Date.now() + 5000
    let arrived = false
    while (Date.now() < deadline) {
      if (existsSync(logPath) && readFileSync(logPath, "utf8").includes("[fake-engine] started")) {
        arrived = true
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    expect(arrived).toBe(true)
    // dispose 必须保留已写入的日志内容（不能因为 close 时序问题丢失数据）
    await bridge.dispose()
    const content = readFileSync(logPath, "utf8")
    expect(content).toContain("[fake-engine] started")
  }, 15000)

  it("jar 缺失：crashed + jar-missing，且不尝试 spawn", async () => {
    const fakeJava = writeFakeJava(workDir, "serve")
    const bridge = new JavaBridge(makeConfig({
      javaExecutablePath: fakeJava,
      jarPath: join(workDir, "missing.jar")
    }))
    bridge.start()
    expect(bridge.getState().kind).toBe("crashed")
    expect(bridge.getFailureReason()).toBe("jar-missing")
    await bridge.dispose()
  })
})
