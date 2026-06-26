/**
 * 模板拖拽覆盖层。
 *
 * 当用户拖拽 .camborder-template.json 到窗口时，
 * 显示确认区域，支持「应用到当前设置」或「保存到模板库」。
 */

import { useCallback, useEffect, useState } from "react"
import { decodeTemplateJson } from "../utils/templateJsonCodec"
import type { Template } from "../types"
import type { RenderSettings } from "../../settings/types"

type DropState =
  | { readonly kind: "idle" }
  | { readonly kind: "detected"; readonly template: Template; readonly rawJson: string }
  | { readonly kind: "error"; readonly message: string }

type TemplateDropOverlayProps = {
  /** 将模板 settings 应用到当前设置（不保存）。 */
  readonly onApply: (settings: RenderSettings) => void
  /** 将模板保存到模板库。 */
  readonly onSave: (template: Template) => void
}

export const TemplateDropOverlay = ({
  onApply,
  onSave,
}: TemplateDropOverlayProps): JSX.Element | null => {
  const [state, setState] = useState<DropState>({ kind: "idle" })

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // 只在离开窗口时取消（检查 relatedTarget）
    if (e.relatedTarget === null) {
      setState({ kind: "idle" })
    }
  }, [])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const files = e.dataTransfer?.files
    if (files === undefined || files.length === 0) {
      setState({ kind: "idle" })
      return
    }

    const file = files[0]
    if (file === undefined) {
      setState({ kind: "idle" })
      return
    }

    // 只处理 .json 文件
    if (!file.name.endsWith(".json")) {
      setState({ kind: "error", message: "请拖入 .json 格式的模板文件。" })
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : ""
      const result = decodeTemplateJson(text)
      if (result.ok) {
        setState({ kind: "detected", template: result.template, rawJson: text })
      } else {
        setState({ kind: "error", message: result.error })
      }
    }
    reader.onerror = () => {
      setState({ kind: "error", message: "文件读取失败。" })
    }
    reader.readAsText(file)
  }, [])

  // 注册全局 drag/drop 事件
  useEffect(() => {
    window.addEventListener("dragover", handleDragOver)
    window.addEventListener("dragenter", handleDragEnter)
    window.addEventListener("dragleave", handleDragLeave)
    window.addEventListener("drop", handleDrop)
    return () => {
      window.removeEventListener("dragover", handleDragOver)
      window.removeEventListener("dragenter", handleDragEnter)
      window.removeEventListener("dragleave", handleDragLeave)
      window.removeEventListener("drop", handleDrop)
    }
  }, [handleDragOver, handleDragEnter, handleDragLeave, handleDrop])

  const handleApply = useCallback(() => {
    if (state.kind === "detected") {
      onApply(state.template.settings)
      setState({ kind: "idle" })
    }
  }, [state, onApply])

  const handleSave = useCallback(() => {
    if (state.kind === "detected") {
      onSave(state.template)
      setState({ kind: "idle" })
    }
  }, [state, onSave])

  const handleCancel = useCallback(() => {
    setState({ kind: "idle" })
  }, [])

  if (state.kind === "idle") {
    return null
  }

  return (
    <div className="templateDropOverlay">
      <div className="templateDropCard">
        {state.kind === "detected" ? (
          <>
            <span className="templateDropTitle">检测到模板</span>
            <span className="templateDropName">{state.template.name}</span>
            <div className="templateDropActions">
              <button
                type="button"
                className="ghostButton"
                onClick={handleApply}
              >
                应用到当前设置
              </button>
              <button
                type="button"
                className="ghostButton"
                onClick={handleSave}
              >
                保存到模板库
              </button>
              <button
                type="button"
                className="ghostButton"
                onClick={handleCancel}
              >
                取消
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="templateDropTitle">模板导入失败</span>
            <span className="templateDropError">{state.message}</span>
            <div className="templateDropActions">
              <button
                type="button"
                className="ghostButton"
                onClick={handleCancel}
              >
                关闭
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
