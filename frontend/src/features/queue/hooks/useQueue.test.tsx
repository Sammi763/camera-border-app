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

describe("useQueue（当前预览图与批量选中状态）", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("首次导入自动激活第一张；后续导入不改变当前预览图", async () => {
    const { result } = renderHook(() => useQueue())
    await act(async () => {
      await result.current.addFromPaths(["/photos/a.jpg"])
    })
    const firstId = result.current.items[0]!.id
    expect(result.current.activeItemId).toBe(firstId)

    await act(async () => {
      await result.current.addFromPaths(["/photos/b.jpg", "/photos/c.jpg"])
    })
    // 当前预览图仍是第一张，不被后续导入覆盖
    expect(result.current.activeItemId).toBe(firstId)
    expect(result.current.items).toHaveLength(3)
  })

  it("点击切换当前预览图（setActive）不改变批量选中集合", async () => {
    const { result } = renderHook(() => useQueue())
    await act(async () => {
      await result.current.addFromPaths(["/photos/a.jpg", "/photos/b.jpg"])
    })
    const ids = result.current.items.map((i) => i.id)
    const idA = ids[0]!
    const idB = ids[1]!

    act(() => {
      result.current.toggleChecked(idA)
    })
    expect(result.current.checkedItemIds).toEqual([idA])

    // 切换当前预览图不影响勾选
    act(() => {
      result.current.setActive(idB)
    })
    expect(result.current.activeItemId).toBe(idB)
    expect(result.current.checkedItemIds).toEqual([idA])
    expect(result.current.activeFilePath).toBe("/photos/b.jpg")
  })

  it("复选框切换 / 全选 / 取消全选，checkedCount 正确", async () => {
    const { result } = renderHook(() => useQueue())
    await act(async () => {
      await result.current.addFromPaths(["/photos/a.jpg", "/photos/b.jpg", "/photos/c.jpg"])
    })
    const ids = result.current.items.map((i) => i.id)

    act(() => {
      result.current.toggleChecked(ids[0]!)
    })
    act(() => {
      result.current.toggleChecked(ids[1]!)
    })
    expect(result.current.checkedCount).toBe(2)

    // 再次点击取消勾选
    act(() => {
      result.current.toggleChecked(ids[0]!)
    })
    expect(result.current.checkedItemIds).toEqual([ids[1]])

    act(() => {
      result.current.checkAll()
    })
    expect(result.current.checkedCount).toBe(3)
    expect(result.current.checkedItemIds).toEqual(ids)

    act(() => {
      result.current.uncheckAll()
    })
    expect(result.current.checkedCount).toBe(0)
  })

  it("清空队列时同时重置当前预览图与批量选中", async () => {
    const { result } = renderHook(() => useQueue())
    await act(async () => {
      await result.current.addFromPaths(["/photos/a.jpg", "/photos/b.jpg"])
    })
    act(() => {
      result.current.checkAll()
    })
    act(() => {
      result.current.clear()
    })
    expect(result.current.items).toHaveLength(0)
    expect(result.current.activeItemId).toBeNull()
    expect(result.current.checkedItemIds).toEqual([])
    expect(result.current.activeFilePath).toBeNull()
  })
})

describe("useQueue（预设作用域应用：当前 / 已选 / 全部）", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("应用到当前图片 / 已选图片 / 全部图片", async () => {
    const { result } = renderHook(() => useQueue())
    await act(async () => {
      await result.current.addFromPaths(["/photos/a.jpg", "/photos/b.jpg", "/photos/c.jpg"])
    })
    const ids = result.current.items.map((i) => i.id)
    const idA = ids[0]!
    const idB = ids[1]!
    const idC = ids[2]!
    // 首张自动激活
    expect(result.current.activeItemId).toBe(idA)

    // 当前图片作用域：只影响当前预览图
    act(() => {
      result.current.assignPresetToScope("p1", "active")
    })
    expect(result.current.items.map((i) => i.presetId)).toEqual(["p1", null, null])

    // 已选图片作用域：勾选 b、c 后应用，不影响当前预览图 a 的绑定
    act(() => {
      result.current.toggleChecked(idB)
      result.current.toggleChecked(idC)
    })
    act(() => {
      result.current.assignPresetToScope("p2", "checked")
    })
    expect(result.current.items.map((i) => i.presetId)).toEqual(["p1", "p2", "p2"])

    // 全部图片作用域
    act(() => {
      result.current.assignPresetToScope("p3", "all")
    })
    expect(result.current.items.every((i) => i.presetId === "p3")).toBe(true)

    // 清除作用域绑定：已选图片
    act(() => {
      result.current.clearPresetFromScope("checked")
    })
    expect(result.current.items.map((i) => i.presetId)).toEqual(["p3", null, null])
  })

  it("已选图片作用域在无勾选时不产生任何变更", async () => {
    const { result } = renderHook(() => useQueue())
    await act(async () => {
      await result.current.addFromPaths(["/photos/a.jpg", "/photos/b.jpg"])
    })
    act(() => {
      result.current.assignPresetToScope("p1", "checked")
    })
    expect(result.current.items.every((i) => i.presetId === null)).toBe(true)
  })

  it("删除预设时清理悬空绑定（clearPresetBinding）", async () => {
    const { result } = renderHook(() => useQueue())
    await act(async () => {
      await result.current.addFromPaths(["/photos/a.jpg", "/photos/b.jpg"])
    })
    act(() => {
      result.current.assignPresetToScope("p1", "all")
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
      result.current.setActiveIdentityOverride({ camera: "X", lens: "L" })
    })
    expect(result.current.items[0]?.identityOverride).toEqual({ camera: "X", lens: "L" })

    // 把 camera 覆盖为「空字符串」-> 该字段被清理，不阻断预设/EXIF 继承
    act(() => {
      result.current.setActiveIdentityOverride({ camera: "" })
    })
    expect(result.current.items[0]?.identityOverride).toEqual({ lens: "L" })

    // 全部清空 -> override 变为 null
    act(() => {
      result.current.setActiveIdentityOverride({ lens: "" })
    })
    expect(result.current.items[0]?.identityOverride).toBeNull()
  })

  it("getEffectiveIdentity：每图覆盖 > 摄影预设 > EXIF > 空（预设未提供字段回落 EXIF）", async () => {
    const { result } = renderHook(() => useQueue())
    await act(async () => {
      await result.current.addFromPaths(["/photos/a.jpg"])
    })
    act(() => {
      result.current.assignPresetToScope("p1", "active")
    })

    const exifByPath = new Map<string, { cameraModel?: string; lensModel?: string }>([
      ["/photos/a.jpg", { cameraModel: "NIKON Z6", lensModel: "Nikkor 50mm" }]
    ])

    // 无覆盖、无预设 -> EXIF 补齐数码信息
    const noPreset = result.current.getEffectiveIdentity(
      result.current.items[0]!.id, [], makeAssets(), exifByPath
    )
    expect(noPreset.camera).toBe("NIKON Z6")

    // 预设提供画幅+胶片，未提供相机/镜头 -> 相机/镜头回落 EXIF
    const withPreset = result.current.getEffectiveIdentity(
      result.current.items[0]!.id, [makePreset("p1")], makeAssets(), exifByPath
    )
    expect(withPreset.camera).toBe("NIKON Z6")
    expect(withPreset.lens).toBe("Nikkor 50mm")
    expect(withPreset.film).toBe("Kodak Portra 400")
    expect(withPreset.captureFormat).toBe("6x10")

    // 每图覆盖 > 摄影预设
    act(() => {
      result.current.setActiveIdentityOverride({ camera: "覆盖相机", captureFormat: "6x6" })
    })
    const withOverride = result.current.getEffectiveIdentity(
      result.current.items[0]!.id, [makePreset("p1")], makeAssets(), exifByPath
    )
    expect(withOverride.camera).toBe("覆盖相机")
    expect(withOverride.captureFormat).toBe("6x6")
    expect(withOverride.film).toBe("Kodak Portra 400")
  })
})
