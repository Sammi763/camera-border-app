import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { EngineStatusBar } from "./EngineStatusBar"
import type { EngineHealthState } from "../preview/hooks/useEngineHealth"

/**
 * EngineStatusBar 测试：
 * - 状态条不再覆盖全屏，仅顶部/状态栏非阻塞提示；
 * - 工作台在引擎未就绪时仍可使用；
 * - 引擎恢复后状态条自动消失（ready 不渲染）；
 * - 错误态保留「重试」与「查看日志」入口；「查看日志」直接打开日志文件
 *   （openLogFile IPC），不再是打开所在目录。
 */

const loadingState: EngineHealthState = { kind: "loading" }
const readyState: EngineHealthState = {
  kind: "ready",
  health: { status: "ok", app: "camera-border-engine", version: "0.1.0" }
}
const errorState: EngineHealthState = { kind: "error", message: "引擎启动超时" }

const setDesktop = (api: unknown): void => {
  ;(window as unknown as { desktop?: unknown }).desktop = api
}

beforeEach(() => {
  ;(window as unknown as { desktop?: unknown }).desktop = undefined
})

afterEach(() => {
  delete (window as unknown as { desktop?: unknown }).desktop
  vi.restoreAllMocks()
})

describe("EngineStatusBar（顶部非阻塞状态条）", () => {
  it("loading（启动中）：显示「本地引擎启动中…」，不阻断工作台", () => {
    render(<EngineStatusBar health={loadingState} />)
    expect(screen.getByText(/本地引擎启动中/)).toBeTruthy()
    // 必须含 role=status 让屏幕阅读器朗读
    expect(screen.getByRole("status")).toBeTruthy()
  })

  it("error（不可用）：显示「引擎暂不可用」+ 原因 + 恢复提示", () => {
    setDesktop({
      getEngineDiagnostics: vi.fn(async () => ({
        code: "health-timeout",
        message: "引擎启动超时",
        logPath: "/u/logs/engine.log",
        processAlive: true
      })),
      retryEngineStart: vi.fn(async () => true),
      openLogFile: vi.fn(async () => true)
    })
    render(<EngineStatusBar health={errorState} />)
    expect(screen.getByText(/引擎暂不可用/)).toBeTruthy()
    expect(screen.getByText(/当前使用本地预览/)).toBeTruthy()
    expect(screen.getByText(/恢复引擎后可进行高保真导出/)).toBeTruthy()
    expect(screen.getByText(/引擎启动超时/)).toBeTruthy()
  })

  it("ready（运行正常）：状态条不渲染（自动消失）", () => {
    const { container } = render(<EngineStatusBar health={readyState} />)
    expect(container.firstChild).toBeNull()
  })

  it("错误状态：含 role=alert 区域以便辅助技术立即朗读", () => {
    setDesktop({
      getEngineDiagnostics: vi.fn(async () => null),
      retryEngineStart: vi.fn(async () => true)
    })
    render(<EngineStatusBar health={errorState} />)
    expect(screen.getByRole("alert")).toBeTruthy()
  })

  it("错误态提供「重试」，点击调用 retryEngineStart 且期间禁用重复点击", async () => {
    const retryStart = vi.fn(async (): Promise<boolean> => {
      // 模拟重试耗时
      await new Promise((resolve) => setTimeout(resolve, 50))
      return true
    })
    setDesktop({
      getEngineDiagnostics: vi.fn(async () => null),
      retryEngineStart: retryStart
    })
    render(<EngineStatusBar health={errorState} />)

    const retryButton = screen.getByRole("button", { name: "重试" }) as HTMLButtonElement
    fireEvent.click(retryButton)
    expect(retryButton.disabled).toBe(true)
    await waitFor(() => {
      expect(retryStart).toHaveBeenCalledTimes(1)
    })
    // 重试完成后按钮恢复可用（hook 完成「重启 + 同步 + 等待启动 + 刷新」全程后解锁）
    await waitFor(() => {
      expect((screen.getByRole("button", { name: "重试" }) as HTMLButtonElement).disabled).toBe(false)
    }, { timeout: 5000 })
  })

  it("重试期间按钮保持锁定到重启完成（快速重复点击不会再次触发 retryEngineStart）", async () => {
    const retryStart = vi.fn(async (): Promise<boolean> => {
      await new Promise((resolve) => setTimeout(resolve, 30))
      return true
    })
    setDesktop({
      getEngineDiagnostics: vi.fn(async () => null),
      retryEngineStart: retryStart
    })
    render(<EngineStatusBar health={errorState} />)

    const retryButton = screen.getByRole("button", { name: "重试" }) as HTMLButtonElement
    fireEvent.click(retryButton)
    await waitFor(() => {
      expect(retryStart).toHaveBeenCalledTimes(1)
    })

    // retryStart 已 resolve（新进程已 spawn），但 hook 仍在等待启动 + 刷新诊断：
    // 按钮必须保持锁定，快速重复点击不得再次触发 retryEngineStart（避免终止刚启动的新引擎）
    expect(retryButton.disabled).toBe(true)
    fireEvent.click(retryButton)
    fireEvent.click(retryButton)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(retryStart).toHaveBeenCalledTimes(1)

    // 全程完成后解锁
    await waitFor(() => {
      expect((screen.getByRole("button", { name: "重试" }) as HTMLButtonElement).disabled).toBe(false)
    }, { timeout: 5000 })
  })

  it("「查看日志」通过 openLogFile 直接打开日志文件（而非目录）", async () => {
    const openLogFile = vi.fn(async () => true)
    setDesktop({
      getEngineDiagnostics: vi.fn(async () => ({
        code: "start-failed",
        message: "引擎启动失败",
        logPath: "/Users/x/Library/Application Support/app/logs/engine.log",
        processAlive: false
      })),
      retryEngineStart: vi.fn(async () => true),
      openLogFile
    })
    render(<EngineStatusBar health={errorState} />)

    // 诊断异步加载完成后按钮出现
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "查看日志" })).toBeTruthy()
    })
    fireEvent.click(screen.getByRole("button", { name: "查看日志" }))
    await waitFor(() => {
      expect(openLogFile).toHaveBeenCalledWith("/Users/x/Library/Application Support/app/logs/engine.log")
    })
  })

  it("诊断无日志路径时隐藏「查看日志」按钮", async () => {
    setDesktop({
      getEngineDiagnostics: vi.fn(async () => ({
        code: "unknown",
        message: "未知",
        logPath: null,
        processAlive: false
      })),
      retryEngineStart: vi.fn(async () => true)
    })
    render(<EngineStatusBar health={errorState} />)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "重试" })).toBeTruthy()
    })
    expect(screen.queryByRole("button", { name: "查看日志" })).toBeNull()
  })

  it("展示诊断 IPC 返回的具体失败原因（runtime-blocked 白名单指引），而非仅健康检查通用消息", async () => {
    const genericHealth: EngineHealthState = { kind: "error", message: "引擎不可达" }
    setDesktop({
      getEngineDiagnostics: vi.fn(async () => ({
        code: "runtime-blocked",
        message: "随包 Java 启动后被系统安全软件阻止（Windows Defender / SmartScreen 等）。请在安全软件中将本应用加入白名单后重试。",
        logPath: "/Users/x/logs/engine.log",
        processAlive: false
      })),
      retryEngineStart: vi.fn(async () => true)
    })
    render(<EngineStatusBar health={genericHealth} />)

    // 诊断异步加载后，应展示白名单指引（而不是只显示「引擎不可达」）
    await waitFor(() => {
      expect(screen.getByText(/Windows Defender \/ SmartScreen/)).toBeTruthy()
    })
    expect(screen.getByText(/加入白名单/)).toBeTruthy()
  })

  it("错误横幅只通过一个诊断抽屉展开详细进程信息", async () => {
    setDesktop({
      getEngineDiagnostics: vi.fn(async () => ({
        code: "start-failed",
        message: "引擎启动失败",
        logPath: null,
        processAlive: false
      })),
      retryEngineStart: vi.fn(async () => true)
    })
    render(<EngineStatusBar health={errorState} />)

    expect(screen.getAllByRole("alert")).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: "查看诊断" }))
    expect(screen.getByRole("dialog", { name: "引擎诊断" })).toBeTruthy()
    await waitFor(() => expect(screen.getByText("未运行")).toBeTruthy())
    fireEvent.keyDown(screen.getByRole("dialog", { name: "引擎诊断" }), { key: "Escape" })
    expect(screen.queryByRole("dialog", { name: "引擎诊断" })).toBeNull()
  })
})
