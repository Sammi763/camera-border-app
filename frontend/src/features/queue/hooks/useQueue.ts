import { useCallback, useEffect, useRef, useState } from "react"
import { fetchDevPhotos } from "../../../services/engine/devPhotosApi"
import { resolveHeicPaths } from "../../../services/desktop/heicConvert"
import { isHeicFile } from "../../metadata/constants/imageFormats"
import { toFileName } from "../../../utils/fileName"
import { createEmptyIdentity } from "../../metadata/types"
import { mergeIdentityChain, resolvePresetIdentity } from "../../metadata/utils/resolveIdentity"
import type { PhotoAssetStore, PhotoIdentity, ShootingPreset } from "../../metadata/types"
import type { PhotoMetadata } from "../../../types/preview"
import type { ImportResult, OperationScope, QueueController, QueueItem } from "../types"
import { resolveIdentityFieldSources } from "../../metadata/utils/resolveIdentityFieldSources"

/** 工作会话只保存可恢复的队列状态，不保存二进制预览或临时 object URL。 */
const QUEUE_SESSION_KEY = "workspace.queue-session.v1"
const HISTORY_LIMIT = 50

type QueueSnapshot = {
  readonly items: readonly QueueItem[]
  readonly activeItemId: string | null
  readonly checkedItemIds: readonly string[]
}

const EMPTY_SNAPSHOT: QueueSnapshot = { items: [], activeItemId: null, checkedItemIds: [] }

const cloneSnapshot = (snapshot: QueueSnapshot): QueueSnapshot => ({
  items: [...snapshot.items],
  activeItemId: snapshot.activeItemId,
  checkedItemIds: [...snapshot.checkedItemIds]
})

const snapshotsEqual = (left: QueueSnapshot, right: QueueSnapshot): boolean =>
  left.items === right.items
  && left.activeItemId === right.activeItemId
  && left.checkedItemIds === right.checkedItemIds

const isPersistedQueueItem = (value: unknown): value is QueueItem => {
  if (value === null || typeof value !== "object") return false
  const item = value as Record<string, unknown>
  return typeof item["id"] === "string"
    && typeof item["filePath"] === "string"
    && typeof item["fileName"] === "string"
    && typeof item["sourcePath"] === "string"
    && typeof item["sourceFormat"] === "string"
    && typeof item["converted"] === "boolean"
    && typeof item["workingFormat"] === "string"
}

/** 从本地会话恢复队列；损坏数据仅回退为空队列，不影响工作台启动。 */
const readPersistedSnapshot = (): QueueSnapshot => {
  try {
    const raw = localStorage.getItem(QUEUE_SESSION_KEY)
    if (raw === null) return EMPTY_SNAPSHOT
    const parsed = JSON.parse(raw) as unknown
    if (parsed === null || typeof parsed !== "object") return EMPTY_SNAPSHOT
    const record = parsed as Record<string, unknown>
    if (!Array.isArray(record["items"])) return EMPTY_SNAPSHOT
    const items = record["items"].filter(isPersistedQueueItem)
    const validIds = new Set(items.map((item) => item.id))
    const activeItemId = typeof record["activeItemId"] === "string" && validIds.has(record["activeItemId"])
      ? record["activeItemId"]
      : (items[0]?.id ?? null)
    const checkedItemIds = Array.isArray(record["checkedItemIds"])
      ? record["checkedItemIds"].filter((id): id is string => typeof id === "string" && validIds.has(id))
      : []
    return { items, activeItemId, checkedItemIds: [...new Set(checkedItemIds)] }
  } catch {
    return EMPTY_SNAPSHOT
  }
}

const writePersistedSnapshot = (snapshot: QueueSnapshot): void => {
  try {
    localStorage.setItem(QUEUE_SESSION_KEY, JSON.stringify(snapshot))
  } catch {
    // 私密模式或配额不足时不影响内存中的工作会话。
  }
}

/** 从文件路径提取格式扩展名（不含点，小写）。 */
const extractFormat = (filePath: string): string => {
  const dotIndex = filePath.lastIndexOf(".")
  return dotIndex > 0 ? filePath.slice(dotIndex + 1).toLowerCase() : ""
}

/**
 * 导入去重的路径键：统一反斜杠为正斜杠后比较。
 * 仅用于跨平台路径的重复判断，不改变队列中保存的原始路径。
 */
const normalizeSourcePath = (sourcePath: string): string => sourcePath.replace(/\\/g, "/")

/** 删除后保持当前图选择确定：优先同下标的下一张，否则上一张。 */
const selectAfterRemoval = (
  before: readonly QueueItem[],
  after: readonly QueueItem[],
  activeItemId: string | null,
  removedIds: ReadonlySet<string>
): string | null => {
  if (after.length === 0) return null
  if (activeItemId !== null && !removedIds.has(activeItemId)) return activeItemId
  const activeIndex = activeItemId === null ? -1 : before.findIndex((item) => item.id === activeItemId)
  if (activeIndex < 0) return after[0]!.id
  return after[activeIndex]?.id ?? after[activeIndex - 1]?.id ?? after[0]!.id
}

/** 会话恢复发现当前图丢失时，按队列顺序选择下一张可用图，否则上一张。 */
const selectAvailableAfterMissing = (items: readonly QueueItem[], activeItemId: string | null): string | null => {
  const current = activeItemId === null ? null : items.find((item) => item.id === activeItemId)
  if (current !== null && current !== undefined && current.missing !== true) return current.id
  const index = activeItemId === null ? -1 : items.findIndex((item) => item.id === activeItemId)
  const after = items.slice(Math.max(0, index + 1)).find((item) => item.missing !== true)
  if (after !== undefined) return after.id
  const before = [...items.slice(0, Math.max(0, index))].reverse().find((item) => item.missing !== true)
  return before?.id ?? null
}

const removeItemsFromSnapshot = (snapshot: QueueSnapshot, ids: ReadonlySet<string>): QueueSnapshot => {
  if (ids.size === 0) return snapshot
  const items = snapshot.items.filter((item) => !ids.has(item.id))
  if (items.length === snapshot.items.length) return snapshot
  return {
    items,
    activeItemId: selectAfterRemoval(snapshot.items, items, snapshot.activeItemId, ids),
    checkedItemIds: snapshot.checkedItemIds.filter((id) => !ids.has(id))
  }
}

/** 计算指定 id 前后（不含自身）的条目 id 集合；id 不存在时返回空集合。 */
const neighborIds = (snapshot: QueueSnapshot, id: string, side: "left" | "right"): ReadonlySet<string> => {
  const index = snapshot.items.findIndex((item) => item.id === id)
  if (index < 0) return new Set()
  const range = side === "left" ? snapshot.items.slice(0, index) : snapshot.items.slice(index + 1)
  return new Set(range.map((item) => item.id))
}

/**
 * 维护图片队列及「当前预览图 / 批量选中」两组独立状态。
 *
 * 队列快照是图片删除、每图覆盖和预设绑定的唯一历史来源；active/checked 的
 * 纯选择变化不污染撤销栈，因此 Ctrl+Z 始终撤销内容变更而不是浏览行为。
 */
export const useQueue = (): QueueController => {
  const snapshotRef = useRef<QueueSnapshot>(readPersistedSnapshot())
  const undoStackRef = useRef<QueueSnapshot[]>([])
  const redoStackRef = useRef<QueueSnapshot[]>([])
  const [items, setItems] = useState<readonly QueueItem[]>(() => snapshotRef.current.items)
  const [activeItemId, setActiveItemId] = useState<string | null>(() => snapshotRef.current.activeItemId)
  const [checkedItemIds, setCheckedItemIds] = useState<readonly string[]>(() => snapshotRef.current.checkedItemIds)
  const [lastImportResult, setLastImportResult] = useState<ImportResult | null>(null)
  // 历史实际存放在 ref，revision 仅用于让 canUndo/canRedo 同步重渲染。
  const [, setHistoryRevision] = useState(0)
  const isBrowserMode = window.desktop === undefined

  const syncSnapshot = useCallback((next: QueueSnapshot): void => {
    snapshotRef.current = next
    setItems(next.items)
    setActiveItemId(next.activeItemId)
    setCheckedItemIds(next.checkedItemIds)
  }, [])

  const commit = useCallback((mutate: (snapshot: QueueSnapshot) => QueueSnapshot, trackHistory = true): void => {
    const previous = snapshotRef.current
    const next = mutate(previous)
    if (snapshotsEqual(previous, next)) return
    if (trackHistory) {
      undoStackRef.current = [...undoStackRef.current, cloneSnapshot(previous)].slice(-HISTORY_LIMIT)
      redoStackRef.current = []
      setHistoryRevision((version) => version + 1)
    }
    syncSnapshot(next)
  }, [syncSnapshot])

  // 每次内容或选择变化后写入本地会话；只保存结构化路径/设置，不缓存图片数据。
  useEffect(() => {
    writePersistedSnapshot({ items, activeItemId, checkedItemIds })
  }, [activeItemId, checkedItemIds, items])

  // 恢复后由受限 preload 白名单检查源文件是否仍存在；HEIC 会重新建立临时 PNG。
  useEffect(() => {
    const checkImagePaths = window.desktop?.checkImagePaths
    if (checkImagePaths === undefined || snapshotRef.current.items.length === 0) return
    let active = true
    void (async () => {
      const originalPaths = snapshotRef.current.items.map((item) => item.sourcePath)
      try {
        const exists = await checkImagePaths(originalPaths)
        if (!active) return
        const converted = await resolveHeicPaths(originalPaths)
        if (!active) return
        commit((previous) => {
          const restoredItems = previous.items.map((item, index) => {
            const sourceExists = exists[index] === true
            const resolved = converted[index]
            const resolvedPath = resolved?.resolved
            if (!sourceExists || resolvedPath === null || resolvedPath === undefined) {
              return { ...item, missing: true }
            }
            return {
              ...item,
              filePath: resolvedPath,
              converted: resolved?.converted ?? false,
              workingFormat: resolved?.converted === true ? "png" : extractFormat(item.sourcePath),
              missing: false
            }
          })
          return {
            items: restoredItems,
            activeItemId: selectAvailableAfterMissing(restoredItems, previous.activeItemId),
            checkedItemIds: previous.checkedItemIds
          }
        }, false)
      } catch {
        // 文件检查失败时保留会话，不把暂时性 IPC 故障误判为图片丢失。
      }
    })()
    return () => { active = false }
  }, [commit])

  /** 将路径列表追加到队列；已在队列中的路径按 sourcePath 去重跳过。队列为空时自动激活首张。HEIC 文件由随包助手转换。 */
  const appendPaths = useCallback(async (paths: readonly string[]): Promise<void> => {
    if (paths.length === 0) return
    const existingKeys = new Set(snapshotRef.current.items.map((item) => normalizeSourcePath(item.sourcePath)))
    const seenInBatch = new Set<string>()
    const newPaths = paths.filter((path) => {
      const key = normalizeSourcePath(path)
      // 同一批内重复出现的路径也只保留一次
      if (existingKeys.has(key) || seenInBatch.has(key)) return false
      seenInBatch.add(key)
      return true
    })
    const skippedDuplicateCount = paths.length - newPaths.length
    if (newPaths.length === 0) {
      setLastImportResult({
        successCount: 0,
        failedFiles: [],
        convertedFiles: [],
        heicUnsupported: false,
        skippedDuplicateCount
      })
      return
    }
    const converted = await resolveHeicPaths(newPaths)
    const validItems = converted.filter((item) => item.resolved !== null)
    const failedFiles = converted.filter((item) => item.resolved === null).map((item) => toFileName(item.original))
    const convertedFiles = converted.filter((item) => item.converted).map((item) => toFileName(item.original))
    const hasHeicUnsupported = newPaths.some(isHeicFile) && converted.some((item) => item.resolved === null && isHeicFile(item.original))
    setLastImportResult({
      successCount: validItems.length,
      failedFiles,
      convertedFiles,
      heicUnsupported: hasHeicUnsupported,
      skippedDuplicateCount
    })
    if (validItems.length === 0) return

    const added: readonly QueueItem[] = validItems.map((item) => ({
      id: crypto.randomUUID(),
      filePath: item.resolved!,
      fileName: toFileName(item.original),
      sourcePath: item.original,
      sourceFormat: extractFormat(item.original),
      converted: item.converted,
      workingFormat: item.converted ? "png" : extractFormat(item.original),
      textOverride: null,
      presetId: null,
      identityOverride: null,
      missing: false
    }))
    commit((previous) => ({
      items: [...previous.items, ...added],
      activeItemId: previous.items.length === 0 ? added[0]!.id : previous.activeItemId,
      checkedItemIds: previous.checkedItemIds
    }))
  }, [commit])

  /** Electron 模式使用原生选择器；浏览器开发模式回退到引擎样片。 */
  const addImages = useCallback(async (): Promise<void> => {
    await appendPaths(await loadSourcePaths())
  }, [appendPaths])

  const addImageFiles = useCallback(async (): Promise<void> => {
    const bridge = window.desktop
    if (bridge !== undefined) {
      if (bridge.selectImageFiles !== undefined) {
        await appendPaths(await bridge.selectImageFiles())
        return
      }
      const result = await bridge.selectImageSources()
      if (result !== null) await appendPaths(result.paths)
      return
    }
    try {
      await appendPaths(await fetchDevPhotos())
    } catch {
      // 开发样片不可用时保持当前队列。
    }
  }, [appendPaths])

  const addImageFolder = useCallback(async (): Promise<void> => {
    const bridge = window.desktop
    if (bridge !== undefined) {
      if (bridge.selectImageFolder !== undefined) {
        const result = await bridge.selectImageFolder()
        if (result !== null) await appendPaths(result.paths)
        return
      }
      const result = await bridge.selectImageSources()
      if (result !== null) await appendPaths(result.paths)
      return
    }
    try {
      await appendPaths(await fetchDevPhotos())
    } catch {
      // 开发样片不可用时保持当前队列。
    }
  }, [appendPaths])

  /** 切换预览图不影响 checked，且不进入撤销栈。 */
  const setActive = useCallback((id: string): void => {
    commit((previous) => previous.items.some((item) => item.id === id)
      ? { ...previous, activeItemId: id }
      : previous, false)
  }, [commit])

  /** 勾选状态与 active 完全独立，且不进入内容撤销栈。 */
  const toggleChecked = useCallback((id: string): void => {
    commit((previous) => {
      if (!previous.items.some((item) => item.id === id)) return previous
      return {
        ...previous,
        checkedItemIds: previous.checkedItemIds.includes(id)
          ? previous.checkedItemIds.filter((checkedId) => checkedId !== id)
          : [...previous.checkedItemIds, id]
      }
    }, false)
  }, [commit])

  const checkAll = useCallback((): void => {
    commit((previous) => ({ ...previous, checkedItemIds: previous.items.map((item) => item.id) }), false)
  }, [commit])

  const uncheckAll = useCallback((): void => {
    commit((previous) => ({ ...previous, checkedItemIds: [] }), false)
  }, [commit])

  const removeItem = useCallback((id: string): void => {
    commit((previous) => removeItemsFromSnapshot(previous, new Set([id])))
  }, [commit])

  const removeChecked = useCallback((): void => {
    commit((previous) => removeItemsFromSnapshot(previous, new Set(previous.checkedItemIds)))
  }, [commit])

  const removeOthers = useCallback((id: string): void => {
    commit((previous) => {
      const keep = previous.items.find((item) => item.id === id)
      if (keep === undefined) return previous
      return {
        items: [keep],
        // 只保留指定图片：active 无论原来指向谁，都落在保留条目上。
        activeItemId: id,
        checkedItemIds: previous.checkedItemIds.includes(id) ? [id] : []
      }
    })
  }, [commit])

  const removeLeftOf = useCallback((id: string): void => {
    commit((previous) => removeItemsFromSnapshot(previous, neighborIds(previous, id, "left")))
  }, [commit])

  const removeRightOf = useCallback((id: string): void => {
    commit((previous) => removeItemsFromSnapshot(previous, neighborIds(previous, id, "right")))
  }, [commit])

  const reorder = useCallback((id: string, toIndex: number): void => {
    commit((previous) => {
      const fromIndex = previous.items.findIndex((item) => item.id === id)
      if (fromIndex < 0 || !Number.isFinite(toIndex)) return previous
      const targetIndex = Math.min(previous.items.length - 1, Math.max(0, Math.round(toIndex)))
      if (targetIndex === fromIndex) return previous
      const items = [...previous.items]
      const [moved] = items.splice(fromIndex, 1)
      items.splice(targetIndex, 0, moved!)
      return { ...previous, items }
    })
  }, [commit])

  const sortByName = useCallback((direction: "asc" | "desc"): void => {
    commit((previous) => {
      // Array.prototype.sort 自 ES2019 起为稳定排序：同名文件保持原相对顺序。
      const items = [...previous.items].sort((a, b) =>
        direction === "asc"
          ? a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: "base" })
          : b.fileName.localeCompare(a.fileName, undefined, { numeric: true, sensitivity: "base" })
      )
      // 已是目标顺序时不产生新数组引用，避免留下无意义的撤销历史。
      const sameOrder = items.every((item, index) => item === previous.items[index])
      return sameOrder ? previous : { ...previous, items }
    })
  }, [commit])

  const clear = useCallback((): void => {
    commit(() => EMPTY_SNAPSHOT)
  }, [commit])

  const undo = useCallback((): void => {
    const previous = undoStackRef.current.at(-1)
    if (previous === undefined) return
    undoStackRef.current = undoStackRef.current.slice(0, -1)
    redoStackRef.current = [...redoStackRef.current, cloneSnapshot(snapshotRef.current)].slice(-HISTORY_LIMIT)
    syncSnapshot(cloneSnapshot(previous))
    setHistoryRevision((version) => version + 1)
  }, [syncSnapshot])

  const redo = useCallback((): void => {
    const next = redoStackRef.current.at(-1)
    if (next === undefined) return
    redoStackRef.current = redoStackRef.current.slice(0, -1)
    undoStackRef.current = [...undoStackRef.current, cloneSnapshot(snapshotRef.current)].slice(-HISTORY_LIMIT)
    syncSnapshot(cloneSnapshot(next))
    setHistoryRevision((version) => version + 1)
  }, [syncSnapshot])

  const resolveScopeIds = useCallback((scope: OperationScope, snapshot: QueueSnapshot): readonly string[] => {
    switch (scope) {
      case "active":
        return snapshot.activeItemId === null ? [] : [snapshot.activeItemId]
      case "checked":
        return snapshot.checkedItemIds
      case "all":
        return snapshot.items.map((item) => item.id)
    }
  }, [])

  const assignPresetToScope = useCallback((presetId: string | null, scope: OperationScope): void => {
    commit((previous) => {
      const targetIds = new Set(resolveScopeIds(scope, previous))
      if (targetIds.size === 0) return previous
      return {
        ...previous,
        items: previous.items.map((item) => targetIds.has(item.id) ? { ...item, presetId } : item)
      }
    })
  }, [commit, resolveScopeIds])

  const clearPresetFromScope = useCallback((scope: OperationScope): void => {
    assignPresetToScope(null, scope)
  }, [assignPresetToScope])

  const clearPresetBinding = useCallback((presetId: string): void => {
    commit((previous) => ({
      ...previous,
      items: previous.items.map((item) => item.presetId === presetId ? { ...item, presetId: null } : item)
    }))
  }, [commit])

  const setActiveTextOverride = useCallback((text: string | null): void => {
    commit((previous) => ({
      ...previous,
      items: previous.items.map((item) => item.id === previous.activeItemId ? { ...item, textOverride: text } : item)
    }))
  }, [commit])

  const setActiveIdentityOverride = useCallback((patch: Partial<PhotoIdentity>): void => {
    commit((previous) => ({
      ...previous,
      items: previous.items.map((item) => {
        if (item.id !== previous.activeItemId) return item
        const merged = { ...(item.identityOverride ?? {}), ...patch }
        const cleaned = Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== "")) as Partial<PhotoIdentity>
        return { ...item, identityOverride: Object.keys(cleaned).length === 0 ? null : cleaned }
      })
    }))
  }, [commit])

  const clearActiveIdentityOverride = useCallback((): void => {
    commit((previous) => ({
      ...previous,
      items: previous.items.map((item) => item.id === previous.activeItemId ? { ...item, identityOverride: null } : item)
    }))
  }, [commit])

  const getEffectiveText = useCallback((id: string, globalText: string): string => {
    const item = snapshotRef.current.items.find((candidate) => candidate.id === id)
    return item?.textOverride ?? globalText
  }, [])

  const getEffectiveIdentity = useCallback((
    itemId: string,
    presets: readonly ShootingPreset[],
    assetStore: PhotoAssetStore,
    exifByPath?: ReadonlyMap<string, PhotoMetadata>
  ): PhotoIdentity => {
    const item = snapshotRef.current.items.find((candidate) => candidate.id === itemId)
    if (item === undefined) return createEmptyIdentity()
    const preset = item.presetId === null ? null : presets.find((candidate) => candidate.id === item.presetId) ?? null
    return mergeIdentityChain({
      override: item.identityOverride,
      preset: preset === null ? null : resolvePresetIdentity(preset, assetStore),
      exif: exifByPath?.get(item.sourcePath) ?? exifByPath?.get(item.filePath) ?? null
    })
  }, [])

  const getIdentitySources = useCallback((
    itemId: string,
    presets: readonly ShootingPreset[],
    assetStore: PhotoAssetStore,
    exifByPath?: ReadonlyMap<string, PhotoMetadata>
  ): ReturnType<typeof resolveIdentityFieldSources> => {
    const item = snapshotRef.current.items.find((candidate) => candidate.id === itemId)
    if (item === undefined) return resolveIdentityFieldSources({ override: null, preset: null, exif: null })
    const preset = item.presetId === null ? null : presets.find((candidate) => candidate.id === item.presetId) ?? null
    return resolveIdentityFieldSources({
      override: item.identityOverride,
      preset: preset === null ? null : resolvePresetIdentity(preset, assetStore),
      exif: exifByPath?.get(item.sourcePath) ?? exifByPath?.get(item.filePath) ?? null
    })
  }, [])

  const activeItem = items.find((item) => item.id === activeItemId) ?? null
  const activeFilePath = activeItem === null || activeItem.missing === true ? null : activeItem.filePath
  const activeTextOverride = activeItem?.textOverride ?? null

  return {
    items,
    activeItemId,
    checkedItemIds,
    checkedCount: checkedItemIds.length,
    activeItem,
    activeFilePath,
    activeTextOverride,
    isBrowserMode,
    lastImportResult,
    missingCount: items.filter((item) => item.missing === true).length,
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
    addImages,
    addImageFiles,
    addImageFolder,
    addFromPaths: appendPaths,
    setActive,
    toggleChecked,
    checkAll,
    uncheckAll,
    removeItem,
    removeChecked,
    removeOthers,
    removeLeftOf,
    removeRightOf,
    reorder,
    sortByName,
    clear,
    undo,
    redo,
    setActiveTextOverride,
    getEffectiveText,
    assignPresetToScope,
    clearPresetFromScope,
    clearPresetBinding,
    setActiveIdentityOverride,
    clearActiveIdentityOverride,
    getEffectiveIdentity,
    getIdentitySources
  }
}

/** 获取图片来源路径列表。 */
const loadSourcePaths = async (): Promise<readonly string[]> => {
  const bridge = window.desktop
  if (bridge !== undefined) {
    if (bridge.selectImageSources !== undefined) {
      const result = await bridge.selectImageSources()
      return result?.paths ?? []
    }
    return bridge.selectImages()
  }
  try {
    return await fetchDevPhotos()
  } catch {
    return []
  }
}
