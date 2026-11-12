import { useEffect, useMemo, useRef, useState } from "react"
import { requestPreview } from "../../../services/engine/previewApi"
import { EngineHttpError } from "../../../services/engine/engineClient"
import { cancelFilmRequests, isFilmCancellation } from "../../../services/engine/filmRequestsApi"
import { TuningScheduler } from "../../../services/engine/tuningScheduler"
import {
  createPreviewCacheKey,
  hashRenderRecipe,
  previewUrlCache
} from "../../../services/engine/previewCache"
import { getImageFileVersions } from "../../../services/desktop/imageFileVersion"
import { toFileName } from "../../../utils/fileName"
import { buildPlainImagePreviewRequest, buildPreviewRequest } from "../../settings/utils/buildRecipe"
import { loadLocalImagePreview, isLocalPreviewSupported, isRawOrHeicFile } from "../../../services/desktop/localImagePreview"
import type { PreviewRequest } from "../../../types/preview"
import type { ImageProcessingConfig } from "../../../types/imageProcessing"
import type { RenderSettings } from "../../settings/types"
import type { PreviewState } from "../types"

const PREVIEW_MAX_WIDTH = 1280
const PREVIEW_MAX_HEIGHT = 1280
const ENGINE_STARTUP_RETRY_COUNT = 8
const ENGINE_STARTUP_RETRY_DELAY_MS = 400

/** 托管引擎启动窗口内重试 503；真实错误仍快速进入可解释的降级状态。 */
const requestPreviewWithStartupRetry = async (
  request: PreviewRequest,
  signal: AbortSignal
) => {
  let lastError: unknown = null
  for (let attempt = 0; attempt <= ENGINE_STARTUP_RETRY_COUNT; attempt++) {
    try {
      return await requestPreview(request, undefined, signal)
    } catch (error: unknown) {
      lastError = error
      const startupError = error instanceof EngineHttpError
        && (error.status === 503 || error.code === "ENGINE_STARTING")
      if (!startupError || attempt === ENGINE_STARTUP_RETRY_COUNT || signal.aborted) {
        throw error
      }
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(resolve, ENGINE_STARTUP_RETRY_DELAY_MS)
        signal.addEventListener("abort", () => {
          window.clearTimeout(timer)
          reject(new DOMException("Preview request aborted", "AbortError"))
        }, { once: true })
      })
    }
  }
  throw lastError instanceof Error ? lastError : new Error("预览请求失败")
}

/**
 * 将引擎返回的同源相对 previewUrl 解析为可加载的 URL。
 * 生产环境的绝对 Java 地址不会进入渲染进程；data URL 仅用于本地降级预览。
 */
const resolveDisplayUrl = (previewUrl: string): string | null => {
  if (previewUrl.startsWith("data:image/")) {
    return previewUrl
  }
  // Java 只允许返回单段预览资源；避免 //host 或 /../ 路径绕过 app:// 代理边界。
  if (/^\/previews\/[A-Za-z0-9_-]+$/.test(previewUrl)) {
    return previewUrl
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
 * 旧请求由 AbortController 物理取消，确保不会占用引擎并覆盖新选图/新设置。
 */
export const usePreview = (
  selectedFilePath: string | null,
  settings: RenderSettings,
  settingsVersion: number,
  textOverride?: string | null,
  resolvedTextLayers?: readonly (string | null)[] | null,
  resolvedBrand?: string | null,
  imageProcessing?: ImageProcessingConfig | null
): PreviewState => {
  const requestClient = useRef(`preview_${Math.random().toString(36).slice(2)}`)
  const schedulerRef = useRef<TuningScheduler | null>(null)
  const filmModeRef = useRef(false)
  const flushRequestedRef = useRef(false)
  const [state, setState] = useState<PreviewState>({ kind: "idle" })
  const filmMode = imageProcessing !== null && imageProcessing !== undefined
  filmModeRef.current = filmMode
  const imageProcessingSignature = imageProcessing === null || imageProcessing === undefined
    ? ""
    : JSON.stringify(imageProcessing)

  // WorkspacePage 解析拍摄信息时会在每次重绘生成新的数组引用。以内容签名稳定它，
  // 否则本 effect 的 cleanup 会取消刚发送、但尚未返回的引擎预览请求，使状态永久停在同步中。
  const textLayersSignature = resolvedTextLayers === undefined
    ? "undefined"
    : JSON.stringify(resolvedTextLayers)
  const stableResolvedTextLayers = useMemo<readonly (string | null)[] | null | undefined>(() => {
    if (resolvedTextLayers === null || resolvedTextLayers === undefined) {
      return resolvedTextLayers
    }
    return [...resolvedTextLayers]
  }, [textLayersSignature])

  // 加载图片元素（引擎优先；失败时降级到本地 nativeImage 预览）
  useEffect(() => {
    if (selectedFilePath === null) {
      setState({ kind: "idle" })
      return
    }

    let active = true
    let ownedObjectUrl: string | null = null
    let cacheKey: string | null = null
    const requestController = new AbortController()

    setState({
      kind: "active",
      filePath: selectedFilePath,
      fileName: toFileName(selectedFilePath),
      currentImage: null,
      engineDisplayUrl: null,
      engineSyncStatus: "idle",
      engineResponse: null,
      filmMode
    })

    // 底片模式只显示引擎校色结果：普通源图/本地 nativeImage 不能冒充当前结果。
    if (filmMode) {
      return () => {
        active = false
        requestController.abort()
      }
    }

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
      if (cacheKey !== null) {
        previewUrlCache.set(cacheKey, result.dataUrl)
      }
      return loadImageFromUrl(result.dataUrl)
    }

    const applyImage = (image: HTMLImageElement): void => {
      if (!active) return
      setState((prev) => {
        if (prev.kind !== "active" || prev.filePath !== selectedFilePath) {
          return prev
        }
        return { ...prev, currentImage: image }
      })
    }

    const loadEnginePreview = async (): Promise<void> => {
      const versions = await getImageFileVersions([selectedFilePath])
      if (!active) return
      cacheKey = createPreviewCacheKey({
        imagePath: selectedFilePath,
        maxWidth: PREVIEW_MAX_WIDTH,
        maxHeight: PREVIEW_MAX_HEIGHT,
        modifiedAtMs: versions[0]?.mtimeMs ?? null,
        sourceSizeBytes: versions[0]?.sizeBytes ?? null,
        recipeHash: hashRenderRecipe(imageRequest.recipe)
      })

      const cachedUrl = previewUrlCache.get(cacheKey)
      if (cachedUrl !== null) {
        applyImage(await loadImageFromUrl(cachedUrl))
        return
      }

      const response = await requestPreviewWithStartupRetry(imageRequest, requestController.signal)
      if (!active || !response.previewAvailable) return
      const displayUrl = resolveDisplayUrl(response.previewUrl)
      if (displayUrl === null) return
      if (displayUrl.startsWith("data:")) {
        const image = await loadImageFromUrl(displayUrl)
        if (!active) return
        previewUrlCache.set(cacheKey, displayUrl)
        applyImage(image)
        return
      }

      const fetchResponse = await fetch(displayUrl, { signal: requestController.signal })
      if (!fetchResponse.ok) {
        throw new Error("preview image response failed")
      }
      const blob = await fetchResponse.blob()
      if (!active) return
      const objectUrl = URL.createObjectURL(blob)
      ownedObjectUrl = objectUrl
      const image = await loadImageFromUrl(objectUrl)
      if (!active) return
      // 缓存接管 object URL；达到字节预算时会由缓存立即 revoke，不能在这里再次释放。
      previewUrlCache.set(cacheKey, objectUrl, blob.size)
      ownedObjectUrl = null
      applyImage(image)
    }

    void loadEnginePreview().catch(async () => {
      // 引擎不可达：降级到本地 nativeImage 预览（仅 JPEG/PNG/WebP/BMP/TIFF）
      if (!active || requestController.signal.aborted) {
        return
      }
      const img = await tryLocalPreview()
      if (!active || img === null) {
        // 引擎失败 + 本地无法解码（RAW/HEIC 或桥接不可用）：保持 currentImage=null
        // 状态文本由 EngineStatusBar 提示用户等待引擎恢复
        return
      }
      applyImage(img)
    })

    return () => {
      active = false
      requestController.abort()
      if (ownedObjectUrl !== null && ownedObjectUrl.startsWith("blob:")) {
        URL.revokeObjectURL(ownedObjectUrl)
      }
    }
  }, [selectedFilePath, filmMode])

  // 每个“文件 + 模式”创建一个调度器；切换图片/关闭底片模式/卸载视图时取消后端旧代次。
  useEffect(() => {
    const scheduler = new TuningScheduler({
      throttleMs: 250,
      onSupersede: (generation) => {
        if (filmModeRef.current) {
          void cancelFilmRequests(requestClient.current, generation).catch(() => {
            // 取消是尽力而为；不把旧任务取消失败展示成引擎不可达。
          })
        }
      }
    })
    schedulerRef.current = scheduler
    return () => {
      const generation = scheduler.dispose()
      if (schedulerRef.current === scheduler) {
        schedulerRef.current = null
      }
      if (filmMode) {
        void cancelFilmRequests(requestClient.current, generation).catch(() => {
          // 切图/卸载时引擎可能已退出；旧任务不会写回新视图。
        })
      }
    }
  }, [selectedFilePath, filmMode])

  // 松手、失焦或确认输入立即提交最终快照；拖动期间由调度器节流到 250ms。
  useEffect(() => {
    const flush = (): void => {
      flushRequestedRef.current = true
      schedulerRef.current?.flush()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Enter") flush()
    }
    window.addEventListener("pointerup", flush, true)
    window.addEventListener("pointercancel", flush, true)
    window.addEventListener("blur", flush, true)
    document.addEventListener("focusout", flush, true)
    document.addEventListener("change", flush, true)
    document.addEventListener("keydown", onKeyDown, true)
    return () => {
      window.removeEventListener("pointerup", flush, true)
      window.removeEventListener("pointercancel", flush, true)
      window.removeEventListener("blur", flush, true)
      document.removeEventListener("focusout", flush, true)
      document.removeEventListener("change", flush, true)
      document.removeEventListener("keydown", onKeyDown, true)
    }
  }, [])

  // 后台引擎预览请求：稳定快照、单一在途、最新待提交；等待期间保留上一张正确画面。
  useEffect(() => {
    if (selectedFilePath === null) {
      return
    }
    const scheduler = schedulerRef.current
    if (scheduler === null) {
      return
    }

    const plainEngineRequest = buildPreviewRequest(
      selectedFilePath, settings, PREVIEW_MAX_WIDTH, PREVIEW_MAX_HEIGHT,
      textOverride, stableResolvedTextLayers, resolvedBrand, imageProcessing
    )
    const snapshotKey = `${selectedFilePath}|${filmMode ? "film" : "plain"}|`
      + `${hashRenderRecipe(plainEngineRequest.recipe)}|${PREVIEW_MAX_WIDTH}x${PREVIEW_MAX_HEIGHT}`
    const immediate = flushRequestedRef.current
    flushRequestedRef.current = false

    const scheduled = scheduler.schedule(snapshotKey, async (generation, signal) => {
      const engineRequest: PreviewRequest = filmMode
        ? { ...plainEngineRequest, clientId: requestClient.current, generation }
        : plainEngineRequest
      try {
        const versions = await getImageFileVersions([selectedFilePath])
        if (signal.aborted) return
        const cacheKey = createPreviewCacheKey({
          imagePath: selectedFilePath,
          maxWidth: PREVIEW_MAX_WIDTH,
          maxHeight: PREVIEW_MAX_HEIGHT,
          modifiedAtMs: versions[0]?.mtimeMs ?? null,
          sourceSizeBytes: versions[0]?.sizeBytes ?? null,
          recipeHash: hashRenderRecipe(engineRequest.recipe)
        })
        const cachedUrl = previewUrlCache.get(cacheKey)
        if (cachedUrl !== null) {
          if (generation !== scheduler.generation) return
          setState((prev) => {
            if (prev.kind !== "active" || prev.filePath !== selectedFilePath) return prev
            return { ...prev, engineDisplayUrl: cachedUrl, engineSyncStatus: "synced" }
          })
          return
        }
        const response = await requestPreviewWithStartupRetry(engineRequest, signal)
        if (signal.aborted || generation !== scheduler.generation) return
        const displayUrl = response.previewAvailable
          ? resolveDisplayUrl(response.previewUrl)
          : null
        if (displayUrl !== null) previewUrlCache.set(cacheKey, displayUrl)
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
      } catch (error: unknown) {
        if (signal.aborted || generation !== scheduler.generation) {
          throw error
        }
        if (filmMode && isFilmCancellation(error)) {
          // 取消/被替代是正常状态：保留上一张正确画面，继续显示同步中。
          setState((prev) => {
            if (prev.kind !== "active" || prev.filePath !== selectedFilePath) return prev
            return { ...prev, engineSyncStatus: "syncing" }
          })
          throw error
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
        throw error
      }
    }, { immediate })

    if (scheduled !== "scheduled") {
      return
    }
    const scheduledGeneration = scheduler.generation
    setState((prev) => {
      if (prev.kind !== "active" || prev.filePath !== selectedFilePath) {
        return prev
      }
      return {
        ...prev,
        engineSyncStatus: "syncing",
        ...(filmMode
          ? {
            engineRecipe: JSON.parse(JSON.stringify(plainEngineRequest.recipe)) as PreviewRequest["recipe"],
            engineClientId: requestClient.current,
            engineGeneration: scheduledGeneration
          }
          : {})
      }
    })
  }, [
    selectedFilePath,
    filmMode,
    settings,
    textOverride,
    stableResolvedTextLayers,
    textLayersSignature,
    resolvedBrand,
    imageProcessing,
    imageProcessingSignature
  ])

  return state
}
