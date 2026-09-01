import type { RenderRecipe } from "../../types/preview"

/** 预览/缩略图缓存的单项 URL 与已编码字节数。 */
type CachedUrl = {
  readonly url: string
  readonly byteSize: number
}

/**
 * 预览缓存键必须包含源路径、请求尺寸、源文件修改时间与 RenderRecipe 哈希。
 * 这让同一张图片的不同缩略图大小、文件被替换后的版本、或不同渲染配方互不串用。
 */
export type PreviewCacheKeyInput = {
  readonly imagePath: string
  readonly maxWidth: number
  readonly maxHeight: number
  readonly modifiedAtMs: number | null
  readonly sourceSizeBytes: number | null
  readonly recipeHash: string
}

/** 对对象键排序，避免调用方字段插入顺序不同导致相同配方产生不同缓存键。 */
const stableSerialize = (value: unknown): string => {
  if (value === null) return "null"
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`
  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

/** FNV-1a：足够作为本地内存缓存键，不承担安全或内容校验职责。 */
const fnv1a = (value: string): string => {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

export const hashRenderRecipe = (recipe: RenderRecipe): string => fnv1a(stableSerialize(recipe))

export const createPreviewCacheKey = ({
  imagePath,
  maxWidth,
  maxHeight,
  modifiedAtMs,
  sourceSizeBytes,
  recipeHash
}: PreviewCacheKeyInput): string =>
  [
    imagePath,
    `${maxWidth}x${maxHeight}`,
    modifiedAtMs === null ? "unknown-mtime" : String(modifiedAtMs),
    sourceSizeBytes === null ? "unknown-source-size" : String(sourceSizeBytes),
    recipeHash
  ].join("\u0000")

/** data URL 没有响应 Content-Length 时使用保守的字节估算。 */
export const estimatePreviewUrlBytes = (url: string): number => {
  const comma = url.indexOf(",")
  if (url.startsWith("data:") && comma >= 0) {
    const metadata = url.slice(0, comma).toLowerCase()
    const payload = url.slice(comma + 1)
    if (metadata.includes(";base64")) {
      return Math.max(1, Math.floor((payload.length * 3) / 4))
    }
  }
  return Math.max(1, new TextEncoder().encode(url).byteLength)
}

/** 释放缓存之外仍由调用方持有的 blob URL。 */
export const releasePreviewUrl = (url: string): void => {
  if (url.startsWith("blob:") && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(url)
  }
}

/**
 * 按字节数约束的 LRU URL 缓存。
 *
 * 预览只缓存已缩小的响应 URL；淘汰 blob URL 时主动 revoke，避免 Renderer 长会话积累
 * object URL。这里不缓存 Canvas、ImageBitmap 或完整分辨率 BufferedImage。
 */
export class BoundedPreviewUrlCache {
  private readonly entries = new Map<string, CachedUrl>()
  private totalBytes = 0

  public constructor(private readonly maxBytes: number) {
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
      throw new Error("preview cache maxBytes must be positive")
    }
  }

  public get(key: string): string | null {
    const entry = this.entries.get(key)
    if (entry === undefined) return null
    // Map 的重新插入代表最近使用，尾部为 LRU。
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.url
  }

  public set(key: string, url: string, byteSize: number = estimatePreviewUrlBytes(url)): void {
    const safeByteSize = Math.max(1, Math.ceil(byteSize))
    const previous = this.entries.get(key)
    if (previous !== undefined) {
      this.entries.delete(key)
      this.totalBytes -= previous.byteSize
      if (previous.url !== url) releasePreviewUrl(previous.url)
    }

    // 单个响应超过预算时不保留，且释放该调用方刚创建的 object URL。
    if (safeByteSize > this.maxBytes) {
      releasePreviewUrl(url)
      return
    }

    this.entries.set(key, { url, byteSize: safeByteSize })
    this.totalBytes += safeByteSize
    this.evictToBudget()
  }

  public clear(): void {
    for (const entry of this.entries.values()) {
      releasePreviewUrl(entry.url)
    }
    this.entries.clear()
    this.totalBytes = 0
  }

  /** 删除单项并释放其 blob URL；队列可见范围卸载时使用。 */
  public delete(key: string): void {
    const entry = this.entries.get(key)
    if (entry === undefined) return
    this.entries.delete(key)
    this.totalBytes -= entry.byteSize
    releasePreviewUrl(entry.url)
  }

  public get size(): number {
    return this.entries.size
  }

  public get byteSize(): number {
    return this.totalBytes
  }

  private evictToBudget(): void {
    while (this.totalBytes > this.maxBytes) {
      const oldest = this.entries.entries().next().value as [string, CachedUrl] | undefined
      if (oldest === undefined) return
      const [key, entry] = oldest
      this.entries.delete(key)
      this.totalBytes -= entry.byteSize
      releasePreviewUrl(entry.url)
    }
  }
}

/** 主预览可缓存约 32 MiB 的缩小图；图片元素仍仅保留当前一张。 */
export const previewUrlCache = new BoundedPreviewUrlCache(32 * 1024 * 1024)
/** 队列缩略图可缓存约 16 MiB 的已编码 URL。 */
export const thumbnailUrlCache = new BoundedPreviewUrlCache(16 * 1024 * 1024)
