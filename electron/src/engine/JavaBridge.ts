import { spawn, type ChildProcess } from "node:child_process"
import { existsSync, mkdirSync, createWriteStream, type WriteStream } from "node:fs"
import { dirname } from "node:path"
import { pollEngineHealth } from "./engineHealth.js"
import type { EngineConfig } from "./engineConfig.js"

/** 引擎进程状态。 */
export type JavaBridgeState =
  | {
      readonly kind: "stopped"
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
    }

/** 引擎启动失败原因分类（供诊断页面展示）。 */
export type EngineFailureReason =
  | "jar-missing"
  | "runtime-missing"
  | "start-failed"
  | "port-conflict"
  | "health-timeout"
  | null

/** SIGTERM 后等待进程自行退出的宽限期，超时改用 SIGKILL。 */
const TERMINATE_GRACE_MS = 3000

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

  public constructor(config: EngineConfig) {
    this.#config = config
  }

  public getState(): JavaBridgeState {
    return this.#state
  }

  /** 引擎启动失败原因（供诊断页面分类）。 */
  public getFailureReason(): EngineFailureReason {
    return this.#failureReason
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

  /** 启动引擎子进程。重复调用时安全（已运行则直接返回）。 */
  public start(): void {
    if (this.#state.kind === "running" || this.#state.kind === "unhealthy") {
      return
    }

    // 分类：jar 缺失
    if (!this.checkJarExists()) {
      console.error(
        `[java-bridge] 引擎 jar 文件不存在：${this.#config.jarPath}\n` +
        `  工作目录：${this.#config.cwd}`
      )
      this.#failureReason = "jar-missing"
      this.#state = { kind: "crashed", exitCode: null }
      return
    }

    const javaExecutable = this.#resolveJavaExecutable()
    if (javaExecutable === null) {
      // runtime-missing（打包模式缺随包运行时）
      this.#state = { kind: "crashed", exitCode: null }
      return
    }

    try {
      // Spring Boot 端口参数：与 engineBaseUrl 同源（CAMBORDER_ENGINE_PORT 可覆盖）
      const serverArgs = this.#config.serverPort !== undefined
        ? [`--server.port=${this.#config.serverPort}`]
        : []

      // 先创建并登记日志流，再 spawn 子进程，避免极早期启动输出在监听器绑定前丢失。
      const logStream = this.#openLog()
      if (logStream !== null) {
        this.#logStream = logStream
      }

      const child = spawn(javaExecutable, ["-jar", this.#config.jarPath, ...serverArgs], {
        cwd: this.#config.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        // 注入主进程准备好的环境变量（如随包 LibRaw 路径），不透传无关改动
        env: { ...process.env, ...(this.#config.env ?? {}) }
      })

      // 引擎输出落盘（日志文件），不直接倾倒到终端
      if (logStream !== null) {
        child.stdout?.on("data", (chunk: Buffer) => logStream.write(chunk))
        child.stderr?.on("data", (chunk: Buffer) => logStream.write(chunk))
      }

      this.#child = child
      this.#state = { kind: "running", pid: child.pid ?? -1 }
      this.#failureReason = null

      // 归属守卫：retry()/dispose() 终止旧进程后，旧进程的 exit/error 事件
      // 不能覆盖新进程的状态。
      child.on("exit", (code, signal) => {
        if (this.#child !== child) {
          return
        }
        this.#child = null
        // 异步关闭日志流（exit 路径下不阻塞事件循环，后台 flush 即可）
        void this.#closeLog()
        // 非零退出码或信号表示引擎未正常关闭；
        // 正常退出（code 0，无信号）则回到 stopped。
        if (signal !== null || (code !== null && code !== 0)) {
          this.#state = { kind: "crashed", exitCode: code }
          if (this.#failureReason === null) {
            this.#failureReason = "start-failed"
          }
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
        this.#state = { kind: "crashed", exitCode: null }
        // EACCES/ENOENT 等：随包运行时不可执行（运行时损坏）或启动失败
        this.#failureReason = this.checkJavaRuntimeExists() ? "start-failed" : "runtime-missing"
        console.error(
          `[java-bridge] 引擎子进程启动失败\n` +
          `  jar 路径：${this.#config.jarPath}\n` +
          `  java 可执行文件：${javaExecutable}\n` +
          `  工作目录：${this.#config.cwd}\n` +
          `  错误原因：${err.message}`
        )
      })
    } catch (err) {
      this.#child = null
      void this.#closeLog()
      this.#state = { kind: "crashed", exitCode: null }
      this.#failureReason = "start-failed"
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
   * 超时且进程仍存活时进入 unhealthy（health-timeout），不再保持 running。
   */
  public async waitForReady(): Promise<boolean> {
    const healthUrl = `${this.#config.baseUrl}/api/health`
    const ready = await pollEngineHealth(
      healthUrl,
      this.#config.readyTimeoutMs,
      () => this.#state.kind === "crashed"
    )
    if (ready) {
      return true
    }
    if (this.#state.kind === "running") {
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
   */
  public async retry(): Promise<void> {
    await this.#disposeChild()
    // 复位状态后再启动：unhealthy / crashed 状态会阻止 start()，必须先回到 stopped
    this.#state = { kind: "stopped" }
    this.#failureReason = null
    this.start()
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
    await this.#disposeChild()
    this.#state = { kind: "stopped" }
    this.#failureReason = null
  }
}
