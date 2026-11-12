import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TuningScheduler } from "./tuningScheduler"

describe("TuningScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("连续调参最多每 250ms 提交一次，并只提交最新快照", async () => {
    const starts: string[] = []
    const scheduler = new TuningScheduler({
      throttleMs: 250,
      now: () => Date.now(),
      setTimeout: (handler, timeout) => window.setTimeout(handler, timeout),
      clearTimeout: (handle) => window.clearTimeout(handle)
    })

    expect(scheduler.schedule("a", async () => { starts.push("a") })).toBe("scheduled")
    await Promise.resolve()
    expect(starts).toEqual(["a"])

    scheduler.schedule("b", async () => { starts.push("b") })
    await vi.advanceTimersByTimeAsync(100)
    expect(starts).toEqual(["a"])

    scheduler.schedule("c", async () => { starts.push("c") })
    await vi.advanceTimersByTimeAsync(149)
    expect(starts).toEqual(["a"])
    await vi.advanceTimersByTimeAsync(1)
    await Promise.resolve()
    expect(starts).toEqual(["a", "c"])
  })

  it("相同快照不重复提交", async () => {
    let calls = 0
    const scheduler = new TuningScheduler({ throttleMs: 250 })
    expect(scheduler.schedule("same", async () => { calls += 1 })).toBe("scheduled")
    expect(scheduler.schedule("same", async () => { calls += 1 })).toBe("duplicate")
    await Promise.resolve()
    expect(scheduler.schedule("same", async () => { calls += 1 })).toBe("duplicate")
    expect(calls).toBe(1)
  })

  it("flush 跳过节流，立即提交最终快照", async () => {
    const starts: string[] = []
    const scheduler = new TuningScheduler({ throttleMs: 250 })
    scheduler.schedule("a", async () => { starts.push("a") })
    await Promise.resolve()
    scheduler.schedule("b", async () => { starts.push("b") })
    scheduler.schedule("c", async () => { starts.push("c") })
    scheduler.flush()
    await vi.advanceTimersByTimeAsync(0)
    await Promise.resolve()
    expect(starts).toEqual(["a", "c"])
  })

  it("新快照产生新代次并请求取消旧代次", async () => {
    let release!: () => void
    const inFlight = new Promise<void>((resolve) => { release = resolve })
    const superseded: number[] = []
    const scheduler = new TuningScheduler({
      throttleMs: 250,
      onSupersede: (generation) => superseded.push(generation)
    })
    scheduler.schedule("a", () => inFlight)
    await Promise.resolve()
    scheduler.schedule("b", async () => undefined)
    expect(superseded).toEqual([1])
    release()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(250)
    await Promise.resolve()
    expect(superseded).toEqual([1])
  })

  it("dispose 中止在途请求、清除计时器并返回最后代次", async () => {
    const seen: { signal?: AbortSignal } = {}
    const scheduler = new TuningScheduler({ throttleMs: 250 })
    scheduler.schedule("a", (_generation, signal) => new Promise<void>(() => {
      seen.signal = signal
    }))
    await Promise.resolve()
    scheduler.schedule("b", async () => undefined)
    expect(scheduler.generation).toBe(2)
    expect(scheduler.dispose()).toBe(2)
    expect(seen.signal?.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(scheduler.schedule("c", async () => undefined)).toBe("disposed")
  })

  it("失败快照允许再次提交，成功快照保持去重", async () => {
    let attempts = 0
    const scheduler = new TuningScheduler({ throttleMs: 0 })
    scheduler.schedule("retry", async () => {
      attempts += 1
      throw new Error("failed")
    })
    await vi.advanceTimersByTimeAsync(0)
    await Promise.resolve()
    await Promise.resolve()
    expect(scheduler.schedule("retry", async () => { attempts += 1 })).toBe("scheduled")
    await Promise.resolve()
    expect(attempts).toBe(2)
  })
})
