import { useEffect, useRef, useState } from "react"
import { requestPreview } from "../../../services/engine/previewApi"
import { loadLocalImagePreview, isLocalPreviewSupported, isRawOrHeicFile } from "../../../services/desktop/localImagePreview"

/**
 * 缩略图缓存与并发加载 Hook。
 *
 * 设计要点：
 * - 使用 Map<filePath, previewUrl> 做内存缓存，避免重复请求
 * - 并发控制（最多 3 个同时请求），避免队列加载时打爆后端
 * - 缩略图请求使用小尺寸（120px）且不加边框文字，尽量轻量
 * - 组件卸载或依赖变化时取消进行中的请求
 */

const THUMB_MAX = 120
const MAX_CONCURRENT = 3

/** 全局缩略图缓存，跨组件实例共享，避免重复请求。 */
const thumbCache = new Map<string, string>()

/**
 * 解析引擎返回的同源相对 previewUrl；data URL 仅用于兼容本地降级结果。
 * 绝对 Java 地址不属于渲染进程契约，收到时直接拒绝。
 */
export const resolveEngineUrl = (previewUrl: string): string | null => {
  if (previewUrl.startsWith("data:image/")) {
    return previewUrl
  }
  if (previewUrl.startsWith("/")) {
    return previewUrl
  }
  return null
}

/**
 * 拉取并物化一张缩略图：先尝试引擎；引擎失败时降级到本地 nativeImage 预览。
 * 任何步骤失败返回 null（不污染队列）。
 */
const fetchThumbnail = async (filePath: string, maxWidth: number, maxHeight: number): Promise<string | null> => {
  // 引擎路径
  const request = {
    recipe: {
      imagePath: filePath,
      border: { top: 0, bottom: 0, left: 0, right: 0, color: "#000000" },
      gradient: null,
      texts: [],
      filmFormat: null,
      autoCrop: false
    },
    maxWidth,
    maxHeight
  }
  try {
    const response = await requestPreview(request)
    if (response.previewAvailable) {
      const url = resolveEngineUrl(response.previewUrl)
      if (url !== null) {
        if (url.startsWith("data:")) {
          return url
        }
        const r = await fetch(url)
        const contentType = r.headers.get("content-type")?.toLowerCase() ?? ""
        if (r.ok && contentType.startsWith("image/")) {
          // 保留相对路径：生产 app:// 页面中的 img 会解析为
          // app://app/previews/<id>，避免把代理结果物化成 blob: 地址。
          return url
        }
      }
    }
  } catch {
    // 引擎不可达：降级到本地预览
  }
  // 本地降级：仅 JPEG/PNG/WebP/BMP/TIFF 等系统可解码格式
  if (isRawOrHeicFile(filePath) || !isLocalPreviewSupported(filePath)) {
    return null
  }
  const local = await loadLocalImagePreview(filePath, maxWidth, maxHeight)
  if (local === null) {
    return null
  }
  // 队列缩略图直接复用 dataURL，不再二次 blob 化
  return local.dataUrl
}

export const useThumbnails = (
  filePaths: readonly string[]
): Map<string, string> => {
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map(thumbCache))
  const activeRef = useRef(true)

  useEffect(() => {
    activeRef.current = true
    return () => { activeRef.current = false }
  }, [])

  useEffect(() => {
    const uncached = filePaths.filter((p) => !thumbCache.has(p))
    if (uncached.length === 0) {
      setThumbnails(new Map(thumbCache))
      return
    }

    let running = 0
    let nextIndex = 0

    const processNext = (): void => {
      while (running < MAX_CONCURRENT && nextIndex < uncached.length) {
        const filePath = uncached[nextIndex]
        nextIndex++
        if (filePath === undefined) {
          continue
        }
        running++

        if (thumbCache.has(filePath)) {
          running--
          processNext()
          continue
        }

        void fetchThumbnail(filePath, THUMB_MAX, THUMB_MAX)
          .then((dataUrl) => {
            if (!activeRef.current || dataUrl === null) {
              return
            }
            thumbCache.set(filePath, dataUrl)
            setThumbnails(new Map(thumbCache))
          })
          .catch(() => {
            // 缩略图加载失败时静默跳过
          })
          .finally(() => {
            running--
            if (activeRef.current) {
              processNext()
            }
          })
      }
    }

    processNext()
  }, [filePaths])

  return thumbnails
}
