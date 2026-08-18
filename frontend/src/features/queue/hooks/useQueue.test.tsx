import { describe, expect, it, afterEach, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useQueue } from "./useQueue"
import type { PhotoAssetStore, ShootingPreset } from "../../metadata/types"
import { createEmptyAssetStore } from "../../metadata/types"

const makePreset = (id: string): ShootingPreset => ({
  id,
  name: `预设 ${id}`,
  category: "测试",
  captureFormat: "6x10",
  cameraAssetId: null,
  lensAssetId: null,
  filmAssetId: "film-1",
  defaultLocation: null,
  notes: null
})

const makeAssets = (): PhotoAssetStore => ({
  ...createEmptyAssetStore(),
  films: [{ id: "film-1", brand: "Kodak", name: "Portra 400", iso: "400", type: "Color", colorProfile: "neutral", discontinued: false, notes: "" }]
})

describe("useQueue（预设绑定与身份链，集成）", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("应用到当前图片 / 全部图片 / 清除绑定", async () => {
    const { result } = renderHook(() => useQueue())
    await act(async () => {
      await result.current.addFromPaths(["/photos/a.jpg", "/photos/b.jpg"])
    })
    expect(result.current.items).toHaveLength(2)

    // 应用到当前图片（选中的第一张）
    act(() => {
      result.current.assignPresetToSelected("p1")
    })
    expect(result.current.items.find((i) => i.isSelected)?.presetId).toBe("p1")

    // 应用到全部图片
    act(() => {
      result.current.assignPresetToAll("p2")
    })
    expect(result.current.items.every((i) => i.presetId === "p2")).toBe(true)

    // 清除当前 / 全部
    act(() => {
      result.current.clearSelectedPreset()
    })
    expect(result.current.items.find((i) => i.isSelected)?.presetId).toBeNull()
    act(() => {
      result.current.clearAllPresetBindings()
    })
    expect(result.current.items.every((i) => i.presetId === null)).toBe(true)
  })

  it("删除预设时清理悬空绑定（clearPresetBinding）", async () => {
    const { result } = renderHook(() => useQueue())
    await act(async () => {
      await result.current.addFromPaths(["/photos/a.jpg", "/photos/b.jpg"])
    })
    act(() => {
      result.current.assignPresetToAll("p1")
    })
    act(() => {
      result.current.clearPresetBinding("p1")
    })
    expect(result.current.items.every((i) => i.presetId === null)).toBe(true)
  })

  it("空字符串覆盖不会阻断继承（hook 层清理空值字段）", async () => {
    const { result } = renderHook(() => useQueue())
    await act(async () => {
      await result.current.addFromPaths(["/photos/a.jpg"])
    })

    act(() => {
      result.current.setSelectedIdentityOverride({ camera: "X", lens: "L" })
    })
    expect(result.current.items[0]?.identityOverride).toEqual({ camera: "X", lens: "L" })

    // 把 camera 覆盖为「空字符串」→ 该字段被清理，不阻断预设/EXIF 继承
    act(() => {
      result.current.setSelectedIdentityOverride({ camera: "" })
    })
    expect(result.current.items[0]?.identityOverride).toEqual({ lens: "L" })

    // 全部清空 → override 变为 null
    act(() => {
      result.current.setSelectedIdentityOverride({ lens: "" })
    })
    expect(result.current.items[0]?.identityOverride).toBeNull()
  })

  it("getEffectiveIdentity：每图覆盖 > 摄影预设 > EXIF > 空（预设未提供字段回落 EXIF）", async () => {
    const { result } = renderHook(() => useQueue())
    await act(async () => {
      await result.current.addFromPaths(["/photos/a.jpg"])
    })
    act(() => {
      result.current.assignPresetToSelected("p1")
    })

    const exifByPath = new Map<string, { cameraModel?: string; lensModel?: string }>([
      ["/photos/a.jpg", { cameraModel: "NIKON Z6", lensModel: "Nikkor 50mm" }]
    ])

    // 无覆盖、无预设 → EXIF 补齐数码信息
    const noPreset = result.current.getEffectiveIdentity(
      result.current.items[0]!.id, [], makeAssets(), exifByPath
    )
    expect(noPreset.camera).toBe("NIKON Z6")

    // 预设提供画幅+胶片，未提供相机/镜头 → 相机/镜头回落 EXIF
    const withPreset = result.current.getEffectiveIdentity(
      result.current.items[0]!.id, [makePreset("p1")], makeAssets(), exifByPath
    )
    expect(withPreset.camera).toBe("NIKON Z6")
    expect(withPreset.lens).toBe("Nikkor 50mm")
    expect(withPreset.film).toBe("Kodak Portra 400")
    expect(withPreset.captureFormat).toBe("6x10")

    // 每图覆盖 > 摄影预设
    act(() => {
      result.current.setSelectedIdentityOverride({ camera: "覆盖相机", captureFormat: "6x6" })
    })
    const withOverride = result.current.getEffectiveIdentity(
      result.current.items[0]!.id, [makePreset("p1")], makeAssets(), exifByPath
    )
    expect(withOverride.camera).toBe("覆盖相机")
    expect(withOverride.captureFormat).toBe("6x6")
    expect(withOverride.film).toBe("Kodak Portra 400")
  })
})
