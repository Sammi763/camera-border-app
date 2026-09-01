import type { ReactNode } from "react"

/** 统一工作台右侧只允许出现的三个页签。 */
export type WorkspaceTabId = "style" | "info" | "output"

export type WorkspaceTab = {
  readonly id: WorkspaceTabId
  readonly label: string
  readonly content: ReactNode
}

type WorkspaceTabsProps = {
  readonly tabs: readonly WorkspaceTab[]
  readonly activeTab: WorkspaceTabId
  readonly onChange: (id: WorkspaceTabId) => void
}

/** 右侧页签容器；内容只挂载当前页，避免大量设置控件同时抢占布局。 */
export const WorkspaceTabs = ({ tabs, activeTab, onChange }: WorkspaceTabsProps): JSX.Element => {
  const current = tabs.find((tab) => tab.id === activeTab) ?? tabs[0]
  if (current === undefined) {
    return <div className="workspaceTabs" />
  }

  return (
    <div className="workspaceTabs">
      <div className="workspaceTabsHeader" role="tablist" aria-label="工作台面板">
        {tabs.map((tab) => {
          const selected = tab.id === current.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`workspace-tab-${tab.id}`}
              aria-controls={`workspace-tabpanel-${tab.id}`}
              aria-selected={selected}
              className={`workspaceTab${selected ? " workspaceTabActive" : ""}`}
              onClick={() => onChange(tab.id)}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      <div
        id={`workspace-tabpanel-${current.id}`}
        className="workspaceTabPanel"
        role="tabpanel"
        aria-labelledby={`workspace-tab-${current.id}`}
        tabIndex={0}
      >
        {current.content}
      </div>
    </div>
  )
}
