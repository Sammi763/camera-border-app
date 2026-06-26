/**
 * 摄影资产库 JSON 编解码工具。
 *
 * 负责将持久化的 JSON 字符串解析为 PhotoAssetStore，
 * 包含版本迁移和结构校验逻辑。
 *
 * 从 usePhotoAssets hook 中抽离，便于独立测试。
 */

import type { PhotoAssetStore } from "../types"
import { createEmptyAssetStore } from "../types"

/** 解析结果：成功返回 store，失败返回 error 描述。 */
export type CodecResult =
  | { readonly ok: true; readonly store: PhotoAssetStore }
  | { readonly ok: false; readonly error: string }

/**
 * 解析资产库 JSON 字符串。
 *
 * 返回 CodecResult，调用方决定如何处理错误（显示提示 / 静默回退）。
 * 不会静默吞掉错误——如果解析失败，error 字段包含中文描述。
 */
export const parseAssetJson = (json: string): CodecResult => {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, error: "摄影资产库数据不是合法 JSON，已临时使用空资产库。请检查本地数据文件。" }
  }

  if (!isAssetStore(parsed)) {
    return { ok: false, error: "摄影资产库数据结构不合法，已临时使用空资产库。请检查本地数据文件。" }
  }

  const migrated = migrateAssetStore(parsed)
  if (migrated === null) {
    return { ok: false, error: `摄影资产库版本 (v${parsed.version}) 不受支持，已临时使用空资产库。` }
  }

  return { ok: true, store: migrated }
}

/** 类型守卫：检查是否为合法的资产库存储结构。 */
const isAssetStore = (value: unknown): value is PhotoAssetStore => {
  if (typeof value !== "object" || value === null) {
    return false
  }
  const obj = value as Record<string, unknown>
  return (
    typeof obj["version"] === "number" &&
    Array.isArray(obj["cameras"]) &&
    Array.isArray(obj["lenses"]) &&
    Array.isArray(obj["films"]) &&
    Array.isArray(obj["scanners"]) &&
    Array.isArray(obj["labs"]) &&
    Array.isArray(obj["developers"])
  )
}

/**
 * 版本迁移。
 *
 * 当前只支持 version 1。未来新版本在此链式迁移。
 * 返回 null 表示版本不受支持。
 */
const migrateAssetStore = (store: PhotoAssetStore): PhotoAssetStore | null => {
  if (store.version === 1) {
    return store
  }
  // 未来：version 2 → 先迁移到 v2 再返回
  return null
}
