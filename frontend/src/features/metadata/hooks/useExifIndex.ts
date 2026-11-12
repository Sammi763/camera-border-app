import { useCallback, useRef, useState } from "react"
import { fetchPhotoMetadata } from "../../../services/engine/photoMetadataApi"
import { getImageFileVersions } from "../../../services/desktop/imageFileVersion"
import type { PhotoMetadata } from "../../../types/preview"

/** 批量 EXIF 读取的并发上限：避免百张队列导出前把引擎的元数据端点打满。 */
const EXIF_LOAD_CONCURRENCY = 4

/**
 * EXIF 索引：按文件路径缓存已读取的照片元数据。
 *
 * 用途：把 EXIF 读取结果并入「有效摄影身份」优先级链
 * （每图覆盖 > 摄影预设 > EXIF > 空），让 {Camera}/{Lens} 等变量在没有
 * 预设或手动填写时也能自动有值，而不是恒为空。
 *
 * 读取是惰性的：
 * - ensureExif(path)：预览用，fire-and-forget（只读当前选中图）；
 * - ensureExifForExport(paths, signal?)：批量/单图导出用，可等待、可取消——
 *   以固定并发上限读取全部路径，全部完成（含失败降级）后才开始构建
 *   RenderRecipe；signal 中止时立即返回，不再发起新读取；
 * - getExifByPath()：读取最新缓存（ref 同步），供解析链在导出/预览时取到
 *   刚到达的 EXIF，避免闭包拿到过期 Map。
 *
 * 失败语义（U09）：引擎明确响应「无元数据」按成功缓存（确无 EXIF）；
 * 请求抛错记入 exifFailures（读取失败），不静默当成空信息，可重试。
 * 导出路径在读取前按 mtime+size 校验文件版本，文件变化后自动重新读取，
 * 与缩略图的版本失效语义一致。
 *
 * 状态发布：ref 即时更新（解析链实时可读），React 状态整批发布一次，
 * 避免百张队列逐条触发整树重渲染。
 */
export const useExifIndex = (): {
  readonly exifByPath: ReadonlyMap<string, PhotoMetadata>
  /** 读取失败的路径 → 错误消息；与「确无 EXIF」明确区分，可重试。 */
  readonly exifFailures: ReadonlyMap<string, string>
  /** 正在读取中的路径集合：供空态区分「正在读取」与「未包含拍摄信息」（U12）。 */
  readonly exifInFlight: ReadonlySet<string>
  readonly getExifByPath: () => ReadonlyMap<string, PhotoMetadata>
  readonly ensureExif: (filePath: string | null) => void
  readonly ensureExifForExport: (filePaths: readonly string[], signal?: AbortSignal) => Promise<void>
} => {
  const [exifByPath, setExifByPath] = useState<ReadonlyMap<string, PhotoMetadata>>(
    () => new Map()
  )
  const [exifFailures, setExifFailures] = useState<ReadonlyMap<string, string>>(
    () => new Map()
  )
  const [exifInFlight, setExifInFlight] = useState<ReadonlySet<string>>(() => new Set())
  /** ref 镜像：保证解析链在任何时刻都能读到最新缓存（含导出等待期间刚到达的 EXIF）。 */
  const exifByPathRef = useRef<ReadonlyMap<string, PhotoMetadata>>(new Map())
  const exifFailuresRef = useRef<Map<string, string>>(new Map())
  /** 缓存条目对应的文件版本键（mtime:size）；null 表示版本未知（浏览器模式）。 */
  const versionByKeyRef = useRef<Map<string, string | null>>(new Map())
  /** 在途请求去重：同一路径只发一次请求。 */
  const inFlightRef = useRef(new Map<string, Promise<PhotoMetadata | null>>())

  /** 发布一次 React 状态（值与 ref 对齐）。 */
  const publish = useCallback((): void => {
    setExifByPath(new Map(exifByPathRef.current))
    setExifFailures(new Map(exifFailuresRef.current))
    setExifInFlight(new Set(inFlightRef.current.keys()))
  }, [])

  /** 缓存是否仍然新鲜：条目存在且文件版本未变化。 */
  const isCacheFresh = useCallback((filePath: string, expectedVersion: string | null): boolean => {
    if (!exifByPathRef.current.has(filePath)) {
      return false
    }
    if (expectedVersion === null) {
      // 版本未知时不做失效判定，保持既有缓存语义。
      return true
    }
    return versionByKeyRef.current.get(filePath) === expectedVersion
  }, [])

  /** 读取单个路径的 EXIF：新鲜缓存直接返回；失败记入 exifFailures（可重试）。 */
  const loadExif = useCallback((filePath: string, expectedVersion: string | null = null): Promise<PhotoMetadata | null> => {
    if (isCacheFresh(filePath, expectedVersion)) {
      return Promise.resolve(exifByPathRef.current.get(filePath) ?? null)
    }
    const inFlight = inFlightRef.current.get(filePath)
    if (inFlight !== undefined) {
      return inFlight
    }
    setExifInFlight((previous) => new Set(previous).add(filePath))
    const promise = fetchPhotoMetadata(filePath)
      .then((meta) => {
        // 引擎成功响应 = 权威事实（含「确无元数据」的空结果），不再重试。
        const next = new Map(exifByPathRef.current)
        next.set(filePath, meta)
        exifByPathRef.current = next
        versionByKeyRef.current.set(filePath, expectedVersion)
        exifFailuresRef.current.delete(filePath)
        return meta
      })
      .catch((error: unknown) => {
        // 读取失败与「确无 EXIF」分开记录；不缓存元数据，下次可重试。
        exifFailuresRef.current.set(
          filePath,
          error instanceof Error ? error.message : "EXIF 读取失败"
        )
        return null
      })
    inFlightRef.current.set(filePath, promise)
    void promise.finally(() => {
      inFlightRef.current.delete(filePath)
      setExifInFlight((previous) => {
        if (!previous.has(filePath)) return previous
        const next = new Set(previous)
        next.delete(filePath)
        return next
      })
    })
    return promise
  }, [isCacheFresh])

  /** 预览用：fire-and-forget 读取选中图片 EXIF（失败单独记录，不静默并入空信息）。 */
  const ensureExif = useCallback((filePath: string | null): void => {
    if (filePath === null) {
      return
    }
    void loadExif(filePath).then(publish)
  }, [loadExif, publish])

  /**
   * 导出用：以固定并发上限等待所有路径的 EXIF 读取完成后再返回。
   * - 文件版本失效：读取前按 mtime+size 校验，文件变化后自动重新读取；
   * - signal 中止时立即返回（已发起的单项请求自然结束），导出流程随后
   *   由取消令牌接管；
   * - 失败/无 EXIF 的路径不会阻塞整批导出，其身份链自然降级为空。
   */
  const ensureExifForExport = useCallback(async (filePaths: readonly string[], signal?: AbortSignal): Promise<void> => {
    const uniquePaths = [...new Set(filePaths)]
    if (uniquePaths.length === 0) {
      return
    }
    // 一次 IPC 批量取版本；浏览器模式返回等长 null（无失效判定）。
    let versions: ReadonlyArray<string | null> = uniquePaths.map(() => null)
    try {
      const fileVersions = await getImageFileVersions(uniquePaths)
      versions = fileVersions.map((version) =>
        version === null ? null : `${version.mtimeMs}:${version.sizeBytes}`)
    } catch {
      // 版本信息不可用时仍按路径缓存语义继续。
    }
    if (signal?.aborted) {
      return
    }
    const pendingPaths = uniquePaths
      .map((path, index) => ({ path, version: versions[index] ?? null }))
      .filter((entry) => !isCacheFresh(entry.path, entry.version))

    // 有界并发：固定数量 worker 依次消费待读队列，不再全量 Promise.all。
    let cursor = 0
    const worker = async (): Promise<void> => {
      while (cursor < pendingPaths.length) {
        if (signal?.aborted) {
          return
        }
        const entry = pendingPaths[cursor]!
        cursor += 1
        await loadExif(entry.path, entry.version)
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(EXIF_LOAD_CONCURRENCY, pendingPaths.length) }, () => worker())
    )
    publish()
  }, [isCacheFresh, loadExif, publish])

  /** 读取最新 EXIF 缓存（供解析链取用，避免闭包过期）。 */
  const getExifByPath = useCallback((): ReadonlyMap<string, PhotoMetadata> => {
    return exifByPathRef.current
  }, [])

  return { exifByPath, exifFailures, exifInFlight, getExifByPath, ensureExif, ensureExifForExport }
}
