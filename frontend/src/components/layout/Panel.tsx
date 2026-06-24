import type { ReactNode } from "react"

type PanelProps = {
  readonly label: string
  readonly title: string
  readonly children: ReactNode
  readonly className?: string
}

/**
 * 共享的工作台面板：包含上标标签、衬线字体标题，以及可独立滚动的主体区域。
 * 所有工作区区域共用该表面，以保持深度与节奏在"仅边框"设计语言下的统一。
 */
export const Panel = ({ label, title, children, className }: PanelProps): JSX.Element => {
  const rootClassName = className === undefined ? "panel" : `panel ${className}`

  return (
    <section className={rootClassName}>
      <header className="panelHeader">
        <span className="panelLabel">{label}</span>
        <h2 className="panelTitle">{title}</h2>
      </header>
      <div className="panelBody">{children}</div>
    </section>
  )
}
