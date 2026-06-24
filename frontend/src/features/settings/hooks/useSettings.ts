import { useCallback, useEffect, useRef, useState } from "react"
import type { NumberSettingKey, RenderSettings, SettingsController } from "../types"

/**
 * 内置字体选项列表。
 * 值使用 CSS font-family 约定的名称，引擎侧渲染时按相同名称查找。
 */
export const FONT_OPTIONS: readonly { readonly value: string; readonly label: string }[] = [
  { value: "sans-serif", label: "SansSerif" },
  { value: "serif", label: "Serif" },
  { value: "LXGW WenKai", label: "LXGW WenKai" },
  { value: "Maoken YingBi Kaishu", label: "Maoken YingBi Kaishu" },
  { value: "851 Tegaki Zatsu", label: "851 Tegaki Zatsu" }
]

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
  jpegQuality: 95
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

  return { settings, settingsVersion, update, updateNumber }
}
