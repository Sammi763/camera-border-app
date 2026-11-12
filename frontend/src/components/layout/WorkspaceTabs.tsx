import { useRef } from "react"
import type { CSSProperties, KeyboardEvent, ReactNode } from "react"

/** 统一工作台右侧页签：样式 / 摄影信息 / 底片 / 输出。 */
export type WorkspaceTabId = "style" | "info" | "film" | "output"

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

/** 页签键盘导航支持的按键；只处理页签按钮自身，不拦截面板内控件。 */
const TAB_NAVIGATION_KEYS = ["ArrowLeft", "ArrowRight", "Home", "End"] as const
type TabNavigationKey = (typeof TAB_NAVIGATION_KEYS)[number]

const isTabNavigationKey = (key: string): key is TabNavigationKey =>
  (TAB_NAVIGATION_KEYS as readonly string[]).includes(key)

/** 左右方向键循环切换，Home/End 到首尾。调用前保证页签数量大于 0。 */
const resolveTargetIndex = (key: TabNavigationKey, index: number, count: number): number => {
  switch (key) {
    case "ArrowLeft":
      return (index - 1 + count) % count
    case "ArrowRight":
      return (index + 1) % count
    case "Home":
      return 0
    case "End":
      return count - 1
  }
}

/** 右侧页签容器；内容只挂载当前页，避免大量设置控件同时抢占布局。 */
export const WorkspaceTabs = ({ tabs, activeTab, onChange }: WorkspaceTabsProps): JSX.Element => {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const current = tabs.find((tab) => tab.id === activeTab) ?? tabs[0]
  if (current === undefined) {
    return <div className="workspaceTabs" />
  }
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === current.id))
  const indicatorStyle = {
    "--tab-index": activeIndex,
    "--tab-count": tabs.length
  } as CSSProperties

  /**
   * 自动激活模式：键盘移动即切换页签。
   * 只在当前页签按钮收到导航键时处理；按钮未来若内嵌输入控件，其事件不会被拦截。
   */
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.target !== event.currentTarget || !isTabNavigationKey(event.key)) {
      return
    }
    event.preventDefault()
    const targetIndex = resolveTargetIndex(event.key, index, tabs.length)
    const target = tabs[targetIndex]
    if (target === undefined) {
      return
    }
    // 页签按钮在同一列表中持续存在，切换选中后可直接把焦点移到目标页签。
    onChange(target.id)
    tabRefs.current[targetIndex]?.focus()
  }

  return (
    <div className="workspaceTabs">
      <div
        className="workspaceTabsHeader"
        role="tablist"
        aria-label="工作台面板"
        aria-orientation="horizontal"
        style={indicatorStyle}
      >
        {/* 选中底座：只做 transform 动画，页签增多时仍按等宽轨道移动。 */}
        <span className="workspaceTabsIndicator" aria-hidden="true" />
        {tabs.map((tab, index) => {
          const selected = tab.id === current.id
          return (
            <button
              key={tab.id}
              ref={(element) => {
                tabRefs.current[index] = element
              }}
              type="button"
              role="tab"
              id={`workspace-tab-${tab.id}`}
              // 仅当前面板存在；非活动页签不设置 aria-controls，避免悬空引用。
              aria-controls={selected ? `workspace-tabpanel-${tab.id}` : undefined}
              aria-selected={selected}
              // roving tabindex：整个页签组只保留一个 Tab 停靠点，方向键在组内移动焦点。
              tabIndex={selected ? 0 : -1}
              className={`workspaceTab${selected ? " workspaceTabActive" : ""}`}
              onClick={() => onChange(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      <div
        key={current.id}
        id={`workspace-tabpanel-${current.id}`}
        className="workspaceTabPanel"
        role="tabpanel"
        aria-labelledby={`workspace-tab-${current.id}`}
        tabIndex={0}
        data-tab-id={current.id}
      >
        {current.content}
      </div>
    </div>
  )
}
