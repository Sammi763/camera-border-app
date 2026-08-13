/**
 * 字体加载服务。
 *
 * 字体分三类：
 * - 内置字体：sans-serif / serif 等通用字体名，引擎和浏览器都支持
 * - 候选字体：通过 Electron 枚举的系统已安装字体（前端可见，但引擎不一定可用）
 * - 引擎可用字体：通过 Java GraphicsEnvironment 返回的字体（引擎渲染时实际可用）
 *
 * 字体可用性判断使用归一化匹配（非精确字符串相等），
 * 处理大小写、空格、连字符差异，减少 false negative。
 */

import { getBaseUrl } from "../engine/engineClient"

/** 字体选项。 */
export type FontOption = {
  readonly value: string
  readonly label: string
  /** 字体来源：内置 / 系统候选。 */
  readonly source: "builtin" | "system"
  /** 引擎是否可用（true = 引擎已注册此字体，false = 候选但引擎可能回退）。 */
  readonly engineAvailable: boolean
}

/** 内置字体选项列表。 */
export const BUILTIN_FONTS: readonly FontOption[] = [
  { value: "sans-serif", label: "SansSerif", source: "builtin", engineAvailable: true },
  { value: "serif", label: "Serif", source: "builtin", engineAvailable: true },
  { value: "LXGW WenKai", label: "LXGW WenKai", source: "builtin", engineAvailable: false },
  { value: "Maoken YingBi Kaishu", label: "Maoken YingBi Kaishu", source: "builtin", engineAvailable: false },
  { value: "851 Tegaki Zatsu", label: "851 Tegaki Zatsu", source: "builtin", engineAvailable: false }
]

/** 内置字体值集合。 */
const BUILTIN_FONT_VALUES = new Set(BUILTIN_FONTS.map((f) => f.value))

/** 判断字体值是否为内置字体。 */
export const isBuiltinFont = (value: string): boolean => BUILTIN_FONT_VALUES.has(value)

/**
 * 归一化字体名称：用于模糊匹配系统候选字体和引擎可用字体。
 *
 * 处理规则：
 * 1. 转小写
 * 2. 去除首尾空格
 * 3. 连字符替换为空格
 * 4. 下划线替换为空格
 * 5. 连续空格压缩为单个
 * 6. 去除常见样式后缀：Bold / Italic / Regular / Light / Medium / Semibold / Thin / Black / Oblique / Heavy / Ultra / Condensed / Extended / Narrow / Wide
 *
 * 这样 "Arial Bold" → "arial"，"Times-New-Roman" → "times new roman"，
 * "Helvetica_Neue_Light" → "helvetica neue"。
 */
export const normalizeFontName = (name: string): string => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s(bold|italic|regular|light|medium|semibold|thin|black|oblique|heavy|ultra|condensed|extended|narrow|wide)$/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * 判断候选字体名是否在引擎可用字体集合中（归一化匹配）。
 */
const isEngineAvailable = (
  candidateName: string,
  engineFonts: Set<string> | null
): boolean => {
  if (engineFonts === null) return false
  if (engineFonts.has(candidateName)) return true
  const normalizedCandidate = normalizeFontName(candidateName)
  for (const engineFont of engineFonts) {
    if (normalizeFontName(engineFont) === normalizedCandidate) {
      return true
    }
  }
  return false
}

/** 获取引擎可用字体集合（从 GET /api/fonts）。失败时返回 null。 */
const fetchEngineFonts = async (): Promise<Set<string> | null> => {
  try {
    const response = await fetch(`${getBaseUrl()}/api/fonts`)
    if (!response.ok) return null
    const data = await response.json() as { fonts: string[] }
    return new Set(data.fonts)
  } catch {
    return null
  }
}

/**
 * 异步加载完整字体选项列表。
 *
 * 1. 调用 Electron IPC 获取系统已安装字体（候选字体）
 * 2. 调用 Java 引擎 GET /api/fonts 获取引擎可用字体
 * 3. 合并：内置 + 系统候选，标注引擎可用性（归一化匹配）
 *
 * 浏览器模式下系统字体不可用，仅返回内置字体。
 * 引擎不可达时所有系统字体标注为 engineAvailable=false。
 */
export const loadFontOptions = async (): Promise<readonly FontOption[]> => {
  const bridge = window.desktop
  const engineFonts = await fetchEngineFonts()

  if (bridge === undefined || bridge.listSystemFonts === undefined) {
    return BUILTIN_FONTS
  }

  try {
    const systemFonts = await bridge.listSystemFonts()
    const systemOptions: FontOption[] = systemFonts
      .filter((name) => !BUILTIN_FONT_VALUES.has(name))
      .map((name) => ({
        value: name,
        label: name,
        source: "system" as const,
        engineAvailable: isEngineAvailable(name, engineFonts)
      }))

    // 更新内置字体的引擎可用性（也用归一化匹配）
    const builtinUpdated = BUILTIN_FONTS.map((f) => ({
      ...f,
      engineAvailable: isEngineAvailable(f.value, engineFonts) || f.engineAvailable
    }))

    return [...builtinUpdated, ...systemOptions]
  } catch {
    return BUILTIN_FONTS
  }
}
