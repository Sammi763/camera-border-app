import { useCallback, useState } from "react"
import { fetchDevPhotos } from "../../../services/engine/devPhotosApi"
import { resolveHeicPaths } from "../../../services/desktop/heicConvert"
import { isHeicFile } from "../../metadata/constants/imageFormats"
import { toFileName } from "../../../utils/fileName"
import { createEmptyIdentity } from "../../metadata/types"
import { mergeIdentityChain, resolvePresetIdentity } from "../../metadata/utils/resolveIdentity"
import type { PhotoAssetStore, PhotoIdentity, ShootingPreset } from "../../metadata/types"
import type { PhotoMetadata } from "../../../types/preview"
import type { ImportResult, QueueController, QueueItem } from "../types"

/**
 * 维护图片队列及其选中状态。
 *
 * 模式检测逻辑：
 * - Electron 模式：window.desktop 存在，使用系统文件/文件夹选择器
 * - 浏览器模式：window.desktop 不存在，降级调用 GET /api/dev/photos 获取样片
 *
 * 两种模式下队列行为一致：图片入队、首张自动选中、切换触发预览。
 */
export const useQueue = (): QueueController => {
  const [items, setItems] = useState<readonly QueueItem[]>([])
  const [lastImportResult, setLastImportResult] = useState<ImportResult | null>(null)
  const isBrowserMode = window.desktop === undefined

  /** 从文件路径提取格式扩展名（不含点，小写）。 */
  const extractFormat = (filePath: string): string => {
    const dotIndex = filePath.lastIndexOf(".")
    return dotIndex > 0 ? filePath.slice(dotIndex + 1).toLowerCase() : ""
  }

  /** 将路径列表追加到队列，首张自动选中。HEIC 文件自动转换。 */
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

    setItems((previous) => {
      const isFirstSelection = previous.length === 0
      const added = validItems.map((item, index) => ({
        id: crypto.randomUUID(),
        filePath: item.resolved!,
        fileName: toFileName(item.original),
        sourcePath: item.original,
        sourceFormat: extractFormat(item.original),
        converted: item.converted,
        workingFormat: item.converted ? "jpg" : extractFormat(item.original),
        isSelected: isFirstSelection && index === 0,
        textOverride: null,
        presetId: null,
        identityOverride: null
      }))
      return [...previous, ...added]
    })
  }, [])

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

  const select = useCallback((id: string): void => {
    setItems((previous) =>
      previous.map((item) => ({
        ...item,
        isSelected: item.id === id
      }))
    )
  }, [])

  const clear = useCallback((): void => {
    setItems([])
  }, [])

  const setSelectedTextOverride = useCallback((text: string | null): void => {
    setItems((previous) =>
      previous.map((item) =>
        item.isSelected ? { ...item, textOverride: text } : item
      )
    )
  }, [])

  const getEffectiveText = useCallback((id: string, globalText: string): string => {
    const item = items.find((i) => i.id === id)
    if (item?.textOverride !== null && item?.textOverride !== undefined) {
      return item.textOverride
    }
    return globalText
  }, [items])

  const assignPresetToSelected = useCallback((presetId: string | null): void => {
    setItems((previous) =>
      previous.map((item) =>
        item.isSelected ? { ...item, presetId } : item
      )
    )
  }, [])

  const assignPresetToAll = useCallback((presetId: string | null): void => {
    setItems((previous) =>
      previous.map((item) => ({ ...item, presetId }))
    )
  }, [])

  /** 清除绑定到指定预设 ID 的所有图片的预设绑定（删除预设时调用）。 */
  const clearPresetBinding = useCallback((presetId: string): void => {
    setItems((previous) =>
      previous.map((item) =>
        item.presetId === presetId ? { ...item, presetId: null } : item
      )
    )
  }, [])

  /** 清除当前选中图片的预设绑定。 */
  const clearSelectedPreset = useCallback((): void => {
    setItems((previous) =>
      previous.map((item) =>
        item.isSelected ? { ...item, presetId: null } : item
      )
    )
  }, [])

  /** 清除全部图片的预设绑定。 */
  const clearAllPresetBindings = useCallback((): void => {
    setItems((previous) =>
      previous.map((item) => ({ ...item, presetId: null }))
    )
  }, [])

  const setSelectedIdentityOverride = useCallback((patch: Partial<PhotoIdentity>): void => {
    setItems((previous) =>
      previous.map((item) => {
        if (!item.isSelected) {
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
  }, [])

  /** 清除当前选中图片的摄影身份覆盖。 */
  const clearSelectedIdentityOverride = useCallback((): void => {
    setItems((previous) =>
      previous.map((item) =>
        item.isSelected ? { ...item, identityOverride: null } : item
      )
    )
  }, [])

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

  const selected = items.find((item) => item.isSelected)
  const selectedFilePath = selected === undefined ? null : selected.filePath
  const selectedTextOverride = selected?.textOverride ?? null

  return {
    items,
    selectedFilePath,
    selectedTextOverride,
    isBrowserMode,
    lastImportResult,
    addImages,
    addImageFiles,
    addImageFolder,
    addFromPaths: appendPaths,
    select,
    clear,
    setSelectedTextOverride,
    getEffectiveText,
    assignPresetToSelected,
    assignPresetToAll,
    clearPresetBinding,
    clearSelectedPreset,
    clearAllPresetBindings,
    setSelectedIdentityOverride,
    clearSelectedIdentityOverride,
    getEffectiveIdentity
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
