import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PresetTextComposer } from "./PresetTextComposer"

describe("PresetTextComposer", () => {
  it("在管理抽屉中保留自由文本创建预设能力并把作用范围交给页面", () => {
    const onCreate = vi.fn()
    render(<PresetTextComposer operationScope="all" onCreate={onCreate} />)

    fireEvent.click(screen.getByRole("button", { name: "开始录入" }))
    fireEvent.change(screen.getByPlaceholderText("例如：135 Portra 日常"), { target: { value: "日常胶片" } })
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "135" } })
    fireEvent.change(screen.getByPlaceholderText("例如：Leica M6"), { target: { value: "Leica M6" } })
    fireEvent.click(screen.getByRole("button", { name: "保存并应用" }))

    expect(onCreate).toHaveBeenCalledWith({
      name: "日常胶片",
      category: "",
      captureFormat: "135",
      camera: "Leica M6",
      lens: "",
      film: "",
      location: ""
    }, "all")
    expect(screen.getByRole("button", { name: "开始录入" })).toBeTruthy()
  })

  it("缺少必填信息时不提交并显示错误", () => {
    const onCreate = vi.fn()
    render(<PresetTextComposer operationScope="active" onCreate={onCreate} />)

    fireEvent.click(screen.getByRole("button", { name: "开始录入" }))
    fireEvent.click(screen.getByRole("button", { name: "保存并应用" }))

    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByRole("alert").textContent).toContain("预设名称")
  })
})
