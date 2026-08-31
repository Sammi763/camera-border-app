/**
 * 模板拖拽确认层。
 *
 * 文件拖放的事件监听由 WorkspaceDropRouter 唯一处理；此组件只负责解释已经被路由
 * 为模板的 File，避免图片导入和模板导入同时响应同一 drop 事件。
 */

import { useEffect, useState } from "react"
import { decodeTemplateJson } from "../utils/templateJsonCodec"
import type { Template } from "../types"
import type { RenderSettings } from "../../settings/types"

type DropState =
  | { readonly kind: "idle" }
  | { readonly kind: "detected"; readonly template: Template }
  | { readonly kind: "error"; readonly message: string }

type TemplateDropOverlayProps = {
  /** 已由根级拖放路由识别为 JSON 模板的文件。 */
  readonly droppedFile: File | null
  /** 清除当前拖放事件，防止关闭后再次解析同一文件。 */
  readonly onDismiss: () => void
  /** 将模板 settings 应用到当前设置（不保存）。 */
  readonly onApply: (settings: RenderSettings) => void
  /** 将模板保存到模板库。 */
  readonly onSave: (template: Template) => void
}

export const TemplateDropOverlay = ({
  droppedFile,
  onDismiss,
  onApply,
  onSave
}: TemplateDropOverlayProps): JSX.Element | null => {
  const [state, setState] = useState<DropState>({ kind: "idle" })

  useEffect(() => {
    if (droppedFile === null) {
      setState({ kind: "idle" })
      return
    }
    let active = true
    const reader = new FileReader()
    reader.onload = () => {
      if (!active) return
      const text = typeof reader.result === "string" ? reader.result : ""
      const result = decodeTemplateJson(text)
      setState(result.ok ? { kind: "detected", template: result.template } : { kind: "error", message: result.error })
    }
    reader.onerror = () => {
      if (active) setState({ kind: "error", message: "文件读取失败。" })
    }
    reader.readAsText(droppedFile)
    return () => {
      active = false
      reader.abort()
    }
  }, [droppedFile])

  if (state.kind === "idle") return null

  const dismiss = (): void => {
    setState({ kind: "idle" })
    onDismiss()
  }

  return (
    <div className="templateDropOverlay">
      <div className="templateDropCard">
        {state.kind === "detected" ? (
          <>
            <span className="templateDropTitle">检测到模板</span>
            <span className="templateDropName">{state.template.name}</span>
            <div className="templateDropActions">
              <button type="button" className="ghostButton" onClick={() => { onApply(state.template.settings); dismiss() }}>应用到当前设置</button>
              <button type="button" className="ghostButton" onClick={() => { onSave(state.template); dismiss() }}>保存到模板库</button>
              <button type="button" className="ghostButton" onClick={dismiss}>取消</button>
            </div>
          </>
        ) : (
          <>
            <span className="templateDropTitle">模板导入失败</span>
            <span className="templateDropError">{state.message}</span>
            <div className="templateDropActions"><button type="button" className="ghostButton" onClick={dismiss}>关闭</button></div>
          </>
        )}
      </div>
    </div>
  )
}
