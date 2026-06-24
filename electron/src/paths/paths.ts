import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * 仓库根目录。
 *
 * 编译产物位于 electron/dist/paths/paths.js，
 * 从该位置回溯到仓库根需要上溯 3 级（dist/paths → dist → electron → 仓库根）。
 *
 * 注意：当前路径推导仅适配开发模式（tsc 输出到 dist 后直接运行）。
 * 未来打包（electron-builder / asar）时，此推导逻辑需要根据打包后
 * 的目录结构调整，届时在此更新。
 */
export const projectRoot = path.resolve(__dirname, "../../..")

/** 前端构建产物目录。 */
export const frontendDistDir = path.join(projectRoot, "frontend", "dist")

/** 前端构建入口文件（当前通过自定义协议加载，此常量保留供参考）。 */
export const frontendDistPath = path.join(frontendDistDir, "index.html")

/**
 * 编译后的 preload 脚本路径。
 *
 * 编译产物位于 electron/dist/paths/paths.js，
 * preload 编译产物在 electron/dist/preload/preload.js。
 */
export const preloadPath = path.join(__dirname, "..", "preload", "preload.js")

/** 引擎 jar 文件路径（由 java-engine 构建产生）。 */
export const engineJarPath = path.join(
  projectRoot,
  "java-engine",
  "target",
  "camera-border-engine.jar"
)
