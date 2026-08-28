import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import { useEngineDiagnostics } from "./useEngineDiagnostics"
import { resetResolvedBaseUrl } from "../../services/engine/engineClient"

/**
 * useEngineDiagnostics.retry() 竞态防护测试：
 * - retry() 在「retryStart + 同步地址 + 等待启动 + 刷新诊断」全部完成前不 resolve；
 * - 期间 state.retrying 保持 true（UI 据此锁定重试按钮）；
 * - 完成后才置 false 并刷新诊断。
 */

afterEach(() => {
  delete (window as unknown as { desktop?: unknown }).desktop
  resetResolvedBaseUrl()
  vi.restoreAllMocks()
})

describe("useEngineDiagnostics.retry 重试锁定", () => {
  beforeEach(() => {
    resetResolvedBaseUrl()
  })

  it("retry() 等待完整重启流程完成，期间 retrying 保持 true", async () => {
    const retryStart = vi.fn(async (): Promise<boolean> => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      return true
    })
    const getEngineDiagnostics = vi.fn(async () => ({
      code: "health-timeout" as const,
      message: "引擎启动超时",
      logPath: "/u/logs/engine.log",
      processAlive: true
    }))
    ;(window as unknown as { desktop?: unknown }).desktop = {
      retryEngineStart: retryStart,
      getEngineDiagnostics,
      getEngineBaseUrl: vi.fn(async () => "http://127.0.0.1:8123")
    }

    const { result } = renderHook(() => useEngineDiagnostics(true, 60))

    let resolved = false
    act(() => {
      void result.current.retry().then(() => { resolved = true })
    })

    // retryStart 已返回，但完整流程未完成：仍处于 retrying
    await waitFor(() => expect(retryStart).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(result.current.state.retrying).toBe(true)
    expect(resolved).toBe(false)

    // 完整流程完成后：retrying 复位、诊断已刷新
    await waitFor(() => {
      expect(result.current.state.retrying).toBe(false)
    }, { timeout: 3000 })
    expect(resolved).toBe(true)
    expect(getEngineDiagnostics).toHaveBeenCalled()
  })

  it("retry() 抛错时也复位 retrying（不永久锁定）", async () => {
    ;(window as unknown as { desktop?: unknown }).desktop = {
      retryEngineStart: vi.fn(async () => { throw new Error("ipc failed") }),
      getEngineDiagnostics: vi.fn(async () => null)
    }
    const { result } = renderHook(() => useEngineDiagnostics(true, 20))

    await act(async () => {
      await result.current.retry()
    })
    expect(result.current.state.retrying).toBe(false)
    expect(result.current.state.lastError).toContain("重试启动引擎失败")
  })

  it("等待诊断刷新真正完成后才解除 retrying", async () => {
    let resolveRefresh: ((value: {
      readonly code: "health-timeout"
      readonly message: string
      readonly logPath: string
      readonly processAlive: boolean
    }) => void) | undefined
    let diagnosticsCallCount = 0
    const getEngineDiagnostics = vi.fn(() => {
      diagnosticsCallCount++
      if (diagnosticsCallCount === 1) {
        return Promise.resolve({
          code: "health-timeout" as const,
          message: "旧诊断",
          logPath: "/u/logs/engine.log",
          processAlive: true
        })
      }
      return new Promise<{
        readonly code: "health-timeout"
        readonly message: string
        readonly logPath: string
        readonly processAlive: boolean
      }>((resolve) => {
        resolveRefresh = resolve
      })
    })
    ;(window as unknown as { desktop?: unknown }).desktop = {
      retryEngineStart: vi.fn(async () => true),
      getEngineDiagnostics,
      getEngineBaseUrl: vi.fn(async () => "http://127.0.0.1:8123")
    }

    const { result } = renderHook(() => useEngineDiagnostics(true, 0))
    await waitFor(() => expect(getEngineDiagnostics).toHaveBeenCalledTimes(1))

    let retryResolved = false
    const retryPromise = result.current.retry().then(() => {
      retryResolved = true
    })
    await waitFor(() => expect(getEngineDiagnostics).toHaveBeenCalledTimes(2))
    expect(result.current.state.retrying).toBe(true)
    expect(retryResolved).toBe(false)

    await act(async () => {
      resolveRefresh!({
        code: "health-timeout",
        message: "新诊断",
        logPath: "/u/logs/engine.log",
        processAlive: true
      })
      await retryPromise
    })
    expect(retryResolved).toBe(true)
    expect(result.current.state.retrying).toBe(false)
  })
})
