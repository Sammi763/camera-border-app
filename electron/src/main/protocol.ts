import { net, protocol } from "electron"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { frontendDistDir } from "../paths/paths.js"

/**
 * 自定义协议 scheme，用于加载前端构建产物。
 *
 * 前端 dist 使用根绝对路径（如 "/assets/index.js"），
 * 在 file:// 协议下会解析到文件系统根目录，导致 JS/CSS 无法加载。
 * 通过自定义标准协议，将绝对路径正确解析到前端 dist 目录。
 */
export const APP_SCHEME = "app"

/**
 * 注册 app:// 为特权协议。必须在 app.whenReady() 之前调用——
 * 标准协议无法在 app ready 后注册。
 */
export const registerAppSchemePrivileged = (): void => {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true
      }
    }
  ])
}

/**
 * 安装 app:// 的请求处理器。必须在 app.whenReady() 之后调用。
 * 请求映射到 frontend/dist/ 目录下的文件，
 * 例如 /assets/index.js 解析到 <dist>/assets/index.js。
 */
export const registerAppProtocol = (): void => {
  protocol.handle(APP_SCHEME, (request) => {
    const { pathname } = new URL(request.url)
    const relativePath = pathname === "/" ? "/index.html" : pathname
    const filePath = path.join(frontendDistDir, relativePath)
    return net.fetch(pathToFileURL(filePath).href)
  })
}

/** BrowserWindow 加载的入口 URL。 */
export const appEntryUrl = `${APP_SCHEME}://app/index.html`
