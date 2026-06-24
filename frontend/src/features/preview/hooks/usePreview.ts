import { useEffect, useRef, useState } from "react"
import { requestPreview } from "../../../services/engine/previewApi"
import { toFileName } from "../../../utils/fileName"
import type { GradientConfig, PreviewRequest } from "../../../types/preview"
import type { RenderSettings } from "../../settings/types"
import type { PreviewState } from "../types"

const PREVIEW_MAX_WIDTH = 1280
const PREVIEW_MAX_HEIGHT = 1280

/**
 * 将引擎返回的 previewUrl 解析为可加载的完整 URL。
 * 始终返回相对路径（如 /previews/xxx），由 Vite 代理转发到引擎，
 * 避免 Canvas 跨域污染问题。
 * data: URL 直接返回。
 */
const resolveDisplayUrl = (previewUrl: string): string | null => {
  if (previewUrl.startsWith("data:")) {
    return previewUrl
  }
  if (previewUrl.startsWith("/")) {
    return previewUrl
  }
  if (previewUrl.startsWith("http://") || previewUrl.startsWith("https://")) {
    try {
      const parsed = new URL(previewUrl)
      return parsed.pathname + parsed.search
    } catch {
      return null
    }
  }
  return null
}

/**
 * 将文字位置和放置区域编码为 placement 字符串。
 *
 * 编码规则：
 * - 图片上：image-top-center / image-center / image-bottom-center
 * - 边框上：border-top-center / border-bottom-center
 *
 * 保留旧值 top-center / center / bottom-center 的兼容处理
 * （不带前缀时默认为 image 区域）。
 */
const encodePlacement = (textArea: string, textPlacement: string): string => {
  if (textPlacement.startsWith("image-") || textPlacement.startsWith("border-")) {
    return textPlacement
  }
  const areaPrefix = textArea === "border" ? "border" : "image"
  return `${areaPrefix}-${textPlacement}`
}

/**
 * 将 UI 渐变设置转换为 API 渐变配置。
 * 渐变未启用时返回 null。
 */
const toGradientConfig = (s: RenderSettings): GradientConfig | null => {
  if (!s.gradient.enabled || s.gradient.stops.length < 2) {
    return null
  }
  return {
    enabled: true,
    type: s.gradient.type,
    angle: s.gradient.angle,
    stops: s.gradient.stops
  }
}

/**
 * 构建预览请求体。
 * 边框使用四边独立宽度，文字仅在内容非空时附加。
 * placement 根据 textArea 和 textPlacement 编码。
 */
const buildPreviewRequest = (filePath: string, s: RenderSettings): PreviewRequest => {
  const border = {
    top: s.borderTop,
    bottom: s.borderBottom,
    left: s.borderLeft,
    right: s.borderRight,
    color: s.borderColor
  }

  const texts = s.textContent.trim().length > 0
    ? [{
        content: s.textContent.trim(),
        fontFamily: s.fontFamily,
        fontSize: s.textFontSize,
        color: s.textColor,
        placement: encodePlacement(s.textArea, s.textPlacement),
        marginX: 0,
        marginY: 20
      }]
    : []

  return {
    recipe: {
      imagePath: filePath,
      border,
      gradient: toGradientConfig(s),
      texts,
      filmFormat: s.filmFormat,
      autoCrop: s.autoCrop
    },
    maxWidth: PREVIEW_MAX_WIDTH,
    maxHeight: PREVIEW_MAX_HEIGHT
  }
}

const toErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : "预览请求失败"
}

/**
 * 预览状态 Hook。
 *
 * 职责：
 * 1. 选中图片变化时，立即加载图片元素供 Canvas 即时渲染
 * 2. 同时向引擎发起预览请求（后台同步）
 * 3. 设置变化时，图片已加载则 Canvas 立即重绘，引擎请求在防抖后发出
 * 4. 返回 currentImage 供 PreviewPanel 中的 Canvas 组件使用
 * 5. 返回 engineSyncStatus 用于 UI 展示引擎同步进度
 *
 * textOverride 为当前图片的独立文字覆盖，会覆盖 settings.textContent。
 * 旧请求通过 active 标记丢弃，确保不会覆盖新选图/新设置。
 */
export const usePreview = (
  selectedFilePath: string | null,
  settings: RenderSettings,
  settingsVersion: number,
  textOverride?: string | null
): PreviewState => {
  const [state, setState] = useState<PreviewState>({ kind: "idle" })

  const lastRequestedRef = useRef<{ filePath: string | null; version: number; textOverride: string | null | undefined }>({
    filePath: null,
    version: 0,
    textOverride: undefined
  })

  // 加载图片元素（通过 fetch→blob→objectURL 避免 CORS 污染）
  useEffect(() => {
    if (selectedFilePath === null) {
      setState({ kind: "idle" })
      return
    }

    let active = true
    let currentObjectUrl: string | null = null

    setState({
      kind: "active",
      filePath: selectedFilePath,
      fileName: toFileName(selectedFilePath),
      currentImage: null,
      engineDisplayUrl: null,
      engineSyncStatus: "idle",
      engineResponse: null
    })

    const imageRequest: PreviewRequest = {
      recipe: {
        imagePath: selectedFilePath,
        border: { top: 0, bottom: 0, left: 0, right: 0, color: "#000000" },
        gradient: null,
        texts: [],
        filmFormat: null,
        autoCrop: false
      },
      maxWidth: PREVIEW_MAX_WIDTH,
      maxHeight: PREVIEW_MAX_HEIGHT
    }

    void requestPreview(imageRequest)
      .then((response) => {
        if (!active) {
          return
        }
        const url = resolveDisplayUrl(response.previewUrl)
        if (url === null) {
          return
        }
        return fetch(url)
      })
      .then((fetchResponse) => {
        if (!active || fetchResponse === undefined) {
          return
        }
        return fetchResponse.blob()
      })
      .then((blob) => {
        if (!active || blob === undefined) {
          return
        }
        currentObjectUrl = URL.createObjectURL(blob)
        const img = new Image()
        img.onload = () => {
          if (!active) {
            return
          }
          setState((prev) => {
            if (prev.kind !== "active" || prev.filePath !== selectedFilePath) {
              return prev
            }
            return { ...prev, currentImage: img }
          })
        }
        img.src = currentObjectUrl
      })
      .catch(() => {
        // 图片加载失败时保持 currentImage 为 null
      })

    return () => {
      active = false
      if (currentObjectUrl !== null) {
        URL.revokeObjectURL(currentObjectUrl)
      }
    }
  }, [selectedFilePath])

  // 后台引擎预览请求（带设置参数，textOverride 合并到设置中）
  useEffect(() => {
    if (selectedFilePath === null) {
      return
    }

    const fileUnchanged = selectedFilePath === lastRequestedRef.current.filePath
    const versionUnchanged = settingsVersion === lastRequestedRef.current.version
    const textOverrideUnchanged = textOverride === lastRequestedRef.current.textOverride
    if (fileUnchanged && versionUnchanged && textOverrideUnchanged && state.kind !== "idle") {
      return
    }
    lastRequestedRef.current = { filePath: selectedFilePath, version: settingsVersion, textOverride }

    let active = true

    setState((prev) => {
      if (prev.kind !== "active") {
        return prev
      }
      return { ...prev, engineSyncStatus: "syncing" }
    })

    // 合并 textOverride：每图独立文字覆盖优先于全局 textContent
    const mergedSettings: RenderSettings = textOverride !== undefined && textOverride !== null
      ? { ...settings, textContent: textOverride }
      : settings

    void requestPreview(buildPreviewRequest(selectedFilePath, mergedSettings))
      .then((response) => {
        if (!active) {
          return
        }
        const displayUrl = response.previewAvailable
          ? resolveDisplayUrl(response.previewUrl)
          : null
        setState((prev) => {
          if (prev.kind !== "active" || prev.filePath !== selectedFilePath) {
            return prev
          }
          return {
            ...prev,
            engineDisplayUrl: displayUrl,
            engineSyncStatus: "synced",
            engineResponse: response
          }
        })
      })
      .catch((error: unknown) => {
        if (!active) {
          return
        }
        setState((prev) => {
          if (prev.kind !== "active" || prev.filePath !== selectedFilePath) {
            return prev
          }
          return {
            ...prev,
            engineSyncStatus: "error",
            engineResponse: {
              status: "error",
              message: toErrorMessage(error),
              previewAvailable: false,
              previewUrl: ""
            }
          }
        })
      })

    return () => {
      active = false
    }
  }, [selectedFilePath, settingsVersion, settings, textOverride])

  return state
}
