import { useCallback, useEffect, useRef, useState } from "react"
import type { NumberSettingKey, RenderSettings, SettingsController, TextLayerSettings } from "../types"
import { createDefaultTextLayers } from "../utils/defaultTextLayers"
import { BUILTIN_FONTS, loadFontOptions, isBuiltinFont, type FontOption } from "../../../services/desktop/fontsApi"

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

const DEFAULT_SETTINGS: RenderSettings = {
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
  autoCrop: false,
  filmFormat: null,
  gradient: {
    enabled: false,
    type: "linear",
    angle: 0,
    stops: [
      { offset: 0, color: "#000000" },
      { offset: 1, color: "#ffffff" }
    ]
  },
  exportFormat: "png",
  jpegQuality: 95,
  outputSizePreset: "original",
  customOutputLongEdge: 2048,
  preserveMetadata: false,
  preserveColorProfile: false,
  preferHighBitDepth: false,
  logo: {
    enabled: false,
    mode: "auto-brand",
    brand: null,
    placement: "border-top-right",
    size: 14,
    colorMode: "auto-contrast",
  }
}

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
  const [settings, setSettings] = useState<RenderSettings>(DEFAULT_SETTINGS)
  const [settingsVersion, setSettingsVersion] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const update = useCallback((patch: Partial<RenderSettings>): void => {
    setSettings((prev) => ({ ...prev, ...patch }))
    scheduleVersionBump()
  }, [scheduleVersionBump])

  const updateNumber = useCallback(
    (key: NumberSettingKey, value: number, min: number, max: number): void => {
      setSettings((prev) => {
        const fallback = prev[key]
        return { ...prev, [key]: clampNumber(value, fallback, min, max) }
      })
      scheduleVersionBump()
    },
    [scheduleVersionBump]
  )

  /** 更新指定文字图层。 */
  const updateTextLayer = useCallback(
    (layerId: string, patch: Partial<TextLayerSettings>): void => {
      setSettings((prev) => ({
        ...prev,
        textLayers: prev.textLayers.map((layer) =>
          layer.id === layerId ? { ...layer, ...patch } : layer
        )
      }))
      scheduleVersionBump()
    },
    [scheduleVersionBump]
  )

  /** 恢复默认 3 段文字图层。 */
  const resetTextLayers = useCallback((): void => {
    setSettings((prev) => ({
      ...prev,
      textLayers: createDefaultTextLayers()
    }))
    scheduleVersionBump()
  }, [scheduleVersionBump])

  /** 替换全部文字图层。 */
  const replaceTextLayers = useCallback(
    (layers: readonly TextLayerSettings[]): void => {
      setSettings((prev) => ({
        ...prev,
        textLayers: layers
      }))
      scheduleVersionBump()
    },
    [scheduleVersionBump]
  )

  return { settings, settingsVersion, update, updateNumber, updateTextLayer, resetTextLayers, replaceTextLayers }
}
