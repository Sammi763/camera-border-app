import { describe, expect, it } from "vitest"
import { EngineHttpError, getBaseUrl, readEngineHttpError, toErrorMessage } from "./engineClient"

describe("engineClient 同源相对 URL 契约", () => {
  it("无论开发或生产渲染环境，都只返回空前缀", () => {
    expect(getBaseUrl()).toBe("")
  })

  it("不会从 window 运行时或任意桥接读取绝对引擎地址", () => {
    ;(window as unknown as { desktopRuntime?: unknown }).desktopRuntime = {
      appName: "test",
      platform: "darwin",
      engine: { managed: true }
    }
    ;(window as unknown as { desktop?: unknown }).desktop = {}

    expect(getBaseUrl()).toBe("")
  })

  it("保留结构化 HTTP 错误 code，供启动中状态机识别", async () => {
    const response = new Response(JSON.stringify({
      code: "ENGINE_STARTING",
      message: "本地引擎正在启动，请稍候。",
      state: "starting"
    }), {
      status: 503,
      headers: { "Content-Type": "application/json" }
    })

    const error = await readEngineHttpError(response, "fallback")

    expect(error).toBeInstanceOf(EngineHttpError)
    expect(error.status).toBe(503)
    expect(error.code).toBe("ENGINE_STARTING")
    expect(error.state).toBe("starting")
    expect(error.message).toContain("启动")
  })

  it("兼容引擎旧版 error 字段和普通 fallback", () => {
    expect(toErrorMessage("fallback", { error: "bad recipe" })).toBe("bad recipe")
    expect(toErrorMessage("fallback", { message: "starting" })).toBe("starting")
    expect(toErrorMessage("fallback", {})).toBe("fallback")
  })
})
