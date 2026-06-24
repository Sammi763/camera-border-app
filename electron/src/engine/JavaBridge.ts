import { spawn, type ChildProcess } from "node:child_process"
import { existsSync } from "node:fs"
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
      readonly kind: "crashed"
      readonly exitCode: number | null
    }

/**
 * 管理本地 Java 渲染引擎子进程的生命周期。
 *
 * 该类职责最小化：启动引擎、跟踪进程状态、通过 /api/health 端点
 * 探测就绪状态、退出时终止子进程。不实现任何 IPC——
 * 渲染进程直接轮询健康端点获取实时状态。
 */
export class JavaBridge {
  readonly #config: EngineConfig
  #state: JavaBridgeState = { kind: "stopped" }
  #child: ChildProcess | null = null

  public constructor(config: EngineConfig) {
    this.#config = config
  }

  public getState(): JavaBridgeState {
    return this.#state
  }

  /**
   * 检查 jar 文件是否存在。
   * 托管模式下启动前应调用此方法，避免 spawn 后才报错。
   */
  public checkJarExists(): boolean {
    return existsSync(this.#config.jarPath)
  }

  /** 启动引擎子进程。重复调用时安全（已运行则直接返回）。 */
  public start(): void {
    if (this.#state.kind === "running") {
      return
    }

    if (!this.checkJarExists()) {
      console.error(
        `[java-bridge] 引擎 jar 文件不存在：${this.#config.jarPath}\n` +
        `  工作目录：${this.#config.cwd}\n` +
        `  请先执行 Maven 构建：mvn -f java-engine/pom.xml clean package`
      )
      this.#state = { kind: "crashed", exitCode: null }
      return
    }

    try {
      const child = spawn("java", ["-jar", this.#config.jarPath], {
        cwd: this.#config.cwd,
        stdio: "ignore"
      })

      this.#child = child
      this.#state = { kind: "running", pid: child.pid ?? -1 }

      child.on("exit", (code, signal) => {
        this.#child = null
        // 非零退出码或信号表示引擎未正常关闭；
        // 正常退出（code 0，无信号）则回到 stopped。
        if (signal !== null || (code !== null && code !== 0)) {
          this.#state = { kind: "crashed", exitCode: code }
        } else {
          this.#state = { kind: "stopped" }
        }
      })

      child.on("error", (err) => {
        this.#child = null
        this.#state = { kind: "crashed", exitCode: null }
        console.error(
          `[java-bridge] 引擎子进程启动失败\n` +
          `  jar 路径：${this.#config.jarPath}\n` +
          `  工作目录：${this.#config.cwd}\n` +
          `  错误原因：${err.message}`
        )
      })
    } catch (err) {
      this.#child = null
      this.#state = { kind: "crashed", exitCode: null }
      console.error(
        `[java-bridge] 引擎 spawn 异常\n` +
        `  jar 路径：${this.#config.jarPath}\n` +
        `  工作目录：${this.#config.cwd}\n` +
        `  错误原因：${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  /**
   * 轮询引擎健康端点，直到成功响应或超时。
   * 引擎崩溃或始终未就绪时返回 false。仅用于启动诊断——
   * 渲染进程会独立轮询健康端点。
   */
  public async waitForReady(): Promise<boolean> {
    const healthUrl = `${this.#config.baseUrl}/api/health`
    return pollEngineHealth(
      healthUrl,
      this.#config.readyTimeoutMs,
      () => this.#state.kind === "crashed"
    )
  }

  /** 如果引擎子进程仍在运行则终止它。 */
  public dispose(): void {
    const child = this.#child
    if (child !== null) {
      try {
        child.kill("SIGTERM")
      } catch {
        // 子进程可能已退出，无需处理
      }
    }

    this.#child = null
    this.#state = { kind: "stopped" }
  }
}
