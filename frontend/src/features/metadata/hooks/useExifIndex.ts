import { useCallback, useRef, useState } from "react"
import { fetchPhotoMetadata } from "../../../services/engine/photoMetadataApi"
import type { PhotoMetadata } from "../../../types/preview"

/**
 * EXIF 索引：按文件路径缓存已读取的照片元数据。
 *
 * 用途：把 EXIF 读取结果并入「有效摄影身份」优先级链
 * （每图覆盖 > 摄影预设 > EXIF > 空），让 {Camera}/{Lens} 等变量在没有
 * 预设或手动填写时也能自动有值，而不是恒为空。
 *
 * 读取是惰性的：
 * - ensureExif(path)：预览用，fire-and-forget（只读当前选中图，失败静默降级）；
 * - ensureExifForExport(paths)：批量/单图导出用，可等待——导出前先逐张读取全部
 *   队列路径的 EXIF，全部完成（含失败降级）后才开始构建 RenderRecipe；
 * - getExifByPath()：读取最新缓存（ref 同步），供解析链在导出/预览时取到
 *   刚到达的 EXIF，避免闭包拿到过期 Map。
 *
 * 同一路径并发去重（in-flight Map），读取失败返回 null 且不缓存，
 * 不阻塞整批导出（对应路径降级为空）。
 */
export const useExifIndex = (): {
  readonly exifByPath: ReadonlyMap<string, PhotoMetadata>
  readonly getExifByPath: () => ReadonlyMap<string, PhotoMetadata>
  readonly ensureExif: (filePath: string | null) => void
  readonly ensureExifForExport: (filePaths: readonly string[]) => Promise<void>
} => {
  const [exifByPath, setExifByPath] = useState<ReadonlyMap<string, PhotoMetadata>>(
    () => new Map()
  )
  /** ref 镜像：保证解析链在任何时刻都能读到最新缓存（含导出等待期间刚到达的 EXIF）。 */
  const exifByPathRef = useRef<ReadonlyMap<string, PhotoMetadata>>(new Map())
  /** 在途请求去重：同一路径只发一次请求。 */
  const inFlightRef = useRef(new Map<string, Promise<PhotoMetadata | null>>())

  /** 读取单个路径的 EXIF：已缓存直接返回；失败返回 null（不缓存，可重试）。 */
  const loadExif = useCallback((filePath: string): Promise<PhotoMetadata | null> => {
    const cached = exifByPathRef.current.get(filePath)
    if (cached !== undefined) {
      return Promise.resolve(cached)
    }
    const inFlight = inFlightRef.current.get(filePath)
    if (inFlight !== undefined) {
      return inFlight
    }
    const promise = fetchPhotoMetadata(filePath)
      .then((meta) => {
        const next = new Map(exifByPathRef.current)
        next.set(filePath, meta)
        exifByPathRef.current = next
        setExifByPath(next)
        return meta
      })
      .catch(() => null)
    inFlightRef.current.set(filePath, promise)
    void promise.finally(() => {
      inFlightRef.current.delete(filePath)
    })
    return promise
  }, [])

  /** 预览用：fire-and-forget 读取选中图片 EXIF（失败静默降级为空）。 */
  const ensureExif = useCallback((filePath: string | null): void => {
    if (filePath === null) {
      return
    }
    void loadExif(filePath)
  }, [loadExif])

  /**
   * 导出用：等待所有路径的 EXIF 读取完成（成功或失败降级）后再返回。
   * 失败/无 EXIF 的路径不会阻塞整批导出，其身份链自然降级为空。
   */
  const ensureExifForExport = useCallback(async (filePaths: readonly string[]): Promise<void> => {
    await Promise.all(filePaths.map((filePath) => loadExif(filePath)))
  }, [loadExif])

  /** 读取最新 EXIF 缓存（供解析链取用，避免闭包过期）。 */
  const getExifByPath = useCallback((): ReadonlyMap<string, PhotoMetadata> => {
    return exifByPathRef.current
  }, [])

  return { exifByPath, getExifByPath, ensureExif, ensureExifForExport }
}
