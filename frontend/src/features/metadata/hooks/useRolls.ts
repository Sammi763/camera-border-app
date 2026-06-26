import { useCallback, useEffect, useRef, useState } from "react"
import type { Roll } from "../types"

const LS_ROLLS_KEY = "camborder-rolls"

const isElectronMode = (): boolean => window.desktop !== undefined

const storageLoad = async (): Promise<readonly Roll[]> => {
  if (isElectronMode()) {
    const json = await window.desktop!.readRolls()
    const parsed = JSON.parse(json) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed as readonly Roll[]
  }
  return loadFromLS()
}

const storageSave = async (rolls: readonly Roll[]): Promise<void> => {
  if (isElectronMode()) {
    await window.desktop!.writeRolls(JSON.stringify(rolls))
    return
  }
  saveToLS(rolls)
}

const loadFromLS = (): readonly Roll[] => {
  const raw = localStorage.getItem(LS_ROLLS_KEY)
  if (raw === null) {
    return []
  }
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) {
    return []
  }
  return parsed as readonly Roll[]
}

const saveToLS = (rolls: readonly Roll[]): void => {
  localStorage.setItem(LS_ROLLS_KEY, JSON.stringify(rolls))
}

type RollController = {
  readonly rolls: readonly Roll[]
  readonly lastError: string | null
  readonly saveRoll: (roll: Roll) => void
  readonly deleteRoll: (id: string) => void
  readonly clearError: () => void
}

/**
 * Roll 胶卷管理 Hook。
 *
 * - Electron 模式：通过 readRolls / writeRolls 持久化到 userData/rolls.json
 * - 浏览器模式：通过 localStorage 持久化
 * - 错误不静默吞掉，通过 lastError 暴露给 UI
 */
export const useRolls = (): RollController => {
  const [rolls, setRolls] = useState<readonly Roll[]>([])
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
        setRolls(result)
        setLoaded(true)
      })
      .catch(() => {
        if (!active) {
          return
        }
        setLastError("Roll 数据读取失败，请检查文件权限或重启应用。")
        setLoaded(true)
      })
    return () => { active = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Roll 列表变化时持久化（跳过初始空值）
  const skipSaveRef = useRef(true)
  useEffect(() => {
    if (!loaded) {
      return
    }
    if (skipSaveRef.current) {
      skipSaveRef.current = false
      return
    }
    void storageSave(rolls)
      .then(() => {
        setLastError(null)
      })
      .catch(() => {
        setLastError("Roll 数据保存失败，请检查文件权限或磁盘空间。")
      })
  }, [rolls, loaded])

  const saveRoll = useCallback((roll: Roll): void => {
    setRolls((prev) => {
      const existing = prev.findIndex((r) => r.id === roll.id)
      if (existing >= 0) {
        const next = [...prev]
        next[existing] = roll
        return next
      }
      return [...prev, roll]
    })
  }, [])

  const deleteRoll = useCallback((id: string): void => {
    setRolls((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const clearError = useCallback((): void => {
    setLastError(null)
  }, [])

  return { rolls, lastError, saveRoll, deleteRoll, clearError }
}
