import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { ModalDrawer } from "./ModalDrawer"

describe("ModalDrawer", () => {
  it("锁定 Tab 焦点，Escape 关闭并把焦点还给打开按钮", async () => {
    const Harness = (): JSX.Element => {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>打开管理器</button>
          <ModalDrawer open={open} title="管理器" onClose={() => setOpen(false)}>
            <button type="button">第一个</button>
            <button type="button">最后一个</button>
          </ModalDrawer>
        </>
      )
    }
    render(<Harness />)
    const opener = screen.getByRole("button", { name: "打开管理器" })
    opener.focus()
    fireEvent.click(opener)

    const dialog = screen.getByRole("dialog")
    const close = screen.getByRole("button", { name: "关闭管理器" })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "第一个" })))

    screen.getByRole("button", { name: "最后一个" }).focus()
    fireEvent.keyDown(dialog, { key: "Tab" })
    expect(document.activeElement).toBe(close)

    fireEvent.keyDown(dialog, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })

  it("关闭后恢复打开者焦点", async () => {
    const Harness = (): JSX.Element => {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>打开管理器</button>
          <ModalDrawer open={open} title="管理器" onClose={() => setOpen(false)}>
            <button type="button">内容</button>
          </ModalDrawer>
        </>
      )
    }
    render(<Harness />)
    const opener = screen.getByRole("button", { name: "打开管理器" })
    opener.focus()
    fireEvent.click(opener)
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })
})
