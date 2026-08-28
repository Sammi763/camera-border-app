import { app, BrowserWindow } from "electron"
import path from "node:path"
import { registerAllIpc } from "../ipc/index.js"
import { cleanupHeicTempFiles } from "../ipc/imageConvert.js"
import { JavaBridge } from "../engine/JavaBridge.js"
import { resolveBundledJavaExecutable, resolveBundledLibRawExecutable } from "../engine/engineRuntime.js"
import { ENGINE_READY_TIMEOUT_MS } from "../engine/engineConfig.js"
import type { EngineConfig } from "../engine/engineConfig.js"
import { engineBaseUrl, engineManaged, enginePort } from "../config/devMode.js"
import { engineCwd, engineJarPath, projectRoot } from "../paths/paths.js"
import { setManagedEngine } from "../engine/managedEngine.js"
import { registerAppProtocol } from "./protocol.js"
import { createMainWindow } from "./createMainWindow.js"

let bridge: JavaBridge | null = null
let isQuitting = false

/** 引擎日志文件路径（userData/logs/engine.log）。 */
const engineLogPath = (): string => path.join(app.getPath("userData"), "logs", "engine.log")

/**
 * 组装引擎配置并创建 JavaBridge。
 *
 * 运行时策略：
 * - 打包模式（engineManaged=true）：必须使用随包 Java Runtime；
 *   缺失时不回退系统 Java，由 JavaBridge 归类 runtime-missing 进入诊断页；
 * - 开发模式：优先随包运行时（本地验证打包布局用），允许回退系统 PATH 的 java。
 */
const buildBridge = (): JavaBridge => {
  const bundledJava = resolveBundledJavaExecutable()
  if (bundledJava === null && !engineManaged) {
    console.warn("[app] 开发模式未找到随包 Java Runtime，回退到系统 PATH 中的 java。")
  }

  // 随包 LibRaw 原生程序：存在时经环境变量注入引擎（RAW 真实显影）；
  // 缺失时不注入——引擎走嵌入预览降级并在 sourceDecode.warning 说明。
  const bundledLibRaw = resolveBundledLibRawExecutable()
  const engineEnv: Record<string, string> | undefined = bundledLibRaw !== null
    ? { CAMBORDER_LIBRAW_PATH: bundledLibRaw }
    : undefined
  if (bundledLibRaw === null) {
    console.warn("[app] 未找到随包 LibRaw 原生程序，RAW 将降级为嵌入预览。")
  }

  const base = {
    baseUrl: engineBaseUrl,
    jarPath: engineJarPath,
    cwd: engineManaged ? engineCwd : projectRoot,
    readyTimeoutMs: ENGINE_READY_TIMEOUT_MS,
    requireBundledRuntime: engineManaged,
    logPath: engineLogPath(),
    env: engineEnv,
    serverPort: enginePort
  }
  const config: EngineConfig = bundledJava !== null
    ? { ...base, javaExecutablePath: bundledJava }
    : base
  const newBridge = new JavaBridge(config)
  setManagedEngine(newBridge, config)
  return newBridge
}

/**
 * 启动 Java 渲染引擎子进程（仅生产/托管模式）。
 *
 * 返回 Promise：resolve 时 start() 已完成「端口探测 + spawn」（不等待引擎就绪，
 * 就绪探测 waitForReady 在后台推进）。生产窗口必须等本函数完成后再创建，
 * 否则前端可能在端口探测前同步到默认 8099，动态端口场景下健康/预览/EXIF/导出
 * 全部指向错误服务。
 *
 * 捕获局部引用 b：before-quit 会把模块级 bridge 置 null，异步回调必须
 * 使用捕获的实例，避免「bridge 为 null 的异常」；b.dispose 后 waitForReady
 * 会被 #shuttingDown/#generation 守卫快速中止，不会挂起。
 */
const startEngine = async (): Promise<void> => {
  bridge = buildBridge()

  // 启动前检查 jar 是否存在，不存在时 JavaBridge.start() 会输出中文错误
  if (!bridge.checkJarExists()) {
    console.error(
      `[app] 托管模式下找不到引擎 jar：${engineJarPath}\n` +
      `  开发模式请使用 npm run dev（不需要 jar），\n` +
      `  托管模式请先执行 Maven 构建：mvn -f java-engine/pom.xml clean package`
    )
    return
  }

  const b = bridge
  // 端口自动选择 + spawn 完成后返回；waitForReady 后台推进（不阻塞窗口创建）
  await b.start()
  void b.waitForReady().then((ready) => {
    if (!ready) {
      console.warn("[java-bridge] 引擎在超时时间内未就绪")
    }
  })
}

/**
 * 初始化并运行应用生命周期。
 *
 * 开发模式：不启动 JavaBridge（引擎由 IDEA 管理）。
 * 生产模式：启动 JavaBridge 管理 jar 子进程。
 */
export const runApplication = (): void => {
  const gotLock = app.requestSingleInstanceLock()

  if (!gotLock) {
    app.quit()
    return
  }

  app.on("second-instance", () => {
    const windows = BrowserWindow.getAllWindows()
    const primary = windows[0]
    if (primary) {
      if (primary.isMinimized()) {
        primary.restore()
      }
      primary.focus()
    }
  })

  app.whenReady().then(async () => {
    // 生产模式需要注册 app:// 协议处理器；开发模式不需要。
    if (engineManaged) {
      registerAppProtocol()
    }

    registerAllIpc()

    // 仅生产模式启动 Java 引擎子进程。
    // 关键时序：先 await startEngine（含端口探测 + spawn），再创建生产窗口，
    // 确保渲染进程启动时 getEngineBaseUrl() 已返回最终端口（动态端口场景）。
    if (engineManaged) {
      await startEngine()
    }

    void createMainWindow()

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createMainWindow()
      }
    })
  })

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit()
    }
  })

  app.on("before-quit", (event) => {
    // before-quit 默认会立刻结束 Electron。第一次触发时阻止退出，
    // 等引擎进程和临时文件清理完成后再触发一次 app.quit()，避免
    // 未响应 SIGTERM 的 Java 进程在应用退出后继续残留。
    if (isQuitting) {
      return
    }
    isQuitting = true

    const currentBridge = bridge
    bridge = null
    if (currentBridge === null) {
      void cleanupHeicTempFiles()
      return
    }

    event.preventDefault()
    void Promise.all([
      currentBridge.dispose(),
      cleanupHeicTempFiles()
    ]).catch((error: unknown) => {
      console.error("[app] 退出清理失败", error)
    }).finally(() => {
      app.quit()
    })
  })
}
