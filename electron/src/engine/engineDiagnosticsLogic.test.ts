import { describe, expect, it } from "vitest"
import { classifyEngineDiagnostics } from "./engineDiagnosticsLogic"
import type { DiagnosticsInput } from "./engineDiagnosticsLogic"
import type { JavaBridgeState } from "./JavaBridge"

const baseInput = (overrides: Partial<DiagnosticsInput>): DiagnosticsInput => ({
  state: { kind: "stopped" },
  failureReason: null,
  jarExists: true,
  bundledRuntimeExists: true,
  requireBundledRuntime: true,
  portOccupiedByOther: false,
  logWarning: null,
  jarPath: "/app/resources/java-engine/camera-border-engine.jar",
  baseUrlLabel: "127.0.0.1:8099",
  ...overrides
})

/** 构造一个标准 crashed 状态（包含新加的 signal/reason 字段）。 */
const crashed = (exitCode: number | null, reason: "start-failed" | "runtime-missing" | "runtime-blocked" | null = "start-failed"): JavaBridgeState => ({
  kind: "crashed",
  exitCode,
  signal: null,
  reason
})

describe("classifyEngineDiagnostics（引擎诊断分类）", () => {
  it("运行中：ok", () => {
    const result = classifyEngineDiagnostics(baseInput({
      state: { kind: "running", pid: 100 }
    }))
    expect(result.code).toBe("ok")
  })

  it("启动中：starting（区分于 running，避免 UI 显示矛盾）", () => {
    const result = classifyEngineDiagnostics(baseInput({
      state: { kind: "starting", pid: 100 }
    }))
    expect(result.code).toBe("starting")
    expect(result.message).toContain("启动中")
  })

  it("jar 缺失：优先级最高，即便同时缺运行时", () => {
    const result = classifyEngineDiagnostics(baseInput({
      jarExists: false,
      bundledRuntimeExists: false
    }))
    expect(result.code).toBe("jar-missing")
    expect(result.message).toContain("重新安装")
  })

  it("打包模式缺随包运行时：runtime-missing（不得提示用户安装 Java）", () => {
    const result = classifyEngineDiagnostics(baseInput({
      bundledRuntimeExists: false,
      failureReason: "runtime-missing",
      state: crashed(null, "runtime-missing")
    }))
    expect(result.code).toBe("runtime-missing")
    expect(result.message).toContain("不要求用户安装 Java")
  })

  it("开发模式不强制随包运行时：缺运行时不判 runtime-missing", () => {
    const result = classifyEngineDiagnostics(baseInput({
      requireBundledRuntime: false,
      bundledRuntimeExists: false
    }))
    // 开发模式回退系统 java，无失败原因时按未知/未启动处理
    expect(result.code).not.toBe("runtime-missing")
  })

  it("健康超时（unhealthy 状态）：health-timeout，不能视为正常", () => {
    const state: JavaBridgeState = { kind: "unhealthy", pid: 7, reason: "health-timeout" }
    const result = classifyEngineDiagnostics(baseInput({ state, failureReason: "health-timeout" }))
    expect(result.code).toBe("health-timeout")
    expect(result.message).toContain("重试")
  })

  it("健康超时（仅 reason，状态尚未更新）：同样归类 health-timeout", () => {
    const result = classifyEngineDiagnostics(baseInput({
      state: { kind: "running", pid: 7 },
      failureReason: "health-timeout"
    }))
    expect(result.code).toBe("health-timeout")
  })

  it("明确端口占用原因：port-conflict", () => {
    const result = classifyEngineDiagnostics(baseInput({
      failureReason: "port-conflict",
      state: crashed(1)
    }))
    expect(result.code).toBe("port-conflict")
    expect(result.message).toContain("127.0.0.1:8099")
  })

  it("无明确原因但进程已崩溃且端口被其它服务占用：port-conflict", () => {
    const result = classifyEngineDiagnostics(baseInput({
      state: crashed(1),
      portOccupiedByOther: true
    }))
    expect(result.code).toBe("port-conflict")
  })

  it("进程崩溃且端口空闲：start-failed", () => {
    const result = classifyEngineDiagnostics(baseInput({
      state: crashed(1),
      portOccupiedByOther: false
    }))
    expect(result.code).toBe("start-failed")
  })

  it("runtime-blocked 原因：归类 runtime-blocked（提示用户检查 Defender/SmartScreen）", () => {
    const result = classifyEngineDiagnostics(baseInput({
      failureReason: "runtime-blocked"
    }))
    expect(result.code).toBe("runtime-blocked")
    expect(result.message).toMatch(/Defender|SmartScreen|安全软件/)
  })

  it("crashed.reason=runtime-blocked（即便未单独传 failureReason）也归类 runtime-blocked", () => {
    const result = classifyEngineDiagnostics(baseInput({
      state: crashed(1, "runtime-blocked"),
      failureReason: null
    }))
    expect(result.code).toBe("runtime-blocked")
  })

  it("spawn 失败原因 start-failed：对应分类", () => {
    const result = classifyEngineDiagnostics(baseInput({
      failureReason: "start-failed",
      state: crashed(null)
    }))
    expect(result.code).toBe("start-failed")
  })

  it("未知状态：unknown", () => {
    const result = classifyEngineDiagnostics(baseInput({
      state: { kind: "stopped" }
    }))
    expect(result.code).toBe("unknown")
  })
})
