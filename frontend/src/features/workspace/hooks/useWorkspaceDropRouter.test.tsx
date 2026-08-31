import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useWorkspaceDropRouter } from "./useWorkspaceDropRouter"

const dispatchDrop = (files: readonly File[]): void => {
  const event = new Event("drop", { bubbles: true, cancelable: true })
  Object.defineProperty(event, "dataTransfer", { value: { files } })
  window.dispatchEvent(event)
}

describe("useWorkspaceDropRouter", () => {
  it("同一个图片 drop 只交给图片队列，不触发模板处理", () => {
    const onImagePaths = vi.fn()
    const { result } = renderHook(() => useWorkspaceDropRouter({ onImagePaths }))
    const image = new File(["photo"], "photo.jpg", { type: "image/jpeg" }) as File & { path?: string }
    Object.defineProperty(image, "path", { value: "/photos/photo.jpg" })
    act(() => dispatchDrop([image]))
    expect(onImagePaths).toHaveBeenCalledWith(["/photos/photo.jpg"])
    expect(result.current.droppedTemplateFile).toBeNull()
  })

  it("JSON drop 只进入模板确认层，不触发图片队列", () => {
    const onImagePaths = vi.fn()
    const { result } = renderHook(() => useWorkspaceDropRouter({ onImagePaths }))
    const template = new File(["{}"], "look.camborder-template.json", { type: "application/json" })
    act(() => dispatchDrop([template]))
    expect(result.current.droppedTemplateFile).toBe(template)
    expect(onImagePaths).not.toHaveBeenCalled()
  })
})
