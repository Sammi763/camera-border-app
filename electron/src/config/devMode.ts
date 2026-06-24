/**
 * 开发/生产模式集中配置。
 *
 * 判断逻辑：
 * - 环境变量 ELECTRON_RENDERER_URL 存在时为开发模式
 * - 否则为生产模式
 *
 * 所有 dev/prod 分支判断统一从此模块读取，避免 process.env 散落在多处。
 */

const rendererUrlEnv = process.env["ELECTRON_RENDERER_URL"]

/** 是否为开发模式。 */
export const isDevMode: boolean = typeof rendererUrlEnv === "string"
  && rendererUrlEnv.length > 0

/**
 * 渲染进程加载 URL。
 * - 开发模式：Vite dev server（由 ELECTRON_RENDERER_URL 指定）
 * - 生产模式：app:// 协议加载 frontend/dist
 */
export const rendererUrl: string = rendererUrlEnv ?? "app://app/index.html"

/** 引擎基础 URL，开发和生产均指向本地 8080。 */
export const engineBaseUrl: string = "http://127.0.0.1:8080"

/**
 * 引擎是否由桌面壳管理。
 * - 开发模式：false（由 IDEA 启动）
 * - 生产模式：true（Electron 通过 JavaBridge 启动 jar）
 */
export const engineManaged: boolean = !isDevMode
