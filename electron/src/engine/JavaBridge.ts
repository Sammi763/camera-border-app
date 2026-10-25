import { spawn, type ChildProcess } from "node:child_process"
import { existsSync, mkdirSync, createWriteStream, type WriteStream } from "node:fs"
import { createServer } from "node:net"
import { dirname } from "node:path"
import { pollEngineHealth } from "./engineHealth.js"
import type { EngineConfig } from "./engineConfig.js"

/** 引擎进程状态。 */
export type JavaBridgeState =
  | {
      readonly kind: "stopped"
    }
  | {
      /**
       * 进程已 spawn，但健康端点尚未确认就绪。
       * 区分于 running：UI 在此期间显示「本地引擎启动中…」而非「引擎运行中」，
       * 避免与「引擎不可用」状态同时出现的矛盾。
       */
      readonly kind: "starting"
      readonly pid: number
    }
  | {
      readonly kind: "running"
      readonly pid: number
    }
  | {
      /** 进程存活但健康检查超时：不能继续视为「正常 running」。 */
      readonly kind: "unhealthy"
      readonly pid: number
      readonly reason: EngineFailureReason
    }
  | {
      readonly kind: "crashed"
      readonly exitCode: number | null
      readonly signal: NodeJS.Signals | null
      readonly reason: EngineFailureReason
    }

/** 引擎启动失败原因分类（供诊断页面展示）。 */
export type EngineFailureReason =
  | "jar-missing"
  | "runtime-missing"
  | "runtime-blocked"
  | "start-failed"
  | "port-conflict"
  | "health-timeout"
  | null

/**
 * spawn 错误分类（纯函数，便于单元测试）。
 *
 * 只有明确的 EACCES / EPERM（运行时存在但不可执行 / 被安全软件阻止，如 Windows
 * Defender / SmartScreen 拒绝执行）才归类 runtime-blocked；
 * 其余 spawn 错误（ENOENT 等）按运行时是否存在归类 runtime-missing / start-failed。
 */
export const classifySpawnError = (
  err: unknown,
  runtimeExists: boolean
): Extract<EngineFailureReason, "runtime-blocked" | "runtime-missing" | "start-failed"> => {
  const code = err !== null && typeof err === "object"
    ? (err as NodeJS.ErrnoException).code
    : undefined
  if (code === "EACCES" || code === "EPERM") {
    return "runtime-blocked"
  }
  return runtimeExists ? "start-failed" : "runtime-missing"
}

/** SIGTERM 后等待进程自行退出的宽限期，超时改用 SIGKILL。 */
const TERMINATE_GRACE_MS = 3000

/** 默认引擎端口；被自动端口选择覆盖时取 availableBaseUrl.port。 */
const DEFAULT_ENGINE_PORT = 8099
/** 端口自动选择探测上限（避免无穷尝试）。 */
const PORT_PROBE_MAX = 20

/**
 * 尝试在 host 上 bind 一个空闲端口（用于引擎端口自动选择）。
 * 成功时关闭并返回端口号；失败时返回 null。
 * 含总超时（防止极少数边界情况下 server 事件未触发导致永久挂起）。
 */
const probeFreePort = (host: string, start: number, timeoutMs: number = 1500): Promise<number | null> => {
  return new Promise((resolve) => {
    const server = createServer()
    server.unref()
    let port = start
    let attempts = 0
    const finish = (result: number | null): void => {
      try {
        server.removeAllListeners()
        server.close(() => resolve(result))
      } catch {
        resolve(result)
      }
    }
    const onError = (): void => {
      attempts++
      if (attempts > PORT_PROBE_MAX) {
        finish(null)
        return
      }
      port++
      tryListen()
    }
    const onListening = (): void => {
      finish(port)
    }
    const tryListen = (): void => {
      server.once("error", onError)
      server.once("listening", onListening)
      server.listen(port, host)
    }
    setTimeout(() => finish(null), timeoutMs).unref?.()
    tryListen()
  })
}

/**
 * 管理本地 Java 渲染引擎子进程的生命周期。
 *
 * 该类职责最小化：启动引擎、跟踪进程状态、通过 /api/health 端点
 * 探测就绪状态、把 stdout/stderr 落盘、退出时终止子进程。不实现任何 IPC——
 * 渲染进程直接轮询健康端点获取实时状态。
 *
 * 运行时策略：
 * - requireBundledRuntime = true（打包模式）：找不到随包 Java 时直接进入
 *   runtime-missing 失败分类，绝不回退系统 PATH 的 java；
 * - requireBundledRuntime = false（开发模式）：允许回退系统 Java。
 *
 * 健康超时策略：
 * - 探测超时且进程仍存活时进入 unhealthy 状态（reason=health-timeout），
 *   不再保持「正常 running」；重试会终止旧进程后重新 spawn。
 */
export class JavaBridge {
  readonly #config: EngineConfig
  #state: JavaBridgeState = { kind: "stopped" }
  #child: ChildProcess | null = null
  #failureReason: EngineFailureReason = null
  #logStream: WriteStream | null = null
  /** 日志系统不可用时的中文原因（供诊断页展示），null 表示日志正常。 */
  #logWarning: string | null = null
  /**
   * 引擎实际 baseUrl：默认与 config.baseUrl 一致；启动时若默认端口被占用，
   * 改为 127.0.0.1:<自动选择端口>。主进程诊断与 app:// 安全代理读取最终地址。
   */
  #actualBaseUrl: string
  /**
   * 退出标记：dispose() 置位后，仍在进行中的 start()（含端口探测阶段）不得再 spawn。
   * 防止应用退出期间产生孤儿 Java 进程。
   */
  #shuttingDown = false
  /**
   * 进行中的 start() Promise：并发 start/retry 调用共享同一启动流程，
   * 避免重复 spawn；retry() 等待该 Promise 即可确保「新进程已 spawn」后返回。
   */
  #startPromise: Promise<void> | null = null
  /**
   * 启动代次：每次 retry/dispose 递增。用于隔离「旧 waitForReady」——
   * 重试后旧的健康探测结果不得把新引擎标记为 unhealthy。
   */
  #generation = 0

  public constructor(config: EngineConfig) {
    this.#config = config
    this.#actualBaseUrl = config.baseUrl
  }

  public getState(): JavaBridgeState {
    return this.#state
  }

  /** 引擎启动失败原因（供诊断页面分类）。 */
  public getFailureReason(): EngineFailureReason {
    return this.#failureReason
  }

  /**
   * 引擎实际 baseUrl（含自动选择的端口）。
   * 启动前会异步探测默认端口是否被占用；被占用时自动选择下一个可用回环端口，
   * 并把最终地址写回 #actualBaseUrl 与本方法返回值。Renderer 不读取该地址。
   */
  public getActualBaseUrl(): string {
    return this.#actualBaseUrl
  }

  /**
   * 探测默认端口是否被占用；被占用时自动选下一个可用端口并更新 #actualBaseUrl。
   * 仅在生产路径被调用；开发模式可继续使用配置端口。
   */
  async #selectPortIfBusy(): Promise<void> {
    const initial = this.#config.baseUrl
    try {
      const parsed = new URL(initial)
      const host = parsed.hostname || "127.0.0.1"
      const startPort = Number.parseInt(parsed.port, 10)
      if (!Number.isFinite(startPort)) {
        return
      }
      // 先尝试探测默认端口；若空闲则保留
      const probe = this.#config.portProbe ?? probeFreePort
      const free = await probe(host, startPort)
      if (free === null) {
        return
      }
      if (free === startPort) {
        return
      }
      // 默认端口被占用，换到空闲端口
      const newUrl = `${parsed.protocol}//${host}:${free}`
      this.#actualBaseUrl = newUrl
      console.warn(`[java-bridge] 默认端口 ${startPort} 被占用，自动改用 ${free}（${newUrl}）`)
    } catch {
      // URL 解析失败时保留原配置
    }
  }

  /** 日志写入异常说明（null 表示日志正常或未配置日志）。 */
  public getLogWarning(): string | null {
    return this.#logWarning
  }

  /** 检查 jar 文件是否存在。 */
  public checkJarExists(): boolean {
    return existsSync(this.#config.jarPath)
  }

  /** 检查随包 Java 可执行文件是否存在（配置了时）。 */
  public checkJavaRuntimeExists(): boolean {
    const javaPath = this.#config.javaExecutablePath
    return javaPath !== undefined && javaPath.trim().length > 0 && existsSync(javaPath)
  }

  /** 引擎日志文件路径（可为空）。 */
  public getLogPath(): string | null {
    return this.#config.logPath ?? null
  }

  /**
   * 写入启动横幅到日志：含 OS/arch/jar/java 路径/启动时间，便于 Windows/macOS
   * 反馈时直接定位问题。
   */
  #writeStartupBanner(): void {
    const stream = this.#logStream
    if (stream === null) {
      return
    }
    const banner = [
      "[engine-start]",
      `platform=${process.platform}`,
      `arch=${process.arch}`,
      `node=${process.version}`,
      `jar=${this.#config.jarPath}`,
      `java=${this.#config.javaExecutablePath ?? "(未配置)"}`,
      `cwd=${this.#config.cwd}`,
      `baseUrl=${this.#actualBaseUrl}`,
      `requireBundledRuntime=${this.#config.requireBundledRuntime}`,
      `time=${new Date().toISOString()}`
    ].join(" ")
    try {
      stream.write(`${banner}\n`)
    } catch {
      // 横幅写入失败不影响引擎启动
    }
  }

  /** 记录本次托管 Java 子进程 PID，供打包 E2E 精确回收临时进程。 */
  #writeProcessPid(pid: number | undefined): void {
    if (this.#logStream === null) {
      return
    }
    try {
      this.#logStream.write(`[engine-process] pid=${pid ?? -1}\n`)
    } catch {
      // PID 记录失败不影响引擎运行；普通启动横幅仍保留。
    }
  }

  /**
   * 打开引擎日志写流（stdout/stderr 落盘）。
   * 启动前先递归创建日志目录；目录不存在/无权限时记录可解释的警告，
   * 不阻塞引擎启动本身。
   */
  #openLog(): WriteStream | null {
    const logPath = this.#config.logPath
    if (logPath === undefined || logPath.length === 0) {
      return null
    }
    try {
      mkdirSync(dirname(logPath), { recursive: true })
      const stream = createWriteStream(logPath, { flags: "a" })
      stream.on("error", () => {
        // 日志写入失败不影响引擎功能，仅记录警告
        if (this.#logWarning === null) {
          this.#logWarning = `引擎日志写入失败（${logPath}），不影响导出功能。`
        }
      })
      this.#logWarning = null
      return stream
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      this.#logWarning = `无法创建引擎日志目录或文件（${logPath}）：${detail}。不影响导出功能。`
      return null
    }
  }

  /** 解析本次启动使用的 java 可执行文件；打包模式缺失随包运行时返回 null 并归类 runtime-missing。 */
  #resolveJavaExecutable(): string | null {
    const bundled = this.#config.javaExecutablePath
    if (this.#config.requireBundledRuntime) {
      // 打包模式：必须使用随包运行时，禁止静默回退系统 Java
      if (!this.checkJavaRuntimeExists()) {
        console.error(
          `[java-bridge] 随包 Java Runtime 缺失：${bundled ?? "(未配置)"}\n` +
          `  打包产物必须携带 java-runtime（extraResources），不得要求用户安装 Java。\n` +
          `  已按 runtime-missing 进入诊断，不尝试系统 PATH 的 java。`
        )
        this.#failureReason = "runtime-missing"
        return null
      }
      return bundled!
    }
    // 开发模式：优先随包，回退系统 PATH
    if (bundled !== undefined && existsSync(bundled)) {
      return bundled
    }
    return "java"
  }

  /** 启动引擎子进程。重复调用安全：并发 start/retry 共享同一启动流程，避免重复 spawn。 */
  public async start(): Promise<void> {
    if (this.#shuttingDown) {
      // 应用退出期间不再启动
      return
    }
    if (this.#state.kind === "running" || this.#state.kind === "unhealthy" || this.#state.kind === "starting") {
      return
    }
    if (this.#startPromise !== null) {
      // 已有启动流程进行中（含端口探测阶段）：共享同一流程，retry 等待它即「新进程已 spawn」
      return this.#startPromise
    }
    const promise = this.#doStart()
    this.#startPromise = promise
    // 只登记一次清理；共享调用的 finally 不清除，避免第三个调用误触发新启动
    void promise.finally(() => {
      if (this.#startPromise === promise) {
        this.#startPromise = null
      }
    })
    await promise
  }

  /** 实际启动流程（jar/java 检查 → 端口探测 → spawn）。 */
  async #doStart(): Promise<void> {
    // 每次启动前重置实际引擎地址为配置默认：重试时若默认端口已释放会恢复默认，
    // 不会复用旧备用端口（若旧备用端口被其它程序占用，复用会导致重试仍然失败）。
    this.#actualBaseUrl = this.#config.baseUrl

    // 分类：jar 缺失
    if (!this.checkJarExists()) {
      console.error(
        `[java-bridge] 引擎 jar 文件不存在：${this.#config.jarPath}\n` +
        `  工作目录：${this.#config.cwd}`
      )
      this.#failureReason = "jar-missing"
      this.#state = { kind: "crashed", exitCode: null, signal: null, reason: "jar-missing" }
      return
    }

    const javaExecutable = this.#resolveJavaExecutable()
    if (javaExecutable === null) {
      // runtime-missing（打包模式缺随包运行时）
      this.#state = { kind: "crashed", exitCode: null, signal: null, reason: "runtime-missing" }
      return
    }

    // 默认端口被占用时自动换端口（在 spawn 之前完成，避免冲突）
    await this.#selectPortIfBusy()

    // 退出竞态：dispose() 可能在端口探测期间被调用；探测完成后若正在退出，不得 spawn
    if (this.#shuttingDown) {
      return
    }

    try {
      // Spring Boot 端口参数：与最终 baseUrl 同源（自动选择后的端口）
      const finalPort = (() => {
        try {
          return new URL(this.#actualBaseUrl).port
        } catch {
          return this.#config.serverPort
        }
      })()
      const serverArgs = finalPort !== undefined && finalPort.length > 0
        ? [`--server.port=${finalPort}`]
        : []

      // 先创建并登记日志流，再 spawn 子进程，避免极早期启动输出在监听器绑定前丢失。
      const logStream = this.#openLog()
      if (logStream !== null) {
        this.#logStream = logStream
      }
      this.#writeStartupBanner()

      const child = spawn(javaExecutable, ["-jar", this.#config.jarPath, ...serverArgs], {
        cwd: this.#config.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        // 注入主进程准备好的随包组件路径，不透传无关改动
        env: { ...process.env, ...(this.#config.env ?? {}) }
      })

      // 引擎输出落盘（日志文件），不直接倾倒到终端
      if (logStream !== null) {
        child.stdout?.on("data", (chunk: Buffer) => logStream.write(chunk))
        child.stderr?.on("data", (chunk: Buffer) => logStream.write(chunk))
      }

      this.#child = child
      this.#writeProcessPid(child.pid)
      // spawn 成功但尚未确认就绪：进入 starting
      this.#state = { kind: "starting", pid: child.pid ?? -1 }
      this.#failureReason = null

      // 归属守卫：retry()/dispose() 终止旧进程后，旧进程的 exit/error 事件
      // 不能覆盖新进程的状态。
      child.on("exit", (code, signal) => {
        if (this.#child !== child) {
          return
        }
        this.#child = null
        // 记录退出信息便于排障（必须在 closeLog 之前写入，否则流已关闭）
        const exitInfo = `exit=${code ?? "null"} signal=${signal ?? "null"}`
        if (this.#logStream !== null) {
          try {
            this.#logStream.write(`[engine-exit] ${exitInfo}\n`)
          } catch {
            // 写入失败不影响主流程
          }
        }
        // 异步关闭日志流（exit 路径下不阻塞事件循环，后台 flush 即可）
        void this.#closeLog()
        // 非零退出码或信号表示引擎未正常关闭；
        // 正常退出（code 0，无信号）则回到 stopped。
        if (signal !== null || (code !== null && code !== 0)) {
          // 普通非零退出（JAR 错误、Spring Boot 初始化失败、参数错误等）→ start-failed。
          // 不把「有 java 文件」当作 runtime-blocked 的判据：只有 EACCES/EPERM
          // 这类明确被安全软件阻止的 spawn 错误才归类 runtime-blocked（见 classifySpawnError）。
          const reason: EngineFailureReason = "start-failed"
          this.#state = {
            kind: "crashed",
            exitCode: code,
            signal: signal,
            reason
          }
          if (this.#failureReason === null) {
            this.#failureReason = reason
          }
          console.error(
            `[java-bridge] 引擎子进程异常退出（${exitInfo}）\n` +
            `  原因归类：${reason}（若为 Windows 安全软件阻止，请检查 Defender/SmartScreen 白名单）\n` +
            `  jar：${this.#config.jarPath}\n` +
            `  java：${javaExecutable}`
          )
        } else if (this.#state.kind !== "unhealthy") {
          this.#state = { kind: "stopped" }
        }
      })

      child.on("error", (err) => {
        if (this.#child !== child) {
          return
        }
        this.#child = null
        void this.#closeLog()
        // EACCES/EPERM → runtime-blocked（安全软件拒绝执行）；
        // 其它 spawn 错误按运行时是否存在归类 runtime-missing / start-failed。
        const reason = classifySpawnError(err, this.checkJavaRuntimeExists())
        this.#failureReason = reason
        this.#state = {
          kind: "crashed",
          exitCode: null,
          signal: null,
          reason
        }
        console.error(
          `[java-bridge] 引擎子进程启动失败\n` +
          `  jar 路径：${this.#config.jarPath}\n` +
          `  java 可执行文件：${javaExecutable}\n` +
          `  工作目录：${this.#config.cwd}\n` +
          `  错误原因：${err.message}\n` +
          `  原因归类：${reason}`
        )
      })
    } catch (err) {
      this.#child = null
      void this.#closeLog()
      this.#failureReason = "start-failed"
      this.#state = {
        kind: "crashed",
        exitCode: null,
        signal: null,
        reason: "start-failed"
      }
      console.error(
        `[java-bridge] 引擎 spawn 异常\n` +
        `  jar 路径：${this.#config.jarPath}\n` +
        `  工作目录：${this.#config.cwd}\n` +
        `  错误原因：${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /** 关闭日志写流：等待已缓冲的写入落盘后再关闭，避免 dispose 后日志为空。 */
  async #closeLog(): Promise<void> {
    const stream = this.#logStream
    this.#logStream = null
    if (stream === null) {
      return
    }
    try {
      await new Promise<void>((resolve) => {
        // stream.end(callback) 的回调在 'finish' 事件后触发；
        // 同时监听 'error' 兜底，避免流已损坏时永久挂起。
        const done = (): void => resolve()
        stream.once("error", done)
        stream.end(done)
      })
    } catch {
      // 忽略关闭失败
    }
  }

  /**
   * 轮询引擎健康端点，直到成功响应或超时。
   * 超时且进程仍存活时进入 unhealthy（health-timeout），不再保持 starting/running。
   * 探测期间持续是 starting（避免 UI 看到"运行中"+"不可用"同时存在）。
   *
   * 退出竞态：dispose() 后（#shuttingDown）或子进程已不存在时立即停止轮询，
   * 不会挂起等待完整超时，也不把已退出的进程标记为 unhealthy。
   */
  public async waitForReady(): Promise<boolean> {
    // 捕获代次：retry()/dispose() 递增后，本次探测结果作废（不得触碰新引擎状态）
    const gen = this.#generation
    const healthUrl = `${this.#actualBaseUrl}/api/health`
    const ready = await pollEngineHealth(
      healthUrl,
      this.#config.readyTimeoutMs,
      () => gen !== this.#generation || this.#shuttingDown || this.#state.kind === "crashed" || this.#child === null
    )
    // 代次已变（重试/退出期间）：旧探测结果作废，不把新引擎标记为 unhealthy
    if (gen !== this.#generation) {
      return false
    }
    if (ready) {
      // 探测成功：把 starting 推进为 running
      if (this.#state.kind === "starting") {
        this.#state = { kind: "running", pid: this.#state.pid }
      }
      return true
    }
    if (this.#state.kind === "starting") {
      // 进程还活着但一直未就绪：标记为 unhealthy，故障页据此显示 health-timeout
      this.#failureReason = "health-timeout"
      this.#state = { kind: "unhealthy", pid: this.#state.pid, reason: "health-timeout" }
      console.warn("[java-bridge] 引擎健康探测超时，已标记为 unhealthy（进程仍在运行）")
    }
    return false
  }

  /** 标记端口冲突（引擎健康端点被其它进程占用时由诊断层调用）。 */
  public markPortConflict(): void {
    this.#failureReason = "port-conflict"
  }

  /**
   * 等待子进程完全关闭：进程退出 + stdio 流关闭（所有 stdout/stderr 数据已到达父进程）。
   * 必须在关闭日志流之前 await，避免日志数据丢失。
   * 先 SIGTERM，宽限期内未关闭则 SIGKILL。
   */
  async #waitForExit(child: ChildProcess, graceMs: number): Promise<void> {
    // 如果进程已退出但 stdio 仍在 drain，'close' 可能很快触发或已经触发过。
    // 优先检查 stdio 流的 destroyed 标志，避免对已关闭的流挂起等待。
    const stdoutClosed = child.stdout === null || child.stdout.destroyed
    const stderrClosed = child.stderr === null || child.stderr.destroyed
    if (child.exitCode !== null && stdoutClosed && stderrClosed) {
      return
    }
    await new Promise<void>((resolve) => {
      let settled = false
      const finish = (): void => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        // 给最后一次 'data' 事件一拍时间进入我们的 logStream.write 队列，
        // 避免关闭日志流时还有数据未入队。
        setImmediate(() => resolve())
      }
      // 'close' 在 'exit' 之后触发，且在所有 stdio 流关闭（pipe 排空）之后触发。
      // 监听 'close' 才能保证所有 'data' 事件已到达父进程。
      child.once("close", finish)
      // 如果进程还活着就发 SIGTERM
      if (child.exitCode === null) {
        try {
          child.kill("SIGTERM")
        } catch {
          // 子进程可能已退出
        }
      }
      const timer = setTimeout(() => {
        try {
          if (child.exitCode === null) {
            child.kill("SIGKILL")
          }
        } catch {
          // 忽略：进程可能刚好退出
        }
        // SIGKILL 后再给一段缓冲，确保 OS 回收 pid、释放端口并关闭 stdio
        setTimeout(finish, 300)
      }, graceMs)
      timer.unref?.()
    })
  }

  /**
   * 重试启动引擎：终止旧进程（含 unhealthy 存活进程）并重新 spawn。
   *
   * 必须是 async：先 await 旧进程真正退出（SIGTERM -> 宽限期 -> SIGKILL），
   * 再 spawn 新进程；否则旧进程未释放端口时新进程会立即 port-conflict。
   *
   * 必须 await start()：start() 完成（含端口探测与 spawn）后 retry 才返回，
   * 调用方（IPC）随后启动 waitForReady()，保证探测在新进程 spawn 之后。
   * 若已有启动流程进行中（#startPromise 非空），start() 共享该流程并等待其完成。
   */
  public async retry(): Promise<void> {
    await this.#disposeChild()
    // 复位状态后再启动：unhealthy / crashed 状态会阻止 start()，必须先回到 stopped
    this.#generation++
    this.#state = { kind: "stopped" }
    this.#failureReason = null
    await this.start()
  }

  /**
   * 终止当前子进程：先 SIGTERM 并等待完全关闭（exit + stdio drain），
   * 最后再关闭日志流。这样能保证所有子进程输出都已进入日志缓冲，
   * 关闭日志流时再 flush 落盘，避免日志数据丢失。
   *
   * 顺序很重要：关闭日志必须在子进程完全关闭之后，否则正在传输的
   * stdout/stderr 数据会写入已关闭的流而被丢弃。
   */
  async #disposeChild(): Promise<void> {
    const child = this.#child
    this.#child = null
    if (child === null) {
      await this.#closeLog()
      return
    }
    // 等待子进程完全关闭（exit + stdio drain），确保所有 'data' 事件已触发
    await this.#waitForExit(child, TERMINATE_GRACE_MS)
    // 现在所有子进程输出已进入日志流缓冲，flush 并关闭
    await this.#closeLog()
  }

  /** 如果引擎子进程仍在运行则终止它。 */
  public async dispose(): Promise<void> {
    // 置退出标记：仍在进行中的 start()（含端口探测）探测完成后不得再 spawn，
    // 避免应用退出期间产生孤儿 Java 进程。递增代次：作废所有在途 waitForReady。
    this.#shuttingDown = true
    this.#generation++
    await this.#disposeChild()
    this.#state = { kind: "stopped" }
    this.#failureReason = null
  }
}
