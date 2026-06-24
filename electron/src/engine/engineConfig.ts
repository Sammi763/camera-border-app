/**
 * 引擎相关配置。
 *
 * 存放引擎基础 URL、就绪探测超时等静态常量，
 * 以及引擎配置参数类型。
 */

/** 本地 Java 渲染引擎的基础 URL（Spring Boot 默认端口）。 */
export const ENGINE_BASE_URL = "http://127.0.0.1:8080"

/** 引擎健康探测超时时间（毫秒）。 */
export const ENGINE_READY_TIMEOUT_MS = 20_000

/** 引擎配置参数，在主进程启动时从配置和路径组装。 */
export type EngineConfig = {
  /** 引擎服务的基础 URL，例如 http://127.0.0.1:8080。 */
  readonly baseUrl: string
  /** 引擎 jar 文件的绝对路径。 */
  readonly jarPath: string
  /** 引擎子进程的工作目录。 */
  readonly cwd: string
  /** 引擎就绪探测的超时时间（毫秒）。 */
  readonly readyTimeoutMs: number
}
