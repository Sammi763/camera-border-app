/**
 * 检查器面板：右侧可折叠分组容器。
 *
 * 作为桌面应用的“工作面板”而非卡片堆叠：
 * - 顶部固定标题条，承载“检查器”标识与折叠按钮。
 * - 分组标题固定高度，点击整行切换展开。
 * - 展开状态记入 sessionStorage，当前会话内不跳变。
 * - 分组之间仅用 1px 轻量分隔，无重边框。
 */

import { useCallback, useState } from "react"
import type { ReactNode } from "react"

/** 展开状态在 sessionStorage 中的键。 */
const EXPANDED_STORAGE_KEY = "inspector.expanded"

/** 读取会话内记忆的展开分组 id。 */
const readExpandedFromSession = (): Set<string> => {
  try {
    const raw = sessionStorage.getItem(EXPANDED_STORAGE_KEY)
    if (raw === null) {
      return new Set()
    }
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((v): v is string => typeof v === "string"))
    }
    return new Set()
  } catch {
    return new Set()
  }
}

/** 写回会话内展开分组 id。 */
const writeExpandedToSession = (ids: ReadonlySet<string>): void => {
  try {
    sessionStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    // 写入失败不影响功能
  }
}

/** 单个折叠分组的配置。 */
export type InspectorSection = {
  readonly id: string
  readonly label: string
  readonly content: ReactNode
  /** 是否默认展开。仅在会话内无记忆时生效。 */
  readonly defaultExpanded?: boolean
}

type InspectorPanelProps = {
  readonly sections: readonly InspectorSection[]
  /** 当前是否折叠为竖条。 */
  readonly collapsed?: boolean
  /** 切换折叠状态。 */
  readonly onToggleCollapse?: () => void
}

export const InspectorPanel = ({
  sections,
  collapsed = false,
  onToggleCollapse
}: InspectorPanelProps): JSX.Element => {
  // 初始化展开状态：优先用 sessionStorage 记忆，否则用 defaultExpanded，
  // 都没有则展开第一个分组。
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => {
    const remembered = readExpandedFromSession()
    if (remembered.size > 0) {
      return remembered
    }
    const initial = new Set<string>()
    for (const section of sections) {
      if (section.defaultExpanded === true) {
        initial.add(section.id)
      }
    }
    if (initial.size === 0 && sections.length > 0) {
      initial.add(sections[0]!.id)
    }
    return initial
  })

  const toggle = useCallback((id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      writeExpandedToSession(next)
      return next
    })
  }, [])

  return (
    <div className="inspectorPanel">
      <header className="inspectorHeader">
        <div className="inspectorHeaderTitle">
          <span className="inspectorHeaderLabel">检查器</span>
          <span className="inspectorHeaderName">Inspector</span>
        </div>
        {onToggleCollapse !== undefined && (
          <button
            type="button"
            className="inspectorCollapseButton"
            onClick={onToggleCollapse}
            aria-label="折叠检查器"
            title="折叠检查器"
          >
            <span>收起</span>
            <span aria-hidden="true">»</span>
          </button>
        )}
      </header>
      <div className="inspectorBody">
        {sections.map((section) => {
          const isOpen = expanded.has(section.id)
          return (
            <section
              key={section.id}
              className={`inspectorSection ${isOpen ? "inspectorSectionOpen" : ""}`}
            >
              <button
                type="button"
                className="inspectorSectionHeader"
                onClick={() => toggle(section.id)}
                aria-expanded={isOpen}
              >
                <span className="inspectorSectionLabel">{section.label}</span>
                <span className="inspectorSectionChevron" aria-hidden="true">▸</span>
              </button>
              {isOpen && (
                <div className="inspectorSectionBody">{section.content}</div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
