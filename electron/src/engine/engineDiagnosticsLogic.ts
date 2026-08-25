import type { EngineFailureReason, JavaBridgeState } from "./JavaBridge.js"

/**
 * 引擎诊断分类（纯函数，便于单元测试）。
 *
 * 输入由 IPC 层从 JavaBridge / 文件系统 / 端口探测收集，
 * 输出面向用户的失败分类与中文说明。
 */
export type DiagnosticsInput = {
  readonly state: JavaBridgeState
  /** JavaBridge.getFailureReason()。 */
  readonly failureReason: EngineFailureReason
  readonly jarExists: boolean
  /** 随包 Java 可执行文件是否存在（打包模式必须存在）。 */
  readonly bundledRuntimeExists: boolean
  readonly requireBundledRuntime: boolean
  /** 引擎未运行时健康端点是否被其它进程占用（仅该场景下探测）。 */
  readonly portOccupiedByOther: boolean
  /** 日志系统警告（null 表示正常）。 */
  readonly logWarning: string | null
  /** jar 绝对路径（用于错误信息展示）。 */
  readonly jarPath: string
  /** 引擎地址的可读形式（如 127.0.0.1:8099）。 */
  readonly baseUrlLabel: string
}

export type DiagnosticsResult = {
  readonly code:
    | "ok"
    | "jar-missing"
    | "runtime-missing"
    | "start-failed"
    | "port-conflict"
    | "health-timeout"
    | "unknown"
  readonly message: string
}

/** 按优先级归类：jar 缺失 > 运行时缺失 > 明确原因 > 端口占用 > 启动失败/未知。 */
export const classifyEngineDiagnostics = (input: DiagnosticsInput): DiagnosticsResult => {
  const { state, failureReason, jarExists, bundledRuntimeExists, portOccupiedByOther, jarPath, baseUrlLabel } = input

  if (!jarExists) {
    return {
      code: "jar-missing",
      message: `引擎文件缺失：${jarPath}。请重新安装应用。`
    }
  }
  if (input.requireBundledRuntime && !bundledRuntimeExists) {
    return {
      code: "runtime-missing",
      message: "随包 Java 运行时缺失或损坏，应用无法启动渲染引擎。请重新安装应用（本应用不要求用户安装 Java）。"
    }
  }

  // 健康超时优先于运行状态判断：超时后即使状态尚未翻转也不能视为正常
  if (state.kind === "unhealthy" || failureReason === "health-timeout") {
    return {
      code: "health-timeout",
      message: "引擎启动超时，长时间未就绪。可点击「重试」终止当前进程并重新启动，或查看日志定位问题。"
    }
  }

  // 运行中：正常或日志告警
  if (state.kind === "running") {
    return { code: "ok", message: "引擎运行中。" }
  }

  switch (failureReason) {
    case "jar-missing":
      return { code: "jar-missing", message: `引擎文件缺失：${jarPath}。请重新安装应用。` }
    case "runtime-missing":
      return {
        code: "runtime-missing",
        message: "随包 Java 运行时缺失或损坏。请重新安装应用（本应用不要求用户安装 Java）。"
      }
    case "port-conflict":
      return {
        code: "port-conflict",
        message: `端口 ${baseUrlLabel} 已被其它程序占用。请关闭占用该端口的程序后重试。`
      }
    case "start-failed":
      return {
        code: "start-failed",
        message: "引擎启动失败，已异常退出。可点击「重试」再次启动，或查看日志定位问题。"
      }
    default:
      break
  }

  // 无明确原因：引擎不在运行，进一步区分端口占用与未知状态
  if (state.kind === "crashed") {
    if (portOccupiedByOther) {
      return {
        code: "port-conflict",
        message: `端口 ${baseUrlLabel} 已被其它程序占用。请关闭占用该端口的程序后重试。`
      }
    }
    return {
      code: "start-failed",
      message: "引擎启动失败，已异常退出。可点击「重试」再次启动，或查看日志定位问题。"
    }
  }

  return {
    code: "unknown",
    message: "引擎尚未启动。可点击「重试」启动引擎。"
  }
}
