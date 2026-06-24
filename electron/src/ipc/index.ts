import { registerFileDialogIpc } from "./fileDialog.js"
import { registerTemplateStorageIpc } from "./templateStorage.js"

/**
 * 统一注册所有 IPC handler。
 *
 * 在 app.whenReady() 之后、窗口创建之前调用。
 */
export const registerAllIpc = (): void => {
  registerFileDialogIpc()
  registerTemplateStorageIpc()
}
