import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useSettings } from "./useSettings"

describe("useSettings 渲染设置历史", () => {
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
})
