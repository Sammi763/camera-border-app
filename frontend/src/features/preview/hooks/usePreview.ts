import { useEffect, useRef, useState } from "react"
import { requestPreview } from "../../../services/engine/previewApi"
import { toFileName } from "../../../utils/fileName"
import { buildPlainImagePreviewRequest, buildPreviewRequest } from "../../settings/utils/buildRecipe"
import { loadLocalImagePreview, isLocalPreviewSupported, isRawOrHeicFile } from "../../../services/desktop/localImagePreview"
import type { PreviewRequest } from "../../../types/preview"
import type { RenderSettings } from "../../settings/types"
import type { PreviewState } from "../types"

const PREVIEW_MAX_WIDTH = 1280
const PREVIEW_MAX_HEIGHT = 1280

/**
 * 将引擎返回的 previewUrl 解析为可加载的完整 URL。
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
 * textOverride 为当前图片的快捷单段文字覆盖，会覆盖 textLayers[0] 的 content。
 * resolvedTextLayers 为每段文字图层解析变量后的内容数组，用于多段文字模式。
 * 旧请求通过 active 标记丢弃，确保不会覆盖新选图/新设置。
 */
export const usePreview = (
  selectedFilePath: string | null,
  settings: RenderSettings,
  settingsVersion: number,
  textOverride?: string | null,
  resolvedTextLayers?: readonly (string | null)[] | null,
  resolvedBrand?: string | null,
  engineBaseUrlRevision: number = 0
): PreviewState => {
  const [state, setState] = useState<PreviewState>({ kind: "idle" })

  const lastRequestedRef = useRef<{
    filePath: string | null
    version: number
    engineBaseUrlRevision: number
    textOverride: string | null | undefined
    textLayersSig: string
    brand: string | null | undefined
  }>({
    filePath: null,
    version: 0,
    engineBaseUrlRevision: 0,
    textOverride: undefined,
    textLayersSig: "",
    brand: undefined
  })

  // 加载图片元素（引擎优先；失败时降级到本地 nativeImage 预览）
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

    // RAW/HEIC 等系统缩略图无法解码的格式：直接走本地预览失败路径，
    // 提示用户「本地预览不可用，需等待引擎恢复」，不静默伪装成正常预览。
    const isUnsupportedForLocal = isRawOrHeicFile(selectedFilePath)

    const imageRequest: PreviewRequest = buildPlainImagePreviewRequest(
      selectedFilePath,
      PREVIEW_MAX_WIDTH,
      PREVIEW_MAX_HEIGHT
    )

    /**
     * 把 dataURL/objectURL 包装为可绘制的 HTMLImageElement。
     * 任何异常（load 失败、格式不支持）由调用方在 .catch 中处理。
     */
    const loadImageFromUrl = (url: string): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = (): void => {
          if (img.naturalWidth === 0 || img.naturalHeight === 0) {
            reject(new Error("image has zero dimensions"))
            return
          }
          resolve(img)
        }
        img.onerror = (): void => reject(new Error("image load failed"))
        img.src = url
      })

    /**
     * 本地降级：通过主进程 nativeImage 读取 + 缩放，返回 dataURL。
     * 引擎不可用时工作台仍可继续预览。
     */
    const tryLocalPreview = async (): Promise<HTMLImageElement | null> => {
      if (isUnsupportedForLocal || !isLocalPreviewSupported(selectedFilePath)) {
        return null
      }
      const result = await loadLocalImagePreview(
        selectedFilePath,
        PREVIEW_MAX_WIDTH,
        PREVIEW_MAX_HEIGHT
      )
      if (result === null) {
        return null
      }
      currentObjectUrl = result.dataUrl
      return loadImageFromUrl(result.dataUrl)
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
        const objectUrl = URL.createObjectURL(blob)
        currentObjectUrl = objectUrl
        return loadImageFromUrl(objectUrl)
      })
      .then((img) => {
        if (!active || img === undefined) {
          return
        }
        setState((prev) => {
          if (prev.kind !== "active" || prev.filePath !== selectedFilePath) {
            return prev
          }
          return { ...prev, currentImage: img }
        })
      })
      .catch(async () => {
        // 引擎不可达：降级到本地 nativeImage 预览（仅 JPEG/PNG/WebP/BMP/TIFF）
        if (!active) {
          return
        }
        const img = await tryLocalPreview()
        if (!active || img === null) {
          // 引擎失败 + 本地无法解码（RAW/HEIC 或桥接不可用）：保持 currentImage=null
          // 状态文本由 EngineStatusBar 提示用户等待引擎恢复
          return
        }
        setState((prev) => {
          if (prev.kind !== "active" || prev.filePath !== selectedFilePath) {
            return prev
          }
          return { ...prev, currentImage: img }
        })
      })

    return () => {
      active = false
      if (currentObjectUrl !== null && currentObjectUrl.startsWith("blob:")) {
        URL.revokeObjectURL(currentObjectUrl)
      }
    }
  }, [selectedFilePath, engineBaseUrlRevision])

  // 后台引擎预览请求
  useEffect(() => {
    if (selectedFilePath === null) {
      return
    }

    // 构建去重签名：resolvedTextLayers 变化时需要重新请求
    const textLayersSig = resolvedTextLayers
      ? resolvedTextLayers.join("\u0000")
      : ""

    const fileUnchanged = selectedFilePath === lastRequestedRef.current.filePath
    const versionUnchanged = settingsVersion === lastRequestedRef.current.version
    const engineBaseUrlUnchanged = engineBaseUrlRevision === lastRequestedRef.current.engineBaseUrlRevision
    const textOverrideUnchanged = textOverride === lastRequestedRef.current.textOverride
    const textLayersUnchanged = textLayersSig === lastRequestedRef.current.textLayersSig
    const brandUnchanged = resolvedBrand === lastRequestedRef.current.brand

    if (fileUnchanged && versionUnchanged && engineBaseUrlUnchanged
      && textOverrideUnchanged && textLayersUnchanged && brandUnchanged && state.kind !== "idle") {
      return
    }
    lastRequestedRef.current = {
      filePath: selectedFilePath,
      version: settingsVersion,
      engineBaseUrlRevision,
      textOverride,
      textLayersSig,
      brand: resolvedBrand
    }

    let active = true

    setState((prev) => {
      if (prev.kind !== "active") {
        return prev
      }
      return { ...prev, engineSyncStatus: "syncing" }
    })

    void requestPreview(buildPreviewRequest(
      selectedFilePath, settings, PREVIEW_MAX_WIDTH, PREVIEW_MAX_HEIGHT,
      textOverride, resolvedTextLayers, resolvedBrand
    ))
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
  }, [selectedFilePath, settingsVersion, settings, textOverride, resolvedTextLayers, resolvedBrand, engineBaseUrlRevision])

  return state
}
