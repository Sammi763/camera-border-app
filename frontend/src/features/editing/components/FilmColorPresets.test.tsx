import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { FilmColorPresets } from "./FilmColorPresets"
import { createDefaultFilmColorProcessing } from "../defaults"
afterEach(() => { localStorage.clear(); delete (window as unknown as { desktop?: unknown }).desktop })
const config = createDefaultFilmColorProcessing("/scan.jpg", "positive", null)!
describe("个人观感配方", () => {
  it("保存后重挂载可应用，保留当前输入、负片和几何", async () => {
    const onChange = vi.fn()
    const view = render(<FilmColorPresets config={{ ...config, positive: { exposureEv: 0.7 } }} onChange={onChange} />)
    await waitFor(() => expect(screen.getByRole("group", { name: "个人校色配方" }).hasAttribute("disabled")).toBe(false))
    fireEvent.change(screen.getByLabelText("配方名称"), { target: { value: "人像" } })
    fireEvent.click(screen.getByRole("button", { name: "保存当前观感" }))
    await screen.findByRole("option", { name: "人像" })
    view.unmount()
    render(<FilmColorPresets config={config} onChange={onChange} />)
    const option = await screen.findByRole("option", { name: "人像" }) as HTMLOptionElement
    fireEvent.change(screen.getByLabelText("个人配方"), { target: { value: option.value } })
    fireEvent.click(screen.getByRole("button", { name: "应用观感" }))
    expect(onChange).toHaveBeenCalledWith({ ...config, positive: { exposureEv: 0.7 } }, { description: "应用个人校色配方：人像" })
  })
  it("损坏文件读取失败时不允许空列表覆盖", async () => {
    ;(window as unknown as { desktop: unknown }).desktop = { readFilmColorPresets: vi.fn(async () => "broken"), writeFilmColorPresets: vi.fn() }
    render(<FilmColorPresets config={config} onChange={vi.fn()} />)
    await screen.findByRole("alert")
    expect(screen.getByRole("group", { name: "个人校色配方" }).hasAttribute("disabled")).toBe(true)
  })
})
