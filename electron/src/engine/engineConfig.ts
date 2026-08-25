/**
 * 引擎相关配置。
 *
 * 存放引擎基础 URL、就绪探测超时等静态常量，
 * 以及引擎配置参数类型。
 */

/** 本地 Java 渲染引擎的基础 URL（本项目开发默认端口）。 */
export const ENGINE_BASE_URL = "http://127.0.0.1:8099"

/** 引擎健康探测超时时间（毫秒）。 */
export const ENGINE_READY_TIMEOUT_MS = 20_000

/** 引擎配置参数，在主进程启动时从配置和路径组装。 */
export type EngineConfig = {
  /** 引擎服务的基础 URL，例如 http://127.0.0.1:8099。 */
  readonly baseUrl: string
  /** 引擎 jar 文件的绝对路径。 */
  readonly jarPath: string
  /** 引擎子进程的工作目录。 */
  readonly cwd: string
  /** 引擎就绪探测的超时时间（毫秒）。 */
  readonly readyTimeoutMs: number
  /**
   * 随包提供的 Java 可执行文件绝对路径（打包模式）。
   * 开发模式可省略（回退到系统 PATH 中的 java）。
   */
  readonly javaExecutablePath?: string
  /**
   * 是否强制要求随包运行时。
   * 打包模式必须为 true：找不到随包 Java 时直接进入 runtime-missing 诊断，
   * 绝不静默回退系统 PATH 的 java（用户机器可能没有 Java）。
   * 开发模式为 false：允许回退系统 Java。
   */
  readonly requireBundledRuntime: boolean
  /** 引擎日志文件绝对路径（stdout/stderr 落盘，供故障排查）。 */
  readonly logPath?: string
  /** 注入引擎子进程的额外环境变量（如 CAMBORDER_LIBRAW_PATH）。 */
  readonly env?: Readonly<Record<string, string>> | undefined
  /** Spring Boot --server.port 参数值；缺省时使用引擎默认端口。 */
  readonly serverPort?: string | undefined
}
