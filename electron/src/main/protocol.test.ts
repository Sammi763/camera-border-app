import { beforeEach, describe, expect, it, vi } from "vitest"

const { protocolHandleMock, netFetchMock, getManagedEngineMock } = vi.hoisted(() => ({
  protocolHandleMock: vi.fn(),
  netFetchMock: vi.fn(),
  getManagedEngineMock: vi.fn()
}))

vi.mock("electron", () => ({
  net: {
    fetch: netFetchMock
  },
  protocol: {
    registerSchemesAsPrivileged: vi.fn(),
    handle: protocolHandleMock
  }
}))

vi.mock("../paths/paths.js", () => ({
  frontendDistDir: "/tmp/camera-border-frontend"
}))

vi.mock("../engine/managedEngine.js", () => ({
  getManagedEngine: getManagedEngineMock
}))

import { APP_CONTENT_SECURITY_POLICY, registerAppProtocol } from "./protocol"

type FakeBridgeState = {
  readonly kind: "starting" | "running" | "stopped" | "crashed" | "unhealthy"
  readonly pid?: number
  readonly reason?: string
}

const setBridge = (baseUrl: string, state: FakeBridgeState): void => {
  getManagedEngineMock.mockReturnValue({
    bridge: {
      getActualBaseUrl: () => baseUrl,
      getState: () => state
    }
  })
}

const getHandler = (): ((request: Request) => Promise<Response>) => {
  const handler = protocolHandleMock.mock.calls.at(-1)?.[1]
  if (typeof handler !== "function") {
    throw new Error("app protocol handler was not registered")
  }
  return handler as (request: Request) => Promise<Response>
}

const readJson = async (response: Response): Promise<Record<string, unknown>> =>
  await response.json() as Record<string, unknown>

/** Request 构造器会主动规范化 ../；安全测试需要保留协议层收到的原始 URL。 */
const rawRequest = (url: string): Request => ({
  url,
  method: "GET",
  headers: new Headers(),
  body: null,
  arrayBuffer: async () => new ArrayBuffer(0)
} as unknown as Request)

beforeEach(() => {
  protocolHandleMock.mockReset()
  netFetchMock.mockReset()
  getManagedEngineMock.mockReset()
  registerAppProtocol()
  netFetchMock.mockResolvedValue(new Response("ok", { status: 200 }))
})

describe("app:// 安全协议代理", () => {
  it("生产 app:// 页面响应带完整 CSP", async () => {
    const response = await getHandler()(new Request("app://app/index.html"))

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Security-Policy")).toBe(APP_CONTENT_SECURITY_POLICY)
  })

  it.each([
    ["GET", "app://app/api/health"],
    ["POST", "app://app/api/preview"],
    ["GET", "app://app/api/render-jobs/job-1"],
    ["DELETE", "app://app/api/render-jobs/job-1"],
    ["GET", "app://app/previews/preview-1"]
  ])("代理已声明路由 %s %s 到 JavaBridge 当前端口", async (method, url) => {
    setBridge("http://127.0.0.1:8123", { kind: "running", pid: 42 })
    const request = method === "POST"
      ? new Request(url, { method, body: "{}", headers: { "Content-Type": "application/json" } })
      : new Request(url, { method })

    const response = await getHandler()(request)

    expect(response.status).toBe(200)
    expect(netFetchMock).toHaveBeenCalledTimes(1)
    expect(netFetchMock.mock.calls[0]?.[0]).toBe(url.replace("app://app", "http://127.0.0.1:8123"))
    expect(netFetchMock.mock.calls[0]?.[1]).toMatchObject({ method, redirect: "error" })
  })

  it("转发 POST body，并过滤 Host 等由代理托管的请求头", async () => {
    setBridge("http://127.0.0.1:8123", { kind: "running", pid: 42 })
    const request = new Request("app://app/api/preview?mode=plain", {
      method: "POST",
      body: "{\"imagePath\":\"/tmp/photo.jpg\"}",
      headers: {
        "Content-Type": "application/json",
        Host: "external.example",
        Origin: "https://external.example"
      }
    })

    await getHandler()(request)

    const init = netFetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.redirect).toBe("error")
    expect(init.headers).toEqual(expect.not.objectContaining({ Host: "external.example" }))
    expect(init.headers).toEqual(expect.not.objectContaining({ Origin: "https://external.example" }))
    expect(await new Response(init.body).text()).toBe("{\"imagePath\":\"/tmp/photo.jpg\"}")
  })

  it("JavaBridge 启动中返回结构化 503", async () => {
    setBridge("http://127.0.0.1:8123", { kind: "starting", pid: 42 })

    const response = await getHandler()(new Request("app://app/api/health"))

    expect(response.status).toBe(503)
    expect(await readJson(response)).toMatchObject({
      code: "ENGINE_STARTING",
      state: "starting"
    })
    expect(netFetchMock).not.toHaveBeenCalled()
  })

  it("JavaBridge 未运行时返回结构化引擎失败 503", async () => {
    setBridge("http://127.0.0.1:8123", { kind: "crashed", reason: "start-failed" })

    const response = await getHandler()(new Request("app://app/api/health"))

    expect(response.status).toBe(503)
    expect(await readJson(response)).toMatchObject({
      code: "ENGINE_UNAVAILABLE",
      state: "crashed"
    })
    expect(netFetchMock).not.toHaveBeenCalled()
  })

  it.each([
    "app://evil/api/health",
    "app://app/api/../previews/secret",
    "app://app/api/%2e%2e/previews/secret",
    "app://app/api/%2Fetc/passwd",
    "app://app/api/%5C%5Cetc/passwd",
    "app://app/api/preview/extra",
    "app://app/previews/preview-1/extra"
  ])("拒绝非法 host、路径穿越或未声明路径：%s", async (url) => {
    setBridge("http://127.0.0.1:8123", { kind: "running", pid: 42 })

    const response = await getHandler()(url.includes("..") || url.includes("%2e") || url.includes("%2F") || url.includes("%5C")
      ? rawRequest(url)
      : new Request(url))

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(netFetchMock).not.toHaveBeenCalled()
  })

  it("拒绝未声明 HTTP 方法，不把 OPTIONS 或 PUT 传给引擎", async () => {
    setBridge("http://127.0.0.1:8123", { kind: "running", pid: 42 })

    const options = await getHandler()(new Request("app://app/api/health", { method: "OPTIONS" }))
    const put = await getHandler()(new Request("app://app/api/health", { method: "PUT" }))

    expect(options.status).toBe(405)
    expect(put.status).toBe(405)
    expect(netFetchMock).not.toHaveBeenCalled()
  })

  it.each([
    "https://127.0.0.1:8123",
    "http://127.0.0.1",
    "http://localhost:8123",
    "http://127.0.0.1.evil.example:8123",
    "http://[::1]:8123"
  ])("拒绝非受管 127.0.0.1 JavaBridge 地址：%s", async (baseUrl) => {
    setBridge(baseUrl, { kind: "running", pid: 42 })

    const response = await getHandler()(new Request("app://app/api/health"))

    expect(response.status).toBe(503)
    expect((await readJson(response))["code"]).toBe("ENGINE_UNAVAILABLE")
    expect(netFetchMock).not.toHaveBeenCalled()
  })

  it("阻止 Java 返回的重定向，避免 app:// 被带到外部地址", async () => {
    setBridge("http://127.0.0.1:8123", { kind: "running", pid: 42 })
    netFetchMock.mockResolvedValue(new Response(null, {
      status: 302,
      headers: { Location: "https://example.com/redirect" }
    }))

    const response = await getHandler()(new Request("app://app/api/health"))

    expect(response.status).toBe(502)
    expect((await readJson(response))["code"]).toBe("ENGINE_REDIRECT_BLOCKED")
  })
})
