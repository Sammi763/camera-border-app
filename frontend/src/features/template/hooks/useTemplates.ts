import { useCallback, useEffect, useRef, useState } from "react"
import type { RenderSettings } from "../../settings/types"
import type { LayoutSettings, Template, TemplateController } from "../types"
import { toLayoutSettings } from "../utils/templateSettings"
import { migrateLegacyTemplateLayout } from "../utils/legacyTemplateMigration"

const LS_TEMPLATES_KEY = "camborder-templates"
const LS_DEFAULT_KEY = "camborder-default-template"

// ---- 存储适配层 ----------------------------------------------------------
// Electron 模式下走 readTemplates / writeTemplates（userData/templates.json），
// 浏览器模式回退到 localStorage。

const isElectronMode = (): boolean => window.desktop !== undefined

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object"

const normalizeStoredTemplates = (value: unknown): { templates: readonly Template[]; migrated: boolean } => {
  if (!Array.isArray(value)) return { templates: [], migrated: false }
  let migrated = false
  const templates: Template[] = []
  for (const candidate of value) {
    if (!isRecord(candidate)
      || typeof candidate["id"] !== "string"
      || typeof candidate["name"] !== "string"
      || typeof candidate["createdAt"] !== "number"
      || !isRecord(candidate["settings"])) {
      migrated = true
      continue
    }
    const originalSettings = candidate["settings"]
    const settings = toLayoutSettings(migrateLegacyTemplateLayout(originalSettings))
    if (JSON.stringify(originalSettings) !== JSON.stringify(settings)) migrated = true
    templates.push({
      id: candidate["id"],
      name: candidate["name"].trim(),
      settings,
      createdAt: candidate["createdAt"]
    })
  }
  return { templates, migrated }
}

const storageLoad = async (): Promise<{ templates: readonly Template[]; defaultId: string | null; migrated: boolean }> => {
  if (isElectronMode()) {
    const json = await window.desktop!.readTemplates()
    try {
      const parsed = JSON.parse(json) as unknown
      const normalized = normalizeStoredTemplates(parsed)
      // Electron 端把 defaultId 存在数组第一个元素的 __defaultId 字段中（约定）
      // 或者单独存储。为简单起见，仍用 localStorage 存 defaultId。
      const defaultId = loadDefaultFromLS()
      return { ...normalized, defaultId }
    } catch {
      console.warn("[模板存储] Electron 模板 JSON 解析失败，已忽略。")
      return { templates: [], defaultId: null, migrated: false }
    }
  }

  // 浏览器模式：localStorage
  const raw = loadFromLS()
  const normalized = normalizeStoredTemplates(raw)
  return { ...normalized, defaultId: loadDefaultFromLS() }
}

const storageSave = async (templates: readonly Template[]): Promise<void> => {
  if (isElectronMode()) {
    await window.desktop!.writeTemplates(JSON.stringify(templates))
    return
  }

  saveToLS(templates)
}

const loadFromLS = (): readonly unknown[] => {
  const raw = localStorage.getItem(LS_TEMPLATES_KEY)
  if (raw === null) {
    return []
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed as readonly Template[]
  } catch {
    // JSON 损坏时返回空数组，不覆盖损坏数据
    console.warn("[模板存储] localStorage 中的模板 JSON 解析失败，已忽略。")
    return []
  }
}

const saveToLS = (templates: readonly Template[]): void => {
  localStorage.setItem(LS_TEMPLATES_KEY, JSON.stringify(templates))
}

const uniqueTemplateName = (name: string, existingNames: readonly string[]): string => {
  if (!existingNames.includes(name)) return name
  let counter = 2
  let candidate = `${name} (${counter})`
  while (existingNames.includes(candidate)) {
    counter += 1
    candidate = `${name} (${counter})`
  }
  return candidate
}

const loadDefaultFromLS = (): string | null => {
  try {
    return localStorage.getItem(LS_DEFAULT_KEY)
  } catch {
    return null
  }
}

const saveDefaultToLS = (id: string | null): void => {
  try {
    if (id === null) {
      localStorage.removeItem(LS_DEFAULT_KEY)
    } else {
      localStorage.setItem(LS_DEFAULT_KEY, id)
    }
  } catch {
    // 静默忽略
  }
}

// ---- Hook ----------------------------------------------------------------

/**
 * 模板管理 Hook。
 *
 * - Electron 模式：模板列表通过 readTemplates / writeTemplates 持久化到 userData/templates.json
 * - 浏览器模式：模板列表通过 localStorage 持久化
 * - 默认模板 ID 统一存 localStorage（两端均可访问）
 * - 提供 onDefaultLoaded 回调，用于在应用启动时自动加载默认模板
 */
export const useTemplates = (
  onDefaultLoaded?: (settings: LayoutSettings) => void
): TemplateController => {
  const [templates, setTemplates] = useState<readonly Template[]>([])
  const [defaultTemplateId, setDefaultTemplateId] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const defaultAppliedRef = useRef(false)

  // 初始加载（异步，兼容 Electron API）
  useEffect(() => {
    let active = true
    void storageLoad()
      .then((result) => {
        if (!active) {
          return
        }
        setTemplates(result.templates)
        setDefaultTemplateId(result.defaultId)
        setLoaded(true)

        // 旧版式只在首次读取时迁移；迁移后的快照立即回写，避免旧输出字段长期滞留。
        if (result.migrated) {
          void storageSave(result.templates).catch(() => {
            if (active) setLastError("模板迁移保存失败，请检查文件权限或磁盘空间。")
          })
        }

        // 自动应用默认模板（仅首次，且调用方提供了回调）
        if (result.defaultId !== null && onDefaultLoaded !== undefined && !defaultAppliedRef.current) {
          const found = result.templates.find((t) => t.id === result.defaultId)
          if (found !== undefined) {
            defaultAppliedRef.current = true
            onDefaultLoaded(found.settings)
          }
        }
      })
      .catch(() => {
        if (!active) {
          return
        }
        setLastError("模板读取失败，请检查文件权限或重启应用。")
        setLoaded(true)
      })
    return () => { active = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 模板列表变化时持久化（跳过初始空值）
  const skipSaveRef = useRef(true)
  useEffect(() => {
    if (!loaded) {
      return
    }
    // 首次 loaded 后的那次 templates 变化是初始赋值，不需要写回
    if (skipSaveRef.current) {
      skipSaveRef.current = false
      return
    }
    void storageSave(templates)
      .then(() => {
        setLastError(null)
      })
      .catch(() => {
        setLastError("模板保存失败，请检查文件权限或磁盘空间。")
      })
  }, [templates, loaded])

  const saveTemplate = useCallback((name: string, settings: Partial<RenderSettings>): void => {
    const trimmedName = name.trim()
    if (trimmedName.length === 0) {
      setLastError("版式名称不能为空。")
      return
    }
    setTemplates((previous) => {
      const template: Template = {
        id: crypto.randomUUID(),
        name: uniqueTemplateName(trimmedName, previous.map((item) => item.name)),
        settings: toLayoutSettings(settings),
        createdAt: Date.now()
      }
      return [template, ...previous]
    })
    setLastError(null)
  }, [])

  const updateTemplate = useCallback((id: string, name: string, settings: Partial<RenderSettings>): void => {
    const trimmedName = name.trim()
    if (trimmedName.length === 0) {
      setLastError("版式名称不能为空。")
      return
    }
    setTemplates((previous) => previous.map((template) => template.id === id
      ? { ...template, name: trimmedName, settings: toLayoutSettings(settings) }
      : template))
    setLastError(null)
  }, [])

  const duplicateTemplate = useCallback((id: string, name?: string): void => {
    setTemplates((previous) => {
      const source = previous.find((template) => template.id === id)
      if (source === undefined) return previous
      const requestedName = name?.trim() || `${source.name} 副本`
      return [{
        ...source,
        id: crypto.randomUUID(),
        name: uniqueTemplateName(requestedName, previous.map((template) => template.name)),
        settings: toLayoutSettings(source.settings),
        createdAt: Date.now()
      }, ...previous]
    })
    setLastError(null)
  }, [])

  const renameTemplate = useCallback((id: string, name: string): void => {
    const trimmedName = name.trim()
    if (trimmedName.length === 0) {
      setLastError("版式名称不能为空。")
      return
    }
    setTemplates((previous) => previous.map((template) => template.id === id
      ? { ...template, name: trimmedName }
      : template))
    setLastError(null)
  }, [])

  const loadTemplate = useCallback((id: string): LayoutSettings | null => {
    const found = templates.find((t) => t.id === id)
    return found?.settings ?? null
  }, [templates])

  const deleteTemplate = useCallback((id: string): void => {
    setTemplates((prev) => prev.filter((t) => t.id !== id))
    if (defaultTemplateId === id) {
      setDefaultTemplateId(null)
      saveDefaultToLS(null)
    }
  }, [defaultTemplateId])

  const setDefault = useCallback((id: string | null): void => {
    setDefaultTemplateId(id)
    saveDefaultToLS(id)
  }, [])

  const clearError = useCallback((): void => {
    setLastError(null)
  }, [])

  return {
    templates,
    defaultTemplateId,
    lastError,
    saveTemplate,
    updateTemplate,
    duplicateTemplate,
    renameTemplate,
    loadTemplate,
    deleteTemplate,
    setDefault,
    clearError
  }
}
