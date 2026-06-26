import { BrowserWindow } from "electron"
import {
  APP_NAME,
  WINDOW_BACKGROUND_COLOR,
  WINDOW_DEFAULT_HEIGHT,
  WINDOW_DEFAULT_WIDTH,
  WINDOW_MIN_HEIGHT,
  WINDOW_MIN_WIDTH
} from "../config/appConfig.js"
import { isDevMode, rendererUrl } from "../config/devMode.js"
import { preloadPath } from "../paths/paths.js"

/** 开发模式下加载 Vite dev server 的最大重试次数。 */
const DEV_SERVER_MAX_RETRIES = 60
/** 每次重试间隔（毫秒）。 */
const DEV_SERVER_RETRY_INTERVAL = 500

/**
 * 等待 Vite dev server 就绪。
 *
 * 开发模式下 Vite 可能还没启动完成，Electron 直接 loadURL 会报 ERR_CONNECTION_REFUSED。
 * 此函数在开发模式下轮询直到 Vite 可连接，生产模式直接返回。
 */
const waitForDevServer = async (): Promise<void> => {
  if (!isDevMode) {
    return
  }

  for (let i = 0; i < DEV_SERVER_MAX_RETRIES; i++) {
    try {
      const response = await fetch(rendererUrl, { method: "HEAD" })
      // Vite 返回 200 或 404（SPA fallback）都表示已就绪
      if (response.ok || response.status === 404) {
        console.log(`[dev] Vite dev server 已就绪（第 ${i + 1} 次探测）`)
        return
      }
    } catch {
      // Vite 还没启动，等待后重试
    }
    await new Promise((resolve) => setTimeout(resolve, DEV_SERVER_RETRY_INTERVAL))
  }

  console.warn(
    `[dev] Vite dev server 在 ${DEV_SERVER_MAX_RETRIES * DEV_SERVER_RETRY_INTERVAL / 1000} 秒内未就绪。\n` +
    `  请确认已在前端目录运行 \`npm run dev\`（或 \`pnpm --filter frontend dev\`）。`
  )
}

/**
 * 创建并返回主窗口。
 *
 * 安全配置保持不变：
 * - contextIsolation: true
 * - nodeIntegration: false
 * - sandbox: false
 *
 * 开发模式加载 Vite dev server（带重试），生产模式加载 app:// 协议。
 */
export const createMainWindow = async (): Promise<BrowserWindow> => {
  const window = new BrowserWindow({
    width: WINDOW_DEFAULT_WIDTH,
    height: WINDOW_DEFAULT_HEIGHT,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    backgroundColor: WINDOW_BACKGROUND_COLOR,
    title: APP_NAME,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // 开发模式下等待 Vite dev server 就绪
  await waitForDevServer()

  try {
    await window.loadURL(rendererUrl)
  } catch (err: unknown) {
    console.error(
      `[dev] 加载渲染进程 URL 失败：${rendererUrl}\n` +
      `  开发模式请先在前端目录运行 \`npm run dev\` 启动 Vite。`,
      err
    )
  }

  return window
}
