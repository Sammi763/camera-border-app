import { useCallback, useEffect, useRef, useState } from "react"
import type {
  CameraAsset,
  DeveloperAsset,
  FilmAsset,
  LabAsset,
  LensAsset,
  PhotoAssetController,
  PhotoAssetStore,
  ScannerAsset
} from "../types"
import { createEmptyAssetStore } from "../types"
import { parseAssetJson } from "../utils/photoAssetStoreCodec"

const LS_ASSETS_KEY = "camborder-assets"

const isElectronMode = (): boolean => window.desktop !== undefined

/**
 * 从持久化层加载资产库。
 *
 * 返回 store 和可能的错误信息。错误不静默吞掉——
 * 调用方通过 error 字段显示中文提示。
 */
const storageLoad = async (): Promise<{ store: PhotoAssetStore; error: string | null }> => {
  if (isElectronMode()) {
    const json = await window.desktop!.readAssets()
    return parseWithHint(json)
  }
  return loadFromLS()
}

/** 将资产库持久化。 */
const storageSave = async (store: PhotoAssetStore): Promise<void> => {
  if (isElectronMode()) {
    await window.desktop!.writeAssets(JSON.stringify(store))
    return
  }
  saveToLS(store)
}

/** 解析 JSON 并附带中文错误提示。 */
const parseWithHint = (json: string): { store: PhotoAssetStore; error: string | null } => {
  const result = parseAssetJson(json)
  if (result.ok) {
    return { store: result.store, error: null }
  }
  return { store: createEmptyAssetStore(), error: result.error }
}

const loadFromLS = (): { store: PhotoAssetStore; error: string | null } => {
  const raw = localStorage.getItem(LS_ASSETS_KEY)
  if (raw === null) {
    return { store: createEmptyAssetStore(), error: null }
  }
  return parseWithHint(raw)
}

const saveToLS = (store: PhotoAssetStore): void => {
  localStorage.setItem(LS_ASSETS_KEY, JSON.stringify(store))
}

/**
 * 摄影资产库管理 Hook。
 *
 * - Electron 模式：通过 readAssets / writeAssets 持久化到 userData/assets.json
 * - 浏览器模式：通过 localStorage 持久化
 * - 错误不静默吞掉，通过 lastError 暴露给 UI
 */
export const usePhotoAssets = (): PhotoAssetController => {
  const [store, setStore] = useState<PhotoAssetStore>(createEmptyAssetStore)
  const [lastError, setLastError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  // 初始加载
  useEffect(() => {
    let active = true
    void storageLoad()
      .then((result) => {
        if (!active) {
          return
        }
        setStore(result.store)
        if (result.error !== null) {
          setLastError(result.error)
        }
        setLoaded(true)
      })
      .catch(() => {
        if (!active) {
          return
        }
        setLastError("摄影资产库读取失败，请检查文件权限或重启应用。")
        setLoaded(true)
      })
    return () => { active = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 资产库变化时持久化（跳过初始空值）
  const skipSaveRef = useRef(true)
  useEffect(() => {
    if (!loaded) {
      return
    }
    if (skipSaveRef.current) {
      skipSaveRef.current = false
      return
    }
    void storageSave(store)
      .then(() => {
        setLastError(null)
      })
      .catch(() => {
        setLastError("摄影资产库保存失败，请检查文件权限或磁盘空间。")
      })
  }, [store, loaded])

  // ---- 相机 ----
  const saveCamera = useCallback((asset: CameraAsset): void => {
    setStore((prev) => {
      const idx = prev.cameras.findIndex((c) => c.id === asset.id)
      const next = [...prev.cameras]
      if (idx >= 0) {
        next[idx] = asset
      } else {
        next.push(asset)
      }
      return { ...prev, cameras: next }
    })
  }, [])

  const deleteCamera = useCallback((id: string): void => {
    setStore((prev) => ({
      ...prev,
      cameras: prev.cameras.filter((c) => c.id !== id)
    }))
  }, [])

  // ---- 镜头 ----
  const saveLens = useCallback((asset: LensAsset): void => {
    setStore((prev) => {
      const idx = prev.lenses.findIndex((l) => l.id === asset.id)
      const next = [...prev.lenses]
      if (idx >= 0) {
        next[idx] = asset
      } else {
        next.push(asset)
      }
      return { ...prev, lenses: next }
    })
  }, [])

  const deleteLens = useCallback((id: string): void => {
    setStore((prev) => ({
      ...prev,
      lenses: prev.lenses.filter((l) => l.id !== id)
    }))
  }, [])

  // ---- 胶片 ----
  const saveFilm = useCallback((asset: FilmAsset): void => {
    setStore((prev) => {
      const idx = prev.films.findIndex((f) => f.id === asset.id)
      const next = [...prev.films]
      if (idx >= 0) {
        next[idx] = asset
      } else {
        next.push(asset)
      }
      return { ...prev, films: next }
    })
  }, [])

  const deleteFilm = useCallback((id: string): void => {
    setStore((prev) => ({
      ...prev,
      films: prev.films.filter((f) => f.id !== id)
    }))
  }, [])

  // ---- 扫描仪 ----
  const saveScanner = useCallback((asset: ScannerAsset): void => {
    setStore((prev) => {
      const idx = prev.scanners.findIndex((s) => s.id === asset.id)
      const next = [...prev.scanners]
      if (idx >= 0) {
        next[idx] = asset
      } else {
        next.push(asset)
      }
      return { ...prev, scanners: next }
    })
  }, [])

  const deleteScanner = useCallback((id: string): void => {
    setStore((prev) => ({
      ...prev,
      scanners: prev.scanners.filter((s) => s.id !== id)
    }))
  }, [])

  // ---- 实验室 ----
  const saveLab = useCallback((asset: LabAsset): void => {
    setStore((prev) => {
      const idx = prev.labs.findIndex((l) => l.id === asset.id)
      const next = [...prev.labs]
      if (idx >= 0) {
        next[idx] = asset
      } else {
        next.push(asset)
      }
      return { ...prev, labs: next }
    })
  }, [])

  const deleteLab = useCallback((id: string): void => {
    setStore((prev) => ({
      ...prev,
      labs: prev.labs.filter((l) => l.id !== id)
    }))
  }, [])

  // ---- 冲洗工艺 ----
  const saveDeveloper = useCallback((asset: DeveloperAsset): void => {
    setStore((prev) => {
      const idx = prev.developers.findIndex((d) => d.id === asset.id)
      const next = [...prev.developers]
      if (idx >= 0) {
        next[idx] = asset
      } else {
        next.push(asset)
      }
      return { ...prev, developers: next }
    })
  }, [])

  const deleteDeveloper = useCallback((id: string): void => {
    setStore((prev) => ({
      ...prev,
      developers: prev.developers.filter((d) => d.id !== id)
    }))
  }, [])

  const clearError = useCallback((): void => {
    setLastError(null)
  }, [])

  return {
    store,
    lastError,
    saveCamera,
    deleteCamera,
    saveLens,
    deleteLens,
    saveFilm,
    deleteFilm,
    saveScanner,
    deleteScanner,
    saveLab,
    deleteLab,
    saveDeveloper,
    deleteDeveloper,
    clearError
  }
}
