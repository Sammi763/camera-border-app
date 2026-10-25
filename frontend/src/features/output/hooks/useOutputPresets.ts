import { useCallback, useEffect, useRef, useState } from "react"
import type { OutputPreset, OutputPresetController, OutputPresetSettings } from "../types"

const STORAGE_KEY = "camborder-output-presets.v1"

const cloneSettings = (settings: OutputPresetSettings): OutputPresetSettings => ({ ...settings })

const VALID_OUTPUT_SIZE_PRESETS = new Set(["original", "1080p", "2k", "4k", "custom"])

const isFiniteInteger = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number"
  && Number.isSafeInteger(value)
  && value >= min
  && value <= max

/** 校验输出预设的完整结构，损坏的 localStorage 条目必须被丢弃而不是带入导出请求。 */
export const isValidOutputPresetSettings = (value: unknown): value is OutputPresetSettings => {
  if (value === null || typeof value !== "object") return false
  const output = value as Record<string, unknown>
  const baseValid = (output["exportFormat"] === "png" || output["exportFormat"] === "jpeg" || output["exportFormat"] === "tiff")
    && isFiniteInteger(output["jpegQuality"], 1, 100)
    && typeof output["outputSizePreset"] === "string"
    && VALID_OUTPUT_SIZE_PRESETS.has(output["outputSizePreset"])
    && isFiniteInteger(output["customOutputLongEdge"], 1, 100_000)
    && typeof output["preserveMetadata"] === "boolean"
    && typeof output["preserveColorProfile"] === "boolean"
    && typeof output["preferHighBitDepth"] === "boolean"
  if (!baseValid) return false
  if (output["tier"] === undefined) return true
  return output["tier"] === "quick-share"
    || output["tier"] === "standard-delivery"
    || output["tier"] === "high-fidelity-archive"
    || output["tier"] === "custom"
    ? (output["colorProfilePolicy"] === "source" || output["colorProfilePolicy"] === "srgb" || output["colorProfilePolicy"] === "none")
      && (output["metadataPolicy"] === "preserve" || output["metadataPolicy"] === "remove-location" || output["metadataPolicy"] === "strip")
      && (output["bitDepthPolicy"] === "source" || output["bitDepthPolicy"] === "8")
    : false
}

export const isValidOutputPreset = (value: unknown): value is OutputPreset => {
  if (value === null || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>
  return typeof candidate["id"] === "string"
    && candidate["id"].trim().length > 0
    && typeof candidate["name"] === "string"
    && candidate["name"].trim().length > 0
    && isFiniteInteger(candidate["createdAt"], 0, Number.MAX_SAFE_INTEGER)
    && isValidOutputPresetSettings(candidate["settings"])
}

const readPresets = (): readonly OutputPreset[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed.filter(isValidOutputPreset).map((preset) => ({
          ...preset,
          settings: cloneSettings(preset.settings)
        }))
      : []
  } catch {
    return []
  }
}

const writePresets = (presets: readonly OutputPreset[]): boolean => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
    return true
  } catch {
    return false
  }
}

export const uniqueOutputPresetName = (name: string, existing: readonly string[]): string => {
  if (!existing.includes(name)) return name
  let index = 2
  let candidate = `${name} (${index})`
  while (existing.includes(candidate)) {
    index += 1
    candidate = `${name} (${index})`
  }
  return candidate
}

/** 独立输出预设的本地持久化控制器。 */
export const useOutputPresets = (): OutputPresetController => {
  const [presets, setPresets] = useState<readonly OutputPreset[]>(readPresets)
  const [lastError, setLastError] = useState<string | null>(null)
  const hydratedRef = useRef(false)

  useEffect(() => {
    hydratedRef.current = true
  }, [])

  useEffect(() => {
    if (hydratedRef.current && !writePresets(presets)) {
      setLastError("输出预设保存失败，请检查浏览器存储空间。")
    }
  }, [presets])

  const savePreset = useCallback((name: string, settings: OutputPresetSettings): void => {
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setLastError("输出预设名称不能为空。")
      return
    }
    setPresets((previous) => [{
      id: crypto.randomUUID(),
      name: uniqueOutputPresetName(trimmed, previous.map((preset) => preset.name)),
      settings: cloneSettings(settings),
      createdAt: Date.now()
    }, ...previous])
    setLastError(null)
  }, [])

  const updatePreset = useCallback((id: string, name: string, settings: OutputPresetSettings): void => {
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setLastError("输出预设名称不能为空。")
      return
    }
    setPresets((previous) => previous.map((preset) => preset.id === id
      ? { ...preset, name: trimmed, settings: cloneSettings(settings) }
      : preset))
    setLastError(null)
  }, [])

  const duplicatePreset = useCallback((id: string, name?: string): void => {
    setPresets((previous) => {
      const source = previous.find((preset) => preset.id === id)
      if (source === undefined) return previous
      const requestedName = name?.trim() || `${source.name} 副本`
      return [{
        ...source,
        id: crypto.randomUUID(),
        name: uniqueOutputPresetName(requestedName, previous.map((preset) => preset.name)),
        settings: cloneSettings(source.settings),
        createdAt: Date.now()
      }, ...previous]
    })
    setLastError(null)
  }, [])

  const deletePreset = useCallback((id: string): void => {
    setPresets((previous) => previous.filter((preset) => preset.id !== id))
    setLastError(null)
  }, [])

  const clearError = useCallback((): void => setLastError(null), [])

  return { presets, lastError, savePreset, updatePreset, duplicatePreset, deletePreset, clearError }
}
