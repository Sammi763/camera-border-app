import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import { useShootingPresets } from "./useShootingPresets"
import type { ShootingPreset } from "../types"

/** 构造一个合法预设。 */
const makePreset = (patch: Partial<ShootingPreset> = {}): ShootingPreset => ({
  id: "preset-1",
  name: "135 Portra 日常",
  category: "135 胶片",
  captureFormat: "135",
  cameraAssetId: null,
  lensAssetId: null,
  filmAssetId: null,
  defaultLocation: null,
  notes: null,
  ...patch
})

const LS_KEY = "camborder-presets"

/** 读写记录（用于断言 Electron IPC 调用）。 */
type DesktopMock = {
  readonly readPresets: ReturnType<typeof vi.fn>
  readonly writePresets: ReturnType<typeof vi.fn>
}

const installDesktopBridge = (overrides: Partial<DesktopMock> = {}): DesktopMock => {
  const mock: DesktopMock = {
    readPresets: vi.fn(async () => "[]"),
    writePresets: vi.fn(async () => {}),
    ...overrides
  }
  ;(window as unknown as { desktop?: unknown }).desktop = mock
  return mock
}

const removeDesktopBridge = (): void => {
  delete (window as unknown as { desktop?: unknown }).desktop
}

describe("useShootingPresets（集成）", () => {
  beforeEach(() => {
    localStorage.clear()
    removeDesktopBridge()
  })

  afterEach(() => {
    removeDesktopBridge()
  })

  it("localStorage 路径：加载、创建、复制、删除并持久化", async () => {
    const { result } = renderHook(() => useShootingPresets())

    // 初始加载为空列表
    await waitFor(() => expect(result.current.presets).toEqual([]))

    // 创建预设 → 写入 localStorage
    act(() => {
      result.current.savePreset(makePreset())
    })
    await waitFor(() => {
      const raw = localStorage.getItem(LS_KEY)
      expect(raw).not.toBeNull()
      expect(JSON.parse(raw ?? "[]")).toHaveLength(1)
    })

    // 复制预设：从状态断言复制结果（避免闭包赋值的类型窄化问题）
    act(() => {
      result.current.duplicatePreset("preset-1")
    })
    await waitFor(() => {
      const copies = result.current.presets.filter((p) => p.id !== "preset-1")
      expect(copies).toHaveLength(1)
      expect(copies[0]?.name).toContain("（副本）")
    })

    // 删除预设
    act(() => {
      result.current.deletePreset("preset-1")
    })
    await waitFor(() => expect(result.current.presets).toHaveLength(1))
  })

  it("localStorage 损坏 JSON → lastError 提示且不崩溃", async () => {
    localStorage.setItem(LS_KEY, "{{{corrupt")
    const { result } = renderHook(() => useShootingPresets())

    await waitFor(() => {
      expect(result.current.lastError).toContain("不是合法 JSON")
    })
    expect(result.current.presets).toEqual([])
  })

  it("localStorage 读取失败（隐私模式抛错）→ lastError 提示", async () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied")
    })
    try {
      const { result } = renderHook(() => useShootingPresets())
      await waitFor(() => {
        expect(result.current.lastError).toContain("读取失败")
      })
      expect(result.current.presets).toEqual([])
    } finally {
      getItemSpy.mockRestore()
    }
  })

  it("Electron IPC 路径：readPresets 加载、savePreset 写回", async () => {
    const bridge = installDesktopBridge({
      readPresets: vi.fn(async () => JSON.stringify([makePreset()]))
    })
    const { result } = renderHook(() => useShootingPresets())

    await waitFor(() => {
      expect(bridge.readPresets).toHaveBeenCalled()
      expect(result.current.presets).toHaveLength(1)
    })
    expect(result.current.presets[0]?.captureFormat).toBe("135")

    act(() => {
      result.current.savePreset(makePreset({ id: "preset-2", name: "中画幅", captureFormat: "6x10" }))
    })
    await waitFor(() => {
      expect(bridge.writePresets).toHaveBeenCalled()
    })
    const written = JSON.parse(bridge.writePresets.mock.calls[0]![0] as string) as ShootingPreset[]
    expect(written).toHaveLength(2)
    expect(written.map((p) => p.captureFormat)).toEqual(["135", "6x10"])
  })

  it("Electron IPC 读取失败 → lastError 提示", async () => {
    installDesktopBridge({
      readPresets: vi.fn(async () => { throw new Error("EACCES") })
    })
    const { result } = renderHook(() => useShootingPresets())

    await waitFor(() => {
      expect(result.current.lastError).toContain("读取失败")
    })
    expect(result.current.presets).toEqual([])
  })

  it("Electron IPC 写入失败 → lastError 保存失败提示", async () => {
    const bridge = installDesktopBridge({
      writePresets: vi.fn(async () => { throw new Error("ENOSPC") })
    })
    const { result } = renderHook(() => useShootingPresets())

    await waitFor(() => expect(result.current.presets).toEqual([]))
    act(() => {
      result.current.savePreset(makePreset())
    })
    await waitFor(() => {
      expect(result.current.lastError).toContain("保存失败")
    })
  })

  it("删除不存在预设 ID 不报错", async () => {
    const { result } = renderHook(() => useShootingPresets())
    await waitFor(() => expect(result.current.presets).toEqual([]))
    act(() => {
      result.current.deletePreset("no-such-id")
    })
    expect(result.current.presets).toEqual([])
  })
})
