import { registerAssetStorageIpc } from "./assetStorage.js"
import { registerFileDialogIpc } from "./fileDialog.js"
import { registerImageConvertIpc } from "./imageConvert.js"
import { registerTemplateStorageIpc } from "./templateStorage.js"
import { registerEngineDiagnosticsIpc } from "./engineDiagnostics.js"
import { registerNotificationsIpc } from "./notifications.js"
import { registerLocalImagePreviewIpc } from "./localImagePreview.js"
import { registerFilePresenceIpc, registerImageFileVersionIpc } from "./filePresence.js"

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
  // 本地图片预览：引擎不可用时为工作台与队列缩略图提供兜底预览
  registerLocalImagePreviewIpc()
  // 会话恢复只获得受限的文件存在性结果，不把文件系统能力暴露给渲染进程。
  registerFilePresenceIpc()
  // 预览缓存仅用 mtime/字节数失效，不向渲染进程暴露文件内容或目录能力。
  registerImageFileVersionIpc()
}
