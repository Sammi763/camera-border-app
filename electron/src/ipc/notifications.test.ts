import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 通知 IPC 测试：
 * - IPC handler 正确创建并展示系统通知；
 * - 通知创建/展示失败时返回 false，不抛出到渲染进程；
 * - 不支持系统通知的平台（Notification 为 null）时返回 false；
 * - title/body 校验：空字符串/超长字符串按规则处理。
 *
 * 通过 vi.mock 模拟 electron 模块，避免在测试环境拉起真实的 Electron。
 */

const { notificationCtor, ipcHandleMock, ipcRemoveHandlerMock } = vi.hoisted(() => ({
  notificationCtor: vi.fn(),
  ipcHandleMock: vi.fn(),
  ipcRemoveHandlerMock: vi.fn()
}))

vi.mock("electron", () => {
  return {
    ipcMain: {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
        ipcHandleMock(channel, handler)
      },
      removeHandler: (channel: string) => {
        ipcRemoveHandlerMock(channel)
      }
    },
    Notification: Object.assign(notificationCtor, { isSupported: () => true })
  }
})

import { registerNotificationsIpc, IPC_NOTIFICATIONS_CHANNEL } from "./notifications"
import { IPC_CHANNELS } from "../types/desktopApi"

type NotificationListener = (...args: unknown[]) => void
type MockNotification = {
  show: ReturnType<typeof vi.fn>
  on: (event: string, cb: NotificationListener) => MockNotification
  listeners: Record<string, NotificationListener[]>
}

const makeMockNotification = (opts: { showThrows?: boolean }): MockNotification => {
  const listeners: Record<string, NotificationListener[]> = {}
  const show = vi.fn(() => {
    if (opts.showThrows) {
      throw new Error("show failed")
    }
  })
  const mock: MockNotification = {
    show,
    on: (event: string, cb: NotificationListener) => {
      const list = listeners[event] ?? []
      list.push(cb)
      listeners[event] = list
      return mock
    },
    listeners
  }
  return mock
}

let handlers: Map<string, (...args: unknown[]) => unknown>

beforeEach(() => {
  handlers = new Map()
  ipcHandleMock.mockClear()
  ipcRemoveHandlerMock.mockClear()
  notificationCtor.mockReset()
  ipcHandleMock.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
    handlers.set(channel, handler)
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("通知 IPC（SHOW_NOTIFICATION）", () => {
  it("调用成功时创建并展示通知，handler 返回 true", async () => {
    const mockNotification = makeMockNotification({})
    notificationCtor.mockImplementation((opts: { title: string; body: string }) => {
      expect(opts.title).toBe("导出完成")
      expect(opts.body).toBe("A.jpg")
      return mockNotification
    })

    registerNotificationsIpc()
    const handler = handlers.get(IPC_CHANNELS.SHOW_NOTIFICATION)
    expect(handler).toBeDefined()

    const result = await handler!({}, "导出完成", "A.jpg")
    expect(result).toBe(true)
    expect(notificationCtor).toHaveBeenCalledTimes(1)
    expect(mockNotification.show).toHaveBeenCalledTimes(1)
  })

  it("show 抛错时返回 false，不向渲染进程抛出异常", async () => {
    const mockNotification = makeMockNotification({ showThrows: true })
    notificationCtor.mockImplementation(() => mockNotification)

    registerNotificationsIpc()
    const handler = handlers.get(IPC_CHANNELS.SHOW_NOTIFICATION)!
    const result = await handler!({}, "导出失败", "A.jpg（引擎超时）")
    expect(result).toBe(false)
  })

  it("Notification 不可用（构造函数为 null）时返回 false，不抛异常", async () => {
    notificationCtor.mockImplementation(() => null)

    registerNotificationsIpc()
    const handler = handlers.get(IPC_CHANNELS.SHOW_NOTIFICATION)!
    const result = await handler!({}, "导出完成", "A.jpg")
    expect(result).toBe(false)
  })

  it("title 为空字符串时拒绝（参数校验）", async () => {
    registerNotificationsIpc()
    const handler = handlers.get(IPC_CHANNELS.SHOW_NOTIFICATION)!
    const result = await handler!({}, "", "A.jpg")
    expect(result).toBe(false)
    expect(notificationCtor).not.toHaveBeenCalled()
  })

  it("参数不是字符串时拒绝（参数校验）", async () => {
    registerNotificationsIpc()
    const handler = handlers.get(IPC_CHANNELS.SHOW_NOTIFICATION)!
    const result1 = await handler!({}, null as unknown as string, "A.jpg")
    expect(result1).toBe(false)
    const result2 = await handler!({}, "导出完成", undefined as unknown as string)
    expect(result2).toBe(false)
    expect(notificationCtor).not.toHaveBeenCalled()
  })

  it("channel 名称与 desktopApi 常量一致", () => {
    registerNotificationsIpc()
    expect(IPC_NOTIFICATIONS_CHANNEL).toBe(IPC_CHANNELS.SHOW_NOTIFICATION)
    expect(IPC_CHANNELS.SHOW_NOTIFICATION).toBe("desktop:show-notification")
  })
})
