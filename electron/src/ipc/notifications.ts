import { ipcMain, Notification } from "electron"
import { IPC_CHANNELS } from "../types/desktopApi.js"

/**
 * 系统通知 IPC handler。
 *
 * 由渲染进程在导出完成/失败时调用，展示系统级通知。
 * 通知不展示绝对路径，只展示文件名（避免隐私外泄）。
 *
 * 设计原则：
 * - 不向渲染进程抛出异常：所有失败都返回 false，让前端降级为 inline 状态；
 * - 平台不支持 Notification（isSupported() === false 或构造函数为 null）时返回 false；
 * - 参数校验：title/body 必须是字符串且非空；非法参数返回 false；
 * - 通知点击默认无操作（与现有工作台状态共存，不主动切窗口/关闭）。
 */
export const IPC_NOTIFICATIONS_CHANNEL = IPC_CHANNELS.SHOW_NOTIFICATION

const MAX_TITLE_LENGTH = 80
const MAX_BODY_LENGTH = 200

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

const sanitize = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max - 1)}…`

/**
 * 注册 SHOW_NOTIFICATION IPC handler。
 *
 * 在 registerAllIpc() 中调用一次；重复注册会抛错（ipcMain.handle 的标准行为）。
 */
export const registerNotificationsIpc = (): void => {
  ipcMain.handle(
    IPC_CHANNELS.SHOW_NOTIFICATION,
    async (_event, title: unknown, body: unknown): Promise<boolean> => {
      if (!isNonEmptyString(title) || !isNonEmptyString(body)) {
        return false
      }
      // Notification 在某些平台/环境下可能未启用（如 Linux 无 libnotify）
      if (typeof Notification !== "function" || !Notification.isSupported?.()) {
        return false
      }
      try {
        const n = new Notification({
          title: sanitize(title, MAX_TITLE_LENGTH),
          body: sanitize(body, MAX_BODY_LENGTH)
        })
        n.show()
        return true
      } catch {
        // 静默降级：不影响导出结果
        return false
      }
    }
  )
}
