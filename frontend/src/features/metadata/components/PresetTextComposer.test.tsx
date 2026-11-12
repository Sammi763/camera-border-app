import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PresetTextComposer } from "./PresetTextComposer"

/**
 * U10/U12：预设创建主入口统一为「新建拍摄信息预设」，默认直接展开填写；
 * 「保存并应用」明确表达创建预设同时应用到当前范围。
 */
describe("PresetTextComposer", () => {
  it("默认展开直接填写；保存并应用后回到收起摘要态", () => {
    const onCreate = vi.fn()
    render(<PresetTextComposer operationScope="all" onCreate={onCreate} />)

    // 默认展开：无需先点击「开始录入」
    expect(screen.getByRole("button", { name: "收起" })).toBeTruthy()
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

    fireEvent.click(screen.getByRole("button", { name: "保存并应用" }))

    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByRole("alert").textContent).toContain("预设名称")
  })

  it("收起后可通过「开始录入」重新展开", () => {
    render(<PresetTextComposer operationScope="active" onCreate={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "收起" }))
    expect(screen.getByRole("button", { name: "开始录入" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "开始录入" }))
    expect(screen.getByRole("button", { name: "保存并应用" })).toBeTruthy()
  })
})
