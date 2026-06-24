import { useEffect, useRef, useState } from "react"
import { requestPreview } from "../../../services/engine/previewApi"

/**
 * 缩略图缓存与并发加载 Hook。
 *
 * 设计要点：
 * - 使用 Map<filePath, objectURL> 做内存缓存，避免重复请求
 * - 并发控制（最多 3 个同时请求），避免队列加载时打爆后端
 * - 缩略图请求使用小尺寸（120px）且不加边框文字，尽量轻量
 * - 组件卸载或依赖变化时取消进行中的请求
 */

const THUMB_MAX = 120
const MAX_CONCURRENT = 3

/** 全局缩略图缓存，跨组件实例共享，避免重复请求。 */
const thumbCache = new Map<string, string>()

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

        const request = {
          recipe: {
            imagePath: filePath,
            border: { top: 0, bottom: 0, left: 0, right: 0, color: "#000000" },
            gradient: null,
            texts: [],
            filmFormat: null,
            autoCrop: false
          },
          maxWidth: THUMB_MAX,
          maxHeight: THUMB_MAX
        }

        void requestPreview(request)
          .then((response) => {
            if (!activeRef.current) {
              return
            }
            if (!response.previewAvailable) {
              return
            }

            const previewUrl = response.previewUrl
            let fullUrl: string
            if (previewUrl.startsWith("data:")) {
              fullUrl = previewUrl
            } else if (previewUrl.startsWith("/")) {
              fullUrl = previewUrl
            } else if (previewUrl.startsWith("http://") || previewUrl.startsWith("https://")) {
              try {
                const parsed = new URL(previewUrl)
                fullUrl = parsed.pathname + parsed.search
              } catch {
                return
              }
            } else {
              return
            }

            return fetch(fullUrl)
              .then((r) => r.blob())
              .then((blob) => {
                if (!activeRef.current) {
                  URL.revokeObjectURL(URL.createObjectURL(blob))
                  return
                }
                const objectUrl = URL.createObjectURL(blob)
                thumbCache.set(filePath, objectUrl)
                setThumbnails(new Map(thumbCache))
              })
              .catch(() => {
                // 缩略图加载失败时静默跳过
              })
          })
          .catch(() => {
            // 缩略图请求失败时静默跳过
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
