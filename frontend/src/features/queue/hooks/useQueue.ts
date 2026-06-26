import { useCallback, useState } from "react"
import { fetchDevPhotos } from "../../../services/engine/devPhotosApi"
import { toFileName } from "../../../utils/fileName"
import { createEmptyIdentity } from "../../metadata/types"
import type { PhotoIdentity, Roll } from "../../metadata/types"
import type { QueueController, QueueItem } from "../types"

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
  const isBrowserMode = window.desktop === undefined

  /** 将路径列表追加到队列，首张自动选中。 */
  const appendPaths = useCallback((paths: readonly string[]): void => {
    if (paths.length === 0) {
      return
    }
    setItems((previous) => {
      const isFirstSelection = previous.length === 0
      const added = paths.map((filePath, index) => ({
        id: crypto.randomUUID(),
        filePath,
        fileName: toFileName(filePath),
        isSelected: isFirstSelection && index === 0,
        textOverride: null,
        rollId: null,
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

  const assignRollToSelected = useCallback((rollId: string | null): void => {
    setItems((previous) =>
      previous.map((item) =>
        item.isSelected ? { ...item, rollId } : item
      )
    )
  }, [])

  const assignRollToAll = useCallback((rollId: string | null): void => {
    setItems((previous) =>
      previous.map((item) => ({ ...item, rollId }))
    )
  }, [])

  /** 清除绑定到指定 Roll ID 的所有图片的 Roll 绑定。 */
  const clearRollBinding = useCallback((rollId: string): void => {
    setItems((previous) =>
      previous.map((item) =>
        item.rollId === rollId ? { ...item, rollId: null } : item
      )
    )
  }, [])

  /** 清除全部图片的 Roll 绑定。 */
  const clearAllRollBindings = useCallback((): void => {
    setItems((previous) =>
      previous.map((item) => ({ ...item, rollId: null }))
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

  const getEffectiveIdentity = useCallback((itemId: string, rolls: readonly Roll[]): PhotoIdentity => {
    const item = items.find((i) => i.id === itemId)
    if (item === undefined) {
      return createEmptyIdentity()
    }

    // 优先级：每图覆盖 > Roll > 空默认
    const empty = createEmptyIdentity()
    const roll = item.rollId !== null
      ? rolls.find((r) => r.id === item.rollId) ?? null
      : null

    const override = item.identityOverride ?? {}

    return {
      camera: override.camera ?? roll?.camera ?? empty.camera,
      lens: override.lens ?? roll?.lens ?? empty.lens,
      film: override.film ?? roll?.film ?? empty.film,
      developer: override.developer ?? roll?.developer ?? empty.developer,
      scanner: override.scanner ?? roll?.scanner ?? empty.scanner,
      lab: override.lab ?? roll?.lab ?? empty.lab,
      location: override.location ?? roll?.location ?? empty.location,
      rollName: override.rollName ?? roll?.name ?? empty.rollName,
      frameNumber: override.frameNumber ?? empty.frameNumber
    }
  }, [items])

  const selected = items.find((item) => item.isSelected)
  const selectedFilePath = selected === undefined ? null : selected.filePath
  const selectedTextOverride = selected?.textOverride ?? null

  return {
    items,
    selectedFilePath,
    selectedTextOverride,
    isBrowserMode,
    addImages,
    addImageFiles,
    addImageFolder,
    addFromPaths: appendPaths,
    select,
    clear,
    setSelectedTextOverride,
    getEffectiveText,
    assignRollToSelected,
    assignRollToAll,
    clearRollBinding,
    clearAllRollBindings,
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
