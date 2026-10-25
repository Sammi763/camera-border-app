import { describe, expect, it, afterEach, beforeEach, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import { useQueue } from "./useQueue"
import type { PhotoAssetStore, ShootingPreset } from "../../metadata/types"
import type { QueueController } from "../types"
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

beforeEach(() => {
  localStorage.clear()
})

describe("useQueue（当前预览图与批量选中状态）", () => {
  afterEach(() => {
    localStorage.clear()
    delete (window as unknown as { desktop?: unknown }).desktop
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

  it("清空后的撤销恢复完整队列、当前预览图和勾选状态", async () => {
    const { result } = renderHook(() => useQueue())
    await act(async () => {
      await result.current.addFromPaths(["/photos/a.jpg", "/photos/b.jpg", "/photos/c.jpg"])
    })
    const ids = result.current.items.map((item) => item.id)
    act(() => {
      result.current.setActive(ids[1]!)
      result.current.toggleChecked(ids[0]!)
      result.current.toggleChecked(ids[2]!)
      result.current.clear()
    })

    expect(result.current.items).toEqual([])
    expect(result.current.activeItemId).toBeNull()
    expect(result.current.checkedItemIds).toEqual([])
    expect(result.current.canUndo).toBe(true)

    act(() => result.current.undo())
    expect(result.current.items.map((item) => item.id)).toEqual(ids)
    expect(result.current.activeItemId).toBe(ids[1])
    expect(result.current.checkedItemIds).toEqual([ids[0], ids[2]])

    act(() => result.current.redo())
    expect(result.current.items).toEqual([])
    expect(result.current.activeItemId).toBeNull()
    expect(result.current.checkedItemIds).toEqual([])
  })

  it("删除当前图时确定性选择下一张；删除末张时选择上一张", async () => {
    const { result } = renderHook(() => useQueue())
    await act(async () => {
      await result.current.addFromPaths(["/photos/a.jpg", "/photos/b.jpg", "/photos/c.jpg"])
    })
    const [idA, idB, idC] = result.current.items.map((item) => item.id)

    act(() => result.current.setActive(idB!))
    act(() => result.current.removeItem(idB!))
    expect(result.current.activeItemId).toBe(idC)

    act(() => result.current.setActive(idC!))
    act(() => result.current.removeItem(idC!))
    expect(result.current.activeItemId).toBe(idA)
  })

  it("删除已选、清空与每图覆盖都可撤销/重做，且恢复 active/checked 快照", async () => {
    const { result } = renderHook(() => useQueue())
    await act(async () => {
      await result.current.addFromPaths(["/photos/a.jpg", "/photos/b.jpg", "/photos/c.jpg"])
    })
    const ids = result.current.items.map((item) => item.id)
    act(() => {
      result.current.setActive(ids[1]!)
      result.current.toggleChecked(ids[0]!)
      result.current.toggleChecked(ids[2]!)
      result.current.removeChecked()
    })
    expect(result.current.items.map((item) => item.fileName)).toEqual(["b.jpg"])
    expect(result.current.activeItemId).toBe(ids[1])
    expect(result.current.canUndo).toBe(true)

    act(() => result.current.undo())
    expect(result.current.items).toHaveLength(3)
    expect(result.current.checkedItemIds).toEqual([ids[0], ids[2]])
    act(() => result.current.redo())
    expect(result.current.items.map((item) => item.fileName)).toEqual(["b.jpg"])

    act(() => result.current.setActiveTextOverride("单图文字"))
    expect(result.current.activeTextOverride).toBe("单图文字")
    act(() => result.current.undo())
    expect(result.current.activeTextOverride).toBeNull()
    act(() => result.current.redo())
    expect(result.current.activeTextOverride).toBe("单图文字")
  })

  it("恢复本地工作会话时检查源文件并标记丢失文件", async () => {
    const restored = [
      {
        id: "available", filePath: "/photos/available.jpg", fileName: "available.jpg", sourcePath: "/photos/available.jpg",
        sourceFormat: "jpg", converted: false, workingFormat: "jpg", textOverride: null, presetId: null, identityOverride: null
      },
      {
        id: "missing", filePath: "/photos/missing.jpg", fileName: "missing.jpg", sourcePath: "/photos/missing.jpg",
        sourceFormat: "jpg", converted: false, workingFormat: "jpg", textOverride: null, presetId: null, identityOverride: null
      }
    ]
    localStorage.setItem("workspace.queue-session.v1", JSON.stringify({
      items: restored,
      activeItemId: "missing",
      checkedItemIds: ["available"]
    }))
    ;(window as unknown as { desktop?: unknown }).desktop = {
      checkImagePaths: vi.fn(async () => [true, false]),
      convertHeicFiles: vi.fn(async (paths: readonly string[]) => paths)
    }

    const { result } = renderHook(() => useQueue())
    await waitFor(() => expect(result.current.missingCount).toBe(1))
    expect(result.current.items.find((item) => item.id === "missing")?.missing).toBe(true)
    // 原 active 文件缺失时不让预览请求不存在的路径，确定性回退到可用条目。
    expect(result.current.activeItemId).toBe("available")
    expect(result.current.checkedItemIds).toEqual(["available"])
    delete (window as unknown as { desktop?: unknown }).desktop
  })
})

describe("useQueue（导入去重）", () => {
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it("重复导入同一 sourcePath 时跳过并计入 skippedDuplicateCount", async () => {
    const { result } = renderHook(() => useQueue())
    await act(async () => {
      await result.current.addFromPaths(["/photos/a.jpg"])
    })
    expect(result.current.items).toHaveLength(1)

    await act(async () => {
      await result.current.addFromPaths(["/photos/a.jpg"])
    })
    expect(result.current.items).toHaveLength(1)
    expect(result.current.lastImportResult?.skippedDuplicateCount).toBe(1)
    expect(result.current.lastImportResult?.successCount).toBe(0)
  })

  it("混合新旧路径时只导入新路径，跳过计数正确", async () => {
    const { result } = renderHook(() => useQueue())
    await act(async () => {
      await result.current.addFromPaths(["/photos/a.jpg", "/photos/b.jpg"])
    })
    await act(async () => {
      await result.current.addFromPaths(["/photos/b.jpg", "/photos/c.jpg", "/photos/d.jpg"])
    })
    expect(result.current.items.map((item) => item.fileName)).toEqual(["a.jpg", "b.jpg", "c.jpg", "d.jpg"])
    expect(result.current.lastImportResult?.skippedDuplicateCount).toBe(1)
    expect(result.current.lastImportResult?.successCount).toBe(2)
  })

  it("同一批内的重复路径也只保留一次", async () => {
    const { result } = renderHook(() => useQueue())
    await act(async () => {
      await result.current.addFromPaths(["/photos/a.jpg", "/photos/a.jpg"])
    })
    expect(result.current.items).toHaveLength(1)
    expect(result.current.lastImportResult?.skippedDuplicateCount).toBe(1)
  })

  it("反斜杠路径与正斜杠路径视为同一文件（Windows 路径归一）", async () => {
    const { result } = renderHook(() => useQueue())
    await act(async () => {
      await result.current.addFromPaths(["C:\\photos\\a.jpg"])
    })
    await act(async () => {
      await result.current.addFromPaths(["C:/photos/a.jpg"])
    })
    expect(result.current.items).toHaveLength(1)
    expect(result.current.lastImportResult?.skippedDuplicateCount).toBe(1)
  })

  it("空数组导入为空操作，不产生导入结果", async () => {
    const { result } = renderHook(() => useQueue())
    await act(async () => {
      await result.current.addFromPaths([])
    })
    expect(result.current.items).toHaveLength(0)
    expect(result.current.lastImportResult).toBeNull()
  })
})

describe("useQueue（队列批量关闭 / 排序 / 拖拽排序）", () => {
  const importThree = async (): Promise<{ result: { current: QueueController }; ids: string[] }> => {
    const rendered = renderHook(() => useQueue())
    await act(async () => {
      await rendered.result.current.addFromPaths(["/photos/a.jpg", "/photos/b.jpg", "/photos/c.jpg"])
    })
    return { result: rendered.result, ids: rendered.result.current.items.map((item) => item.id) }
  }

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it("removeOthers 只保留指定图片，active 落在保留条目上且可撤销", async () => {
    const { result, ids } = await importThree()
    act(() => result.current.setActive(ids[2]!))
    act(() => result.current.removeOthers(ids[0]!))
    expect(result.current.items.map((item) => item.id)).toEqual([ids[0]])
    expect(result.current.activeItemId).toBe(ids[0])
    expect(result.current.canUndo).toBe(true)

    act(() => result.current.undo())
    expect(result.current.items).toHaveLength(3)
    expect(result.current.activeItemId).toBe(ids[2])
  })

  it("removeOthers 保留条目的勾选状态；未勾选时勾选集清空", async () => {
    const { result, ids } = await importThree()
    act(() => result.current.toggleChecked(ids[1]!))
    act(() => result.current.removeOthers(ids[0]!))
    expect(result.current.checkedItemIds).toEqual([])

    act(() => result.current.undo())
    act(() => result.current.removeOthers(ids[1]!))
    expect(result.current.checkedItemIds).toEqual([ids[1]])
  })

  it("removeLeftOf / removeRightOf 删除对应侧条目且保持 active 确定性", async () => {
    const { result, ids } = await importThree()
    act(() => result.current.removeLeftOf(ids[2]!))
    expect(result.current.items.map((item) => item.id)).toEqual([ids[2]])
    expect(result.current.activeItemId).toBe(ids[2])

    act(() => result.current.undo())
    expect(result.current.items).toHaveLength(3)

    act(() => result.current.removeRightOf(ids[0]!))
    expect(result.current.items.map((item) => item.id)).toEqual([ids[0]])
  })

  it("对不存在的 id 操作与空队列边界都不产生变更", async () => {
    const { result, ids } = await importThree()
    act(() => result.current.removeLeftOf("not-exist"))
    act(() => result.current.removeRightOf("not-exist"))
    act(() => result.current.removeOthers("not-exist"))
    act(() => result.current.reorder("not-exist", 0))
    act(() => result.current.reorder(ids[0]!, Number.NaN))
    expect(result.current.items).toHaveLength(3)
    // 无效操作不产生历史：撤销一次直接回到导入前的空队列
    act(() => result.current.undo())
    expect(result.current.items).toHaveLength(0)

    act(() => result.current.redo())
    act(() => result.current.clear())
    act(() => result.current.removeLeftOf(ids[0]!))
    act(() => result.current.removeOthers(ids[0]!))
    expect(result.current.items).toHaveLength(0)
  })

  it("reorder 移动条目到目标下标；越界自动钳制", async () => {
    const { result, ids } = await importThree()
    act(() => result.current.reorder(ids[0]!, 2))
    expect(result.current.items.map((item) => item.id)).toEqual([ids[1], ids[2], ids[0]])

    // 负数下标钳制到队首
    act(() => result.current.reorder(ids[0]!, -5))
    expect(result.current.items.map((item) => item.id)).toEqual([ids[0], ids[1], ids[2]])
  })

  it("拖回原位不产生撤销历史", async () => {
    const { result, ids } = await importThree()
    act(() => result.current.reorder(ids[1]!, 1))
    // 只有导入这一条历史：撤销直接清空队列，而不是先撤销一次无变化的 reorder
    act(() => result.current.undo())
    expect(result.current.items).toHaveLength(0)
  })

  it("reorder 后可撤销恢复原顺序", async () => {
    const { result, ids } = await importThree()
    act(() => result.current.reorder(ids[0]!, 2))
    act(() => result.current.undo())
    expect(result.current.items.map((item) => item.id)).toEqual(ids)
  })

  it("sortByName 升序降序；同名文件保持原相对顺序（稳定排序）", async () => {
    const { result } = renderHook(() => useQueue())
    // 两个不同目录下的同名文件：fileName 相同，稳定排序必须保持导入时的相对顺序
    await act(async () => {
      await result.current.addFromPaths([
        "/photos/IMG_2.jpg",
        "/photos/roll-a/DUP.jpg",
        "/photos/IMG_10.jpg",
        "/photos/roll-b/DUP.jpg",
        "/photos/IMG_1.jpg"
      ])
    })
    const dupFirstId = result.current.items.find((item) => item.sourcePath === "/photos/roll-a/DUP.jpg")!.id
    const dupSecondId = result.current.items.find((item) => item.sourcePath === "/photos/roll-b/DUP.jpg")!.id

    act(() => result.current.sortByName("asc"))
    // 数值排序：IMG_1 < IMG_2 < IMG_10；同名 DUP 按原顺序在前
    expect(result.current.items.map((item) => item.fileName)).toEqual([
      "DUP.jpg", "DUP.jpg", "IMG_1.jpg", "IMG_2.jpg", "IMG_10.jpg"
    ])
    const ascOrder = result.current.items.map((item) => item.id)
    expect(ascOrder.indexOf(dupFirstId)).toBeLessThan(ascOrder.indexOf(dupSecondId))

    act(() => result.current.sortByName("desc"))
    expect(result.current.items.map((item) => item.fileName)).toEqual([
      "IMG_10.jpg", "IMG_2.jpg", "IMG_1.jpg", "DUP.jpg", "DUP.jpg"
    ])
    // 降序时同名文件仍保持原相对顺序
    const descOrder = result.current.items.map((item) => item.id)
    expect(descOrder.indexOf(dupFirstId)).toBeLessThan(descOrder.indexOf(dupSecondId))
  })

  it("sortByName 已是目标顺序时不产生撤销历史", async () => {
    const { result, ids } = await importThree()
    // a.jpg / b.jpg / c.jpg 已经是升序
    act(() => result.current.sortByName("asc"))
    expect(result.current.items.map((item) => item.id)).toEqual(ids)
    // 只有导入这一条历史：撤销直接清空队列
    act(() => result.current.undo())
    expect(result.current.items).toHaveLength(0)
  })
})

describe("useQueue（预设作用域应用：当前 / 已选 / 全部）", () => {
  afterEach(() => {
    localStorage.clear()
    delete (window as unknown as { desktop?: unknown }).desktop
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
