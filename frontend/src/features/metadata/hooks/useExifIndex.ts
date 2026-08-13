import { useCallback, useState } from "react"
import { fetchPhotoMetadata } from "../../../services/engine/photoMetadataApi"
import type { PhotoMetadata } from "../../../types/preview"

/**
 * EXIF 索引：按文件路径缓存已读取的照片元数据。
 *
 * 用途：把 EXIF 读取结果并入「有效摄影身份」优先级链
 * （每图覆盖 > Roll > EXIF > 空），让 {Camera}/{Lens} 等变量在没有
 * Roll 或手动填写时也能自动有值，而不是恒为空。
 *
 * 读取是惰性的：只有调用 ensureExif(path) 的路径才会被读取（通常只读
 * 当前选中图 + 批量导出时逐图读取），并缓存到会话内 Map 避免重复请求。
 * 读取失败静默忽略，不阻塞预览/导出主流程。
 */
export const useExifIndex = (): {
  readonly exifByPath: ReadonlyMap<string, PhotoMetadata>
  readonly ensureExif: (filePath: string | null) => void
} => {
  const [exifByPath, setExifByPath] = useState<ReadonlyMap<string, PhotoMetadata>>(
    () => new Map()
  )

  const ensureExif = useCallback((filePath: string | null): void => {
    if (filePath === null) {
      return
    }
    // 已缓存或已在途时直接跳过（通过同步检查避免重复请求）
    setExifByPath((prev) => {
      if (prev.has(filePath)) {
        return prev
      }
      void fetchPhotoMetadata(filePath)
        .then((meta) => {
          setExifByPath((current) => {
            if (current.has(filePath)) {
              return current
            }
            const next = new Map(current)
            next.set(filePath, meta)
            return next
          })
        })
        .catch(() => {
          // EXIF 读取失败（无元数据/文件不可读）不阻塞预览与导出
        })
      return prev
    })
  }, [])

  return { exifByPath, ensureExif }
}
