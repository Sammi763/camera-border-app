/**
 * 快捷键速查面板（编辑态叠加，不进入 RenderRecipe）。
 *
 * 由 WorkspacePage 的 `?` 快捷键或帮助抽屉打开；Esc 或点击关闭按钮退出。
 * 快捷键数据来自 shortcutList.ts 单一来源。
 */

import { useEffect, useId, useRef } from "react"
import { SHORTCUT_GROUPS } from "./shortcutList"

type ShortcutOverlayProps = {
  readonly open: boolean
  readonly onClose: () => void
}

export const ShortcutOverlay = ({ open, onClose }: ShortcutOverlayProps): JSX.Element | null => {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
        return
      }
      // `?` 再次按下时切换关闭，与打开行为对称
      if (event.key === "?") {
        event.preventDefault()
        onClose()
      }
    }
    const frame = window.requestAnimationFrame(() => {
      dialogRef.current?.focus()
    })
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, onClose])

  /**
   * 简单焦点圈定：Tab 在面板内首尾循环，避免焦点跑到背景控件后
   * `?` 被输入控件守卫拦截、面板关不掉的不一致状态。
   */
  const handleTabTrap = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "Tab") {
      return
    }
    const panel = dialogRef.current
    if (panel === null) {
      return
    }
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>("button, a, input, select, textarea"))
      .filter((element) => !element.hasAttribute("disabled") && element.tabIndex !== -1)
    if (focusables.length === 0) {
      return
    }
    const first = focusables[0]!
    const last = focusables[focusables.length - 1]!
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (active === last || active === panel)) {
      event.preventDefault()
      first.focus()
    }
  }

  if (!open) {
    return null
  }

  return (
    <div
      className="shortcutOverlayBackdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        ref={dialogRef}
        className="shortcutOverlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleTabTrap}
      >
        <header className="shortcutOverlayHeader">
          <h2 id={titleId} className="shortcutOverlayTitle">快捷键速查</h2>
          <button type="button" className="modalDrawerClose" aria-label="关闭快捷键速查" onClick={onClose}>
            关闭
          </button>
        </header>
        <div className="shortcutOverlayBody">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} className="shortcutGroup" aria-label={group.title}>
              <h3 className="shortcutGroupTitle">{group.title}</h3>
              <ul className="shortcutGroupList">
                {group.entries.map((entry) => (
                  <li key={entry.description} className="shortcutEntry">
                    <span className="shortcutKeys">
                      {entry.keys.map((key, index) => (
                        <kbd key={`${key}-${index}`} className="shortcutKey">{key}</kbd>
                      ))}
                    </span>
                    <span className="shortcutDescription">{entry.description}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
