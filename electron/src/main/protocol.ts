import { net, protocol } from "electron"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { frontendDistDir } from "../paths/paths.js"
import { getManagedEngine } from "../engine/managedEngine.js"

/** 自定义协议 scheme。生产窗口和引擎代理都只接受这个 scheme。 */
export const APP_SCHEME = "app"

/**
 * 生产 app:// 页面唯一允许的内容来源。
 *
 * 引擎请求通过同源 app:// 代理完成；禁止页面自行连接 http(s)/ws(s) 外部地址，
 * 也不允许插件对象、表单提交或嵌套 frame。Vite 开发页不走本协议，因此不受此头影响。
 */
export const APP_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'"
].join("; ")

type ProxyMethod = "GET" | "POST" | "DELETE"

type ProxyRoute = {
  readonly matches: (pathname: string) => boolean
  readonly methods: readonly ProxyMethod[]
}

/**
 * app:// 暴露给渲染进程的引擎路由白名单。
 *
 * 路由必须同时在这里声明、并由 Java 引擎控制器提供。未知的 /api/**
 * 或 /previews/** 不会回退到静态文件，也不会被转发到引擎。
 */
const PROXY_ROUTES: readonly ProxyRoute[] = [
  { matches: (pathname) => pathname === "/api/health", methods: ["GET"] },
  { matches: (pathname) => pathname === "/api/preview", methods: ["POST"] },
  { matches: (pathname) => pathname === "/api/render-jobs", methods: ["POST"] },
  {
    matches: (pathname) => /^\/api\/render-jobs\/[^/]+$/.test(pathname),
    methods: ["GET", "DELETE"]
  },
  { matches: (pathname) => pathname === "/api/photo-metadata", methods: ["POST"] },
  { matches: (pathname) => pathname === "/api/film-formats", methods: ["GET"] },
  { matches: (pathname) => pathname === "/api/assets/film-stocks", methods: ["GET"] },
  { matches: (pathname) => pathname === "/api/fonts", methods: ["GET"] },
  { matches: (pathname) => pathname === "/api/metadata/format", methods: ["POST"] },
  { matches: (pathname) => pathname === "/api/dev/photos", methods: ["GET"] },
  { matches: (pathname) => /^\/previews\/[^/]+$/.test(pathname), methods: ["GET"] }
]

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "origin",
  "proxy-authenticate",
  "proxy-authorization",
  "referer",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
])

type ErrorCode =
  | "APP_REQUEST_REJECTED"
  | "ROUTE_NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "ENGINE_STARTING"
  | "ENGINE_UNAVAILABLE"
  | "ENGINE_REDIRECT_BLOCKED"

const jsonResponse = (
  status: number,
  body: Readonly<Record<string, unknown>>,
  extraHeaders: Readonly<Record<string, string>> = {}
): Response => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders
  }
})

const jsonError = (
  status: number,
  code: ErrorCode,
  message: string,
  state?: string
): Response => jsonResponse(status, {
  code,
  message,
  ...(state === undefined ? {} : { state })
})

/**
 * 取出 URL 中未经 URL 标准化的路径，用来在 new URL() 之前拦截 ../、反斜杠
 * 和编码后的分隔符。否则 URL parser 可能先把路径穿越规范化，掩盖原始攻击载荷。
 */
const extractRawPath = (requestUrl: string): string | null => {
  const prefix = `${APP_SCHEME}://`
  if (!requestUrl.startsWith(prefix)) {
    return null
  }
  const authorityAndPath = requestUrl.slice(prefix.length)
  const slashIndex = authorityAndPath.indexOf("/")
  if (slashIndex < 0) {
    return "/"
  }
  const pathAndQuery = authorityAndPath.slice(slashIndex)
  return pathAndQuery.split(/[?#]/, 1)[0] ?? null
}

const hasUnsafePathSegment = (rawPath: string): boolean => {
  if (!rawPath.startsWith("/") || rawPath.includes("\\") || rawPath.includes("\u0000")) {
    return true
  }
  for (const rawSegment of rawPath.split("/")) {
    let decodedSegment: string
    try {
      decodedSegment = decodeURIComponent(rawSegment)
    } catch {
      return true
    }
    if (
      decodedSegment === "."
      || decodedSegment === ".."
      || decodedSegment.includes("/")
      || decodedSegment.includes("\\")
      || decodedSegment.includes("\u0000")
    ) {
      return true
    }
  }
  return false
}

type ParsedAppRequest = {
  readonly url: URL
  readonly pathname: string
  readonly method: string
}

/** 只接受 app://app，不接受自定义 scheme 的其它 host、端口或凭据。 */
const parseAppRequest = (request: Request): ParsedAppRequest | null => {
  const rawPath = extractRawPath(request.url)
  if (rawPath === null || hasUnsafePathSegment(rawPath)) {
    return null
  }

  let url: URL
  try {
    url = new URL(request.url)
  } catch {
    return null
  }

  if (
    url.protocol !== `${APP_SCHEME}:`
    || url.host !== "app"
    || url.username.length > 0
    || url.password.length > 0
    || url.port.length > 0
    || url.hash.length > 0
  ) {
    return null
  }

  let pathname: string
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return null
  }
  if (hasUnsafePathSegment(pathname) || pathname.startsWith("//")) {
    return null
  }

  return { url, pathname, method: request.method.toUpperCase() }
}

const findProxyRoute = (pathname: string): ProxyRoute | null =>
  PROXY_ROUTES.find((route) => route.matches(pathname)) ?? null

const isEngineNamespace = (pathname: string): boolean =>
  pathname === "/api"
  || pathname.startsWith("/api/")
  || pathname === "/previews"
  || pathname.startsWith("/previews/")

/**
 * 校验 JavaBridge 给出的当前地址。
 * 主进程只允许 HTTP 127.0.0.1，并拒绝凭据、路径、查询参数和 fragment，
 * 因而动态端口仍受 JavaBridge 管理，不能借代理访问外部 Host。
 */
const getManagedEngineOrigin = (baseUrl: string): string | null => {
  try {
    const url = new URL(baseUrl)
    if (
      url.protocol !== "http:"
      || url.hostname !== "127.0.0.1"
      || url.port.length === 0
      || url.username.length > 0
      || url.password.length > 0
      || url.pathname !== "/"
      || url.search.length > 0
      || url.hash.length > 0
    ) {
      return null
    }
    return url.origin
  } catch {
    return null
  }
}

const forwardedHeaders = (headers: Headers): Headers => {
  const result = new Headers()
  for (const [name, value] of headers.entries()) {
    if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      result.set(name, value)
    }
  }
  return result
}

const isRedirectResponse = (response: Response): boolean =>
  (response.status >= 300 && response.status < 400)
  || response.headers.get("location") !== null

const isSameOriginResponse = (response: Response, origin: string): boolean => {
  if (response.url.length === 0) {
    return true
  }
  try {
    return new URL(response.url).origin === origin
  } catch {
    return false
  }
}

const engineUnavailableResponse = (state: string, message: string): Response =>
  jsonError(503, "ENGINE_UNAVAILABLE", message, state)

const proxyToManagedEngine = async (
  request: Request,
  parsed: ParsedAppRequest
): Promise<Response> => {
  const managed = getManagedEngine()
  if (managed === null) {
    return jsonError(503, "ENGINE_STARTING", "本地引擎正在启动，请稍候。", "starting")
  }

  const state = managed.bridge.getState()
  if (state.kind === "starting") {
    return jsonError(503, "ENGINE_STARTING", "本地引擎正在启动，请稍候。", state.kind)
  }
  if (state.kind !== "running") {
    return engineUnavailableResponse(state.kind, "本地引擎不可用，请重试启动引擎。")
  }

  const origin = getManagedEngineOrigin(managed.bridge.getActualBaseUrl())
  if (origin === null) {
    return engineUnavailableResponse("invalid-address", "本地引擎地址无效，已拒绝代理请求。")
  }

  const targetUrl = `${origin}${parsed.url.pathname}${parsed.url.search}`
  const init: RequestInit = {
    method: parsed.method,
    headers: forwardedHeaders(request.headers),
    redirect: "error"
  }

  if (parsed.method !== "GET" && request.body !== null) {
    init.body = await request.arrayBuffer()
  }

  try {
    const response = await net.fetch(targetUrl, init)
    if (isRedirectResponse(response) || !isSameOriginResponse(response, origin)) {
      return jsonError(502, "ENGINE_REDIRECT_BLOCKED", "引擎响应包含被禁止的重定向。")
    }
    return response
  } catch {
    return engineUnavailableResponse(state.kind, "本地引擎暂时无响应，请稍候重试。")
  }
}

const isPathInside = (candidate: string, root: string): boolean => {
  const relative = path.relative(root, candidate)
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

/** 给生产 app:// 静态资源响应补上页面级 CSP。 */
const withAppContentSecurityPolicy = (response: Response): Response => {
  const headers = new Headers(response.headers)
  headers.set("Content-Security-Policy", APP_CONTENT_SECURITY_POLICY)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

const serveFrontendFile = (pathname: string): Promise<Response> => {
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1)
  const root = path.resolve(frontendDistDir)
  const filePath = path.resolve(root, relativePath)
  if (!isPathInside(filePath, root)) {
    return Promise.resolve(jsonError(403, "APP_REQUEST_REJECTED", "静态资源路径无效。"))
  }
  return net.fetch(pathToFileURL(filePath).href).then(withAppContentSecurityPolicy)
}

/** app:// 请求处理器，导出供主进程注册和安全单测复用。 */
export const handleAppRequest = async (request: Request): Promise<Response> => {
  const parsed = parseAppRequest(request)
  if (parsed === null) {
    return jsonError(400, "APP_REQUEST_REJECTED", "app:// 请求无效。")
  }

  const route = findProxyRoute(parsed.pathname)
  if (route !== null) {
    if (!route.methods.includes(parsed.method as ProxyMethod)) {
      return jsonResponse(405, {
        code: "METHOD_NOT_ALLOWED",
        message: "该 app:// 路由不允许此 HTTP 方法。"
      }, { Allow: route.methods.join(", ") })
    }
    return proxyToManagedEngine(request, parsed)
  }

  if (isEngineNamespace(parsed.pathname)) {
    return jsonError(404, "ROUTE_NOT_FOUND", "未声明的 app:// 引擎路由。")
  }

  if (parsed.method !== "GET") {
    return jsonResponse(405, {
      code: "METHOD_NOT_ALLOWED",
      message: "静态 app:// 资源只允许 GET。"
    }, { Allow: "GET" })
  }
  return serveFrontendFile(parsed.pathname)
}

/** 注册 app:// 为特权协议。必须在 app ready 之前调用。 */
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

/** 安装 app:// 请求处理器。必须在 app ready 之后调用。 */
export const registerAppProtocol = (): void => {
  protocol.handle(APP_SCHEME, handleAppRequest)
}

/** BrowserWindow 加载的入口 URL。 */
export const appEntryUrl = `${APP_SCHEME}://app/index.html`
