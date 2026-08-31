/**
 * 工作区唯一拖放路由。
 *
 * 同一个 drop 事件只能归类为模板或图片：JSON 进入 TemplateDropOverlay，其余文件
 * 只交给图片队列。这样 QueuePanel、欢迎页和模板覆盖层不会重复处理/互相报错。
 */

import { useEffect, useState } from "react"

type UseWorkspaceDropRouterArgs = {
  readonly onImagePaths: (paths: readonly string[]) => void
}

type WorkspaceDropRouter = {
  readonly droppedTemplateFile: File | null
  readonly dismissDroppedTemplate: () => void
}

const isTemplateJson = (file: File): boolean => file.name.toLowerCase().endsWith(".json")

export const useWorkspaceDropRouter = ({ onImagePaths }: UseWorkspaceDropRouterArgs): WorkspaceDropRouter => {
  const [droppedTemplateFile, setDroppedTemplateFile] = useState<File | null>(null)

  useEffect(() => {
    const preventNavigation = (event: DragEvent): void => {
      event.preventDefault()
    }
    const routeDrop = (event: DragEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length === 0) return
      // 混合拖入时模板优先：一次 drop 只消费一个路由，避免 JSON 被误当成图片路径，
      // 也避免模板覆盖层与图片队列同时响应同一个用户动作。
      const template = files.find(isTemplateJson)
      if (template !== undefined) {
        setDroppedTemplateFile(template)
        return
      }
      const paths = files
        .map((file) => (file as File & { path?: string }).path)
        .filter((path): path is string => typeof path === "string" && path.trim().length > 0)
      if (paths.length > 0) onImagePaths(paths)
    }
    window.addEventListener("dragover", preventNavigation)
    window.addEventListener("drop", routeDrop)
    return () => {
      window.removeEventListener("dragover", preventNavigation)
      window.removeEventListener("drop", routeDrop)
    }
  }, [onImagePaths])

  return {
    droppedTemplateFile,
    dismissDroppedTemplate: () => setDroppedTemplateFile(null)
  }
}
