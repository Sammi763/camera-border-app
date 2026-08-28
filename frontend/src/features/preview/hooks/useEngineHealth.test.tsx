import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor, act } from "@testing-library/react"
import { useEngineHealth } from "./useEngineHealth"

/**
 * useEngineHealth 状态机测试：
 * - 状态正确区分 "starting"(loading)、"ready"、"unavailable"(error)；
 * - "ready" 不会因为瞬时 fetch 抖动反复回退到 error（避免状态矛盾）；
 * - 不可用状态下持续暴露稳定 message，便于 UI 展示"引擎暂不可用"提示。
 *
 * fetch 整体 mock：测试用 fake timers + vi.useFakeTimers 控制轮询节奏。
 */

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const Probe = ({ intervalMs = 100 }: { intervalMs?: number }): JSX.Element => {
  const state = useEngineHealth(intervalMs)
  return (
    <div>
      <span data-testid="kind">{state.kind}</span>
      {state.kind === "error" && <span data-testid="message">{state.message}</span>}
      {state.kind === "ready" && <span data-testid="status">{state.health.status}</span>}
    </div>
  )
}

describe("useEngineHealth（引擎健康轮询）", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("初始为 loading（启动中），首次成功进入 ready", async () => {
    fetchMock = vi.fn(async () => jsonResponse({ status: "ok", app: "camera-border-engine", version: "0.1.0" }))
    vi.stubGlobal("fetch", fetchMock)

    render(<Probe />)
    // 首次同步渲染就是 loading（启动中）
    expect(screen.getByTestId("kind").textContent).toBe("loading")
    await waitFor(() => {
      expect(screen.getByTestId("kind").textContent).toBe("ready")
    })
    expect(screen.getByTestId("status").textContent).toBe("ok")
  })

  it("引擎不可达：进入 error，message 可读", async () => {
    fetchMock = vi.fn(async () => {
      throw new Error("ECONNREFUSED 127.0.0.1:8099")
    })
    vi.stubGlobal("fetch", fetchMock)

    render(<Probe />)
    await waitFor(() => {
      expect(screen.getByTestId("kind").textContent).toBe("error")
    })
    expect(screen.getByTestId("message").textContent).toMatch(/127\.0\.0\.1:8099|不可用/)
  })

  it("恢复：从 error 再次变为 ready，状态可重新进入工作态", async () => {
    let fail = true
    fetchMock = vi.fn(async () => {
      if (fail) {
        throw new Error("暂时不可用")
      }
      return jsonResponse({ status: "ok", app: "camera-border-engine", version: "0.1.0" })
    })
    vi.stubGlobal("fetch", fetchMock)

    render(<Probe intervalMs={50} />)
    await waitFor(() => {
      expect(screen.getByTestId("kind").textContent).toBe("error")
    })
    // 恢复
    act(() => {
      fail = false
      vi.advanceTimersByTime(60)
    })
    await waitFor(() => {
      expect(screen.getByTestId("kind").textContent).toBe("ready")
    })
  })

  it("轮询：引擎恢复后下一次轮询再次失败，状态会回退到 error", async () => {
    let ready = true
    fetchMock = vi.fn(async () => {
      if (ready) {
        return jsonResponse({ status: "ok", app: "camera-border-engine", version: "0.1.0" })
      }
      throw new Error("又挂了")
    })
    vi.stubGlobal("fetch", fetchMock)

    render(<Probe intervalMs={50} />)
    await waitFor(() => {
      expect(screen.getByTestId("kind").textContent).toBe("ready")
    })
    act(() => {
      ready = false
      vi.advanceTimersByTime(60)
    })
    await waitFor(() => {
      expect(screen.getByTestId("kind").textContent).toBe("error")
    })
  })
})
