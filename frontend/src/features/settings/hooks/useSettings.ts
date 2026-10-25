import { useCallback, useEffect, useRef, useState } from "react"
import type { NumberSettingKey, RenderSettings, SettingsController, SettingsUpdateOptions, TextLayerSettings } from "../types"
import { createDefaultTextLayers } from "../utils/defaultTextLayers"
import { BUILTIN_FONTS, loadFontOptions, isBuiltinFont, type FontOption } from "../../../services/desktop/fontsApi"
import {
  DEFAULT_IMAGE_AREA_SETTINGS,
  imagePlacementFromArea,
  normalizeImageAreaSettings
} from "../utils/imageArea"

/**
 * 内置字体选项列表（向后兼容导出）。
 * 值使用 CSS font-family 约定的名称，引擎侧渲染时按相同名称查找。
 * 系统字体通过 useSystemFonts hook 异步加载。
 */
export const FONT_OPTIONS: readonly { readonly value: string; readonly label: string }[] = BUILTIN_FONTS

/** 重新导出 isBuiltinFont，供组件使用。 */
export { isBuiltinFont }

/**
 * 异步加载系统字体列表 hook。
 * 先返回内置字体，再异步补系统字体。不阻塞首屏。
 */
export const useSystemFonts = (): {
  readonly fonts: readonly FontOption[]
  readonly loaded: boolean
} => {
  const [fonts, setFonts] = useState<readonly FontOption[]>(BUILTIN_FONTS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    void loadFontOptions().then((options) => {
      if (active) {
        setFonts(options)
        setLoaded(true)
      }
    })
    return () => {
      active = false
    }
  }, [])

  return { fonts, loaded }
}

/**
 * 创建默认文字图层。
 * 首版固定 3 段：文字 1 / 文字 2 / 文字 3。
 *
 * 已抽到 ../utils/defaultTextLayers.ts，此处保留 re-export 供旧引用兼容。
 */
const createDefaultTextLayersLocal = createDefaultTextLayers

export const DEFAULT_SETTINGS: RenderSettings = {
  borderColor: "#ffffff",
  borderTop: 20,
  borderBottom: 20,
  borderLeft: 20,
  borderRight: 20,
  textContent: "",
  textFontSize: 24,
  textColor: "#000000",
  textPlacement: "bottom-center",
  textArea: "image",
  fontFamily: "sans-serif",
  textLayers: createDefaultTextLayersLocal(),
  imagePlacement: {
    mode: "fit",
    focalX: 0.5,
    focalY: 0.5,
    rotation: 0,
    targetAspectRatio: null
  },
  imageArea: DEFAULT_IMAGE_AREA_SETTINGS,
  layoutPresetId: null,
  gradient: {
    enabled: false,
    type: "linear",
    angle: 0,
    stops: [
      { offset: 0, color: "#000000" },
      { offset: 1, color: "#ffffff" }
    ]
  },
  borderStyle: null,
  exportFormat: "jpeg",
  jpegQuality: 95,
  outputSizePreset: "original",
  customOutputLongEdge: 2048,
  preserveMetadata: true,
  preserveColorProfile: true,
  preferHighBitDepth: false,
  tier: "standard-delivery",
  colorProfilePolicy: "source",
  metadataPolicy: "preserve",
  bitDepthPolicy: "8",
  logo: {
    enabled: false,
    mode: "auto-brand",
    brand: null,
    placement: "border-top-right",
    size: 14,
    colorMode: "auto-contrast",
    imagePath: null,
    opacity: 1,
    autoContrast: true
  }
}

/** 设置含嵌套图层/渐变对象；历史快照必须深复制，不能保留可变引用。 */
const cloneSettings = (settings: RenderSettings): RenderSettings =>
  JSON.parse(JSON.stringify(settings)) as RenderSettings

const SETTINGS_STORAGE_KEY = "camborder-workspace-settings.v1"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const isValidExportFormat = (value: unknown): value is RenderSettings["exportFormat"] =>
  value === "png" || value === "jpeg" || value === "tiff"

const isValidOutputSizePreset = (value: unknown): value is RenderSettings["outputSizePreset"] =>
  value === "original" || value === "1080p" || value === "2k" || value === "4k" || value === "custom"

type PersistedSettingsState = {
  readonly settings: RenderSettings
  readonly restored: boolean
}

const defaultPersistedSettings = (): PersistedSettingsState => ({
  settings: cloneSettings(DEFAULT_SETTINGS),
  restored: false
})

const readPersistedSettings = (): PersistedSettingsState => {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (raw === null) return defaultPersistedSettings()
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) return defaultPersistedSettings()
    const payload = parsed["schemaVersion"] === 1 && isRecord(parsed["settings"])
      ? parsed["settings"]
      : parsed
    if (!isRecord(payload)) return defaultPersistedSettings()
    if (!isValidExportFormat(payload["exportFormat"]) || !isValidOutputSizePreset(payload["outputSizePreset"])) {
      return defaultPersistedSettings()
    }

    const placement = isRecord(payload["imagePlacement"])
      ? { ...DEFAULT_SETTINGS.imagePlacement, ...payload["imagePlacement"] }
      : DEFAULT_SETTINGS.imagePlacement
    const area = normalizeImageAreaSettings(
      isRecord(payload["imageArea"])
        ? payload["imageArea"]
        : undefined,
      placement
    )
    const logo = isRecord(payload["logo"])
      ? { ...DEFAULT_SETTINGS.logo, ...payload["logo"] }
      : DEFAULT_SETTINGS.logo
    const gradient = isRecord(payload["gradient"])
      ? {
          ...DEFAULT_SETTINGS.gradient,
          ...payload["gradient"],
          stops: Array.isArray(payload["gradient"]["stops"])
            ? payload["gradient"]["stops"]
            : DEFAULT_SETTINGS.gradient.stops
        }
      : DEFAULT_SETTINGS.gradient
    const textLayers = Array.isArray(payload["textLayers"])
      ? payload["textLayers"]
      : DEFAULT_SETTINGS.textLayers
    const restored = {
      ...DEFAULT_SETTINGS,
      ...payload,
      imageArea: area,
      imagePlacement: imagePlacementFromArea(area, placement),
      logo,
      gradient,
      textLayers
    }
    return { settings: restored as RenderSettings, restored: true }
  } catch {
    return defaultPersistedSettings()
  }
}

const writePersistedSettings = (settings: RenderSettings): void => {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      settings
    }))
  } catch {
    // 存储空间不足或浏览器禁用存储时不影响当前编辑会话。
  }
}

const SETTINGS_HISTORY_LIMIT = 50

/**
 * 设置防抖延迟（毫秒）。
 * 用户连续输入文字时，不会每个键都触发预览请求，
 * 而是在停止输入 300ms 后统一触发一次。
 */
const DEBOUNCE_MS = 300

/**
 * 对数字输入做三重保护：
 * 1. NaN 检测：用户清空输入框时 valueAsNumber 返回 NaN，此时回退到原值
 * 2. 范围钳制：确保结果在 [min, max] 区间内
 * 3. 整数化：对像素类输入取整，避免浮点数泄漏到状态中
 */
const clampNumber = (value: number, fallback: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return fallback
  }
  const clamped = Math.min(max, Math.max(min, Math.round(value)))
  return clamped
}

/**
 * 管理预览参数状态，设置变化后自动防抖递增 settingsVersion。
 *
 * 设计要点：
 * - 不再需要 Apply 按钮，设置变化自动触发预览
 * - 防抖避免连续输入文字时频繁请求后端
 * - previewVersion 只在防抖结束后递增，确保 usePreview 拿到稳定的设置
 * - textLayers 变化也触发防抖预览
 */
export const useSettings = (): SettingsController => {
  const [initialPersistence] = useState<PersistedSettingsState>(() => readPersistedSettings())
  const settingsRef = useRef<RenderSettings>(initialPersistence.settings)
  const undoStackRef = useRef<RenderSettings[]>([])
  const redoStackRef = useRef<RenderSettings[]>([])
  /** 最近一次提交的合并标签；相邻同标签的手势类更新共用一条撤销历史。 */
  const lastHistoryTagRef = useRef<string | null>(null)
  const [settings, setSettings] = useState<RenderSettings>(() => initialPersistence.settings)
  const [settingsVersion, setSettingsVersion] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 历史本体存 ref；revision 只用于让 canUndo/canRedo 及时刷新。
  const [, setHistoryRevision] = useState(0)

  // 当前稳定设置持久化；视口缩放、滚动位置和 Canvas 尺寸不在 RenderSettings 中。
  useEffect(() => {
    writePersistedSettings(settings)
  }, [settings])

  const scheduleVersionBump = useCallback(() => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      setSettingsVersion((v) => v + 1)
      debounceRef.current = null
    }, DEBOUNCE_MS)
  }, [])

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  /**
   * 记录一次内容变更并切断嵌套对象引用。
   *
   * historyTag 用于连续手势（如裁切构图拖动）：相邻提交携带相同标签时不重复压栈，
   * 撤销栈顶保留的是手势开始前的快照，一次撤销即可回到拖动前状态。
   */
  const commitSettings = useCallback((mutate: (current: RenderSettings) => RenderSettings, historyTag?: string): void => {
    const previous = settingsRef.current
    const next = mutate(previous)
    if (next === previous) {
      return
    }
    const coalesceWithLast = historyTag !== undefined && historyTag === lastHistoryTagRef.current
    if (!coalesceWithLast) {
      undoStackRef.current = [...undoStackRef.current, cloneSettings(previous)].slice(-SETTINGS_HISTORY_LIMIT)
    }
    lastHistoryTagRef.current = historyTag ?? null
    redoStackRef.current = []
    const frozenNext = cloneSettings(next)
    settingsRef.current = frozenNext
    setSettings(frozenNext)
    setHistoryRevision((version) => version + 1)
    scheduleVersionBump()
  }, [scheduleVersionBump])

  const update = useCallback((patch: Partial<RenderSettings>, options?: SettingsUpdateOptions): void => {
    commitSettings((previous) => ({ ...previous, ...patch }), options?.historyTag)
  }, [commitSettings])

  const updateNumber = useCallback(
    (key: NumberSettingKey, value: number, min: number, max: number): void => {
      commitSettings((previous) => {
        const fallback = previous[key]
        return { ...previous, [key]: clampNumber(value, fallback, min, max) }
      })
    },
    [commitSettings]
  )

  /** 更新指定文字图层。 */
  const updateTextLayer = useCallback(
    (layerId: string, patch: Partial<TextLayerSettings>): void => {
      commitSettings((previous) => ({
        ...previous,
        textLayers: previous.textLayers.map((layer) =>
          layer.id === layerId ? { ...layer, ...patch } : layer
        )
      }))
    },
    [commitSettings]
  )

  /** 恢复默认 3 段文字图层。 */
  const resetTextLayers = useCallback((): void => {
    commitSettings((previous) => ({
      ...previous,
      textLayers: createDefaultTextLayers()
    }))
  }, [commitSettings])

  /** 替换全部文字图层。 */
  const replaceTextLayers = useCallback(
    (layers: readonly TextLayerSettings[]): void => {
      commitSettings((previous) => ({
        ...previous,
        textLayers: layers
      }))
    },
    [commitSettings]
  )

  const undo = useCallback((): void => {
    const previous = undoStackRef.current.at(-1)
    if (previous === undefined) return
    undoStackRef.current = undoStackRef.current.slice(0, -1)
    // 撤销后下一条更新不应与已结束的手势合并，重置合并标签。
    lastHistoryTagRef.current = null
    redoStackRef.current = [...redoStackRef.current, cloneSettings(settingsRef.current)].slice(-SETTINGS_HISTORY_LIMIT)
    const restored = cloneSettings(previous)
    settingsRef.current = restored
    setSettings(restored)
    setHistoryRevision((version) => version + 1)
    scheduleVersionBump()
  }, [scheduleVersionBump])

  const redo = useCallback((): void => {
    const next = redoStackRef.current.at(-1)
    if (next === undefined) return
    redoStackRef.current = redoStackRef.current.slice(0, -1)
    lastHistoryTagRef.current = null
    undoStackRef.current = [...undoStackRef.current, cloneSettings(settingsRef.current)].slice(-SETTINGS_HISTORY_LIMIT)
    const restored = cloneSettings(next)
    settingsRef.current = restored
    setSettings(restored)
    setHistoryRevision((version) => version + 1)
    scheduleVersionBump()
  }, [scheduleVersionBump])

  return {
    settings,
    restoredFromStorage: initialPersistence.restored,
    settingsVersion,
    update,
    updateNumber,
    updateTextLayer,
    resetTextLayers,
    replaceTextLayers,
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
    undo,
    redo
  }
}
