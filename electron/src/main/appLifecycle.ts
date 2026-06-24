import { app, BrowserWindow } from "electron"
import { registerAllIpc } from "../ipc/index.js"
import { JavaBridge } from "../engine/JavaBridge.js"
import { ENGINE_READY_TIMEOUT_MS } from "../engine/engineConfig.js"
import { engineBaseUrl, engineManaged } from "../config/devMode.js"
import { engineJarPath, projectRoot } from "../paths/paths.js"
import { registerAppProtocol } from "./protocol.js"
import { createMainWindow } from "./createMainWindow.js"

let bridge: JavaBridge | null = null

/** 启动 Java 渲染引擎子进程（仅生产/托管模式）。 */
const startEngine = (): void => {
  bridge = new JavaBridge({
    baseUrl: engineBaseUrl,
    jarPath: engineJarPath,
    cwd: projectRoot,
    readyTimeoutMs: ENGINE_READY_TIMEOUT_MS
  })

  // 启动前检查 jar 是否存在，不存在时 JavaBridge.start() 会输出中文错误
  if (!bridge.checkJarExists()) {
    console.error(
      `[app] 托管模式下找不到引擎 jar：${engineJarPath}\n` +
      `  开发模式请使用 npm run dev（不需要 jar），\n` +
      `  托管模式请先执行 Maven 构建：mvn -f java-engine/pom.xml clean package`
    )
    return
  }

  bridge.start()

  void bridge.waitForReady().then((ready) => {
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

  app.whenReady().then(() => {
    // 生产模式需要注册 app:// 协议处理器；开发模式不需要。
    if (engineManaged) {
      registerAppProtocol()
    }

    registerAllIpc()

    // 仅生产模式启动 Java 引擎子进程。
    if (engineManaged) {
      startEngine()
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

  app.on("before-quit", () => {
    bridge?.dispose()
    bridge = null
  })
}
