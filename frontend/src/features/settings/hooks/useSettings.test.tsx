import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { useSettings } from "./useSettings"

describe("useSettings 渲染设置历史", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("边框和文字图层的设置变更可撤销/重做，且历史不会共享嵌套引用", () => {
    const { result } = renderHook(() => useSettings())
    const firstLayerId = result.current.settings.textLayers[0]!.id
    const initialTop = result.current.settings.borderTop
    const initialContent = result.current.settings.textLayers[0]!.content

    act(() => {
      result.current.update({ borderTop: 88 })
      result.current.updateTextLayer(firstLayerId, { content: "冻结的图层内容" })
    })
    expect(result.current.settings.borderTop).toBe(88)
    expect(result.current.settings.textLayers[0]?.content).toBe("冻结的图层内容")
    expect(result.current.canUndo).toBe(true)

    act(() => result.current.undo())
    expect(result.current.settings.borderTop).toBe(88)
    expect(result.current.settings.textLayers[0]?.content).toBe(initialContent)
    act(() => result.current.undo())
    expect(result.current.settings.borderTop).toBe(initialTop)
    expect(result.current.canRedo).toBe(true)

    act(() => result.current.redo())
    expect(result.current.settings.borderTop).toBe(88)
    act(() => result.current.redo())
    expect(result.current.settings.textLayers[0]?.content).toBe("冻结的图层内容")
  })

  it("相同 historyTag 的连续更新合并为一条撤销历史，不同标签互不合并", () => {
    const { result } = renderHook(() => useSettings())
    const initialTop = result.current.settings.borderTop

    // 模拟一次拖动手势：多次 update 携带相同标签
    act(() => {
      result.current.update({ borderTop: 10 }, { historyTag: "drag-gesture-1" })
      result.current.update({ borderTop: 20 }, { historyTag: "drag-gesture-1" })
      result.current.update({ borderTop: 30 }, { historyTag: "drag-gesture-1" })
    })
    expect(result.current.settings.borderTop).toBe(30)

    // 一次撤销应回到手势开始前，而不是中间状态
    act(() => result.current.undo())
    expect(result.current.settings.borderTop).toBe(initialTop)

    // 重做到手势终点
    act(() => result.current.redo())
    expect(result.current.settings.borderTop).toBe(30)

    // 第二次拖动（新标签）必须产生独立历史条目
    act(() => {
      result.current.update({ borderTop: 40 }, { historyTag: "drag-gesture-2" })
      result.current.update({ borderTop: 50 }, { historyTag: "drag-gesture-2" })
    })
    act(() => result.current.undo())
    expect(result.current.settings.borderTop).toBe(30)

    // 无标签更新打断后，同标签的后续更新不得与已结束手势合并
    act(() => {
      result.current.update({ borderTop: 60 })
      result.current.update({ borderTop: 70 }, { historyTag: "drag-gesture-2" })
    })
    act(() => result.current.undo())
    expect(result.current.settings.borderTop).toBe(60)
  })

  it("重启 hook 后恢复图片区域、版式、输出档位和水印设置", () => {
    const first = renderHook(() => useSettings())
    const imageArea = {
      orientation: "portrait" as const,
      ratio: "4:5" as const,
      displayMode: "fill" as const,
      focalX: 0.2,
      focalY: 0.8,
      rotation: 90,
      targetAspectRatioOverride: null
    }

    act(() => {
      first.result.current.update({
        imageArea,
        layoutPresetId: "polaroid",
        exportFormat: "png",
        outputSizePreset: "2k",
        tier: "standard-delivery",
        logo: { ...first.result.current.settings.logo, enabled: true, brand: "NIKON" }
      })
    })
    first.unmount()

    const second = renderHook(() => useSettings())
    expect(second.result.current.restoredFromStorage).toBe(true)
    expect(second.result.current.settings.imageArea).toEqual(imageArea)
    expect(second.result.current.settings.imagePlacement).toMatchObject({
      mode: "fill",
      targetAspectRatio: 4 / 5,
      rotation: 90
    })
    expect(second.result.current.settings.layoutPresetId).toBe("polaroid")
    expect(second.result.current.settings.exportFormat).toBe("png")
    expect(second.result.current.settings.outputSizePreset).toBe("2k")
    expect(second.result.current.settings.logo).toMatchObject({ enabled: true, brand: "NIKON" })
  })

  it("损坏或不完整的持久化设置回退默认值，不标记为已恢复", () => {
    localStorage.setItem("camborder-workspace-settings.v1", JSON.stringify({
      schemaVersion: 1,
      settings: { exportFormat: "gif", outputSizePreset: "original" }
    }))
    const { result } = renderHook(() => useSettings())
    expect(result.current.restoredFromStorage).toBe(false)
    expect(result.current.settings.exportFormat).toBe("jpeg")
  })
})
