import { useState } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { InspectorPanel } from "./InspectorPanel"

const DraftForm = (): JSX.Element => {
  const [value, setValue] = useState("")
  return <input aria-label="导入草稿" value={value} onChange={(event) => setValue(event.target.value)} />
}

afterEach(() => {
  sessionStorage.clear()
})

describe("InspectorPanel", () => {
  it("折叠分组时保持内容挂载，不丢失表单草稿", () => {
    render(<InspectorPanel sections={[
      { id: "import", label: "导入", defaultExpanded: true, content: <DraftForm /> },
      { id: "other", label: "其他", content: <span>其他内容</span> }
    ]} />)
    const input = screen.getByRole("textbox", { name: "导入草稿" }) as HTMLInputElement
    fireEvent.change(input, { target: { value: "未提交的导入配置" } })
    fireEvent.click(screen.getByRole("button", { name: /导入/ }))
    expect(input.parentElement?.hidden).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: /导入/ }))
    expect((screen.getByRole("textbox", { name: "导入草稿" }) as HTMLInputElement).value).toBe("未提交的导入配置")
  })
})
