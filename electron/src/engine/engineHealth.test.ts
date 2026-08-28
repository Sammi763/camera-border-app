import { afterEach, describe, expect, it, vi } from "vitest"
import { pollEngineHealth } from "./engineHealth"

/**
 * 主进程健康探测测试：
 * - 连接后长期不响应的 fetch 会被单次请求超时（AbortSignal.timeout）终止，轮询继续，
 *   不会卡死（readyTimeoutMs 才能真正生效）；
 * - 正常响应 / 崩溃 / 超时终止行为正确。
 */

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

/** 永不 resolve 但尊重 abort 信号的 fetch：模拟「连接建立但无响应」。 */
const hangingFetch = (abortCount: { current: number }): void => {
  vi.stubGlobal("fetch", (_input: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        abortCount.current++
        reject(new DOMException("aborted", "TimeoutError"))
      })
    })
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("pollEngineHealth 主进程健康探测", () => {
  it("连接后无响应的 fetch 在单次请求超时后被终止，轮询不会卡死", async () => {
    const abortCount = { current: 0 }
    hangingFetch(abortCount)
    const startedAt = Date.now()
    // readyTimeout=200ms，单次请求超时=30ms：若请求不被终止，轮询会卡在第一个 await 上
    const ready = await pollEngineHealth("http://127.0.0.1:59999/api/health", 200, () => false, 30)
    const elapsed = Date.now() - startedAt
    expect(ready).toBe(false)
    // 在有限时间返回（而非永久挂起）
    expect(elapsed).toBeLessThan(1000)
    // 至少发起过一次请求并被超时终止（证明请求确实可取消）
    expect(abortCount.current).toBeGreaterThanOrEqual(1)
  })

  it("正常响应返回 true", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({ status: "ok" }))
    const ready = await pollEngineHealth("http://127.0.0.1:59999/api/health", 500, () => false, 30)
    expect(ready).toBe(true)
  })

  it("引擎已崩溃立即返回 false（不等待超时）", async () => {
    vi.stubGlobal("fetch", async () => { throw new Error("unreachable") })
    const startedAt = Date.now()
    const ready = await pollEngineHealth("http://127.0.0.1:59999/api/health", 5000, () => true, 30)
    expect(ready).toBe(false)
    expect(Date.now() - startedAt).toBeLessThan(1000)
  })

  it("非 2xx 响应持续轮询直到超时返回 false", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({ error: "not ready" }, 503))
    const ready = await pollEngineHealth("http://127.0.0.1:59999/api/health", 120, () => false, 30)
    expect(ready).toBe(false)
  })
})
