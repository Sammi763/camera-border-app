import { useEffect, useMemo, useRef, useState } from "react"
import { requestPreview } from "../../../services/engine/previewApi"
import {
  createPreviewCacheKey,
  hashRenderRecipe,
  releasePreviewUrl,
  thumbnailUrlCache
} from "../../../services/engine/previewCache"
import { getImageFileVersions } from "../../../services/desktop/imageFileVersion"
import { loadLocalImagePreview, isLocalPreviewSupported, isRawOrHeicFile } from "../../../services/desktop/localImagePreview"
import type { PreviewRequest, RenderRecipe } from "../../../types/preview"
import type { ImageFileVersion } from "../../../types/runtime"

/**
 * 缩略图缓存与并发加载 Hook。
 *
 * 设计要点：
 * - 缩略图请求使用小尺寸（120px）且无边框文字，Java 与 nativeImage 均可在解码阶段 subsampling；
 * - 严格最多 2 个并发请求，避免 100 图队列把引擎和 Renderer 同时打满；
 * - 缓存键固定为 path + 请求尺寸 + mtime + RenderRecipe hash，文件替换或配方变化不会串图；
 * - 缓存按已编码字节上限淘汰（见 previewCache.ts），不保存原图像素数据。
 */

const THUMB_MAX = 120
const MAX_CONCURRENT = 2

type ThumbnailPayload = {
  readonly url: string
  readonly byteSize: number
}

/**
 * 解析引擎返回的同源相对 previewUrl；data URL 仅用于兼容本地降级结果。
 * 绝对 Java 地址不属于渲染进程契约，收到时直接拒绝。
 */
export const resolveEngineUrl = (previewUrl: string): string | null => {
  if (previewUrl.startsWith("data:image/")) {
    return previewUrl
  }
  // 预览资源只能来自受控的单段 /previews/{id} 路由；拒绝 //host、路径穿越和其它相对路径。
  if (/^\/previews\/[A-Za-z0-9_-]+$/.test(previewUrl)) {
    return previewUrl
  }
  return null
}

/** 缩略图唯一使用的零边框 RenderRecipe；导出配方不受它影响。 */
const buildThumbnailRecipe = (filePath: string): RenderRecipe => ({
  imagePath: filePath,
  border: { top: 0, bottom: 0, left: 0, right: 0, color: "#000000" },
  gradient: null,
  texts: [],
  imagePlacement: {
    mode: "fit",
    focalX: 0.5,
    focalY: 0.5,
    rotation: 0,
    targetAspectRatio: null
  }
})

export const buildThumbnailRequest = (filePath: string, maxWidth: number, maxHeight: number): PreviewRequest => ({
  recipe: buildThumbnailRecipe(filePath),
  maxWidth,
  maxHeight
})

/** 浏览器不支持 object URL 时的测试/降级转换；Chromium 路径优先使用可释放的 blob URL。 */
const blobToDataUrl = async (blob: Blob): Promise<string> =>
  await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (): void => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("thumbnail data URL conversion failed"))
    reader.onerror = (): void => reject(new Error("thumbnail data URL conversion failed"))
    reader.readAsDataURL(blob)
  })

/**
 * 拉取并物化一张缩略图：先尝试引擎；引擎失败时降级到本地 nativeImage 预览。
 * 任何步骤失败返回 null（不污染队列）。signal 表示该任务已被新的队列范围替代。
 */
const fetchThumbnail = async (
  filePath: string,
  maxWidth: number,
  maxHeight: number,
  signal: AbortSignal
): Promise<ThumbnailPayload | null> => {
  const request = buildThumbnailRequest(filePath, maxWidth, maxHeight)
  try {
    const response = await requestPreview(request, undefined, signal)
    if (response.previewAvailable) {
      const url = resolveEngineUrl(response.previewUrl)
      if (url !== null) {
        if (url.startsWith("data:")) {
          return { url, byteSize: Math.max(1, url.length) }
        }
        const imageResponse = await fetch(url, { signal })
        const contentType = imageResponse.headers.get("content-type")?.toLowerCase() ?? ""
        if (imageResponse.ok && contentType.startsWith("image/")) {
          const blob = await imageResponse.blob()
          if (typeof URL.createObjectURL === "function") {
            const objectUrl = URL.createObjectURL(blob)
            if (signal.aborted) {
              releasePreviewUrl(objectUrl)
              return null
            }
            return { url: objectUrl, byteSize: Math.max(1, blob.size) }
          }
          return { url: await blobToDataUrl(blob), byteSize: Math.max(1, blob.size) }
        }
      }
    }
  } catch {
    // 取消时不再做本地兜底；其他引擎失败才进入 nativeImage 路径。
    if (signal.aborted) return null
  }
  if (signal.aborted || isRawOrHeicFile(filePath) || !isLocalPreviewSupported(filePath)) {
    return null
  }
  const local = await loadLocalImagePreview(filePath, maxWidth, maxHeight)
  if (signal.aborted || local === null) {
    return null
  }
  // 队列缩略图直接复用 dataURL，不再二次 blob 化。
  return { url: local.dataUrl, byteSize: Math.max(1, local.dataUrl.length) }
}

const versionForPath = (
  versions: ReadonlyMap<string, ImageFileVersion | null>,
  filePath: string
): ImageFileVersion | null =>
  versions.get(filePath) ?? null

const thumbnailKey = (filePath: string, version: ImageFileVersion | null): string => {
  const request = buildThumbnailRequest(filePath, THUMB_MAX, THUMB_MAX)
  return createPreviewCacheKey({
    imagePath: filePath,
    maxWidth: THUMB_MAX,
    maxHeight: THUMB_MAX,
    modifiedAtMs: version?.mtimeMs ?? null,
    sourceSizeBytes: version?.sizeBytes ?? null,
    recipeHash: hashRenderRecipe(request.recipe)
  })
}

const cachedThumbnailMap = (
  filePaths: readonly string[],
  versions: ReadonlyMap<string, ImageFileVersion | null>
): Map<string, string> => {
  const result = new Map<string, string>()
  for (const filePath of filePaths) {
    const cached = thumbnailUrlCache.get(thumbnailKey(filePath, versionForPath(versions, filePath)))
    if (cached !== null) {
      result.set(filePath, cached)
    }
  }
  return result
}

export const useThumbnails = (filePaths: readonly string[]): Map<string, string> => {
  const pathSignature = useMemo(() => [...filePaths].join("\u0000"), [filePaths])
  const [versions, setVersions] = useState<ReadonlyMap<string, ImageFileVersion | null>>(new Map())
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map())
  const ownedThumbnailKeys = useRef<Map<string, string>>(new Map())

  // 读取受限 mtime；桥不存在时服务返回等长 null，仍可安全使用 unknown-mtime 缓存键。
  useEffect(() => {
    let active = true
    void getImageFileVersions(filePaths).then((results) => {
      if (!active) return
      setVersions((previous) => {
        const next = new Map(previous)
        filePaths.forEach((filePath, index) => next.set(filePath, results[index] ?? null))
        return next
      })
    })
    return () => { active = false }
  }, [filePaths, pathSignature])

  const versionsReady = filePaths.every((filePath) => versions.has(filePath))

  useEffect(() => {
    const currentPaths = new Set(filePaths)
    for (const [filePath, cacheKey] of ownedThumbnailKeys.current) {
      if (!currentPaths.has(filePath)) {
        thumbnailUrlCache.delete(cacheKey)
        ownedThumbnailKeys.current.delete(filePath)
      }
    }

    if (!versionsReady) {
      setThumbnails(cachedThumbnailMap(filePaths, versions))
      return
    }

    let active = true
    let running = 0
    let nextIndex = 0
    const controllers = new Set<AbortController>()
    const uniquePaths = [...new Set(filePaths)]
    const currentThumbnailKeys = new Map<string, string>()
    for (const filePath of uniquePaths) {
      const cacheKey = thumbnailKey(filePath, versionForPath(versions, filePath))
      const previousKey = ownedThumbnailKeys.current.get(filePath)
      if (previousKey !== undefined && previousKey !== cacheKey) {
        thumbnailUrlCache.delete(previousKey)
      }
      currentThumbnailKeys.set(filePath, cacheKey)
    }
    ownedThumbnailKeys.current = currentThumbnailKeys
    const uncached = uniquePaths.filter((filePath) =>
      thumbnailUrlCache.get(thumbnailKey(filePath, versionForPath(versions, filePath))) === null)

    setThumbnails(cachedThumbnailMap(filePaths, versions))

    const publish = (): void => {
      if (active) {
        setThumbnails(cachedThumbnailMap(filePaths, versions))
      }
    }

    const processNext = (): void => {
      while (active && running < MAX_CONCURRENT && nextIndex < uncached.length) {
        const filePath = uncached[nextIndex]
        nextIndex++
        if (filePath === undefined) continue
        const controller = new AbortController()
        controllers.add(controller)
        running++

        void fetchThumbnail(filePath, THUMB_MAX, THUMB_MAX, controller.signal)
          .then((payload) => {
            if (payload === null) return
            if (!active) {
              // 请求完成与范围卸载竞态下，缓存没有接管该 object URL，必须在这里释放。
              releasePreviewUrl(payload.url)
              return
            }
            thumbnailUrlCache.set(
              thumbnailKey(filePath, versionForPath(versions, filePath)),
              payload.url,
              payload.byteSize
            )
            publish()
          })
          .catch(() => {
            // 单张缩略图失败时静默跳过，队列仍保留可操作的占位状态。
          })
          .finally(() => {
            controllers.delete(controller)
            running--
            processNext()
          })
      }
    }

    processNext()
    return () => {
      active = false
      for (const controller of controllers) controller.abort()
    }
  }, [filePaths, pathSignature, versions, versionsReady])

  useEffect(() => () => {
    // 组件卸载时释放当前可见范围持有的 URL；范围切换只释放移出范围的项目。
    for (const cacheKey of ownedThumbnailKeys.current.values()) {
      thumbnailUrlCache.delete(cacheKey)
    }
    ownedThumbnailKeys.current.clear()
  }, [])

  return thumbnails
}
