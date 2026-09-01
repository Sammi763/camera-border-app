import { useEffect, useId, useRef } from "react"
import type { ReactNode, KeyboardEvent as ReactKeyboardEvent } from "react"

type ModalDrawerProps = {
  readonly open: boolean
  readonly title: string
  readonly children: ReactNode
  readonly onClose: () => void
  readonly side?: "right" | "bottom"
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",")

const isHTMLElement = (value: Element | null): value is HTMLElement => value instanceof HTMLElement

/**
 * 统一管理抽屉/对话框的焦点生命周期。
 * 打开时把焦点送进内容，Tab 不会逃出对话框，Escape 和关闭按钮都会恢复打开者焦点。
 */
export const ModalDrawer = ({
  open,
  title,
  children,
  onClose,
  side = "right"
}: ModalDrawerProps): JSX.Element | null => {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      openerRef.current = isHTMLElement(document.activeElement) ? document.activeElement : null
    }
    if (!open && wasOpenRef.current) {
      const opener = openerRef.current
      if (opener !== null && opener.isConnected) {
        opener.focus()
      }
      openerRef.current = null
    }
    wasOpenRef.current = open
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }
    const dialog = dialogRef.current
    if (dialog === null) {
      return
    }
    const focusFirst = (): void => {
      const bodyFirst = dialog.querySelector<HTMLElement>(".modalDrawerBody")?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      const first = bodyFirst ?? dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      if (first !== null) {
        first.focus()
      } else {
        dialog.focus()
      }
    }
    const frame = window.requestAnimationFrame(focusFirst)
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== "Tab") {
        return
      }
      const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, onClose])

  if (!open) {
    return null
  }

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <div
      className="modalDrawerBackdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        ref={dialogRef}
        className={`modalDrawer modalDrawer${side === "bottom" ? "Bottom" : "Right"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
      >
        <header className="modalDrawerHeader">
          <h2 id={titleId} className="modalDrawerTitle">{title}</h2>
          <button type="button" className="modalDrawerClose" aria-label={`关闭${title}`} onClick={onClose}>
            关闭
          </button>
        </header>
        <div className="modalDrawerBody">{children}</div>
      </div>
    </div>
  )
}
