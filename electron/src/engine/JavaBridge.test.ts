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

/** 生成可执行的假 java：忽略 -jar 参数；boom=进程存在但立即异常退出(1)以模拟被安全软件阻止；
 *  serve=打印启动行后保持存活（无 /api/health 端点，用于测试 health-timeout）。 */
const writeFakeJava = (dir: string, mode: string): string => {
  const lines =
    mode === "boom"
      ? [
          "#!/usr/bin/env node",
          "// 测试用假引擎：模拟 java 存在但子进程立即异常退出（安全软件阻止场景）",
          "process.exit(1);"
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
    await bridge.start()

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
    await bridge.start()
    // spawn 后立即处于 starting（健康端点尚未确认），与旧版 running 同义但语义更准
    expect(bridge.getState().kind).toBe("starting")

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

  it("健康探测超时：状态从 starting 进入 unhealthy（health-timeout）", async () => {
    const fakeJava = writeFakeJava(workDir, "serve")
    const bridge = new JavaBridge(makeConfig({
      javaExecutablePath: fakeJava,
      readyTimeoutMs: 400
    }))
    await bridge.start()
    const initialState = bridge.getState()
    expect(initialState.kind).toBe("starting")

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
    await bridge.start()
    await bridge.waitForReady()
    const unhealthy = bridge.getState()
    expect(unhealthy.kind).toBe("unhealthy")

    const oldPid = unhealthy.kind === "unhealthy" ? unhealthy.pid : -1
    expect(oldPid).toBeGreaterThan(0)
    expect(isAlive(oldPid)).toBe(true)

    // retry 现在会等待旧进程真正退出（SIGTERM -> 宽限期 -> SIGKILL）后再 spawn
    await bridge.retry()
    // retry 本身不等新进程的 spawn 完成；轮询直到 state 进入 starting
    const waitDeadline = Date.now() + 3000
    while (bridge.getState().kind !== "starting" && Date.now() < waitDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
    const newState = bridge.getState()
    expect(newState.kind).toBe("starting")
    const newPid = newState.kind === "starting" ? newState.pid : -1
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
    await bridge.start()
    const state = bridge.getState()
    // 进程在 starting / running / unhealthy 中任一即可（都表示已 spawn）
    const pid = (state.kind === "starting" || state.kind === "running" || state.kind === "unhealthy")
      ? state.pid
      : -1
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
    await bridge.start()
    expect(bridge.getState().kind).toBe("starting")
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
    await bridge.start()
    expect(bridge.getState().kind).toBe("crashed")
    expect(bridge.getFailureReason()).toBe("jar-missing")
    await bridge.dispose()
  })

  // ── 启动中状态（与"运行中"明确区分，避免 UI 显示矛盾） ────────────
  // 引擎被 spawn 之后、waitForReady 探测完成之前，状态为 starting：
  // - 进程已存在但健康端点尚未确认；
  // - UI 据此显示「本地引擎启动中…」而非「引擎运行中」+ 同时「引擎不可用」；
  // - waitForReady 成功后自动进入 running。
  describe("启动中状态（区分 starting / running）", () => {
    it("spawn 后立即可见 starting，waitForReady 成功后变为 running", async () => {
      const fakeJava = writeFakeJava(workDir, "serve")
      const bridge = new JavaBridge(makeConfig({
        javaExecutablePath: fakeJava,
        // 故意给 1.5s 探测窗口，便于观察到 starting 状态
        readyTimeoutMs: 1500
      }))
      await bridge.start()
      const immediateState = bridge.getState()
      // 进程已 spawn 但 health 探测尚未完成 → starting
      expect(immediateState.kind).toBe("starting")
      if (immediateState.kind === "starting") {
        expect(immediateState.pid).toBeGreaterThan(0)
      }
      // 等待 health 端点（假 java 不会起 HTTP 端点，会超时进入 unhealthy）
      await bridge.waitForReady()
      const afterReady = bridge.getState()
      // 假 java 不模拟 health → 必然超时
      expect(afterReady.kind).toBe("unhealthy")
      await bridge.dispose()
    })
  })

  // ── 异步启动与退出竞态 ──────────────────────────────────────────
  // retry() 必须等待 start() 完成（含端口探测与 spawn）后返回；
  // 应用退出（dispose）期间，即使 start() 仍在等待端口探测也不得继续 spawn；
  // 不留下后台 Java 进程；waitForReady() 在 dispose 后应快速返回而非挂起。
  describe("异步启动与退出竞态", () => {
    it("retry() 等待 start() 完成后再返回（返回时新进程已 spawn，处于 starting）", async () => {
      const fakeJava = writeFakeJava(workDir, "serve")
      const bridge = new JavaBridge(makeConfig({
        javaExecutablePath: fakeJava,
        readyTimeoutMs: 400
      }))
      await bridge.start()
      await bridge.waitForReady() // → unhealthy（假 java 无健康端点）
      expect(bridge.getState().kind).toBe("unhealthy")

      await bridge.retry()
      // retry 返回时新进程已 spawn：状态必须是 starting（无需轮询等待）
      const state = bridge.getState()
      expect(state.kind).toBe("starting")
      if (state.kind === "starting") {
        expect(state.pid).toBeGreaterThan(0)
      }
      await bridge.dispose()
    }, 20000)

    it("dispose 后再 start 不再 spawn（shuttingDown 守卫）", async () => {
      const fakeJava = writeFakeJava(workDir, "serve")
      const bridge = new JavaBridge(makeConfig({
        javaExecutablePath: fakeJava,
        readyTimeoutMs: 300
      }))
      await bridge.dispose() // 触发 shuttingDown
      await bridge.start()
      // 未 spawn：保持 stopped，且无子进程
      expect(bridge.getState().kind).toBe("stopped")
      await bridge.dispose()
    })

    it("退出期间 start() 正在等待端口探测：dispose 后不再 spawn（不留下后台进程）", async () => {
      const fakeJava = writeFakeJava(workDir, "serve")
      // 注入慢速端口探测：让 start() 卡在探测阶段，便于验证 dispose 竞态
      const bridge = new JavaBridge(makeConfig({
        javaExecutablePath: fakeJava,
        readyTimeoutMs: 300,
        portProbe: async () => {
          await new Promise((resolve) => setTimeout(resolve, 150))
          return 59973
        }
      }))
      const startPromise = bridge.start() // 进入端口探测（未 spawn）
      // 等一拍，确保 start 已进入探测
      await new Promise((resolve) => setTimeout(resolve, 30))
      await bridge.dispose() // 退出：置 shuttingDown
      await startPromise
      // 探测完成后检测到 shuttingDown，不得 spawn
      expect(bridge.getState().kind).toBe("stopped")
      await bridge.dispose()
    }, 15000)

    it("waitForReady() 在 dispose 后快速返回（不挂起等待完整超时）", async () => {
      const fakeJava = writeFakeJava(workDir, "serve")
      const bridge = new JavaBridge(makeConfig({
        javaExecutablePath: fakeJava,
        readyTimeoutMs: 20000 // 故意给长超时，验证 dispose 后不等待
      }))
      await bridge.start()
      expect(bridge.getState().kind).toBe("starting")
      await bridge.dispose()

      const startedAt = Date.now()
      const ready = await bridge.waitForReady()
      const elapsed = Date.now() - startedAt
      expect(ready).toBe(false)
      // 远小于 20s 超时：dispose 后轮询立即中止
      expect(elapsed).toBeLessThan(2000)
    }, 15000)

    it("并发 start 调用去重：不会 spawn 两个进程", async () => {
      // 假 java（CommonJS .js，支持 require）：把自己的 pid 追加到日志文件，便于统计 spawn 次数
      const pidLog = join(workDir, "pid-log.txt")
      const pidJava = join(workDir, "fake-java-pidlog.js")
      writeFileSync(pidJava, [
        "#!/usr/bin/env node",
        "const fs = require('node:fs');",
        `fs.appendFileSync(${JSON.stringify(pidLog)}, String(process.pid) + '\\n');`,
        "setInterval(() => {}, 1000);"
      ].join("\n") + "\n")
      chmodSync(pidJava, 0o755)
      writeFileSync(pidLog, "")

      const bridge = new JavaBridge(makeConfig({
        javaExecutablePath: pidJava,
        readyTimeoutMs: 300,
        portProbe: async () => {
          await new Promise((resolve) => setTimeout(resolve, 80))
          return 59974
        }
      }))
      await Promise.all([bridge.start(), bridge.start()])
      const state = bridge.getState()
      expect(state.kind).toBe("starting")

      // 等待两个子进程都写入 pid 日志
      const deadline = Date.now() + 5000
      let lines: string[] = []
      while (Date.now() < deadline) {
        lines = readFileSync(pidLog, "utf8").split("\n").filter((l) => l.length > 0)
        if (lines.length >= 1) {
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      // 只 spawn 了 1 个进程（去重生效）
      expect(new Set(lines).size).toBe(1)
      await bridge.dispose()
    }, 15000)
  })

  // ── 端口占用：8099 被占用时自动选择可用回环端口 ────────────
  // 实际生产中可能与其他应用冲突；自动换端口让用户无需手动改环境变量。
  // 选定的端口通过 getActualBaseUrl() 暴露给前端，前端重新指向新地址。
  describe("端口自动选择", () => {
    it("getActualBaseUrl 暴露带端口的最终 baseUrl", () => {
      const bridge = new JavaBridge(makeConfig({}))
      expect(bridge.getActualBaseUrl()).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    })

    it("默认 baseUrl 端口与配置一致", () => {
      const bridge = new JavaBridge(makeConfig({ baseUrl: "http://127.0.0.1:8123" }))
      expect(bridge.getActualBaseUrl()).toBe("http://127.0.0.1:8123")
    })

    // ── 动态端口 → 前端时序契约（P1-1） ──
    // 生产窗口在 start()（含端口探测）完成后再创建；渲染进程经 getEngineBaseUrl IPC
    // 读到 getActualBaseUrl()。本用例验证「start() 完成后 getActualBaseUrl() 已是最终端口」。
    it("start() 完成后 getActualBaseUrl() 为最终端口（窗口创建后可经 IPC 拿到）", async () => {
      const fakeJava = writeFakeJava(workDir, "serve")
      const bridge = new JavaBridge(makeConfig({
        javaExecutablePath: fakeJava,
        readyTimeoutMs: 300,
        baseUrl: "http://127.0.0.1:8099",
        portProbe: async () => {
          await new Promise((resolve) => setTimeout(resolve, 40))
          return 8123 // 模拟 8099 被占用 → 自动换到 8123
        }
      }))
      expect(bridge.getActualBaseUrl()).toBe("http://127.0.0.1:8099") // 探测前仍是默认
      await bridge.start()
      // start() 完成后（含端口探测 + spawn），最终端口已确定
      expect(bridge.getActualBaseUrl()).toBe("http://127.0.0.1:8123")
      await bridge.dispose()
    }, 15000)

    // ── 重试前重置实际地址（P1-3） ──
    // 首次使用备用端口后，重试时若默认端口已释放，应恢复默认端口，
    // 而不是继续复用旧备用端口（旧备用端口被占用会导致重试仍然失败）。
    it("重试前重置实际引擎地址：8099 释放后恢复默认端口", async () => {
      const fakeJava = writeFakeJava(workDir, "serve")
      let probeCall = 0
      const bridge = new JavaBridge(makeConfig({
        javaExecutablePath: fakeJava,
        readyTimeoutMs: 300,
        baseUrl: "http://127.0.0.1:8099",
        portProbe: async () => {
          probeCall++
          // 第一次探测：8099 被占用 → 8123；重试后：8099 已释放 → 8099
          return probeCall === 1 ? 8123 : 8099
        }
      }))
      await bridge.start()
      expect(bridge.getActualBaseUrl()).toBe("http://127.0.0.1:8123")

      await bridge.retry()
      // 重试前已重置为配置默认并重新探测：8099 空闲 → 恢复 8099
      expect(bridge.getActualBaseUrl()).toBe("http://127.0.0.1:8099")
      await bridge.dispose()
    }, 20000)

    // ── 重试代次隔离（P1-2） ──
    // 重试后旧的 waitForReady 探测结果不得把新引擎标记为 unhealthy。
    it("重试后旧 waitForReady 不把新引擎标记为 unhealthy", async () => {
      const fakeJava = writeFakeJava(workDir, "serve")
      const bridge = new JavaBridge(makeConfig({
        javaExecutablePath: fakeJava,
        readyTimeoutMs: 5000 // 故意长超时，让旧探测持续进行
      }))
      await bridge.start()
      expect(bridge.getState().kind).toBe("starting")

      // 启动旧代次的 waitForReady（不 await，让它持续轮询）
      const oldWait = bridge.waitForReady()
      await new Promise((resolve) => setTimeout(resolve, 120))

      // 重试：代次递增，spawn 新引擎
      await bridge.retry()
      expect(bridge.getState().kind).toBe("starting")

      // 旧探测结果必须作废：resolve 为 false，且不触碰新引擎状态
      const oldResult = await oldWait
      expect(oldResult).toBe(false)
      const afterOld = bridge.getState()
      // 新引擎仍是 starting（未被旧探测误标为 unhealthy）
      expect(afterOld.kind).toBe("starting")
      await bridge.dispose()
    }, 20000)
  })

  // ── 启动失败细化：runtime-blocked 只用于 EACCES/EPERM 等明确被阻止的启动错误 ──
  // 普通 JAR 错误、Spring Boot 初始化失败、参数错误（非零退出）归类 start-failed；
  // 只有 EACCES/EPERM（如 Windows 安全软件拒绝执行）才归类 runtime-blocked。
  describe("启动失败细化", () => {
    it("java 文件存在但子进程立即异常退出（exit 1）：归类 start-failed（不是 runtime-blocked）", async () => {
      const fakeJava = writeFakeJava(workDir, "boom")
      const bridge = new JavaBridge(makeConfig({
        javaExecutablePath: fakeJava,
        readyTimeoutMs: 300
      }))
      await bridge.start()
      // 等待子进程 exit 事件处理（exit 事件是异步的）
      const deadline = Date.now() + 2000
      while (Date.now() < deadline && bridge.getState().kind !== "crashed") {
        await new Promise((resolve) => setTimeout(resolve, 30))
      }
      const state = bridge.getState()
      expect(state.kind).toBe("crashed")
      // 普通非零退出（JAR/Spring/参数错误）→ start-failed
      expect(bridge.getFailureReason()).toBe("start-failed")
      await bridge.dispose()
    })

    it("不同退出码（exit 3）同样归类 start-failed", async () => {
      const exitThree = join(workDir, "fake-java-exit3.mjs")
      writeFileSync(exitThree, "#!/usr/bin/env node\nprocess.exit(3);\n")
      chmodSync(exitThree, 0o755)
      const bridge = new JavaBridge(makeConfig({
        javaExecutablePath: exitThree,
        readyTimeoutMs: 300
      }))
      await bridge.start()
      const deadline = Date.now() + 2000
      while (Date.now() < deadline && bridge.getState().kind !== "crashed") {
        await new Promise((resolve) => setTimeout(resolve, 30))
      }
      expect(bridge.getState().kind).toBe("crashed")
      expect(bridge.getFailureReason()).toBe("start-failed")
      await bridge.dispose()
    })

    it("spawn 错误 EACCES（运行时存在但不可执行/被安全软件阻止）：归类 runtime-blocked", async () => {
      // 文件存在但不可执行 → Node spawn 抛 EACCES（与 Windows 安全软件拒绝执行同类）
      const notExecutable = join(workDir, "fake-java-not-executable.mjs")
      writeFileSync(notExecutable, "#!/usr/bin/env node\nprocess.exit(0);\n")
      chmodSync(notExecutable, 0o644) // 去掉执行位
      const bridge = new JavaBridge(makeConfig({
        javaExecutablePath: notExecutable,
        readyTimeoutMs: 300
      }))
      await bridge.start()
      const deadline = Date.now() + 3000
      while (Date.now() < deadline && bridge.getState().kind !== "crashed") {
        await new Promise((resolve) => setTimeout(resolve, 30))
      }
      const state = bridge.getState()
      expect(state.kind).toBe("crashed")
      expect(bridge.getFailureReason()).toBe("runtime-blocked")
      await bridge.dispose()
    }, 15000)

    it("classifySpawnError 纯函数：EACCES/EPERM→runtime-blocked，其它→start-failed/runtime-missing", async () => {
      const { classifySpawnError } = await import("./JavaBridge")
      expect(classifySpawnError({ code: "EACCES" }, true)).toBe("runtime-blocked")
      expect(classifySpawnError({ code: "EPERM" }, true)).toBe("runtime-blocked")
      expect(classifySpawnError({ code: "EACCES" }, false)).toBe("runtime-blocked")
      expect(classifySpawnError({ code: "ENOENT" }, true)).toBe("start-failed")
      expect(classifySpawnError({ code: "ENOENT" }, false)).toBe("runtime-missing")
      expect(classifySpawnError(new Error("boom"), true)).toBe("start-failed")
      expect(classifySpawnError("not-an-error", true)).toBe("start-failed")
    })
  })

  // ── 启动日志增强：包含 Windows/macOS 系统信息、架构、jar/jar 路径、退出码 ──
  // 帮助朋友/支持团队根据反馈的日志快速判断问题（操作系统、架构、java 路径、jar 路径、错误细节）
  describe("启动日志增强", () => {
    it("启动时向日志写入 OS/arch/jar/java 路径/退出码", async () => {
      const logPath = join(workDir, "diag-log", "engine.log")
      const fakeJava = writeFakeJava(workDir, "boom")
      const bridge = new JavaBridge(makeConfig({
        javaExecutablePath: fakeJava,
        logPath
      }))
      await bridge.start()
      // 轮询等待子进程退出 + 日志落盘（含 exit= 记录）
      // OS 文件写入可能存在 buffer；最多等 8s 避免 CI 慢机器偶发失败
      const deadline = Date.now() + 8000
      let content = ""
      while (Date.now() < deadline) {
        if (existsSync(logPath)) {
          content = readFileSync(logPath, "utf8")
          if (content.includes("platform=") && content.includes("exit=")) {
            break
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      // 启动横幅包含可机器解析的键值对，便于日志分析
      expect(content).toMatch(/\[engine-start\][\s\S]*platform=/)
      expect(content).toMatch(/arch=/)
      expect(content).toMatch(/jar=/)
      expect(content).toMatch(/java=/)
      // 子进程退出后记录退出信息（含 exit code/signal）
      expect(content).toMatch(/exit=/)
      await bridge.dispose()
    })
  })
})
