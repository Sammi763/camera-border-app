import { useCallback, useEffect, useRef, useState } from "react"
import { fetchDevPhotos } from "../../../services/engine/devPhotosApi"
import { resolveHeicPaths } from "../../../services/desktop/heicConvert"
import { isHeicFile } from "../../metadata/constants/imageFormats"
import { toFileName } from "../../../utils/fileName"
import { createEmptyIdentity } from "../../metadata/types"
import { mergeIdentityChain, resolvePresetIdentity } from "../../metadata/utils/resolveIdentity"
import type { PhotoAssetStore, PhotoIdentity, ShootingPreset } from "../../metadata/types"
import type { PhotoMetadata } from "../../../types/preview"
import type { ImportResult, OperationScope, QueueController, QueueItem, FilmSyncField } from "../types"
import type { ImageProcessingConfig, MonotonicCurve } from "../../../types/imageProcessing"
import { createDefaultFilmProcessing } from "../../editing/defaults"
import { cloneImageProcessing, migrateImageProcessing } from "../imageProcessingSession"
import { nextHistorySeq, type HistoryEntryMeta } from "../../../utils/historySequence"
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

const isPersistedQueueItem = (value: unknown): boolean => {
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

/**
 * 旧会话迁移：缺 imageProcessing 视为普通模式；损坏/未知版本保留错误解释并关闭处理，
 * 不能静默恢复成一张“看似已调好”的图。
 */
const normalizePersistedQueueItem = (value: unknown): QueueItem | null => {
  if (!isPersistedQueueItem(value)) return null
  const item = value as Record<string, unknown>
  const migrated = migrateImageProcessing(item["imageProcessing"])
  const rawText = item["textOverride"]
  const rawPreset = item["presetId"]
  const rawIdentity = item["identityOverride"]
  return {
    id: item["id"] as string,
    filePath: item["filePath"] as string,
    fileName: item["fileName"] as string,
    sourcePath: item["sourcePath"] as string,
    sourceFormat: item["sourceFormat"] as string,
    converted: item["converted"] as boolean,
    workingFormat: item["workingFormat"] as string,
    textOverride: typeof rawText === "string" ? rawText : null,
    presetId: typeof rawPreset === "string" ? rawPreset : null,
    identityOverride: rawIdentity !== null && typeof rawIdentity === "object"
      ? rawIdentity as Partial<PhotoIdentity>
      : null,
    imageProcessing: migrated.config,
    imageProcessingError: migrated.error
      ?? (typeof item["imageProcessingError"] === "string" ? item["imageProcessingError"] : null),
    sourceVersion: typeof item["sourceVersion"] === "string" ? item["sourceVersion"] : null,
    ...(item["missing"] === true ? { missing: true } : {})
  }
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
    const items = record["items"]
      .map(normalizePersistedQueueItem)
      .filter((item): item is QueueItem => item !== null)
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

/** 按字段组合并底片配置；只复制用户选中的组，未选中的每图覆盖保留。 */
const mergeFilmProcessing = (
  source: ImageProcessingConfig,
  target: ImageProcessingConfig,
  fields: ReadonlySet<FilmSyncField>
): ImageProcessingConfig => {
  const result = JSON.parse(JSON.stringify(target)) as unknown as {
    -readonly [K in keyof ImageProcessingConfig]: ImageProcessingConfig[K]
  }
  if (fields.has("lightSource") || fields.has("filmBase") || fields.has("density")) {
    const sourceNegative = source.negative
    const targetNegative = result.negative ?? (sourceNegative === null || sourceNegative === undefined
      ? null
      : JSON.parse(JSON.stringify(sourceNegative)))
    if (targetNegative !== null && sourceNegative !== null && sourceNegative !== undefined) {
      result.negative = {
        ...targetNegative,
        ...((fields.has("lightSource") || fields.has("filmBase")) ? { calibrationSpaceKey: sourceNegative.calibrationSpaceKey ?? null } : {}),
        ...(fields.has("lightSource") && sourceNegative.lightSource !== undefined
          ? { lightSource: JSON.parse(JSON.stringify(sourceNegative.lightSource)) }
          : {}),
        ...(fields.has("filmBase") && sourceNegative.filmBase !== undefined
          ? { filmBase: JSON.parse(JSON.stringify(sourceNegative.filmBase)) }
          : {}),
        ...(fields.has("density") && sourceNegative.density !== undefined
          ? { density: JSON.parse(JSON.stringify(sourceNegative.density)) }
          : {})
      }
    }
  }
  if (fields.has("positive") || fields.has("curves")) {
    const sourcePositive = source.positive
    const targetPositive = result.positive ?? {}
    result.positive = {
      ...targetPositive,
      ...(fields.has("positive") && sourcePositive !== undefined && sourcePositive !== null
        ? {
          ...(sourcePositive.exposureEv !== undefined ? { exposureEv: sourcePositive.exposureEv } : {}),
          ...(sourcePositive.rgbBalanceEv !== undefined
            ? { rgbBalanceEv: [...sourcePositive.rgbBalanceEv] as [number, number, number] } : {}),
          ...(sourcePositive.blackPoint !== undefined ? { blackPoint: sourcePositive.blackPoint } : {}),
          ...(sourcePositive.whitePoint !== undefined ? { whitePoint: sourcePositive.whitePoint } : {}),
          ...(sourcePositive.saturation !== undefined ? { saturation: sourcePositive.saturation } : {})
        }
        : {}),
      ...(fields.has("curves") && sourcePositive !== undefined && sourcePositive !== null
        ? {
          ...(sourcePositive.masterCurve !== undefined ? { masterCurve: cloneCurve(sourcePositive.masterCurve) } : {}),
          ...(sourcePositive.redCurve !== undefined ? { redCurve: cloneCurve(sourcePositive.redCurve) } : {}),
          ...(sourcePositive.greenCurve !== undefined ? { greenCurve: cloneCurve(sourcePositive.greenCurve) } : {}),
          ...(sourcePositive.blueCurve !== undefined ? { blueCurve: cloneCurve(sourcePositive.blueCurve) } : {})
        }
        : {})
    }
  }
  if (fields.has("sourceGeometry") && source.sourceGeometry !== undefined) {
    result.sourceGeometry = JSON.parse(JSON.stringify(source.sourceGeometry))
  }
  return result
}

const cloneCurve = (curve: MonotonicCurve | null): MonotonicCurve | null =>
  curve === null ? null : JSON.parse(JSON.stringify(curve)) as MonotonicCurve

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
  // 历史条目携带全局序号与动作描述，供工作台在队列/设置两套历史间按最近操作协调 ⌘Z。
  const undoStackRef = useRef<Array<{ snapshot: QueueSnapshot; meta: HistoryEntryMeta }>>([])
  const redoStackRef = useRef<Array<{ snapshot: QueueSnapshot; meta: HistoryEntryMeta }>>([])
  const [items, setItems] = useState<readonly QueueItem[]>(() => snapshotRef.current.items)
  const [activeItemId, setActiveItemId] = useState<string | null>(() => snapshotRef.current.activeItemId)
  const [checkedItemIds, setCheckedItemIds] = useState<readonly string[]>(() => snapshotRef.current.checkedItemIds)
  const [lastImportResult, setLastImportResult] = useState<ImportResult | null>(null)
  /** 最近一次提交的合并标签；相邻同标签手势共用一条撤销历史。 */
  const lastHistoryTagRef = useRef<string | null>(null)
  // 历史实际存放在 ref，revision 仅用于让 canUndo/canRedo 同步重渲染。
  const [, setHistoryRevision] = useState(0)
  const isBrowserMode = window.desktop === undefined

  const syncSnapshot = useCallback((next: QueueSnapshot): void => {
    snapshotRef.current = next
    setItems(next.items)
    setActiveItemId(next.activeItemId)
    setCheckedItemIds(next.checkedItemIds)
  }, [])

  const commit = useCallback((
    mutate: (snapshot: QueueSnapshot) => QueueSnapshot,
    trackHistory = true,
    description = "队列操作",
    historyTag?: string
  ): void => {
    const previous = snapshotRef.current
    const next = mutate(previous)
    if (snapshotsEqual(previous, next)) return
    if (trackHistory) {
      const coalesce = historyTag !== undefined && historyTag === lastHistoryTagRef.current
      if (!coalesce) {
        const meta: HistoryEntryMeta = { seq: nextHistorySeq(), description }
        undoStackRef.current = [...undoStackRef.current, { snapshot: cloneSnapshot(previous), meta }]
          .slice(-HISTORY_LIMIT)
      }
      redoStackRef.current = []
      setHistoryRevision((version) => version + 1)
    }
    lastHistoryTagRef.current = historyTag ?? null
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
      imageProcessing: null,
      imageProcessingError: null,
      sourceVersion: null,
      missing: false
    }))
    commit((previous) => ({
      items: [...previous.items, ...added],
      activeItemId: previous.items.length === 0 ? added[0]!.id : previous.activeItemId,
      checkedItemIds: previous.checkedItemIds
    }), true, "导入图片")
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
    commit((previous) => removeItemsFromSnapshot(previous, new Set([id])), true, "删除图片")
  }, [commit])

  const removeChecked = useCallback((): void => {
    commit((previous) => removeItemsFromSnapshot(previous, new Set(previous.checkedItemIds)), true, "删除已选图片")
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
    }, true, "删除其他图片")
  }, [commit])

  const removeLeftOf = useCallback((id: string): void => {
    commit((previous) => removeItemsFromSnapshot(previous, neighborIds(previous, id, "left")), true, "删除左侧图片")
  }, [commit])

  const removeRightOf = useCallback((id: string): void => {
    commit((previous) => removeItemsFromSnapshot(previous, neighborIds(previous, id, "right")), true, "删除右侧图片")
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
    }, true, "拖动排序")
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
    }, true, "按文件名排序")
  }, [commit])

  const clear = useCallback((): void => {
    commit(() => EMPTY_SNAPSHOT, true, "清空队列")
  }, [commit])

  const undo = useCallback((): void => {
    const entry = undoStackRef.current.at(-1)
    if (entry === undefined) return
    undoStackRef.current = undoStackRef.current.slice(0, -1)
    const meta: HistoryEntryMeta = { seq: entry.meta.seq, description: entry.meta.description }
    redoStackRef.current = [...redoStackRef.current, { snapshot: cloneSnapshot(snapshotRef.current), meta }].slice(-HISTORY_LIMIT)
    syncSnapshot(cloneSnapshot(entry.snapshot))
    setHistoryRevision((version) => version + 1)
  }, [syncSnapshot])

  const redo = useCallback((): void => {
    const entry = redoStackRef.current.at(-1)
    if (entry === undefined) return
    redoStackRef.current = redoStackRef.current.slice(0, -1)
    const meta: HistoryEntryMeta = { seq: entry.meta.seq, description: entry.meta.description }
    undoStackRef.current = [...undoStackRef.current, { snapshot: cloneSnapshot(snapshotRef.current), meta }].slice(-HISTORY_LIMIT)
    syncSnapshot(cloneSnapshot(entry.snapshot))
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
    }, true, presetId === null ? "移除拍摄信息预设" : "应用拍摄信息预设")
  }, [commit, resolveScopeIds])

  const clearPresetFromScope = useCallback((scope: OperationScope): void => {
    assignPresetToScope(null, scope)
  }, [assignPresetToScope])

  const clearPresetBinding = useCallback((presetId: string): void => {
    commit((previous) => ({
      ...previous,
      items: previous.items.map((item) => item.presetId === presetId ? { ...item, presetId: null } : item)
    }), true, "解除预设绑定")
  }, [commit])

  const setActiveTextOverride = useCallback((text: string | null): void => {
    commit((previous) => ({
      ...previous,
      items: previous.items.map((item) => item.id === previous.activeItemId ? { ...item, textOverride: text } : item)
    }), true, text === null ? "清除快捷文字" : "修改快捷文字")
  }, [commit])

  /**
   * 每图底片配置是队列快照的一部分，因此和每图文字/身份一样共享同一撤销历史。
   * historyTag 让一次曲线拖动只留下一条历史（栈顶是拖动前快照）。
   */
  const setActiveImageProcessing = useCallback((
    config: ImageProcessingConfig | null,
    options?: { readonly historyTag?: string; readonly description?: string }
  ): void => {
    const cloned = cloneImageProcessing(config)
    commit((previous) => ({
      ...previous,
      items: previous.items.map((item) => item.id === previous.activeItemId
        ? { ...item, imageProcessing: cloned, imageProcessingError: null }
        : item)
    }), true, options?.description ?? "修改底片处理", options?.historyTag)
  }, [commit])

  const recordSourceVersion = useCallback((id: string, version: string): void => {
    const previous = snapshotRef.current
    const item = previous.items.find((candidate) => candidate.id === id)
    if (item === undefined || item.sourceVersion === version) return
    // 引擎事实更新不结束用户正在进行的编辑手势，也不新增撤销历史。
    syncSnapshot({ ...previous, items: previous.items.map((candidate) => candidate.id === id
      ? { ...candidate, sourceVersion: version } : candidate) })
  }, [syncSnapshot])

  const getEffectiveImageProcessing = useCallback((id: string): ImageProcessingConfig | null => {
    const item = snapshotRef.current.items.find((candidate) => candidate.id === id)
    return cloneImageProcessing(item?.imageProcessing)
  }, [])

  /**
   * 只合并指定字段组；目标已有配置时保留其他组，新建目标以源配置为骨架。
   * 每个目标独立深复制，后续修改任意一张不会污染其他图。
   */
  const syncImageProcessing = useCallback((
    scope: OperationScope,
    source: ImageProcessingConfig,
    fields: readonly FilmSyncField[]
  ): void => {
    if (fields.length === 0) return
    const selected = new Set(fields)
    const sourceClone = cloneImageProcessing(source)
    if (sourceClone === null) return
    commit((previous) => {
      const targetIds = new Set(resolveScopeIds(scope, previous))
      let changed = false
      const items = previous.items.map((item) => {
        if (!targetIds.has(item.id) || item.imageProcessingError != null) return item
        const defaults = createDefaultFilmProcessing(item.sourcePath)
        if (defaults === null || defaults.inputMode !== sourceClone.inputMode) return item
        const base = cloneImageProcessing(item.imageProcessing) ?? defaults
        const next = mergeFilmProcessing(sourceClone, base, selected)
        if (JSON.stringify(next) === JSON.stringify(item.imageProcessing)) return item
        changed = true
        return { ...item, imageProcessing: next, imageProcessingError: null }
      })
      return changed ? { ...previous, items } : previous
    }, true, "同步底片配置")
  }, [commit, resolveScopeIds])

  const setActiveIdentityOverride = useCallback((patch: Partial<PhotoIdentity>): void => {
    commit((previous) => ({
      ...previous,
      items: previous.items.map((item) => {
        if (item.id !== previous.activeItemId) return item
        const merged = { ...(item.identityOverride ?? {}), ...patch }
        const cleaned = Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== "")) as Partial<PhotoIdentity>
        return { ...item, identityOverride: Object.keys(cleaned).length === 0 ? null : cleaned }
      })
    }), true, "修改拍摄信息覆盖")
  }, [commit])

  const clearActiveIdentityOverride = useCallback((): void => {
    commit((previous) => ({
      ...previous,
      items: previous.items.map((item) => item.id === previous.activeItemId ? { ...item, identityOverride: null } : item)
    }), true, "清除拍摄信息覆盖")
  }, [commit])

  // ---- 丢失文件重定位（U11） ------------------------------------------------

  /**
   * 将单个丢失条目重新定位到新路径：保留条目身份（id）、文字/预设/身份覆盖、
   * 排序与选中状态，仅更新文件路径并按 HEIC 规则重建工作文件。
   */
  const relocateItem = useCallback(async (id: string, newPath: string): Promise<boolean> => {
    if (newPath.trim().length === 0) return false
    if (!snapshotRef.current.items.some((item) => item.id === id)) return false
    const [resolved] = await resolveHeicPaths([newPath])
    const working = resolved?.resolved ?? null
    if (working === null) return false
    commit((previous) => ({
      ...previous,
      items: previous.items.map((item) => item.id === id
        ? {
          ...item,
          filePath: working,
          sourcePath: newPath,
          sourceFormat: extractFormat(newPath),
          converted: resolved?.converted ?? false,
          workingFormat: resolved?.converted === true ? "png" : extractFormat(newPath),
          sourceVersion: null,
          missing: false
        }
        : item)
    }), true, "重新定位源文件")
    return true
  }, [commit])

  /**
   * 文件夹级重定位：按文件名在候选路径中查找丢失条目。
   * 同名候选唯一时自动绑定；出现多个同名候选时不静默绑定，
   * 在 ambiguous 中返回候选路径供用户逐个确认（U11 明确要求）。
   */
  const relocateMissingFromFolder = useCallback(async (candidatePaths: readonly string[]): Promise<{
    readonly relocated: number
    /** 同名多个候选：携带具体条目 id，供界面逐条人工绑定（同名条目之间不串行）。 */
    readonly ambiguous: readonly { readonly itemId: string; readonly fileName: string; readonly candidates: readonly string[] }[]
    readonly unresolved: readonly string[]
  }> => {
    const missingItems = snapshotRef.current.items.filter((item) => item.missing === true)
    if (missingItems.length === 0) {
      return { relocated: 0, ambiguous: [], unresolved: [] }
    }
    const byName = new Map<string, string[]>()
    for (const candidate of candidatePaths) {
      const name = candidate.replaceAll("\\", "/").split("/").pop() ?? candidate
      const bucket = byName.get(name)
      if (bucket === undefined) {
        byName.set(name, [candidate])
      } else {
        bucket.push(candidate)
      }
    }
    const resolved = new Map<string, string>()
    const ambiguous: { itemId: string; fileName: string; candidates: string[] }[] = []
    const unresolved: string[] = []
    for (const item of missingItems) {
      const candidates = byName.get(item.fileName)
      if (candidates === undefined) {
        unresolved.push(item.fileName)
      } else if (candidates.length === 1) {
        resolved.set(item.id, candidates[0]!)
      } else {
        ambiguous.push({ itemId: item.id, fileName: item.fileName, candidates })
      }
    }
    for (const [id, newPath] of resolved) {
      await relocateItem(id, newPath)
    }
    return { relocated: resolved.size, ambiguous, unresolved }
  }, [relocateItem])

  /** 更新单条目到用户明确选择的重定位候选（同名冲突时的人工确认入口）。 */
  const relocateItemToCandidate = useCallback(async (id: string, candidatePath: string): Promise<boolean> => {
    return relocateItem(id, candidatePath)
  }, [relocateItem])

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
  const activeImageProcessing = activeItem?.imageProcessing ?? null
  const activeImageProcessingError = activeItem?.imageProcessingError ?? null

  return {
    items,
    activeItemId,
    checkedItemIds,
    checkedCount: checkedItemIds.length,
    activeItem,
    activeFilePath,
    activeTextOverride,
    activeImageProcessing,
    activeImageProcessingError,
    isBrowserMode,
    lastImportResult,
    missingCount: items.filter((item) => item.missing === true).length,
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
    topUndo: undoStackRef.current.at(-1)?.meta ?? null,
    topRedo: redoStackRef.current.at(-1)?.meta ?? null,
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
    setActiveImageProcessing,
    recordSourceVersion,
    getEffectiveImageProcessing,
    syncImageProcessing,
    getEffectiveText,
    assignPresetToScope,
    clearPresetFromScope,
    clearPresetBinding,
    setActiveIdentityOverride,
    clearActiveIdentityOverride,
    getEffectiveIdentity,
    getIdentitySources,
    relocateItem,
    relocateMissingFromFolder,
    relocateItemToCandidate
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
