import { fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it } from "vitest"
import { WorkspaceTabs, type WorkspaceTab } from "./WorkspaceTabs"

const tabs: readonly WorkspaceTab[] = [
  { id: "style", label: "样式", content: <p>样式内容</p> },
  { id: "info", label: "摄影信息", content: <p>信息内容</p> },
  { id: "output", label: "输出", content: <p>输出内容</p> }
]

const Harness = (): JSX.Element => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab["id"]>("style")
  return <WorkspaceTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
}

describe("WorkspaceTabs", () => {
  it("只显示三个工作台页签，并切换对应内容", () => {
    render(<Harness />)

    expect(screen.getAllByRole("tab")).toHaveLength(3)
    expect(screen.getByRole("tab", { name: "样式" }).getAttribute("aria-selected")).toBe("true")
    expect(screen.getByText("样式内容")).toBeTruthy()
    expect(screen.queryByText("信息内容")).toBeNull()

    fireEvent.click(screen.getByRole("tab", { name: "摄影信息" }))

    expect(screen.getByRole("tab", { name: "摄影信息" }).getAttribute("aria-selected")).toBe("true")
    expect(screen.getByText("信息内容")).toBeTruthy()
    expect(screen.queryByText("样式内容")).toBeNull()
  })
})
