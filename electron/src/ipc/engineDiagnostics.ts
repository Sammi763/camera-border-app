import { existsSync } from "node:fs"
import { join } from "node:path"
import { app, shell, ipcMain } from "electron"
import { IPC_CHANNELS, type EngineDiagnostics } from "../types/desktopApi.js"
import { getManagedEngine } from "../engine/managedEngine.js"
import { classifyEngineDiagnostics } from "../engine/engineDiagnosticsLogic.js"
import { isAllowedLogPath } from "./logPathGuard.js"
import { engineBaseUrl } from "../config/devMode.js"

/**
 * 检测引擎端口是否被其它进程占用。
 *
 * 判定逻辑：引擎进程未运行，但健康端点仍能建立 HTTP 连接——
 * 说明该端口上跑着别的服务（可能是残留的旧引擎或其它程序）。
 */
const isPortOccupiedByOther = async (baseUrl: string): Promise<boolean> => {
  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      signal: AbortSignal.timeout(1500)
    })
    // 能收到 HTTP 响应 → 端口上确实有服务在跑
    return response.status >= 200 && response.status < 500
  } catch {
    return false
  }
}

/**
 * 注册引擎诊断与重试 IPC handler（托管模式专用能力）。
 *
 * - GET_ENGINE_DIAGNOSTICS：返回失败分类（含日志告警）、日志路径、进程状态；
 * - RETRY_ENGINE_START：请求桌面壳终止旧进程并重新启动引擎。
 *
 * 非托管（开发）模式下 bridge 不存在，诊断返回 null、重试返回 false，
 * 前端据此隐藏故障页面。
 */
export const registerEngineDiagnosticsIpc = (): void => {
  /**
   * 引擎实际 baseUrl（含动态端口）。托管模式返回 JavaBridge 自动选择的端口；
   * 未托管（开发）返回配置端口。前端启动与重试后调用以同步实际地址。
   */
  ipcMain.handle(IPC_CHANNELS.GET_ENGINE_BASE_URL, async (): Promise<string> => {
    return getManagedEngine()?.bridge.getActualBaseUrl() ?? engineBaseUrl
  })

  ipcMain.handle(IPC_CHANNELS.GET_ENGINE_DIAGNOSTICS, async (): Promise<EngineDiagnostics | null> => {
    const managed = getManagedEngine()
    if (managed === null) {
      return null
    }
    const { bridge, config } = managed

    const state = bridge.getState()
    // 仅在「引擎不在运行且无明确原因」时才做端口探测，避免每次诊断都发网络请求
    const needsPortProbe = state.kind !== "running" && bridge.getFailureReason() === null
    const portOccupied = needsPortProbe ? await isPortOccupiedByOther(bridge.getActualBaseUrl()) : false

    const result = classifyEngineDiagnostics({
      state,
      failureReason: bridge.getFailureReason(),
      jarExists: bridge.checkJarExists(),
      bundledRuntimeExists: bridge.checkJavaRuntimeExists(),
      requireBundledRuntime: config.requireBundledRuntime,
      portOccupiedByOther: portOccupied,
      logWarning: bridge.getLogWarning(),
      jarPath: config.jarPath,
      baseUrlLabel: bridge.getActualBaseUrl().replace(/^https?:\/\//, "")
    })

    let message = result.message
    const logWarning = bridge.getLogWarning()
    if (logWarning !== null) {
      message = `${message}（${logWarning}）`
    }

    return {
      code: result.code,
      message,
      logPath: bridge.getLogPath(),
      processAlive: state.kind === "running" || state.kind === "unhealthy" || state.kind === "starting"
    }
  })

  ipcMain.handle(IPC_CHANNELS.RETRY_ENGINE_START, async (): Promise<boolean> => {
    const managed = getManagedEngine()
    if (managed === null) {
      return false
    }
    // retry() 现在会等待旧进程真正退出再 spawn 新进程，
    // 避免 port-conflict；返回前新进程已 spawn。
    await managed.bridge.retry()
    void managed.bridge.waitForReady()
    return true
  })

  /**
   * 在系统默认应用中打开引擎日志文件（绝对路径）。
   * 安全边界：仅接受位于 userData/logs 下的**常规文件**，避免渲染进程任意打开本地文件。
   * 校验（logPathGuard.ts）：
   * - resolve 规范化后必须位于 userData/logs 内（拦截 ../ 路径穿越）；
   * - realpath 解析后仍位于其内（拦截绝对路径大小写绕过与符号链接指向目录外）；
   * - stat 确认是普通文件（拒绝目录 / 设备 / 链接）。
   * 打开失败（校验不过、文件不存在、shell 报错）返回 false，不抛异常。
   */
  ipcMain.handle(
    IPC_CHANNELS.OPEN_LOG_FILE,
    async (_event, logPath: unknown): Promise<boolean> => {
      if (typeof logPath !== "string") {
        return false
      }
      const allowedRoot = join(app.getPath("userData"), "logs")
      if (!isAllowedLogPath(logPath, allowedRoot)) {
        return false
      }
      try {
        const errorMessage = await shell.openPath(logPath)
        return errorMessage.length === 0
      } catch {
        return false
      }
    }
  )
}

/** 引擎日志文件是否存在（测试与排障辅助）。 */
export const engineLogPathExists = (logPath: string | null): boolean =>
  logPath !== null && existsSync(logPath)
