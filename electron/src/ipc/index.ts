import { registerAssetStorageIpc } from "./assetStorage.js"
import { registerFileDialogIpc } from "./fileDialog.js"
import { registerImageConvertIpc } from "./imageConvert.js"
import { registerTemplateStorageIpc } from "./templateStorage.js"
import { registerEngineDiagnosticsIpc } from "./engineDiagnostics.js"
import { registerNotificationsIpc } from "./notifications.js"

/**
 * 统一注册所有 IPC handler。
 *
 * 在 app.whenReady() 之后、窗口创建之前调用。
 */
export const registerAllIpc = (): void => {
  registerFileDialogIpc()
  registerTemplateStorageIpc()
  registerAssetStorageIpc()
  registerImageConvertIpc()
  // 引擎诊断与重试：bridge 未创建时诊断返回 null、重试返回 false（安全降级）
  registerEngineDiagnosticsIpc()
  // 系统通知：单图/批量导出完成或失败时使用；不可用时静默降级为 inline 状态
  registerNotificationsIpc()
}
