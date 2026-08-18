import { useCallback, useEffect, useRef, useState } from "react"
import type { ShootingPreset, ShootingPresetController } from "../types"
import {
  createElectronPresetStorage,
  createLocalStoragePresetStorage,
  loadPresets,
  savePresets,
  LS_PRESETS_KEY
} from "../utils/presetPersistence"
import type { PresetStorage } from "../utils/presetPersistence"

/**
 * 摄影预设管理 Hook（P0-05）。
 *
 * - Electron 模式：经 readPresets / writePresets 持久化到 userData/presets.json
 * - 浏览器模式：降级到 localStorage
 * - 错误不静默吞掉：损坏 JSON、读取失败、写入失败都通过 lastError 暴露给 UI
 *
 * 只负责预设本身的增删改与复制；「应用到图片」的绑定状态在队列（useQueue）中维护，
 * 删除预设时由 WorkspacePage 调用 queue.clearPresetBinding 清理悬空绑定。
 */
export const useShootingPresets = (): ShootingPresetController => {
  const [presets, setPresets] = useState<readonly ShootingPreset[]>([])
  const [lastError, setLastError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const storageRef = useRef<PresetStorage | null>(null)

  /** 惰性选择存储适配器（进程内固定，不随渲染重建）。 */
  const getStorage = useCallback((): PresetStorage => {
    if (storageRef.current === null) {
      storageRef.current = window.desktop !== undefined
        ? createElectronPresetStorage(window.desktop)
        : createLocalStoragePresetStorage(LS_PRESETS_KEY)
    }
    return storageRef.current
  }, [])

  // 初始加载
  useEffect(() => {
    let active = true
    void loadPresets(getStorage())
      .then((result) => {
        if (!active) {
          return
        }
        setPresets(result.presets)
        setLastError(result.error)
        setLoaded(true)
      })
    return () => { active = false }
  }, [getStorage])

  // 预设列表变化时持久化（跳过初始加载值）
  const skipSaveRef = useRef(true)
  useEffect(() => {
    if (!loaded) {
      return
    }
    if (skipSaveRef.current) {
      skipSaveRef.current = false
      return
    }
    void savePresets(getStorage(), presets).then((error) => {
      setLastError(error)
    })
  }, [presets, loaded, getStorage])

  const savePreset = useCallback((preset: ShootingPreset): void => {
    setPresets((prev) => {
      const idx = prev.findIndex((p) => p.id === preset.id)
      const next = [...prev]
      if (idx >= 0) {
        next[idx] = preset
      } else {
        next.push(preset)
      }
      return next
    })
  }, [])

  /**
   * 复制预设：生成新 id，名称追加「（副本）」。
   * 返回复制出的预设（供面板立即进入编辑态）；源预设 id 不存在时返回 null。
   */
  const duplicatePreset = useCallback((id: string): ShootingPreset | null => {
    const source = presets.find((p) => p.id === id)
    if (source === undefined) {
      return null
    }
    const copy: ShootingPreset = {
      ...source,
      id: crypto.randomUUID(),
      name: `${source.name}（副本）`
    }
    setPresets((prev) => [...prev, copy])
    return copy
  }, [presets])

  const deletePreset = useCallback((id: string): void => {
    setPresets((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const clearError = useCallback((): void => {
    setLastError(null)
  }, [])

  return { presets, lastError, savePreset, duplicatePreset, deletePreset, clearError }
}
