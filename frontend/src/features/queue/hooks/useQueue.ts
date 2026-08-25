import { useCallback, useState } from "react"
import { fetchDevPhotos } from "../../../services/engine/devPhotosApi"
import { resolveHeicPaths } from "../../../services/desktop/heicConvert"
import { isHeicFile } from "../../metadata/constants/imageFormats"
import { toFileName } from "../../../utils/fileName"
import { createEmptyIdentity } from "../../metadata/types"
import { mergeIdentityChain, resolvePresetIdentity } from "../../metadata/utils/resolveIdentity"
import type { PhotoAssetStore, PhotoIdentity, ShootingPreset } from "../../metadata/types"
import type { PhotoMetadata } from "../../../types/preview"
import type { BatchScope, ImportResult, QueueController, QueueItem } from "../types"
import { resolveIdentityFieldSources } from "../../metadata/utils/resolveIdentityFieldSources"

/**
 * 维护图片队列及「当前预览图 / 批量选中」两组独立状态。
 *
 * 状态语义：
 * - activeItemId：点击缩略图切换，驱动预览与单图编辑；入队首张自动激活；
 * - checkedItemIds：复选框控制的批量选中集合，驱动预设批量应用与批量导出范围；
 *   清空队列时两组状态一并重置。
 *
 * 模式检测逻辑：
 * - Electron 模式：window.desktop 存在，使用系统文件/文件夹选择器
 * - 浏览器模式：window.desktop 不存在，降级调用 GET /api/dev/photos 获取样片
 */
export const useQueue = (): QueueController => {
  const [items, setItems] = useState<readonly QueueItem[]>([])
  const [activeItemId, setActiveItemId] = useState<string | null>(null)
  const [checkedItemIds, setCheckedItemIds] = useState<readonly string[]>([])
  const [lastImportResult, setLastImportResult] = useState<ImportResult | null>(null)
  const isBrowserMode = window.desktop === undefined

  /** 从文件路径提取格式扩展名（不含点，小写）。 */
  const extractFormat = (filePath: string): string => {
    const dotIndex = filePath.lastIndexOf(".")
    return dotIndex > 0 ? filePath.slice(dotIndex + 1).toLowerCase() : ""
  }

  /** 将路径列表追加到队列。队列原本为空时自动激活首张。HEIC 文件自动转换。 */
  const appendPaths = useCallback(async (paths: readonly string[]): Promise<void> => {
    if (paths.length === 0) {
      return
    }

    // 转换 HEIC 文件为临时 JPEG（桌面模式）
    const converted = await resolveHeicPaths(paths)

    const validItems = converted.filter((item) => item.resolved !== null)
    const failedFiles = converted
      .filter((item) => item.resolved === null)
      .map((item) => toFileName(item.original))
    const convertedFiles = converted
      .filter((item) => item.converted)
      .map((item) => toFileName(item.original))
    const hasHeicUnsupported = paths.some(isHeicFile) && converted.some((item) => item.resolved === null && isHeicFile(item.original))

    setLastImportResult({
      successCount: validItems.length,
      failedFiles,
      convertedFiles,
      heicUnsupported: hasHeicUnsupported
    })

    if (validItems.length === 0) {
      return
    }

    const added = validItems.map((item) => ({
      id: crypto.randomUUID(),
      filePath: item.resolved!,
      fileName: toFileName(item.original),
      sourcePath: item.original,
      sourceFormat: extractFormat(item.original),
      converted: item.converted,
      workingFormat: item.converted ? "jpg" : extractFormat(item.original),
      textOverride: null,
      presetId: null,
      identityOverride: null
    }))

    // 队列原本为空（首次导入或清空后重新导入）时自动激活第一张；
    // 后续导入不改变当前预览图，也不改变批量选中集合。
    const wasEmpty = items.length === 0
    setItems((previous) => [...previous, ...added])
    if (wasEmpty && added.length > 0) {
      setActiveItemId(added[0]!.id)
    }
  }, [items.length])

  /** 统一入口：Electron 模式用 selectImageSources，浏览器模式降级。 */
  const addImages = useCallback(async (): Promise<void> => {
    const paths = await loadSourcePaths()
    appendPaths(paths)
  }, [appendPaths])

  /** 选择图片文件加入队列。 */
  const addImageFiles = useCallback(async (): Promise<void> => {
    const bridge = window.desktop
    if (bridge !== undefined) {
      // Electron 模式：使用独立文件选择器
      const selectFiles = bridge.selectImageFiles
      if (selectFiles !== undefined) {
        const paths = await selectFiles()
        appendPaths(paths)
        return
      }
      // 回退到旧 API
      const result = await bridge.selectImageSources()
      if (result === null || result.paths.length === 0) {
        return
      }
      appendPaths(result.paths)
      return
    }

    // 浏览器模式降级
    try {
      const paths = await fetchDevPhotos()
      appendPaths(paths)
    } catch {
      // 静默忽略
    }
  }, [appendPaths])

  /** 选择图片文件夹加入队列。 */
  const addImageFolder = useCallback(async (): Promise<void> => {
    const bridge = window.desktop
    if (bridge !== undefined) {
      // Electron 模式：使用独立文件夹选择器
      const selectFolder = bridge.selectImageFolder
      if (selectFolder !== undefined) {
        const result = await selectFolder()
        if (result === null) {
          // 用户取消了选择
          return
        }
        if (result.paths.length === 0) {
          // 空文件夹，由 UI 层提示
          appendPaths([])
          return
        }
        appendPaths(result.paths)
        return
      }
      // 回退到旧 API
      const result = await bridge.selectImageSources()
      if (result === null || result.paths.length === 0) {
        return
      }
      appendPaths(result.paths)
      return
    }

    // 浏览器模式降级
    try {
      const paths = await fetchDevPhotos()
      appendPaths(paths)
    } catch {
      // 静默忽略
    }
  }, [appendPaths])

  /** 切换当前预览图片。不改变批量选中集合。 */
  const setActive = useCallback((id: string): void => {
    setActiveItemId(id)
  }, [])

  /** 切换某张图片的批量选中状态。不影响当前预览图。 */
  const toggleChecked = useCallback((id: string): void => {
    setCheckedItemIds((previous) =>
      previous.includes(id)
        ? previous.filter((checkedId) => checkedId !== id)
        : [...previous, id]
    )
  }, [])

  /** 全选队列全部图片。 */
  const checkAll = useCallback((): void => {
    setCheckedItemIds(items.map((item) => item.id))
  }, [items])

  /** 取消全选。 */
  const uncheckAll = useCallback((): void => {
    setCheckedItemIds([])
  }, [])

  const clear = useCallback((): void => {
    setItems([])
    setActiveItemId(null)
    setCheckedItemIds([])
  }, [])

  /** 更新当前预览图片的文字覆盖。 */
  const setActiveTextOverride = useCallback((text: string | null): void => {
    setItems((previous) =>
      previous.map((item) =>
        item.id === activeItemId ? { ...item, textOverride: text } : item
      )
    )
  }, [activeItemId])

  const getEffectiveText = useCallback((id: string, globalText: string): string => {
    const item = items.find((i) => i.id === id)
    if (item?.textOverride !== null && item?.textOverride !== undefined) {
      return item.textOverride
    }
    return globalText
  }, [items])

  /** 解析作用范围对应的图片 id 集合。 */
  const resolveScopeIds = useCallback((scope: BatchScope, currentItems: readonly QueueItem[], currentActiveId: string | null, currentCheckedIds: readonly string[]): readonly string[] => {
    switch (scope) {
      case "active":
        return currentActiveId !== null ? [currentActiveId] : []
      case "checked":
        return currentCheckedIds
      case "all":
        return currentItems.map((item) => item.id)
    }
  }, [])

  /** 应用摄影预设到指定作用范围（当前预览图 / 已选图片 / 全部图片）。 */
  const assignPresetToScope = useCallback((presetId: string | null, scope: BatchScope): void => {
    setItems((previous) => {
      const targetIds = new Set(resolveScopeIds(scope, previous, activeItemId, checkedItemIds))
      if (targetIds.size === 0) {
        return previous
      }
      return previous.map((item) =>
        targetIds.has(item.id) ? { ...item, presetId } : item
      )
    })
  }, [activeItemId, checkedItemIds, resolveScopeIds])

  /** 清除指定作用范围的预设绑定。 */
  const clearPresetFromScope = useCallback((scope: BatchScope): void => {
    assignPresetToScope(null, scope)
  }, [assignPresetToScope])

  /** 清除绑定到指定预设 ID 的所有图片的预设绑定（删除预设时调用）。 */
  const clearPresetBinding = useCallback((presetId: string): void => {
    setItems((previous) =>
      previous.map((item) =>
        item.presetId === presetId ? { ...item, presetId: null } : item
      )
    )
  }, [])

  /** 更新当前预览图片的摄影身份覆盖。 */
  const setActiveIdentityOverride = useCallback((patch: Partial<PhotoIdentity>): void => {
    setItems((previous) =>
      previous.map((item) => {
        if (item.id !== activeItemId) {
          return item
        }
        const current = item.identityOverride ?? {}
        const merged = { ...current, ...patch }
        // 清理所有值为空字符串的字段
        const cleaned = Object.fromEntries(
          Object.entries(merged).filter(([, v]) => v !== "")
        ) as Partial<PhotoIdentity>
        // 如果所有字段都为空，设为 null
        const hasValues = Object.keys(cleaned).length > 0
        return { ...item, identityOverride: hasValues ? cleaned : null }
      })
    )
  }, [activeItemId])

  /** 清除当前预览图片的摄影身份覆盖。 */
  const clearActiveIdentityOverride = useCallback((): void => {
    setItems((previous) =>
      previous.map((item) =>
        item.id === activeItemId ? { ...item, identityOverride: null } : item
      )
    )
  }, [activeItemId])

  const getEffectiveIdentity = useCallback((
    itemId: string,
    presets: readonly ShootingPreset[],
    assetStore: PhotoAssetStore,
    exifByPath?: ReadonlyMap<string, PhotoMetadata>
  ): PhotoIdentity => {
    const item = items.find((i) => i.id === itemId)
    if (item === undefined) {
      return createEmptyIdentity()
    }

    // 优先级：每图覆盖 > 摄影预设 > EXIF > 空默认（合并逻辑见 metadata/utils/resolveIdentity.ts）
    const preset = item.presetId !== null
      ? presets.find((p) => p.id === item.presetId) ?? null
      : null
    const presetIdentity = preset !== null ? resolvePresetIdentity(preset, assetStore) : null
    const exif = exifByPath?.get(item.filePath) ?? null

    return mergeIdentityChain({
      override: item.identityOverride,
      preset: presetIdentity,
      exif
    })
  }, [items])

  /** 计算各展示字段的来源标识（判定逻辑与 getEffectiveIdentity 的合并链一致）。 */
  const getIdentitySources = useCallback((
    itemId: string,
    presets: readonly ShootingPreset[],
    assetStore: PhotoAssetStore,
    exifByPath?: ReadonlyMap<string, PhotoMetadata>
  ): ReturnType<typeof resolveIdentityFieldSources> => {
    const item = items.find((i) => i.id === itemId)
    if (item === undefined) {
      return resolveIdentityFieldSources({ override: null, preset: null, exif: null })
    }
    const preset = item.presetId !== null
      ? presets.find((p) => p.id === item.presetId) ?? null
      : null
    const presetIdentity = preset !== null ? resolvePresetIdentity(preset, assetStore) : null
    const exif = exifByPath?.get(item.filePath) ?? null
    return resolveIdentityFieldSources({
      override: item.identityOverride,
      preset: presetIdentity,
      exif
    })
  }, [items])

  const activeItem = items.find((item) => item.id === activeItemId) ?? null
  const activeFilePath = activeItem === null ? null : activeItem.filePath
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
    addImages,
    addImageFiles,
    addImageFolder,
    addFromPaths: appendPaths,
    setActive,
    toggleChecked,
    checkAll,
    uncheckAll,
    clear,
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

/**
 * 获取图片来源路径列表。
 *
 * Electron 模式：优先使用 selectImageSources（支持文件+文件夹选择）；
 *   若不存在则回退到旧 selectImages。
 * 浏览器模式：从 Java 引擎的 /api/dev/photos 端点获取样片路径。
 *
 * 返回空数组表示用户取消或无可用图片，调用方静默忽略即可。
 */
const loadSourcePaths = async (): Promise<readonly string[]> => {
  const bridge = window.desktop
  if (bridge !== undefined) {
    // 优先使用新的统一图片来源选择 API
    if (bridge.selectImageSources !== undefined) {
      const result = await bridge.selectImageSources()
      if (result === null) {
        // 用户取消了选择
        return []
      }
      return result.paths
    }
    // 回退到旧 API（兼容）
    return bridge.selectImages()
  }

  // 浏览器模式降级
  try {
    return await fetchDevPhotos()
  } catch {
    return []
  }
}
