import { fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { WorkspaceTabs, type WorkspaceTab, type WorkspaceTabId } from "./WorkspaceTabs"

const tabs: readonly WorkspaceTab[] = [
  { id: "style", label: "样式", content: <p>样式内容</p> },
  { id: "info", label: "摄影信息", content: <p>信息内容</p> },
  { id: "output", label: "输出", content: <p>输出内容</p> }
]

const Harness = ({ initialTab = "style" }: { readonly initialTab?: WorkspaceTabId }): JSX.Element => {
  const [activeTab, setActiveTab] = useState<WorkspaceTabId>(initialTab)
  return <WorkspaceTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
}

const tabByName = (name: string): HTMLElement => screen.getByRole("tab", { name })

const tabIndexes = (): number[] => screen.getAllByRole("tab").map((tab) => (tab as HTMLButtonElement).tabIndex)

describe("WorkspaceTabs", () => {
  it("只显示三个工作台页签，点击切换内容并维护 ARIA 关联", () => {
    render(<Harness />)

    expect(screen.getAllByRole("tab")).toHaveLength(3)
    expect(screen.getByRole("tablist", { name: "工作台面板" }).getAttribute("aria-orientation")).toBe("horizontal")

    const styleTab = tabByName("样式")
    expect(styleTab.getAttribute("aria-selected")).toBe("true")
    expect(styleTab.getAttribute("aria-controls")).toBe("workspace-tabpanel-style")
    // 非活动面板未挂载，非活动页签不设置 aria-controls，避免指向不存在的元素。
    expect(tabByName("摄影信息").getAttribute("aria-controls")).toBeNull()
    expect(tabByName("输出").getAttribute("aria-controls")).toBeNull()
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe("workspace-tab-style")
    expect(screen.getByText("样式内容")).toBeTruthy()
    expect(screen.queryByText("信息内容")).toBeNull()

    fireEvent.click(tabByName("摄影信息"))

    const infoTab = tabByName("摄影信息")
    expect(infoTab.getAttribute("aria-selected")).toBe("true")
    expect(infoTab.getAttribute("aria-controls")).toBe("workspace-tabpanel-info")
    expect(styleTab.getAttribute("aria-controls")).toBeNull()
    expect(tabByName("输出").getAttribute("aria-controls")).toBeNull()
    const panel = screen.getByRole("tabpanel")
    expect(panel.id).toBe("workspace-tabpanel-info")
    expect(panel.getAttribute("aria-labelledby")).toBe("workspace-tab-info")
    expect(screen.getByText("信息内容")).toBeTruthy()
    expect(screen.queryByText("样式内容")).toBeNull()
  })

  it("roving tabindex 只让选中页签进入 Tab 顺序", () => {
    render(<Harness />)

    expect(tabIndexes()).toEqual([0, -1, -1])

    fireEvent.click(tabByName("输出"))

    expect(tabIndexes()).toEqual([-1, -1, 0])
    expect(tabByName("输出").getAttribute("aria-selected")).toBe("true")
  })

  it("左右方向键循环切换、自动激活并移动焦点", () => {
    render(<Harness />)

    tabByName("样式").focus()
    fireEvent.keyDown(tabByName("样式"), { key: "ArrowRight" })

    expect(tabByName("摄影信息").getAttribute("aria-selected")).toBe("true")
    expect(document.activeElement).toBe(tabByName("摄影信息"))
    expect(tabIndexes()).toEqual([-1, 0, -1])
    expect(tabByName("摄影信息").getAttribute("aria-controls")).toBe("workspace-tabpanel-info")
    expect(tabByName("样式").getAttribute("aria-controls")).toBeNull()
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe("workspace-tab-info")
    expect(screen.getByText("信息内容")).toBeTruthy()

    fireEvent.keyDown(tabByName("摄影信息"), { key: "ArrowRight" })

    expect(tabByName("输出").getAttribute("aria-selected")).toBe("true")
    expect(document.activeElement).toBe(tabByName("输出"))

    // 右方向键从末项回到首项，左方向键从首项回到末项。
    fireEvent.keyDown(tabByName("输出"), { key: "ArrowRight" })

    expect(tabByName("样式").getAttribute("aria-selected")).toBe("true")
    expect(document.activeElement).toBe(tabByName("样式"))

    fireEvent.keyDown(tabByName("样式"), { key: "ArrowLeft" })

    expect(tabByName("输出").getAttribute("aria-selected")).toBe("true")
    expect(document.activeElement).toBe(tabByName("输出"))
    expect(tabIndexes()).toEqual([-1, -1, 0])
  })

  it("Home/End 跳到首尾页签并聚焦", () => {
    render(<Harness initialTab="info" />)

    tabByName("摄影信息").focus()
    fireEvent.keyDown(tabByName("摄影信息"), { key: "End" })

    expect(tabByName("输出").getAttribute("aria-selected")).toBe("true")
    expect(document.activeElement).toBe(tabByName("输出"))
    expect(tabIndexes()).toEqual([-1, -1, 0])

    fireEvent.keyDown(tabByName("输出"), { key: "Home" })

    expect(tabByName("样式").getAttribute("aria-selected")).toBe("true")
    expect(document.activeElement).toBe(tabByName("样式"))
    expect(tabIndexes()).toEqual([0, -1, -1])
  })

  it("选中样式与内容面板一起切换", () => {
    const { container } = render(<Harness />)

    expect(tabByName("样式").classList.contains("workspaceTabActive")).toBe(true)
    expect(container.querySelector(".workspaceTabPanel")?.getAttribute("data-tab-id")).toBe("style")

    fireEvent.click(tabByName("输出"))

    expect(tabByName("输出").classList.contains("workspaceTabActive")).toBe(true)
    expect(tabByName("样式").classList.contains("workspaceTabActive")).toBe(false)
    expect(container.querySelector(".workspaceTabPanel")?.getAttribute("data-tab-id")).toBe("output")
  })

  it("空页签列表安全回退，不渲染 tab/tabpanel", () => {
    const { container } = render(<WorkspaceTabs tabs={[]} activeTab="style" onChange={() => undefined} />)

    expect((container.firstElementChild as HTMLElement).className).toBe("workspaceTabs")
    expect(screen.queryAllByRole("tab")).toHaveLength(0)
    expect(screen.queryByRole("tabpanel")).toBeNull()
  })

  it("无效 activeTab 回退到首个页签", () => {
    const { container } = render(
      <WorkspaceTabs tabs={tabs} activeTab={"missing" as WorkspaceTabId} onChange={() => undefined} />
    )

    expect(tabByName("样式").getAttribute("aria-selected")).toBe("true")
    expect(tabIndexes()).toEqual([0, -1, -1])
    expect(screen.getByText("样式内容")).toBeTruthy()
    expect(container.querySelector(".workspaceTabPanel")?.getAttribute("data-tab-id")).toBe("style")
  })

  it("面板内输入控件收到方向键/Home/End 时不切换页签", () => {
    const inputTabs: readonly WorkspaceTab[] = [
      { id: "style", label: "样式", content: <input aria-label="页签内输入" defaultValue="" /> },
      { id: "info", label: "摄影信息", content: <input aria-label="信息输入" defaultValue="" /> },
      { id: "output", label: "输出", content: <input aria-label="输出输入" defaultValue="" /> }
    ]
    const onChange = vi.fn()
    render(<WorkspaceTabs tabs={inputTabs} activeTab="style" onChange={onChange} />)

    const input = screen.getByRole("textbox", { name: "页签内输入" })
    input.focus()

    for (const key of ["ArrowLeft", "ArrowRight", "Home", "End"]) {
      fireEvent.keyDown(input, { key })
    }

    expect(onChange).not.toHaveBeenCalled()
    expect(tabByName("样式").getAttribute("aria-selected")).toBe("true")
    expect(document.activeElement).toBe(input)
  })
})
